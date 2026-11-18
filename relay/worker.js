/* size-washer relay — "trạm điện" cho người dùng phổ thông.
   Trình duyệt KHÔNG giữ token nào. Trạm này giữ GitHub token (bí mật của Worker) và chỉ làm 4 việc:
     GET  /health          → {ok:true}
     GET  /data/jobs|videos → đọc docs/data/*.json (dữ liệu mới nhất, không qua cache của Pages)
     POST /dispatch        → chạy workflow submit.yml / poll.yml với dữ liệu đã kiểm tra chặt
     POST /upload/start · PUT /upload/part · POST /upload/complete → trình duyệt tải video lên R2 (từng phần)
     GET  /files/u/<id>/<tên> → kernel Kaggle tải video về (cần khoá bí mật FILES_SECRET)
   Cấu hình (wrangler.toml / dashboard):  GH_REPO="owner/repo"  ALLOWED_ORIGINS="https://owner.github.io"
   Bí mật:  wrangler secret put GH_TOKEN   (fine-grained, repo này, Actions: read/write + Contents: read) */

const WORKFLOWS = new Set(["submit.yml", "poll.yml"]);
const DATA = new Set(["jobs", "videos"]);
const MAX_BODY = 70000;

/* giới hạn tần suất (trong bộ nhớ của isolate — đủ để chặn lạm dụng thông thường; dùng KV nếu cần chặt hơn) */
const buckets = new Map();
export function rateOK(key, limit, windowMs, now = Date.now()) {
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= limit) { buckets.set(key, b); return false; }
  b.push(now); buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
  return true;
}
export function _resetRate() { buckets.clear(); }

const int = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const num = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
const str = (v, re, max) => typeof v === "string" && v.length <= max && re.test(v);
const SAFE_TEXT = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/; /* không ký tự điều khiển */

const VIDEO_NAME = /^[A-Za-z0-9._-]{1,100}\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const FILE_KEY = /^u\/[0-9a-f]{32}\/[A-Za-z0-9._-]{1,100}$/;
const PART_BYTES = 32 * 1024 * 1024; /* Worker gói miễn phí nhận tối đa 100 MB mỗi request */
const MIME = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", webm: "video/webm", avi: "video/x-msvideo" };
const hex32 = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const maxUploadBytes = env => Math.max(1, Number(env.MAX_UPLOAD_MB) || 1024) * 1024 * 1024;

/* Kiểm tra + dựng lại job từ danh sách trắng (khoá lạ bị bỏ). Trả về {job} hoặc {error}. */
export function sanitizeJob(j, base = "") {
  if (!j || typeof j !== "object" || Array.isArray(j)) return { error: "job must be an object" };
  const o = {};
  if (!str(j.id, /^[a-z0-9-]{3,60}$/, 60)) return { error: "bad id" }; o.id = j.id;
  o.label = typeof j.label === "string" && j.label.length <= 160 && SAFE_TEXT.test(j.label) ? j.label : "";
  if (!Array.isArray(j.videos) || j.videos.length < 1 || j.videos.length > 8) return { error: "videos: 1-8 items" };
  for (const v of j.videos) if (!str(v, /^[A-Za-z0-9._-]{1,100}\.(mp4|mov|mkv|webm|avi|m4v)$/i, 110)) return { error: "bad video name" };
  o.videos = j.videos.slice();
  if (j.uploads !== undefined) {
    /* video đã tải lên R2: chỉ nhận đúng địa chỉ do trạm này cấp, và phải ứng với một video trong job */
    if (!base || !j.uploads || typeof j.uploads !== "object" || Array.isArray(j.uploads)) return { error: "bad uploads" };
    o.uploads = {};
    for (const [name, url] of Object.entries(j.uploads)) {
      if (!o.videos.includes(name)) return { error: "uploads: unknown video" };
      if (typeof url !== "string" || !url.startsWith(base + "/files/") || !FILE_KEY.test(url.slice(base.length + "/files/".length))) return { error: "bad upload url" };
      o.uploads[name] = url;
    }
  }
  if (!Array.isArray(j.sizes) || j.sizes.length < 1 || j.sizes.length > 6) return { error: "sizes: 1-6 items" };
  const seen = new Set(); o.sizes = [];
  for (const s of j.sizes) {
    if (!s || !str(s.name, /^[a-z0-9-]{1,40}$/, 40) || !int(s.w, 64, 16384) || !int(s.h, 64, 16384)) return { error: "bad size" };
    if (seen.has(s.name)) return { error: "duplicate size name" }; seen.add(s.name);
    o.sizes.push({ name: s.name, w: s.w, h: s.h });
  }
  if (!["wan", "blur"].includes(j.engine)) return { error: "bad engine" }; o.engine = j.engine;
  if (!["1.3b", "14b"].includes(j.model)) return { error: "bad model" }; o.model = j.model;
  if (!["auto", "fp16", "bf16"].includes(j.dtype)) return { error: "bad dtype" }; o.dtype = j.dtype;
  if (!str(j.accelerator, /^[A-Za-z0-9]{2,40}$/, 40)) return { error: "bad accelerator" }; o.accelerator = j.accelerator;
  if (!int(j.steps, 1, 60)) return { error: "bad steps" }; o.steps = j.steps;
  if (!int(j.stride, 1, 4)) return { error: "bad stride" }; o.stride = j.stride;
  if (!num(j.gen_mpx, 0.1, 1.5)) return { error: "bad gen_mpx" }; o.gen_mpx = j.gen_mpx;
  if (!num(j.scale, 0.3, 1)) return { error: "bad scale" }; o.scale = j.scale;
  if (!num(j.guidance, 0, 20)) return { error: "bad guidance" }; o.guidance = j.guidance;
  if (!int(j.seed, 0, 2147483647)) return { error: "bad seed" }; o.seed = j.seed;
  if (!int(j.chunk, 9, 161)) return { error: "bad chunk" }; o.chunk = j.chunk;
  if (typeof j.prompt !== "string" || j.prompt.length > 2000 || !SAFE_TEXT.test(j.prompt)) return { error: "bad prompt" }; o.prompt = j.prompt;
  if (!num(j.test_seconds, 0, 600)) return { error: "bad test_seconds" }; o.test_seconds = j.test_seconds;
  if (!num(j.timeout_h, 0.1, 12)) return { error: "bad timeout_h" }; o.timeout_h = j.timeout_h;
  if (j.resume_from !== "" && !str(j.resume_from, /^[A-Za-z0-9-]{3,80}$/, 80)) return { error: "bad resume_from" }; o.resume_from = j.resume_from;
  if (!str(j.dataset, /^[A-Za-z0-9._-]{1,80}$/, 80)) return { error: "bad dataset" }; o.dataset = j.dataset;
  return { job: o };
}

