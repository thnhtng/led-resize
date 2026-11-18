import test from "node:test";
import assert from "node:assert/strict";
import worker, { sanitizeJob, rateOK, rateInfo, computeQuota, _resetRate, _resetQuotaCache } from "./worker.js";
import { fakeR2 } from "../demo/fake-r2.mjs";
const resetAll = () => { _resetRate(); _resetQuotaCache(); };

const ENV = { GH_TOKEN: "ghp_SECRET_TOKEN", GH_REPO: "acme/led-resize", ALLOWED_ORIGINS: "https://acme.github.io", DEFAULT_BRANCH: "main" };
const JOB = { id: "j20261117-120000ab", label: "fanta.mp4 → 4128x1290", videos: ["fanta.mp4"], sizes: [{ name: "townhall", w: 4128, h: 1290 }],
  engine: "wan", model: "1.3b", dtype: "auto", accelerator: "NvidiaTeslaT4", steps: 25, stride: 1, gen_mpx: 0.5, scale: 1, guidance: 5, seed: 42, chunk: 81,
  prompt: "Seamless extension, don't add text", test_seconds: 2, timeout_h: 11, resume_from: "", dataset: "led-videos" };
const req = (path, init = {}, origin = "https://acme.github.io") => new Request("https://relay.example" + path, { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers || {}) } });
const post = (body, origin) => req("/dispatch", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }, origin);

beforeEachReset();
function beforeEachReset() { /* hạn mức có cache trong isolate: xoá giữa các test */ }
function mockGitHub(handler) {
  const calls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

test("health + CORS only for allowed origins", async () => {
  resetAll();
  const ok = await worker.fetch(req("/health"), ENV);
  assert.equal(ok.status, 200); assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://acme.github.io");
  const bad = await worker.fetch(req("/health", {}, "https://evil.example"), ENV);
  assert.equal(bad.status, 403); assert.equal(bad.headers.get("Access-Control-Allow-Origin"), null);
  const pre = await worker.fetch(req("/dispatch", { method: "OPTIONS" }), ENV);
  assert.equal(pre.status, 204);
});

test("not configured → 503, never leaks anything", async () => {
  const r = await worker.fetch(req("/health"), { ALLOWED_ORIGINS: ENV.ALLOWED_ORIGINS });
  assert.equal(r.status, 503);
});

test("valid job is dispatched with the token server-side and a rebuilt (sanitised) payload", async () => {
  resetAll();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    const r = await worker.fetch(post({ workflow: "submit.yml", inputs: { job: JSON.stringify({ ...JOB, evil: "x", __proto__: { a: 1 } }) } }), ENV);
    assert.equal(r.status, 204);
    const c = gh.calls.find(x => x.url.endsWith("/dispatches"));
    assert.equal(gh.calls.filter(x => x.url.endsWith("/dispatches")).length, 1);
    assert.equal(c.url, "https://api.github.com/repos/acme/led-resize/actions/workflows/submit.yml/dispatches");
    assert.equal(c.init.headers.Authorization, "Bearer ghp_SECRET_TOKEN");
    const sent = JSON.parse(c.init.body); assert.equal(sent.ref, "main");
    const job = JSON.parse(sent.inputs.job); assert.equal(job.evil, undefined); assert.deepEqual(job.sizes, JOB.sizes); assert.equal(job.prompt, JOB.prompt);
    assert.ok(!(await r.text()).includes("SECRET"));
  } finally { gh.restore(); }
});

test("rejects unknown workflows, bad JSON, oversize bodies", async () => {
  resetAll();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    assert.equal((await worker.fetch(post({ workflow: "release.yml", inputs: {} }), ENV)).status, 400);
    assert.equal((await worker.fetch(post("{not json"), ENV)).status, 400);
    assert.equal((await worker.fetch(post("x".repeat(80000)), ENV)).status, 413);
    assert.equal((await worker.fetch(post({ workflow: "submit.yml", inputs: { job: "{bad" } }), ENV)).status, 400);
    assert.equal(gh.calls.filter(x => x.url.endsWith("/dispatches")).length, 0, "nothing may be dispatched to GitHub");
  } finally { gh.restore(); }
});

