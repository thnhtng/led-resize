#!/usr/bin/env python3
"""make_kernel.py <job.json> <outdir> <kaggle_username>
Dựng notebook Kaggle (nhúng tham số job + worker.py) và kernel-metadata.json."""
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
GPU_ACCELERATORS = {"NvidiaTeslaP100", "NvidiaTeslaT4", "NvidiaTeslaT4Highmem", "NvidiaTeslaA100", "NvidiaL4",
                    "NvidiaL4X1", "NvidiaH100", "NvidiaRtxPro6000"}


def slug(s):
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c)).replace("đ", "d").replace("Đ", "d")
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def stem(name):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", os.path.splitext(os.path.basename(name))[0])


def normalize(job):
    j = dict(job)
    j["id"] = slug(j.get("id") or "job")
    vids = j.get("videos") or []
    if not vids:
        raise ValueError("job không có video")
    j["videos"] = [os.path.basename(v) for v in vids]
    sizes = []
    for s in j.get("sizes") or []:
        w, h = int(s["w"]), int(s["h"])
        if not (64 <= w <= 16384 and 64 <= h <= 16384):
            raise ValueError(f"kích thước không hợp lệ: {w}x{h}")
        sizes.append({"name": slug(s.get("name") or f"{w}x{h}"), "w": w + (w % 2), "h": h + (h % 2)})
    if not sizes:
        raise ValueError("job không có kích thước đầu ra")
    names = [s["name"] for s in sizes]
    if len(set(names)) != len(names):
        raise ValueError("tên kích thước bị trùng")
    j["sizes"] = sizes
    j.setdefault("engine", "wan")
    j.setdefault("model", "1.3b")
    j.setdefault("dtype", "auto")
    j.setdefault("accelerator", "NvidiaTeslaT4")
    j.setdefault("dataset", "led-videos")
    if j["engine"] not in ("wan", "blur") or j["model"] not in ("1.3b", "14b"):
        raise ValueError("engine/model không hợp lệ")
    if j["dtype"] not in ("auto", "fp16", "bf16"):
        raise ValueError("dtype không hợp lệ")
    return j


CELL_INSTALL = '''# 1) Cài thư viện (ffmpeg, opencv có sẵn trên Kaggle)
!pip install -q -U "diffusers>=0.35.0" "transformers>=4.51" accelerate sentencepiece ftfy
import subprocess
print(subprocess.run("ffmpeg -version | head -1; nvidia-smi", shell=True, capture_output=True, text=True).stdout)
'''

CELL_CONFIG = '''# 2) Cấu hình job (do trang web tạo)
import os, glob, json
os.environ["HF_HOME"] = "/tmp/hf"
JOB = json.loads(r\'\'\'__JOB__\'\'\')
WORK, OUT = "/kaggle/working/work", "/kaggle/working/out"
os.makedirs(WORK, exist_ok=True)

def find_video(fname):
    hits = glob.glob(f"/kaggle/input/**/{fname}", recursive=True)
    assert hits, f"Không thấy {fname} trong /kaggle/input (dataset {JOB.get('dataset')})"
    return hits[0]

def stem(n):
    import re
    return re.sub(r"[^A-Za-z0-9_-]+", "_", os.path.splitext(os.path.basename(n))[0])

videos = {stem(v): find_video(v) for v in JOB["videos"]}
cfg = dict(JOB, work=WORK, out=OUT, videos=videos, max_seconds=JOB.get("test_seconds", 0), unit_max=341, min_piece=48)
CFG = f"{WORK}/config.json"
json.dump(cfg, open(CFG, "w"), indent=1)
print(json.dumps({k: cfg[k] for k in ["videos", "sizes", "engine", "model", "dtype", "steps", "stride", "gen_mpx", "scale", "max_seconds"] if k in cfg}, indent=1))
'''

CELL_WRITE = "%%writefile worker.py\n__WORKER__"

CELL_RESTORE = '''# 3) Khôi phục tiến độ từ job trước (nếu job này được đặt "resume_from")
import subprocess, glob, os
for p in glob.glob("/kaggle/input/**/work", recursive=True):
    if os.path.isdir(os.path.join(p, "seg")):
        print("Khôi phục từ", p)
        subprocess.run(["cp", "-rn", p + "/.", WORK + "/"], check=False)
'''