function cors(req, env, extra = {}) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const h = { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin; h["Vary"] = "Origin";
    h["Access-Control-Allow-Methods"] = "GET,POST,PUT,OPTIONS"; h["Access-Control-Allow-Headers"] = "Content-Type"; h["Access-Control-Max-Age"] = "600";
  }
  return { h, ok: !origin || allowed.includes(origin) };
}
const json = (obj, status, h) => new Response(obj === null ? null : JSON.stringify(obj), { status, headers: h });

export default {
  async fetch(req, env) {
    const { h, ok } = cors(req, env);
    const url = new URL(req.url), ip = req.headers.get("CF-Connecting-IP") || "local";
    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: h });
    if (!ok) return json({ error: "origin not allowed" }, 403, h);
    if (!env.GH_TOKEN || !env.GH_REPO || !/^[\w.-]+\/[\w.-]+$/.test(env.GH_REPO)) return json({ error: "relay is not configured" }, 503, h);
    const branch = env.DEFAULT_BRANCH || "main";
    const gh = (path, init = {}) => fetch("https://api.github.com/repos/" + env.GH_REPO + path, {
      ...init, headers: { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "size-washer-relay", ...(init.headers || {}) } });

    if (url.pathname === "/health" && req.method === "GET") return json({ ok: true }, 200, h);

    const m = url.pathname.match(/^\/data\/(\w+)$/);
    if (m && req.method === "GET") {
      if (!DATA.has(m[1])) return json({ error: "not found" }, 404, h);
      if (!rateOK("r:" + ip, 120, 60000)) return json({ error: "rate limited" }, 429, h);
      const r = await gh("/contents/docs/data/" + m[1] + ".json?ref=" + encodeURIComponent(branch), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!r.ok) return json({ error: "upstream " + r.status }, 502, h);
      return new Response(await r.text(), { status: 200, headers: h });
    }

    if (url.pathname === "/dispatch" && req.method === "POST") {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: "body too large" }, 413, h);
      let body; try { body = JSON.parse(raw); } catch (e) { return json({ error: "invalid JSON" }, 400, h); }
      if (!body || !WORKFLOWS.has(body.workflow)) return json({ error: "workflow not allowed" }, 400, h);
      let inputs = {};
      if (body.workflow === "submit.yml") {
        if (!rateOK("d:" + ip, Number(env.MAX_JOBS_PER_HOUR) || 6, 3600000)) return json({ error: "rate limited" }, 429, h);
        let job; try { job = JSON.parse(String(body.inputs && body.inputs.job)); } catch (e) { return json({ error: "invalid job" }, 400, h); }
        const v = sanitizeJob(job, url.origin); if (v.error) return json({ error: v.error }, 400, h);
        inputs = { job: JSON.stringify(v.job) };
      } else if (!rateOK("p:" + ip, 6, 3600000)) return json({ error: "rate limited" }, 429, h);
      const r = await gh("/actions/workflows/" + body.workflow + "/dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: branch, inputs }) });
      if (r.status === 204) return json(null, 204, h);
      return json({ error: "upstream " + r.status }, r.status === 404 || r.status === 422 ? r.status : 502, h);
    }

    /* ---- tải video lên R2 (từng phần) ---- */
    if (url.pathname.startsWith("/upload/")) {
      if (!env.VIDEOS) return json({ error: "uploads are not configured" }, 503, h);
      const maxB = maxUploadBytes(env);
      if (url.pathname === "/upload/start" && req.method === "POST") {
        if (!rateOK("u:" + ip, Number(env.MAX_UPLOADS_PER_HOUR) || 10, 3600000)) return json({ error: "rate limited" }, 429, h);
        let b; try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: "invalid JSON" }, 400, h); }
        if (!b || !str(b.name, VIDEO_NAME, 110)) return json({ error: "bad name" }, 400, h);
        if (!int(b.size, 1, maxB)) return json({ error: "file too large" }, 413, h);
        const key = "u/" + hex32() + "/" + b.name;
        const mp = await env.VIDEOS.createMultipartUpload(key, { httpMetadata: { contentType: MIME[b.name.split(".").pop().toLowerCase()] || "application/octet-stream" } });
        return json({ key, uploadId: mp.uploadId, partSize: PART_BYTES, parts: Math.ceil(b.size / PART_BYTES) }, 200, h);
      }
      if (url.pathname === "/upload/part" && req.method === "PUT") {
        const key = url.searchParams.get("key") || "", uploadId = url.searchParams.get("uploadId") || "", n = Number(url.searchParams.get("n"));
        if (!FILE_KEY.test(key) || !/^[\w.~-]{10,400}$/.test(uploadId) || !int(n, 1, Math.ceil(maxB / PART_BYTES))) return json({ error: "bad part" }, 400, h);
        const len = Number(req.headers.get("Content-Length"));
        if (!Number.isFinite(len) || len < 1 || len > PART_BYTES) return json({ error: "bad part size" }, 413, h);
        try {
          const part = await env.VIDEOS.resumeMultipartUpload(key, uploadId).uploadPart(n, await req.arrayBuffer());
          return json({ partNumber: part.partNumber, etag: part.etag }, 200, h);
        } catch (e) { return json({ error: "part failed" }, 502, h); }
      }
      if (url.pathname === "/upload/complete" && req.method === "POST") {
        let b; try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: "invalid JSON" }, 400, h); }
        if (!b || !FILE_KEY.test(b.key || "") || !/^[\w.~-]{10,400}$/.test(b.uploadId || "") || !Array.isArray(b.parts) || b.parts.length < 1 || b.parts.length > Math.ceil(maxB / PART_BYTES)) return json({ error: "bad request" }, 400, h);
        const parts = b.parts.map(p => ({ partNumber: p && p.partNumber, etag: p && p.etag }));
        if (parts.some(p => !int(p.partNumber, 1, 10000) || typeof p.etag !== "string" || p.etag.length > 200)) return json({ error: "bad parts" }, 400, h);
        try {
          const obj = await env.VIDEOS.resumeMultipartUpload(b.key, b.uploadId).complete(parts);
          if (obj.size > maxB) { await env.VIDEOS.delete(b.key); return json({ error: "file too large" }, 413, h); }
          return json({ url: url.origin + "/files/" + b.key, size: obj.size }, 200, h);
        } catch (e) { return json({ error: "complete failed" }, 502, h); }
      }
      return json({ error: "not found" }, 404, h);
    }

    /* ---- kernel Kaggle tải video về (không có Origin; cần Authorization: Bearer FILES_SECRET) ---- */
    if (url.pathname.startsWith("/files/") && (req.method === "GET" || req.method === "HEAD")) {
      if (!env.VIDEOS || !env.FILES_SECRET) return json({ error: "uploads are not configured" }, 503, h);
      /* repo công khai ⇒ địa chỉ file nằm trong input công khai của workflow; chỉ kernel (có khoá bí mật) mới tải được */
      if (!safeEq(req.headers.get("Authorization") || "", "Bearer " + env.FILES_SECRET)) return json({ error: "unauthorized" }, 401, h);
      const key = url.pathname.slice("/files/".length);
      if (!FILE_KEY.test(key)) return json({ error: "not found" }, 404, h);
      const obj = req.method === "HEAD" ? await env.VIDEOS.head(key) : await env.VIDEOS.get(key, { range: req.headers });
      if (!obj) return json({ error: "not found" }, 404, h);
      const fh = new Headers({ "Content-Type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", ETag: obj.httpEtag });
      let status = 200;
      if (obj.range && req.method === "GET") {
        const r = obj.range, off = r.offset ?? 0, len = r.length ?? (obj.size - off);
        fh.set("Content-Range", "bytes " + off + "-" + (off + len - 1) + "/" + obj.size); fh.set("Content-Length", String(len)); status = 206;
      } else fh.set("Content-Length", String(obj.size));
      return new Response(req.method === "HEAD" ? null : obj.body, { status, headers: fh });
    }

    return json({ error: "not found" }, 404, h);
  }
};