test("sanitizeJob blocks path traversal, shell-ish names, huge values and control chars", () => {
  const bad = [
    { ...JOB, videos: ["../../etc/passwd.mp4"] }, { ...JOB, videos: ["a b.mp4"] }, { ...JOB, videos: ["x.sh"] }, { ...JOB, videos: [] },
    { ...JOB, sizes: [{ name: "a", w: 10, h: 1290 }] }, { ...JOB, sizes: [{ name: "a", w: 4128, h: 99999 }] }, { ...JOB, sizes: [{ name: "A B", w: 4128, h: 1290 }] },
    { ...JOB, engine: "rm -rf" }, { ...JOB, model: "70b" }, { ...JOB, accelerator: "T4; curl x" }, { ...JOB, steps: 9999 }, { ...JOB, timeout_h: 99 },
    { ...JOB, prompt: "a".repeat(3000) }, { ...JOB, prompt: "bad\u0000char" }, { ...JOB, id: "../x" }, { ...JOB, dataset: "a/b" }, { ...JOB, resume_from: "../../x" }, null, [], "str"
  ];
  for (const j of bad) assert.ok(sanitizeJob(j).error, "should reject " + JSON.stringify(j).slice(0, 80));
  assert.ok(sanitizeJob(JOB).job);
  assert.ok(sanitizeJob({ ...JOB, prompt: "line1\nline2 ''' still a plain string" }).job, "newlines/quotes allowed (runner escapes them)");
});

test("rate limits submissions per client", async () => {
  resetAll();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    const mk = i => post({ workflow: "submit.yml", inputs: { job: JSON.stringify({ ...JOB, id: "job-" + i + "-abc" }) } });
    const codes = []; for (let i = 0; i < 8; i++) codes.push((await worker.fetch(mk(i), { ...ENV, MAX_JOBS_PER_HOUR: "3" })).status);
    assert.deepEqual(codes, [204, 204, 204, 429, 429, 429, 429, 429]);
    assert.equal(gh.calls.filter(x => x.url.endsWith("/dispatches")).length, 3);
  } finally { gh.restore(); }
  assert.equal(rateOK("k", 1, 1000, 0), true); assert.equal(rateOK("k", 1, 1000, 500), false); assert.equal(rateOK("k", 1, 1000, 2000), true);
});

test("/data proxies the JSON (fresh) and refuses other files", async () => {
  resetAll();
  const gh = mockGitHub(url => url.includes("/contents/docs/data/jobs.json") ? new Response('[{"id":"a"}]', { status: 200 }) : new Response("", { status: 404 }));
  try {
    const r = await worker.fetch(req("/data/jobs"), ENV);
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), [{ id: "a" }]);
    assert.ok(gh.calls[0].url.endsWith("jobs.json?ref=main"));
    assert.equal((await worker.fetch(req("/data/secrets"), ENV)).status, 404);
    assert.equal((await worker.fetch(req("/data/..%2f..%2fpackage"), ENV)).status, 404);
  } finally { gh.restore(); }
});

test("upstream failures are reported without leaking details; poll.yml has no inputs", async () => {
  resetAll();
  let gh = mockGitHub(() => new Response('{"message":"Bad credentials ghp_SECRET_TOKEN"}', { status: 401 }));
  try {
    const r = await worker.fetch(post({ workflow: "poll.yml", inputs: { anything: "x" } }), ENV);
    assert.equal(r.status, 502); assert.ok(!(await r.text()).includes("SECRET"));
    assert.deepEqual(JSON.parse(gh.calls.find(x => x.url.endsWith("/dispatches")).init.body).inputs, {});
  } finally { gh.restore(); }
});

