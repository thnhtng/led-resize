/* R2 giả trong bộ nhớ (đủ cho multipart + Range) — dùng cho demo và test. */
export function fakeR2() {
  const objs = new Map(), ups = new Map();
  return {
    objs,
    async createMultipartUpload(key, opt) { const id = "up-" + Math.random().toString(36).slice(2) + "xxxxxxxx"; ups.set(id, { key, parts: new Map(), opt }); return { uploadId: id }; },
    resumeMultipartUpload(key, id) {
      const u = ups.get(id); if (!u || u.key !== key) throw new Error("no such upload");
      return {
        async uploadPart(n, data) { const etag = "e" + n; u.parts.set(n, { etag, data: new Uint8Array(data) }); return { partNumber: n, etag }; },
        async complete(parts) {
          const bufs = parts.map(p => { const x = u.parts.get(p.partNumber); if (!x || x.etag !== p.etag) throw new Error("bad part"); return x.data; });
          const all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; }
          objs.set(key, { data: all, httpMetadata: u.opt.httpMetadata, uploaded: new Date() }); return { size: all.length };
        },
      };
    },
    async head(key) { const o = objs.get(key); return o && { size: o.data.length, httpEtag: '"x"', httpMetadata: o.httpMetadata }; },
    async get(key, opt) {
      const o = objs.get(key); if (!o) return null;
      const m = opt && opt.range && opt.range.get && /bytes=(\d+)-(\d*)/.exec(opt.range.get("range") || "");
      const base = { size: o.data.length, httpEtag: '"x"', httpMetadata: o.httpMetadata };
      if (m) { const off = +m[1], end = m[2] ? +m[2] : o.data.length - 1; return { ...base, range: { offset: off, length: end - off + 1 }, body: o.data.slice(off, end + 1) }; }
      return { ...base, body: o.data };
    },
    async delete(key) { objs.delete(key); },
    async list({ prefix = "" } = {}) { return { objects: [...objs].filter(([k]) => k.startsWith(prefix)).map(([key, o]) => ({ key, size: o.data.length, uploaded: o.uploaded || new Date() })), truncated: false }; },
  };
}
