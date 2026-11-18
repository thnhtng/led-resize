#!/usr/bin/env node
/* Demo cục bộ: phục vụ docs/ và giả lập "trạm điện" + Kaggle để chạy thử TOÀN BỘ luồng mà không cần token/GPU.
   Chạy:  node demo/server.mjs   rồi mở http://127.0.0.1:8787
   Mẻ giặt giả: xếp hàng 3s → giặt 10s → xong (kèm video xem thử dựng bằng ffmpeg nếu máy có). Không gửi gì ra ngoài. */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import worker, { sanitizeJob } from "../relay/worker.js";
import { fakeR2 } from "./fake-r2.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs");
const PORT = Number(process.env.PORT) || 8787;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "size-washer-demo-"));
const jobs = [];
const ORIGIN = `http://127.0.0.1:${PORT}`;
/* trạm điện THẬT (relay/worker.js) chạy cục bộ với R2 giả: tải lên từng phần, kernel tải về bằng khoá bí mật */
const RELAY_ENV = { GH_TOKEN: "demo", GH_REPO: "demo/demo", ALLOWED_ORIGINS: ORIGIN, FILES_SECRET: "demo-files-secret", VIDEOS: fakeR2(), MAX_UPLOAD_MB: "512",
  MAX_UPLOADS_PER_HOUR: process.env.QUOTA_UPLOADS_PER_HOUR || "50", MAX_JOBS_PER_HOUR: process.env.QUOTA_JOBS_PER_HOUR || "50", QUOTA_JOBS_PER_DAY: process.env.QUOTA_JOBS_PER_DAY || "20",
  QUOTA_STORAGE_GB: process.env.QUOTA_STORAGE_GB || "8", QUOTA_GPU_HOURS_WEEK: process.env.QUOTA_GPU_HOURS_WEEK || "30" };
/* trạm thật đọc jobs.json qua GitHub API — trong demo trả danh sách mẻ giả */
const realFetch = globalThis.fetch;
globalThis.fetch = (u, init) => String(u).startsWith("https://api.github.com/repos/demo/demo/contents/docs/data/jobs.json")
  ? Promise.resolve(new Response(JSON.stringify(jobs), { status: 200 })) : realFetch(u, init);
