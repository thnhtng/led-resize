import test from "node:test";
import assert from "node:assert/strict";
import worker, { sanitizeJob, rateOK, _resetRate } from "./worker.js";
import { fakeR2 } from "../demo/fake-r2.mjs";

const ENV = { GH_TOKEN: "ghp_SECRET_TOKEN", GH_REPO: "acme/led-resize", ALLOWED_ORIGINS: "https://acme.github.io", DEFAULT_BRANCH: "main" };
const JOB = { id: "j20261117-120000ab", label: "fanta.mp4 → 4128x1290", videos: ["fanta.mp4"], sizes: [{ name: "townhall", w: 4128, h: 1290 }],
  engine: "wan", model: "1.3b", dtype: "auto", accelerator: "NvidiaTeslaT4", steps: 25, stride: 1, gen_mpx: 0.5, scale: 1, guidance: 5, seed: 42, chunk: 81,
  prompt: "Seamless extension, don't add text", test_seconds: 2, timeout_h: 11, resume_from: "", dataset: "led-videos" };
const req = (path, init = {}, origin = "https://acme.github.io") => new Request("https://relay.example" + path, { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers || {}) } });
const post = (body, origin) => req("/dispatch", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }, origin);

function mockGitHub(handler) {
  const calls = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

test("health + CORS only for allowed origins", async () => {
  _resetRate();
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
  _resetRate();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    const r = await worker.fetch(post({ workflow: "submit.yml", inputs: { job: JSON.stringify({ ...JOB, evil: "x", __proto__: { a: 1 } }) } }), ENV);
    assert.equal(r.status, 204);
    assert.equal(gh.calls.length, 1);
    const c = gh.calls[0];
    assert.equal(c.url, "https://api.github.com/repos/acme/led-resize/actions/workflows/submit.yml/dispatches");
    assert.equal(c.init.headers.Authorization, "Bearer ghp_SECRET_TOKEN");
    const sent = JSON.parse(c.init.body); assert.equal(sent.ref, "main");
    const job = JSON.parse(sent.inputs.job); assert.equal(job.evil, undefined); assert.deepEqual(job.sizes, JOB.sizes); assert.equal(job.prompt, JOB.prompt);
    assert.ok(!(await r.text()).includes("SECRET"));
  } finally { gh.restore(); }
});

test("rejects unknown workflows, bad JSON, oversize bodies", async () => {
  _resetRate();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    assert.equal((await worker.fetch(post({ workflow: "release.yml", inputs: {} }), ENV)).status, 400);
    assert.equal((await worker.fetch(post("{not json"), ENV)).status, 400);
    assert.equal((await worker.fetch(post("x".repeat(80000)), ENV)).status, 413);
    assert.equal((await worker.fetch(post({ workflow: "submit.yml", inputs: { job: "{bad" } }), ENV)).status, 400);
    assert.equal(gh.calls.length, 0, "nothing may reach GitHub");
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
  _resetRate();
  const gh = mockGitHub(() => new Response(null, { status: 204 }));
  try {
    const mk = i => post({ workflow: "submit.yml", inputs: { job: JSON.stringify({ ...JOB, id: "job-" + i + "-abc" }) } });
    const codes = []; for (let i = 0; i < 8; i++) codes.push((await worker.fetch(mk(i), { ...ENV, MAX_JOBS_PER_HOUR: "3" })).status);
    assert.deepEqual(codes, [204, 204, 204, 429, 429, 429, 429, 429]);
    assert.equal(gh.calls.length, 3);
  } finally { gh.restore(); }
  assert.equal(rateOK("k", 1, 1000, 0), true); assert.equal(rateOK("k", 1, 1000, 500), false); assert.equal(rateOK("k", 1, 1000, 2000), true);
});

test("/data proxies the JSON (fresh) and refuses other files", async () => {
  _resetRate();
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
  _resetRate();
  let gh = mockGitHub(() => new Response('{"message":"Bad credentials ghp_SECRET_TOKEN"}', { status: 401 }));
  try {
    const r = await worker.fetch(post({ workflow: "poll.yml", inputs: { anything: "x" } }), ENV);
    assert.equal(r.status, 502); assert.ok(!(await r.text()).includes("SECRET"));
    assert.deepEqual(JSON.parse(gh.calls[0].init.body).inputs, {});
  } finally { gh.restore(); }
});

/* ---------- tải video lên R2 ---------- */
const KEY = { Authorization: "Bearer files-secret-123" };
const ENVR = () => ({ ...ENV, FILES_SECRET: "files-secret-123", VIDEOS: fakeR2(), MAX_UPLOAD_MB: "1", MAX_UPLOADS_PER_HOUR: "3" });
const put = (path, data, origin) => req(path, { method: "PUT", body: data, headers: { "Content-Length": String(data.length) } }, origin);

test("upload: start → part → complete → kernel downloads (with Range)", async () => {
  _resetRate(); const env = ENVR();
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
  _resetRate(); const env = ENVR();
  const start = (body, origin, e = env) => worker.fetch(req("/upload/start", { method: "POST", body: JSON.stringify(body) }, origin), e);
  assert.equal((await start({ name: "../x.mp4", size: 5 })).status, 400);
  assert.equal((await start({ name: "a.exe", size: 5 })).status, 400);
  assert.equal((await start({ name: "a.mp4", size: 2 * 1024 * 1024 })).status, 413);
  assert.equal((await start({ name: "a.mp4", size: 5 }, "https://evil.example")).status, 403);
  assert.equal((await start({ name: "a.mp4", size: 5 }, undefined, { ...ENV })).status, 503);
  _resetRate();
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
