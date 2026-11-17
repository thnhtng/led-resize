"""Tiện ích đọc/ghi docs/data/jobs.json và videos.json."""
import json
import os

JOBS = os.path.join("docs", "data", "jobs.json")
VIDEOS = os.path.join("docs", "data", "videos.json")


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def upsert(jobs, job):
    jobs = [j for j in jobs if j.get("id") != job["id"]]
    jobs.insert(0, job)
    return jobs[:200]