/* ---------- tải video lên R2 ---------- */
const KEY = { Authorization: "Bearer files-secret-123" };
const ENVR = () => ({ ...ENV, FILES_SECRET: "files-secret-123", VIDEOS: fakeR2(), MAX_UPLOAD_MB: "1", MAX_UPLOADS_PER_HOUR: "3" });
const put = (path, data, origin) => req(path, { method: "PUT", body: data, headers: { "Content-Length": String(data.length) } }, origin);

test("upload: start → part → complete → kernel downloads (with Range)", async () => {
  resetAll(); const env = ENVR();
  const st = await worker.fetch(req("/upload/start", { method: "POST", body: JSON.stringify({ name: "TV.mp4", size: 10 }) }), env);
  assert.equal(st.status, 200); const s = await st.json();
  assert.match(s.key, /^u\/[0-9a-f]{32}\/TV\.mp4$/); assert.equal(s.parts, 1);
  const pr = await worker.fetch(put("/upload/part?key=" + encodeURIComponent(s.key) + "&uploadId=" + s.uploadId + "&n=1", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), env);
  assert.equal(pr.status, 200); const p = await pr.json();
  const cr = await worker.fetch(req("/upload/complete", { method: "POST", body: JSON.stringify({ key: s.key, uploadId: s.uploadId, parts: [p] }) }), env);
  assert.equal(cr.status, 200); const c = await cr.json();
  assert.equal(c.url, "https://relay.example/files/" + s.key); assert.equal(c.size, 10);
  /* kernel: không có Origin */
  assert.equal((await worker.fetch(req("/files/" + s.key, {}, null), env)).status, 401, "no secret → 401");
  assert.equal((await worker.fetch(req("/files/" + s.key, { headers: { Authorization: "Bearer wrong" } }, null), env)).status, 401);
  const dl = await worker.fetch(req("/files/" + s.key, { headers: KEY }, null), env);
  assert.equal(dl.status, 200); assert.equal(dl.headers.get("Content-Type"), "video/mp4"); assert.equal(dl.headers.get("Content-Length"), "10");
  const rg = await worker.fetch(req("/files/" + s.key, { headers: { ...KEY, Range: "bytes=2-4" } }, null), env);
  assert.equal(rg.status, 206); assert.equal(rg.headers.get("Content-Range"), "bytes 2-4/10"); assert.deepEqual([...new Uint8Array(await rg.arrayBuffer())], [3, 4, 5]);
  assert.equal((await worker.fetch(req("/files/u/" + "0".repeat(32) + "/x.mp4", { headers: KEY }, null), env)).status, 404);
  assert.equal((await worker.fetch(req("/files/..%2Fsecret", { headers: KEY }, null), env)).status, 404);
});

test("upload: rejects bad names, oversize, foreign origin, missing R2, rate limit", async () => {
  resetAll(); const env = ENVR();
  const start = (body, origin, e = env) => worker.fetch(req("/upload/start", { method: "POST", body: JSON.stringify(body) }, origin), e);
  assert.equal((await start({ name: "../x.mp4", size: 5 })).status, 400);
  assert.equal((await start({ name: "a.exe", size: 5 })).status, 400);
  assert.equal((await start({ name: "a.mp4", size: 2 * 1024 * 1024 })).status, 413);
  assert.equal((await start({ name: "a.mp4", size: 5 }, "https://evil.example")).status, 403);
  assert.equal((await start({ name: "a.mp4", size: 5 }, undefined, { ...ENV })).status, 503);
  resetAll();
  for (let i = 0; i < 3; i++) assert.equal((await start({ name: "a.mp4", size: 5 })).status, 200);
  assert.equal((await start({ name: "a.mp4", size: 5 })).status, 429);
  /* part: key giả / thiếu độ dài / quá lớn */
  const bad = await worker.fetch(put("/upload/part?key=u/zz/a.mp4&uploadId=abcdefghijk&n=1", new Uint8Array(3)), env);
  assert.equal(bad.status, 400);
});

