#!/usr/bin/env python3
"""Tạo bản xem thử (mp4 nhỏ + ảnh bìa) từ kết quả giặt, để trang web phát ngay trên tấm vải phơi.
Kết quả đầy đủ vẫn nằm riêng tư trên Kaggle; bản xem thử chỉ là ≤ 10 giây, cạnh dài ≤ 960px, không tiếng."""
import glob
import json
import os
import re
import subprocess

MAX_OUTPUTS = 6
MAX_SIDE = 960
MAX_SECONDS = 10
KEEP_JOBS = 12


def find_outputs(root):
    files = sorted(glob.glob(os.path.join(root, "**", "*.mp4"), recursive=True))
    return files[:MAX_OUTPUTS]


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "json", path], capture_output=True, text=True, check=True)
    s = json.loads(r.stdout)["streams"][0]
    return int(s["width"]), int(s["height"])


def make_preview(src, mp4, jpg):
    vf = (f"scale='if(gt(iw,ih),min({MAX_SIDE},iw),-2)':'if(gt(iw,ih),-2,min({MAX_SIDE},ih))',format=yuv420p")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-t", str(MAX_SECONDS), "-i", src, "-vf", vf, "-an", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "30", "-movflags", "+faststart", mp4], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.4", "-i", mp4, "-frames:v", "1", "-vf", "scale=420:-2", jpg], check=True)
    return probe(mp4)


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)[:80] or "x"


def build_previews(job_id, out_dir, dest_dir):
    """Trả về danh sách {label, mp4, jpg, w, h}; đường dẫn tương đối so với thư mục docs/ (để trang web dùng trực tiếp)."""
    os.makedirs(dest_dir, exist_ok=True)
    res = []
    for i, src in enumerate(find_outputs(out_dir), 1):
        base = f"{safe(job_id)}_{i}"
        mp4, jpg = os.path.join(dest_dir, base + ".mp4"), os.path.join(dest_dir, base + ".jpg")
        try:
            w, h = make_preview(src, mp4, jpg)
        except Exception as e:  # một file hỏng không làm hỏng cả mẻ
            print("preview lỗi:", src, e)
            for f in (mp4, jpg):
                if os.path.exists(f):
                    os.remove(f)
            continue
        res.append({"label": os.path.splitext(os.path.basename(src))[0], "mp4": f"data/previews/{base}.mp4", "jpg": f"data/previews/{base}.jpg", "w": w, "h": h})
    return res


def prune(jobs, dest_dir, keep=KEEP_JOBS):
    """Chỉ giữ bản xem thử của `keep` mẻ xong mới nhất; xoá file mồ côi để repo không phình."""
    done = [j for j in jobs if j.get("status") == "done" and j.get("previews")]
    done.sort(key=lambda j: str(j.get("finished_at") or j.get("submitted_at") or ""), reverse=True)
    for j in done[keep:]:
        j.pop("previews", None)
    used = {os.path.basename(p[k]) for j in jobs for p in j.get("previews", []) for k in ("mp4", "jpg")}
    removed = []
    if os.path.isdir(dest_dir):
        for f in os.listdir(dest_dir):
            if f not in used and f.endswith((".mp4", ".jpg")):
                os.remove(os.path.join(dest_dir, f))
                removed.append(f)
    return removed