CELL_RUN = '''# 4) Chuẩn bị + mã hoá prompt + chạy worker (mỗi GPU một process) + nối file cuối
import subprocess, time, os, sys, shutil
def sh(args):
    print("$", " ".join(args), flush=True)
    r = subprocess.run(args)
    if r.returncode != 0:
        raise SystemExit(f"Lệnh lỗi ({r.returncode}): {' '.join(args)}")

sh(["python", "worker.py", "prepare", "--config", CFG])
if cfg["engine"] == "wan":
    sh(["python", "worker.py", "encode", "--config", CFG])

n_gpu = len([l for l in subprocess.run("nvidia-smi -L", shell=True, capture_output=True, text=True).stdout.splitlines() if "GPU" in l])
if cfg["engine"] == "wan" and n_gpu == 0:
    raise SystemExit("Notebook không có GPU nhưng engine = wan. Kiểm tra accelerator của job.")
n_workers = max(1, min(2, n_gpu)) if cfg["engine"] == "wan" else 2
print("Số worker:", n_workers, "| GPU:", n_gpu)

def launch(i):
    env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(i), PYTHONUNBUFFERED="1")
    f = open(f"{WORK}/worker{i}.log", "w")
    return subprocess.Popen(["python", "worker.py", "work", "--config", CFG, "--gpu", str(i)], env=env, stdout=f, stderr=subprocess.STDOUT)

def tail(i, n=4):
    try:
        return "".join(open(f"{WORK}/worker{i}.log").readlines()[-n:])
    except Exception:
        return ""

for i in range(n_workers):
    try: os.remove(f"{WORK}/ready_{i}")
    except FileNotFoundError: pass
procs = []
for i in range(n_workers):
    procs.append(launch(i))
    while not os.path.exists(f"{WORK}/ready_{i}") and procs[i].poll() is None:
        time.sleep(5)
    if procs[i].poll() not in (None, 0):
        print(tail(i, 40)); raise SystemExit("Worker lỗi khi khởi động")
t0 = time.time()
while any(p.poll() is None for p in procs):
    time.sleep(POLL_SECONDS if "POLL_SECONDS" in globals() else 60)
    print(f"--- {(time.time() - t0) / 60:.0f} phút ---")
    for i in range(n_workers):
        print(f"[GPU{i}]", tail(i, 3).strip())
bad = [i for i, p in enumerate(procs) if p.returncode != 0]
for i in bad: print(f"Worker {i} lỗi:\\n", tail(i, 40))
if bad:
    raise SystemExit("Có worker lỗi")
r = subprocess.run(["python", "worker.py", "assemble", "--config", CFG])
if r.returncode == 0:
    for d in ("seg", "tails"):
        shutil.rmtree(f"{WORK}/{d}", ignore_errors=True)   # giữ output gọn khi đã xong hoàn toàn
else:
    print("Còn thiếu unit - giữ lại tiến độ để chạy tiếp (resume_from).")
    raise SystemExit("Chưa xong hết")
'''

CELL_SUMMARY = '''# 5) Tóm tắt kết quả
import glob, os, json
files = [{"file": os.path.basename(f), "mb": round(os.path.getsize(f) / 1e6, 1)} for f in sorted(glob.glob(f"{OUT}/*.mp4"))]
json.dump({"job": JOB["id"], "outputs": files}, open("/kaggle/working/summary.json", "w"), indent=1)
print(json.dumps(files, indent=1))
'''


def build(job, user, outdir):
    worker = open(os.path.join(HERE, "worker.py"), encoding="utf-8").read()
    jtxt = json.dumps(job, ensure_ascii=False).replace("'''", "\\u0027\\u0027\\u0027")
    cells_src = [CELL_INSTALL, CELL_CONFIG.replace("__JOB__", jtxt), CELL_WRITE.replace("__WORKER__", worker),
                 CELL_RESTORE, CELL_RUN, CELL_SUMMARY]
    cells = [{"cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
              "source": s.splitlines(True)} for s in cells_src]
    nb = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                                       "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 4}
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, "led-resize.ipynb"), "w", encoding="utf-8") as f:
        json.dump(nb, f, ensure_ascii=False, indent=1)
    title = f"led-resize-{job['id']}"
    ks = [f"{user}/led-resize-{slug(job['resume_from'])}"] if job.get("resume_from") else []
    meta = {"id": f"{user}/{slug(title)}", "title": title, "code_file": "led-resize.ipynb", "language": "python",
            "kernel_type": "notebook", "is_private": True, "enable_gpu": job["engine"] == "wan",
            "enable_internet": True, "dataset_sources": [f"{user}/{job['dataset']}"],
            "competition_sources": [], "kernel_sources": ks, "model_sources": []}
    with open(os.path.join(outdir, "kernel-metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    return meta


if __name__ == "__main__":
    job = normalize(json.load(open(sys.argv[1], encoding="utf-8")))
    m = build(job, sys.argv[3], sys.argv[2])
    print(json.dumps({"kernel": m["id"], "accelerator": job["accelerator"], "timeout_h": job.get("timeout_h", 11)}))
