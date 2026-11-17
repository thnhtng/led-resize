/* Tấm vải: video được "may" thành một mảnh vải mềm (lưới đỉnh biến dạng theo thời gian).
   Có đường may viền, vân dệt, và các kiểu chuyển động: nhàu trong lồng giặt, bay phấp phới, treo trên dây phơi. */
import * as THREE from "three";

let WEAVE = null;
function weaveTexture() {
  if (WEAVE) return WEAVE;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#808080"; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) { g.fillStyle = (i / 4) % 2 ? "#b8b8b8" : "#5c5c5c"; g.fillRect(i, 0, 2, 64); g.fillStyle = (i / 4) % 2 ? "#5c5c5c" : "#b8b8b8"; g.fillRect(0, i, 64, 2); }
  WEAVE = new THREE.CanvasTexture(c);
  WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping; WEAVE.repeat.set(10, 7);
  return WEAVE;
}

/* ảnh → texture vải: phủ kín, thêm viền gấu + đường may chỉ trắng + vân dệt mờ */
export function fabricTexture(img, aspect) {
  const W = 360, H = Math.max(120, Math.round(W / (aspect || 1.6)));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  if (img && img.naturalWidth) {
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    g.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  } else {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#ffd9b8"); gr.addColorStop(1, "#ff9fb0");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.moveTo(W / 2 - 22, H / 2 - 28); g.lineTo(W / 2 + 30, H / 2); g.lineTo(W / 2 - 22, H / 2 + 28); g.closePath(); g.fill();
  }
  g.globalAlpha = 0.07; g.strokeStyle = "#000"; g.lineWidth = 1;
  for (let i = -H; i < W; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
  g.globalAlpha = 1;
  g.strokeStyle = "rgba(255,255,255,.42)"; g.lineWidth = 14; g.strokeRect(0, 0, W, H);
  g.setLineDash([9, 7]); g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 2.5; g.strokeRect(11, 11, W - 22, H - 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Cloth {
  constructor(w = 0.62, h = 0.4) {
    this.sx = 22; this.sy = 14; this.phase = Math.random() * 10;
    this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, bumpMap: weaveTexture(), bumpScale: 0.9 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.anchor = "center";
    this.build(w, h);
  }
  build(w, h) {
    if (this.geo) this.geo.dispose();
    this.w = w; this.h = h;
    this.geo = new THREE.PlaneGeometry(w, h, this.sx, this.sy);
    this.base = this.geo.attributes.position.array.slice();
    this.mesh.geometry = this.geo;
    this.setAnchor(this.anchor);
  }
  setAnchor(a) { this.anchor = a; this.mesh.position.y = a === "top" ? -this.h / 2 : 0; }
  /* kích thước theo tỉ lệ video (cạnh dài nhất = max) */
  fit(aspect, max = 0.62) {
    const asp = aspect || 1.6, w = asp >= 1 ? max : max * asp, h = asp >= 1 ? max / asp : max;
    this.build(w, h);
  }
  setTexture(tex) { if (this.mat.map && this.mat.map !== tex) this.mat.map.dispose(); this.mat.map = tex; this.mat.needsUpdate = true; }
  /* mode: 'hang' treo / 'drum' nhàu trong lồng / 'fly' bay phấp phới */
  update(t, mode, amp, speed = 1) {
    const p = this.geo.attributes.position, b = this.base, n = p.count, w = this.w, h = this.h, T = t * speed + this.phase;
    for (let i = 0; i < n; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], u = x / w + 0.5, v = y / h + 0.5; /* v=1 là mép trên */
      let dx = 0, dy = 0, dz = 0;
      if (mode === "hang") {
        const k = Math.pow(1 - v, 1.25);
        dz = amp * k * (Math.sin(u * 5.5 + T * 1.7) * 0.6 + Math.sin(u * 10 - T * 2.4 + v * 3) * 0.4);
        dx = amp * 0.4 * k * Math.sin(T * 1.1 + v * 2.2);
        dy = -Math.abs(dz) * 0.22;
      } else if (mode === "drum") {
        dz = amp * (Math.sin(u * 6.5 + v * 3.2 + T * 1.4) * 0.5 + Math.sin(u * 12 - v * 7 + T * 1.9) * 0.3 + Math.sin(v * 9 + T * 1.1) * 0.4);
        dx = x * (-amp * 1.6 * (0.5 + 0.5 * Math.sin(u * 4 + T * 1.2)));
        dy = y * (-amp * 1.2 * (0.5 + 0.5 * Math.sin(v * 5 + T)));
      } else { /* fly */
        dz = amp * (Math.sin(u * 7 + T * 7) * 0.5 + Math.sin(v * 6 - T * 8) * 0.5) * (0.4 + 0.6 * (1 - v));
        dx = amp * 0.35 * Math.sin(v * 5 + T * 6);
        dy = -Math.abs(dz) * 0.25;
      }
      p.setXYZ(i, x + dx, y + dy, dz);
    }
    p.needsUpdate = true; this.geo.computeVertexNormals();
  }
  dispose() { this.geo.dispose(); if (this.mat.map) this.mat.map.dispose(); this.mat.dispose(); }
}
