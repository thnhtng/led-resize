#!/usr/bin/env python3
"""Chạy theo lịch trong GitHub Actions: cập nhật trạng thái job từ Kaggle + đồng bộ danh sách video của dataset."""
import glob
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jobs_lib as JL
import preview as PV

ACTIVE = {"submitted", "queued", "running"}
MAP = {"QUEUED": "queued", "RUNNING": "running", "COMPLETE": "done", "ERROR": "error", "CANCEL_REQUESTED": "cancelled",
       "CANCEL_ACKNOWLEDGED": "cancelled", "CANCELLED": "cancelled"}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def kaggle(*args):
    r = subprocess.run(["kaggle", *args], capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def parse_status(text):
    m = re.search(r'status\s+"?(?:KernelWorkerStatus\.)?([A-Za-z_]+)"?', text)
    return MAP.get(m.group(1).upper()) if m else None


def error_tail(kernel):
    with tempfile.TemporaryDirectory() as d:
        kaggle("kernels", "output", kernel, "-p", d)
        logs = glob.glob(os.path.join(d, "*.log"))
        if logs:
            return open(logs[0], encoding="utf-8", errors="replace").read()[-1500:]
    return ""


def make_previews(job):
    """Tải kết quả từ Kaggle, dựng bản xem thử nhỏ cho trang web. Lỗi ở đây không được làm hỏng việc cập nhật trạng thái."""
    with tempfile.TemporaryDirectory() as d:
        rc, out = kaggle("kernels", "output", job["kernel"], "-p", d)
        if rc != 0:
            print("không tải được output để dựng preview:", out.strip()[-600:])
            return []
        return PV.build_previews(job["id"], d, os.path.join("docs", "data", "previews"))


def sync_jobs():
    jobs = JL.load(JL.JOBS, [])
    changed = False
    for j in jobs:
        if j.get("status") == "done" and j.get("kernel") and not j.get("previews") and j.get("preview_tries", 0) < 3:
            j["preview_tries"] = j.get("preview_tries", 0) + 1  # dựng lại bản xem thử nếu lần trước lỗi (ffmpeg, mạng...)
            changed = True
            try:
                pv = make_previews(j)
                if pv:
                    j["previews"] = pv
            except Exception as e:  # noqa
                print("preview thất bại:", e)
        if j.get("status") not in ACTIVE or not j.get("kernel"):
            continue
        rc, out = kaggle("kernels", "status", j["kernel"])
        st = parse_status(out)
        print(j["id"], "->", st, "|", out.strip()[:160])
        if not st or st == j["status"]:
            continue
        j["status"] = st
        changed = True
        if st in ("done", "error", "cancelled"):
            j["finished_at"] = now()
        if st == "done":
            j["output_cmd"] = f'kaggle kernels output {j["kernel"]} -p ~/Downloads/led_out'
            try:
                pv = make_previews(j)
                if pv:
                    j["previews"] = pv
            except Exception as e:  # noqa
                print("preview thất bại:", e)
        if st == "error":
            j["error_tail"] = error_tail(j["kernel"])
    if changed:
        PV.prune(jobs, os.path.join("docs", "data", "previews"))
        JL.save(JL.JOBS, jobs)


def sync_videos():
    user, ds = os.environ.get("KAGGLE_USERNAME", ""), os.environ.get("VIDEO_DATASET", "led-videos")
    if not user:
        return
    rc, out = kaggle("datasets", "files", f"{user}/{ds}")
    if rc != 0:
        print("không liệt kê được dataset:", out.strip()[-600:])
        return
    vids = []
    for line in out.splitlines():
        m = re.match(r"^(\S+\.(?:mp4|mov|mkv|webm|avi|m4v))\s+(\S+)", line.strip(), re.I)
        if m:
            vids.append({"name": m.group(1), "size": m.group(2)})
    old = JL.load(JL.VIDEOS, {})
    if old.get("videos") != vids or old.get("dataset") != f"{user}/{ds}":
        JL.save(JL.VIDEOS, {"dataset": f"{user}/{ds}", "videos": vids, "updated": now()})
        print("đã cập nhật videos.json:", [v["name"] for v in vids])


if __name__ == "__main__":
    sync_jobs()
    sync_videos()
