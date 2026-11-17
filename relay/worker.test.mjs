import test from "node:test";
import assert from "node:assert/strict";
import worker, { sanitizeJob, rateOK, _resetRate } from "./worker.js";

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
