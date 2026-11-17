#!/usr/bin/env python
"""
worker.py - outpaint video cho màn LED (Wan2.1 VACE) với kích thước đầu ra bất kỳ.

Chế độ: prepare | encode | work | assemble     (tham số trong config.json)
- Video nguồn có kích thước bất kỳ, được đặt vào GIỮA canvas (không kéo giãn), phần còn lại AI vẽ tiếp.
- Mỗi "unit" (một cảnh hoặc một đoạn của cảnh dài) được lưu riêng nên chạy tiếp được sau khi bị ngắt.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time

import numpy as np

CHUNK = 81
OVERLAP = 16
NEG = ("text, watermark, logo, border, frame, split screen, duplicate, mirrored, blurry, low quality, "
       "deformed, extra characters, black bars, gray bars")
DEFAULT_PROMPT = ("Seamless wide cinematic extension of the same scene, identical lighting, color grading, "
                  "depth of field and art style, continuous background, no text, no logos, no borders")
MODEL_IDS = {"1.3b": "Wan-AI/Wan2.1-VACE-1.3B-diffusers", "14b": "Wan-AI/Wan2.1-VACE-14B-diffusers"}


# ------------------------------------------------------------------ hình học
def even(x):
    return max(2, int(round(x / 2.0)) * 2)


def layout(sw, sh, W, H, scale=1.0):
    """Đặt video nguồn (sw x sh) vào giữa canvas W x H, giữ tỉ lệ. Trả về (cw, ch, x0, y0)."""
    s = min(W / float(sw), H / float(sh)) * scale
    cw, ch = min(even(sw * s), W), min(even(sh * s), H)
    return cw, ch, (W - cw) // 2, (H - ch) // 2


def auto_gen(W, H, mpx):
    """Chọn canvas AI (cạnh chia hết 16) cùng tỉ lệ với W x H, diện tích ~ mpx megapixel."""
    aspect = W / float(H)
    target = mpx * 1e6
    gh0 = int(math.sqrt(target / aspect) / 16) * 16
    best = None
    for gh in range(max(64, gh0 - 96), gh0 + 112, 16):
        gw = max(64, int(round(gh * aspect / 16.0)) * 16)
        area = gw * gh
        if area < 0.6 * target or area > 1.5 * target:
            continue
        err = abs(gw / float(gh) - aspect) / aspect
        key = (round(err, 4), abs(area - target))
        if best is None or key < best[0]:
            best = (key, (gw, gh))
    if best is None:
        gh = max(64, int(round(gh0 / 16.0)) * 16)
        return max(64, int(round(gh * aspect / 16.0)) * 16), gh
    return best[1]


def gen_rect(final_rect, W, H, gw, gh):
    """Hình chữ nhật video trên canvas AI. Cạnh nào chiếm trọn canvas thì giữ nguyên (không làm tròn lệch)."""
    cw, ch, _, _ = final_rect
    gcw = gw if cw >= W else min(even(cw * gw / float(W)), gw)
    gch = gh if ch >= H else min(even(ch * gh / float(H)), gh)
    return gcw, gch, (gw - gcw) // 2, (gh - gch) // 2


def dec_dims(sw, sh, fcw, fch):
    """Kích thước giải mã: không cần nhiều điểm ảnh hơn vùng video ở độ phân giải cuối."""
    f = min(1.0, fcw / float(sw), fch / float(sh))
    return even(sw * f), even(sh * f)


def rect_alpha(w, h, x0, y0, cw, ch, ramp, full_w, full_h):
    """Alpha trên canvas full_w x full_h: =1 trong vùng video, dốc về 0 ở mép trong (chỉ mép có vùng AI vẽ)."""
    x = np.arange(full_w, dtype=np.float32)
    y = np.arange(full_h, dtype=np.float32)
    inx = (x >= x0) & (x < x0 + cw)
    iny = (y >= y0) & (y < y0 + ch)
    ax = np.where(inx, np.clip(np.minimum(x - x0, x0 + cw - 1 - x) / max(ramp, 1), 0, 1), 0) if x0 > 0 else inx * 1.0
    ay = np.where(iny, np.clip(np.minimum(y - y0, y0 + ch - 1 - y) / max(ramp, 1), 0, 1), 0) if y0 > 0 else iny * 1.0
    return (ay[:, None] * ax[None, :]).astype(np.float32)


def pad_tail(full):
    if len(full) >= OVERLAP:
        return full[-OVERLAP:].copy()
    return np.concatenate([np.repeat(full[:1], OVERLAP - len(full), axis=0), full])


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


# ------------------------------------------------------------------ cấu hình / đường dẫn
def load_cfg(path):
    with open(path) as f:
        return json.load(f)


def sizes_of(cfg):
    for s in cfg["sizes"]:
        s["w"], s["h"] = even(s["w"]), even(s["h"])
    return cfg["sizes"]


def job_dir(cfg, v, t):
    return os.path.join(cfg["work"], "seg", f"{v}_{t}")


def seg_path(cfg, v, t, uid):
    return os.path.join(job_dir(cfg, v, t), f"{uid}.mp4")


def tail_path(cfg, v, t, uid):
    return os.path.join(cfg["work"], "tails", f"{v}_{t}_{uid}.npy")


def geometry(cfg, plan, sz):
    """Mọi kích thước/toạ độ liên quan tới một (video, size)."""
    sw, sh = plan["sw"], plan["sh"]
    W, H = sz["w"], sz["h"]
    scale = float(cfg.get("scale", 1.0))
    fr = layout(sw, sh, W, H, scale)
    if sz.get("gen"):
        gw, gh = sz["gen"]
    else:
        gw, gh = auto_gen(W, H, float(sz.get("mpx", cfg.get("gen_mpx", 0.5))))
    gr = gen_rect(fr, W, H, gw, gh)
    passthrough = fr[0] >= W and fr[1] >= H
    return {"W": W, "H": H, "fr": fr, "gw": gw, "gh": gh, "gr": gr, "passthrough": passthrough,
            "dec": dec_dims(sw, sh, fr[0], fr[1])}


# ------------------------------------------------------------------ đọc video
def probe(path):
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
         "-of", "json", path], text=True)
    st = json.loads(out)["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den)


def gray_frames(path, max_seconds=0):
    """Toàn bộ video ở độ phân giải thấp (80x49, xám) - dùng để dò cắt cảnh."""
    cmd = ["ffmpeg", "-v", "error"]
    if max_seconds and max_seconds > 0:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-i", path, "-vf", "scale=80:49:flags=area,format=gray", "-f", "rawvideo", "-pix_fmt", "gray", "-"]
    raw = subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, 49, 80)


def read_range(path, a, b, dw, dh, fps):
    """Đọc frame [a, b) ở kích thước dw x dh."""
    t = max(0.0, (a - 0.25) / fps)
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t:.6f}", "-i", path, "-frames:v", str(b - a),
           "-vf", f"scale={dw}:{dh}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    raw = subprocess.run(cmd, check=True, stdout=subprocess.PIPE).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, dh, dw, 3)
    if len(fr) < b - a:   # thiếu frame ở cuối: lặp frame cuối
        fr = np.concatenate([fr, np.repeat(fr[-1:], (b - a) - len(fr), axis=0)])
    return fr


def detect_shots(gray, abs_thr=40.0, ratio_thr=2.2, min_len=12):
    n = len(gray)
    if n < 2:
        return [(0, n)]
    d = np.abs(np.diff(gray.astype(np.float32), axis=0)).mean(axis=(1, 2))
    cuts = []
    for i in range(len(d)):
        lo, hi = max(0, i - 8), min(len(d), i + 9)
        around = np.delete(d[lo:hi], i - lo)
        local = float(np.median(around)) if len(around) else 0.0
        if d[i] > abs_thr and d[i] > ratio_thr * max(local, 1.0):
            cuts.append(i + 1)
    bounds = [0] + cuts + [n]
    shots = [[bounds[i], bounds[i + 1]] for i in range(len(bounds) - 1) if bounds[i + 1] > bounds[i]]
    merged = []
    for a, b in shots:
        if merged and (b - a < min_len or merged[-1][1] - merged[-1][0] < min_len):
            merged[-1][1] = b
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def split_shot(a, b, unit_max, min_piece):
    pieces, s = [], a
    while s < b:
        pieces.append([s, min(s + unit_max, b)])
        s += unit_max
    if len(pieces) > 1 and pieces[-1][1] - pieces[-1][0] < min_piece:
        pieces[-2][1] = pieces[-1][1]
        pieces.pop()
    return pieces


def chunk_count(n_frames, has_ctx, stride, chunk=CHUNK):
    n = n_frames if stride <= 1 else int(math.ceil(n_frames / float(stride))) + 1
    n += OVERLAP if has_ctx else 0
    return 1 if n <= chunk else 1 + int(math.ceil((n - chunk) / float(chunk - OVERLAP)))


# ------------------------------------------------------------------ canvas
def build_canvas(frames, g):
    import cv2
    gcw, gch, gx0, gy0 = g["gr"]
    canvas = np.full((len(frames), g["gh"], g["gw"], 3), 128, np.uint8)
    for i, f in enumerate(frames):
        canvas[i, gy0:gy0 + gch, gx0:gx0 + gcw] = cv2.resize(f, (gcw, gch), interpolation=cv2.INTER_AREA)
    return canvas


def engine_blur(canvas, g):
    import cv2
    gcw, gch, gx0, gy0 = g["gr"]
    gw, gh = g["gw"], g["gh"]
    out = np.empty_like(canvas)
    sigma = max(min(gw, gh) * 0.05, 4)
    pad = ((gy0, gh - gy0 - gch), (gx0, gw - gx0 - gcw), (0, 0))
    for i in range(len(canvas)):
        c = canvas[i, gy0:gy0 + gch, gx0:gx0 + gcw]
        out[i] = cv2.GaussianBlur(np.pad(c, pad, mode="symmetric"), (0, 0), sigma)
    return out


_PIPE = {}


def get_pipe(cfg, vname):
    import torch
    if "pipe" not in _PIPE:
        from diffusers import AutoencoderKLWan, UniPCMultistepScheduler, WanVACEPipeline
        want = cfg.get("dtype", "auto")
        if want == "auto":
            want = "bf16" if torch.cuda.get_device_capability()[0] >= 8 else "fp16"
        dt = torch.float16 if want == "fp16" else torch.bfloat16
        log(f"dtype = {want}, GPU = {torch.cuda.get_device_name(0)}")
        mid = MODEL_IDS[cfg["model"]]
        vae = AutoencoderKLWan.from_pretrained(mid, subfolder="vae", torch_dtype=torch.float32)
        pipe = WanVACEPipeline.from_pretrained(mid, vae=vae, text_encoder=None, tokenizer=None, torch_dtype=dt)
        pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)
        pipe.to("cuda")
        try:
            pipe.vae.enable_tiling()
        except Exception as e:  # noqa
            log(f"không bật được vae tiling: {e}")
        _PIPE["pipe"], _PIPE["dt"], _PIPE["name"] = pipe, dt, want
    if vname not in _PIPE:
        e = torch.load(os.path.join(cfg["work"], f"embeds_{vname}.pt"))
        _PIPE[vname] = (e["p"].to("cuda", _PIPE["dt"]), e["n"].to("cuda", _PIPE["dt"]))
    pe, ne = _PIPE[vname]
    return _PIPE["pipe"], pe, ne


def engine_wan(canvas, g, cfg, vname, ctx):
    import torch
    from PIL import Image

    pipe, pe, ne = get_pipe(cfg, vname)
    gw, gh = g["gw"], g["gh"]
    gcw, gch, gx0, gy0 = g["gr"]
    chunk = int(cfg.get("chunk", CHUNK))
    full = canvas if ctx is None else np.concatenate([ctx, canvas])
    n = len(full)
    side = np.full((gh, gw), 255, np.uint8)
    side[gy0:gy0 + gch, gx0:gx0 + gcw] = 0
    mask_side = Image.fromarray(side, "L")
    mask_keep = Image.new("L", (gw, gh), 0)
    c_alpha = rect_alpha(gw, gh, gx0, gy0, gcw, gch, 8, gw, gh)[..., None]

    out = np.zeros_like(full)
    if ctx is not None:
        out[:OVERLAP] = ctx
    s, first, ci = 0, ctx is None, 0
    n_chunks = 1 if n <= chunk else 1 + int(math.ceil((n - chunk) / float(chunk - OVERLAP)))
    while True:
        ci += 1
        t0 = time.time()
        src_idx = np.minimum(np.arange(s, s + chunk), n - 1)
        video = [Image.fromarray(full[j]) for j in src_idx]
        mask = [mask_side] * chunk
        if not first:
            for k in range(OVERLAP):
                video[k] = Image.fromarray(out[s + k])
                mask[k] = mask_keep
        gen = pipe(
            video=video, mask=mask, prompt=None, negative_prompt=None, prompt_embeds=pe, negative_prompt_embeds=ne,
            height=gh, width=gw, num_frames=chunk, num_inference_steps=int(cfg["steps"]),
            guidance_scale=float(cfg.get("guidance", 5.0)),
            generator=torch.Generator("cpu").manual_seed(int(cfg.get("seed", 42))),
        ).frames[0]
        gen = np.asarray(gen)
        if not np.isfinite(gen).all():
            raise RuntimeError("Kết quả có NaN (thường do fp16 trên T4). Đặt precision = bf16 hoặc dùng GPU Ampere trở lên.")
        if gen.dtype != np.uint8:
            gen = (np.clip(gen, 0, 1) * 255).round().astype(np.uint8)
        cen = full[src_idx].astype(np.float32)
        gen = (gen.astype(np.float32) * (1 - c_alpha) + cen * c_alpha).round().astype(np.uint8)
        new_start = s if first else s + OVERLAP
        end = min(s + chunk, n)
        if new_start < end:
            out[new_start:end] = gen[new_start - s:end - s]
        first = False
        torch.cuda.empty_cache()
        log(f"    chunk {ci}/{n_chunks}: {time.time() - t0:.0f}s")
        if s + chunk >= n:
            break
        s += chunk - OVERLAP
    return (out if ctx is None else out[OVERLAP:]), pad_tail(out)


def generate_unit(frames_unit, g, cfg, vname, ctx):
    """Trả về (canvas AI đã có phần vẽ thêm (n,gh,gw,3), tail)."""
    n = len(frames_unit)
    if g["passthrough"]:
        out = build_canvas(frames_unit, g)
        return out, pad_tail(out)
    if cfg.get("engine", "wan") == "blur":
        out = engine_blur(build_canvas(frames_unit, g), g)
        return out, pad_tail(out)
    stride = int(cfg.get("stride", 1))
    idx = np.unique(np.concatenate([np.arange(0, n, stride), [n - 1]])) if stride > 1 and n > 2 * stride else np.arange(n)
    sub, tail = engine_wan(build_canvas(frames_unit[idx], g), g, cfg, vname, ctx)
    if len(idx) == n:
        return sub, tail
    out = np.empty((n,) + sub.shape[1:], np.uint8)
    last, j = len(idx) - 1, 0
    for i in range(n):
        while j + 1 < last and idx[j + 1] <= i:
            j += 1
        a, b = idx[j], idx[min(j + 1, last)]
        t = 0.0 if b == a else (i - a) / float(b - a)
        out[i] = (sub[j].astype(np.float32) * (1 - t) + sub[min(j + 1, last)].astype(np.float32) * t).round().astype(np.uint8)
    return out, tail


def encode_segment(sides, frames_unit, g, fps, out_path):
    import cv2
    W, H = g["W"], g["H"]
    fcw, fch, fx0, fy0 = g["fr"]
    feather = max(int(min(W, H) * 0.02), 6)
    x = np.arange(fcw, dtype=np.float32)
    y = np.arange(fch, dtype=np.float32)
    ax = np.clip(np.minimum(x, fcw - 1 - x) / feather, 0, 1) if fx0 > 0 else np.ones(fcw, np.float32)
    ay = np.clip(np.minimum(y, fch - 1 - y) / feather, 0, 1) if fy0 > 0 else np.ones(fch, np.float32)
    alpha = (ay[:, None] * ax[None, :])[..., None].astype(np.float32)
    tmp = out_path + ".tmp.mp4"
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{fps}",
         "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", tmp],
        stdin=subprocess.PIPE)
    for k in range(len(frames_unit)):
        if g["passthrough"]:
            canvas = cv2.resize(frames_unit[k], (W, H), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
        else:
            canvas = cv2.resize(sides[k], (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
            center = cv2.resize(frames_unit[k], (fcw, fch), interpolation=cv2.INTER_LANCZOS4).astype(np.float32)
            roi = canvas[fy0:fy0 + fch, fx0:fx0 + fcw]
            canvas[fy0:fy0 + fch, fx0:fx0 + fcw] = center * alpha + roi * (1 - alpha)
        enc.stdin.write(np.clip(canvas, 0, 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError("ffmpeg encode thất bại")
    os.replace(tmp, out_path)


# ------------------------------------------------------------------ các chế độ
def mode_prepare(cfg):
    os.makedirs(os.path.join(cfg["work"], "seg"), exist_ok=True)
    os.makedirs(os.path.join(cfg["work"], "tails"), exist_ok=True)
    total = 0
    for v, path in cfg["videos"].items():
        sw, sh, fps = probe(path)
        gray = gray_frames(path, cfg.get("max_seconds", 0))
        shots = detect_shots(gray)
        unit_max = int(cfg.get("unit_max", 341))
        stub = {"sw": sw, "sh": sh}
        worst = 0
        for sz in sizes_of(cfg):
            g = geometry(cfg, stub, sz)
            dw, dh = g["dec"]
            worst = max(worst, dw * dh * 3 + g["gw"] * g["gh"] * 3 * 2)
        unit_max = max(int(cfg.get("min_piece", 48)), min(unit_max, int(3e9 // max(worst, 1))))
        units = []
        for si, (a, b) in enumerate(shots):
            for pi, (pa, pb) in enumerate(split_shot(a, b, unit_max, cfg.get("min_piece", 48))):
                dep = units[-1]["id"] if pi > 0 else None
                units.append({"id": f"u{len(units):04d}", "shot": si, "a": pa, "b": pb, "dep": dep,
                              "chunks": chunk_count(pb - pa, dep is not None, int(cfg.get("stride", 1)),
                                                    int(cfg.get("chunk", CHUNK)))})
        needed = {u["dep"] for u in units if u["dep"]}
        for u in units:
            u["tail"] = u["id"] in needed
        with open(os.path.join(cfg["work"], f"plan_{v}.json"), "w") as f:
            json.dump({"fps": fps, "sw": sw, "sh": sh, "nframes": len(gray), "units": units}, f)
        c = sum(u["chunks"] for u in units)
        total += c * len(cfg["sizes"])
        log(f"{v}: {sw}x{sh} @ {fps:.2f}fps, {len(gray)} frame, {len(shots)} cảnh, {len(units)} unit, {c} chunk/kích thước")
    removed = 0
    for root, _, files in os.walk(os.path.join(cfg["work"], "seg")):
        for fn in files:
            if fn.endswith(".claim") and not os.path.exists(os.path.join(root, fn[:-6])):
                os.remove(os.path.join(root, fn))
                removed += 1
    log(f"TỔNG: {total} chunk cho {len(cfg['videos'])} video x {len(cfg['sizes'])} kích thước (xoá {removed} claim cũ)")


def mode_encode(cfg):
    import torch
    from diffusers import WanVACEPipeline
    pipe = WanVACEPipeline.from_pretrained(MODEL_IDS[cfg["model"]], transformer=None, vae=None, torch_dtype=torch.bfloat16)
    for v in cfg["videos"]:
        p = os.path.join(cfg["work"], f"embeds_{v}.pt")
        if os.path.exists(p):
            log(f"embeds {v} đã có")
            continue
        prompt = (cfg.get("prompts") or {}).get(v) or cfg.get("prompt") or DEFAULT_PROMPT
        pe, ne = pipe.encode_prompt(prompt=prompt, negative_prompt=NEG, do_classifier_free_guidance=True,
                                    max_sequence_length=512, device="cpu")
        torch.save({"p": pe.float().cpu(), "n": ne.float().cpu()}, p)
        log(f"đã mã hoá prompt cho {v}")


def claim(path):
    try:
        os.close(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        return True
    except FileExistsError:
        return False


def mode_work(cfg, gpu):
    tag = f"[GPU{gpu}]"
    plans = {}
    for v in cfg["videos"]:
        with open(os.path.join(cfg["work"], f"plan_{v}.json")) as f:
            plans[v] = json.load(f)
    jobs = [(v, sz) for v in cfg["videos"] for sz in sizes_of(cfg)]
    if cfg.get("engine", "wan") == "wan":
        get_pipe(cfg, list(cfg["videos"])[0])
    open(os.path.join(cfg["work"], f"ready_{gpu}"), "w").close()
    log(f"{tag} sẵn sàng")
    while True:
        did, left = False, False
        for v, sz in jobs:
            t = sz["name"]
            os.makedirs(job_dir(cfg, v, t), exist_ok=True)
            plan = plans[v]
            for u in plan["units"]:
                sp = seg_path(cfg, v, t, u["id"])
                if os.path.exists(sp) or os.path.exists(sp + ".claim"):
                    continue
                left = True
                if u["dep"] and not os.path.exists(tail_path(cfg, v, t, u["dep"])):
                    continue
                if not claim(sp + ".claim"):
                    continue
                g = geometry(cfg, plan, sz)
                t0 = time.time()
                log(f"{tag} {v}/{t}/{u['id']} frame {u['a']}-{u['b']} ({u['chunks']} chunk)")
                ctx = np.load(tail_path(cfg, v, t, u["dep"])) if u["dep"] else None
                fu = read_range(cfg["videos"][v], u["a"], u["b"], g["dec"][0], g["dec"][1], plan["fps"])
                sides, tail = generate_unit(fu, g, cfg, v, ctx)
                if u.get("tail"):
                    tp = tail_path(cfg, v, t, u["id"])
                    os.makedirs(os.path.dirname(tp), exist_ok=True)
                    with open(tp + ".tmp", "wb") as f:
                        np.save(f, tail)
                    os.replace(tp + ".tmp", tp)
                encode_segment(sides, fu, g, plan["fps"], sp)
                log(f"{tag} xong {v}/{t}/{u['id']} trong {time.time() - t0:.0f}s")
                did = True
                break
            if did:
                break
        if not did:
            if not left:
                break
            time.sleep(10)
    log(f"{tag} hết việc")


def mode_assemble(cfg):
    os.makedirs(cfg["out"], exist_ok=True)
    ok = True
    for v, path in cfg["videos"].items():
        with open(os.path.join(cfg["work"], f"plan_{v}.json")) as f:
            plan = json.load(f)
        for sz in sizes_of(cfg):
            t = sz["name"]
            segs = [seg_path(cfg, v, t, u["id"]) for u in plan["units"]]
            missing = [s for s in segs if not os.path.exists(s)]
            if missing:
                log(f"THIẾU {len(missing)}/{len(segs)} unit cho {v}/{t}, bỏ qua")
                ok = False
                continue
            lst = os.path.join(cfg["work"], f"list_{v}_{t}.txt")
            with open(lst, "w") as f:
                f.write("".join(f"file '{os.path.abspath(s)}'\n" for s in segs))
            out = os.path.join(cfg["out"], f"{v}_{t}.mp4")
            cmd = ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-i", path,
                   "-map", "0:v", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest"]
            if cfg.get("max_seconds", 0):
                cmd += ["-t", str(cfg["max_seconds"])]
            subprocess.run(cmd + ["-movflags", "+faststart", out], check=True)
            log(f"đã tạo {out} ({os.path.getsize(out) / 1e6:.0f} MB)")
    log("XONG tất cả" if ok else "Còn thiếu unit")
    sys.exit(0 if ok else 3)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["prepare", "encode", "work", "assemble"])
    ap.add_argument("--config", required=True)
    ap.add_argument("--gpu", type=int, default=0)
    a = ap.parse_args()
    c = load_cfg(a.config)
    {"prepare": lambda: mode_prepare(c), "encode": lambda: mode_encode(c),
     "work": lambda: mode_work(c, a.gpu), "assemble": lambda: mode_assemble(c)}[a.mode]()
