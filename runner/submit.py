#!/usr/bin/env python3
"""Chạy trong GitHub Actions: nhận JOB_JSON, dựng notebook, đẩy lên Kaggle, ghi vào docs/data/jobs.json."""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jobs_lib as JL
import make_kernel as MK


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_url():
    s, r, i = os.environ.get("GITHUB_SERVER_URL"), os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_RUN_ID")
    return f"{s}/{r}/actions/runs/{i}" if s and r and i else ""


def main():
    user = os.environ["KAGGLE_USERNAME"]
    raw = json.loads(os.environ["JOB_JSON"])
    rec = {"id": MK.slug(str(raw.get("id") or "job")), "label": str(raw.get("label", ""))[:120], "submitted_at": now(),
           "run_url": run_url(), "status": "error"}
    jobs = JL.load(JL.JOBS, [])
    try:
        job = MK.normalize(raw)
        engine = job["engine"]
        acc = job["accelerator"]
        if engine == "wan" and acc not in MK.GPU_ACCELERATORS:
            raise ValueError(f"accelerator không hợp lệ: {acc}")
        tsec = int(min(max(float(job.get("timeout_h", 11)), 0.2), 12) * 3600)
        meta = MK.build(job, user, "kernel")
        cmd = ["kaggle", "kernels", "push", "-p", "kernel", "-t", str(tsec)]
        if engine == "wan":
            cmd += ["--accelerator", acc]
        r = subprocess.run(cmd, capture_output=True, text=True)
        out = (r.stdout or "") + (r.stderr or "")
        print(out)
        ok = r.returncode == 0 and not re.search(r"(?i)\b(error|invalid|not found|denied)\b", out)
        slug = meta["id"].split("/", 1)[1]
        rec.update({
            "id": job["id"], "kernel": meta["id"], "kernel_url": f"https://www.kaggle.com/code/{user}/{slug}",
            "engine": engine, "model": job["model"], "accelerator": acc if engine == "wan" else "CPU",
            "sizes": job["sizes"], "videos": job["videos"], "steps": job.get("steps"), "stride": job.get("stride"),
            "gen_mpx": job.get("gen_mpx"), "scale": job.get("scale"), "test_seconds": job.get("test_seconds", 0),
            "resume_from": job.get("resume_from", ""),
            "status": "submitted" if ok else "error",
        })
        if not ok:
            rec["error_tail"] = out.strip()[-1200:]
    except Exception as e:  # noqa
        rec["error_tail"] = f"{type(e).__name__}: {e}"
        print(rec["error_tail"])
    JL.save(JL.JOBS, JL.upsert(jobs, rec))
    sys.exit(0 if rec["status"] == "submitted" else 1)


if __name__ == "__main__":
    main()