function viaWorker(req, res, rest) {
  const chunks = []; req.on("data", c => chunks.push(c));
  req.on("end", async () => {
    try {
      const body = Buffer.concat(chunks), headers = { ...req.headers }; delete headers.host;
      const wr = await worker.fetch(new Request(ORIGIN + rest, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }), RELAY_ENV);
      const out = Buffer.from(await wr.arrayBuffer()); const h = Object.fromEntries(wr.headers); delete h["content-length"];
      res.writeHead(wr.status, h); res.end(out);
    } catch (e) { send(res, 500, JSON.stringify({ error: String(e.message) })); }
  });
}
async function checkUploads(job) {
  for (const [name, u] of Object.entries(job.uploads || {})) {
    const r = await worker.fetch(new Request(u, { headers: { Authorization: "Bearer " + RELAY_ENV.FILES_SECRET } }), RELAY_ENV);
    console.log(`  ⇣ kernel (giả) tải ${name}:`, r.status, (await r.arrayBuffer()).byteLength, "byte");
  }
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".mp4": "video/mp4", ".glb": "model/gltf-binary", ".md": "text/plain" };
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function makePreview(job) {
  if (!hasFfmpeg) return [];
  const s = job.sizes[0], ar = s.w / s.h;
  const w = ar >= 1 ? 960 : Math.round(960 * ar / 2) * 2, h = ar >= 1 ? Math.round(960 / ar / 2) * 2 : 960;
  const mp4 = path.join(TMP, job.id + ".mp4"), jpg = path.join(TMP, job.id + ".jpg");
  const a = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=24:duration=6`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-movflags", "+faststart", mp4]);
  if (a.status !== 0) return [];
  spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.4", "-i", mp4, "-frames:v", "1", "-vf", "scale=420:-2", jpg]);
  return [{ label: job.videos[0].replace(/\.[^.]+$/, "") + "_" + s.name, mp4: "data/previews/" + job.id + ".mp4", jpg: "data/previews/" + job.id + ".jpg", w, h }];
}
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
function startJob(job) {
  const rec = { id: job.id, label: job.label, submitted_at: now(), status: "submitted", kernel: "demo/" + job.id, kernel_url: "https://www.kaggle.com/",
    engine: job.engine, model: job.model, accelerator: job.accelerator, sizes: job.sizes, videos: job.videos, steps: job.steps, stride: job.stride, test_seconds: job.test_seconds };
  jobs.unshift(rec);
  setTimeout(() => { rec.status = "queued"; }, 3000);
  setTimeout(() => { rec.status = "running"; }, 7000);
  setTimeout(() => { rec.previews = makePreview(job); rec.output_cmd = `kaggle kernels output demo/${job.id} -p ~/Downloads/led_out`; rec.finished_at = now(); rec.status = "done"; console.log("  ✔ job xong:", job.id); }, 17000);
}

function send(res, code, body, type = "application/json", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...extra }); res.end(body);
}
function file(req, res, fp) {
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, "not found", "text/plain");
    const type = MIME[path.extname(fp).toLowerCase()] || "application/octet-stream", range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      let [a, b] = range.replace("bytes=", "").split("-"); a = a ? +a : 0; b = b ? +b : st.size - 1;
      if (a > b || a >= st.size) return send(res, 416, "", "text/plain", { "Content-Range": "bytes */" + st.size });
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": b - a + 1 });
      return fs.createReadStream(fp, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" });
    fs.createReadStream(fp).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
  if (p === "/config.json") return send(res, 200, JSON.stringify({ relay: `http://127.0.0.1:${PORT}/relay` }));
  if (p === "/relay/quota") return viaWorker(req, res, "/quota");
  if (p.startsWith("/relay/upload/")) return viaWorker(req, res, p.slice("/relay".length) + url.search);
  if (p === "/relay/health") return send(res, 200, '{"ok":true}');
  if (p === "/relay/data/jobs" || p === "/data/jobs.json") return send(res, 200, JSON.stringify(jobs));
  if (p === "/relay/data/videos" || p === "/data/videos.json") return send(res, 200, JSON.stringify({ dataset: "demo/led-videos", videos: [] }));
  if (p === "/relay/dispatch" && req.method === "POST") {
    let raw = ""; req.on("data", c => { raw += c; if (raw.length > 70000) req.destroy(); });
    req.on("end", () => {
      try {
        const body = JSON.parse(raw);
        if (body.workflow === "poll.yml") return send(res, 204, "");
        const v = sanitizeJob(JSON.parse(body.inputs.job), ORIGIN);
        if (v.error) return send(res, 400, JSON.stringify({ error: v.error }));
        console.log("  ➜ nhận mẻ giặt:", v.job.id, v.job.videos.join(","), v.job.sizes.map(s => s.w + "x" + s.h).join(","), v.job.engine + "/" + v.job.model);
        worker.fetch(new Request(ORIGIN + "/quota", { headers: { Origin: ORIGIN } }), RELAY_ENV).then(async qr => {
          const q = await qr.json();
          if (q.locked) { console.log("  ⛔ hết hạn mức:", q.reason); return send(res, 429, JSON.stringify({ error: "quota", reason: q.reason, resetSec: q.resetSec })); }
          await checkUploads(v.job); startJob(v.job); send(res, 204, "");
        }); return;
      } catch (e) { return send(res, 400, JSON.stringify({ error: "invalid request" })); }
    });
    return;
  }
  if (p.startsWith("/data/previews/")) return file(req, res, path.join(TMP, path.basename(p)));
  const fp = path.normalize(path.join(ROOT, p === "/" ? "index.html" : p));
  if (!fp.startsWith(ROOT + path.sep) && fp !== ROOT) return send(res, 403, "forbidden", "text/plain");
  file(req, res, fp);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`\n  size-washer demo → http://127.0.0.1:${PORT}\n  (ffmpeg: ${hasFfmpeg ? "có — mẻ giặt sẽ có video xem thử" : "không có — viewer sẽ hiện hướng dẫn tải về"})\n  Dừng: Ctrl+C\n`);
});