test("sanitizeJob: uploads only accept this relay's file URLs", () => {
  const base = "https://relay.example", url = base + "/files/u/" + "a".repeat(32) + "/fanta.mp4";
  const ok = sanitizeJob({ ...JOB, uploads: { "fanta.mp4": url } }, base);
  assert.ok(ok.job && ok.job.uploads["fanta.mp4"] === url);
  assert.ok(sanitizeJob({ ...JOB, uploads: { "fanta.mp4": "https://evil.example/files/u/" + "a".repeat(32) + "/fanta.mp4" } }, base).error);
  assert.ok(sanitizeJob({ ...JOB, uploads: { "fanta.mp4": base + "/files/u/short/fanta.mp4" } }, base).error);
  assert.ok(sanitizeJob({ ...JOB, uploads: { "other.mp4": url } }, base).error);
  assert.ok(sanitizeJob({ ...JOB, uploads: { "fanta.mp4": url } }).error, "no base → reject");
  assert.ok(sanitizeJob({ ...JOB, uploads: ["x"] }, base).error);
  assert.equal(sanitizeJob(JOB, base).job.uploads, undefined);
});


/* ---------- hạn mức ---------- */
const NOW = Date.parse("2026-11-18T12:00:00Z"), iso = ms => new Date(NOW - ms).toISOString().replace(/\.\d+Z$/, "Z"), H = 3600000;
const QENV = { QUOTA_STORAGE_GB: "1", QUOTA_GPU_HOURS_WEEK: "10", QUOTA_JOBS_PER_DAY: "3", MAX_JOBS_PER_HOUR: "6", MAX_UPLOADS_PER_HOUR: "10" };
const wanJob = (agoH, durH, extra = {}) => ({ id: "x", engine: "wan", kernel: "u/x", submitted_at: iso(agoH * H), finished_at: iso((agoH - durH) * H), status: "done", ...extra });

test("quota: GPU hours are summed over a rolling week, only for AI (wan) jobs", () => {
  const q = computeQuota({ jobs: [wanJob(10, 2), wanJob(30, 3), wanJob(200, 5), { ...wanJob(5, 1), engine: "blur" }], env: QENV, now: NOW });
  const g = q.meters.find(m => m.id === "gpu");
  assert.equal(g.used, 5, "2h + 3h inside 7 days; 200h-old job and blur job ignored"); assert.equal(g.limit, 10); assert.equal(q.locked, false);
});
test("quota: running job counts up to now; GPU exhausted ⇒ locked with reset time", () => {
  const q = computeQuota({ jobs: [wanJob(11, 9, { finished_at: undefined, status: "running" }), wanJob(40, 2)], env: QENV, now: NOW });
  assert.equal(q.locked, true); assert.equal(q.reason, "gpu");
  const g = q.meters.find(m => m.id === "gpu"); assert.equal(g.used, 13, "11h running (counted up to now) + 2h finished");
  assert.ok(q.resetSec > 0 && q.resetSec <= 7 * 86400);
});
test("quota: failed/cancelled jobs without a finish time do not burn GPU hours", () => {
  const q = computeQuota({ jobs: [wanJob(20, 0, { finished_at: undefined, status: "error" }), wanJob(20, 0, { finished_at: undefined, status: "cancelled" })], env: QENV, now: NOW });
  assert.equal(q.meters.find(m => m.id === "gpu").used, 0);
});
test("quota: daily job cap, per-IP caps and storage lock everything", () => {
  const day = computeQuota({ jobs: [wanJob(1, 0.1), wanJob(2, 0.1), wanJob(3, 0.1)], env: QENV, now: NOW });
  assert.equal(day.reason, "jobsDay"); assert.ok(day.resetSec > 0);
  assert.equal(computeQuota({ jobs: [], ipJobs: { used: 6, limit: 6, resetMs: 90000 }, env: QENV, now: NOW }).reason, "jobsHour");
  assert.equal(computeQuota({ jobs: [], ipUploads: { used: 10, limit: 10, resetMs: 5000 }, env: QENV, now: NOW }).resetSec, 5);
  const full = computeQuota({ jobs: [], storage: { used: 1024 ** 3, oldest: NOW - 2 * 24 * H }, env: QENV, now: NOW });
  assert.equal(full.reason, "storage"); assert.equal(full.resetSec, 24 * 3600, "oldest object expires 3 days after upload");
  assert.equal(computeQuota({ jobs: [], env: QENV, now: NOW }).locked, false);
  assert.equal(computeQuota({ jobs: [], pending: 3, env: QENV, now: NOW }).reason, "jobsDay", "just-dispatched jobs count before they reach jobs.json");
});
test("quota: GET /quota reports real numbers; dispatch and upload are refused when exhausted", async () => {
  resetAll();
  const r2 = fakeR2(); r2.list = async () => ({ objects: [{ size: 700 * 1024 * 1024, uploaded: new Date(Date.now() - H) }], truncated: false });
  const env = { ...ENV, ...QENV, VIDEOS: r2, FILES_SECRET: "s" };
  const recent = Array.from({ length: 3 }, (_, i) => ({ ...wanJob(0, 0), submitted_at: new Date(Date.now() - (i + 1) * H).toISOString(), finished_at: new Date(Date.now() - i * H).toISOString() }));
  let jobs = recent.slice(0, 1);
  const gh = mockGitHub(url => url.includes("/contents/docs/data/jobs.json") ? new Response(JSON.stringify(jobs), { status: 200 }) : new Response(null, { status: 204 }));
  try {
    const q = await (await worker.fetch(req("/quota"), env)).json();
    assert.equal(q.locked, false); assert.equal(q.meters.find(m => m.id === "storage").used, 700 * 1024 * 1024);
    assert.equal(q.meters.find(m => m.id === "jobsDay").used, 1);
    /* chưa khoá: tải lên 100 MB còn vừa 1 GB */
    assert.equal((await worker.fetch(req("/upload/start", { method: "POST", body: JSON.stringify({ name: "a.mp4", size: 100 * 1024 * 1024 }) }), env)).status, 200);
    /* 400 MB nữa sẽ vượt kho (700 + 400 > 1024) ⇒ 429 reason storage */
    const big = await worker.fetch(req("/upload/start", { method: "POST", body: JSON.stringify({ name: "b.mp4", size: 400 * 1024 * 1024 }) }), { ...env, MAX_UPLOAD_MB: "1024" });
    assert.equal(big.status, 429); assert.equal((await big.json()).reason, "storage");
    /* hết hạn mức mẻ/ngày ⇒ dispatch bị từ chối, không gọi GitHub dispatch */
    jobs = recent; resetAll(); gh.calls.length = 0;
    const d = await worker.fetch(post({ workflow: "submit.yml", inputs: { job: JSON.stringify(JOB) } }), env);
    assert.equal(d.status, 429); const dj = await d.json(); assert.equal(dj.error, "quota"); assert.equal(dj.reason, "jobsDay"); assert.ok(dj.resetSec > 0);
    assert.equal(gh.calls.filter(c => c.url.endsWith("/dispatches")).length, 0);
    /* poll vẫn được phép để xem kết quả */
    assert.equal((await worker.fetch(post({ workflow: "poll.yml", inputs: {} }), env)).status, 204);
    const lk = await (await worker.fetch(req("/quota"), env)).json(); assert.equal(lk.locked, true);
    assert.equal((await worker.fetch(req("/quota", {}, "https://evil.example"), env)).status, 403);
    assert.ok(!JSON.stringify(lk).includes("SECRET"));
  } finally { gh.restore(); }
});
