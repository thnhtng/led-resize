/* Cảnh 3D của size-washer: máy giặt, tấm vải (video), Bọt, 3 chai nước giặt, giỏ đồ, dây phơi, ổ điện + phích cắm.
   Mọi thứ dựng bằng code (không cần file model). Muốn dùng model 3D riêng: đặt file .glb vào docs/models/
   (xem docs/models/README.md) — scene sẽ tự thay thế phần dựng bằng code nếu tìm thấy file. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mascotCanvas } from "./mascot.js";
import { Cloth, fabricTexture } from "./cloth.js";

export const MODE_ORDER = ["quick", "normal", "deep"];
const MODE_COLOR = { quick: 0x6fd3ff, normal: 0x3a86f0, deep: 0xffc857 };
const MODE_DOTS = { quick: 1, normal: 2, deep: 3 };
const LIGHT_COLOR = { idle: 0x3a86f0, hungry: 0x7cc0ff, loaded: 0x3a86f0, washing: 0x55a8ff, done: 0x7dffc4, error: 0xff4a5e, off: 0x3a86f0 };
const LIGHT_POWER = { idle: 2.5, hungry: 8, loaded: 4.5, washing: 9, done: 8, error: 6, off: 0 };
const FONT = '"Geist Mono","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",ui-monospace,Menlo,monospace';

/* dây phơi (đặt phía trước máy, trên cao, để vải bay ra theo đường thẳng) */
const LINE_Z = 0.9, LINE_Y = 3.08, POLE_X = 2.6;
const HANG_SLOTS = [-1.22, 1.22, -2.1, 2.1];
const ropeY = x => LINE_Y + 0.05 - 0.07 * (1 - (x / POLE_X) * (x / POLE_X));
/* ổ cắm nhiều lỗ + phích */
const STRIP = { x: 0.55, z: 1.05 }, SOCKET = { x: 0.75, y: 0.075, z: 1.18 };
const PLUG_IN = new THREE.Vector3(SOCKET.x, SOCKET.y, SOCKET.z + 0.19);
const PLUG_OUT = new THREE.Vector3(1.32, 0.058, 1.62);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const ease = u => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

function canvasTex(w, h, draw, opt) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opt && opt.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.userData.canvas = c;
  return t;
}
function labelSprite(text, bg, fg) {
  let cur = text;
  const draw = (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 24); g.fill();
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    let s = 44; g.font = "700 " + s + "px " + FONT;
    while (g.measureText(cur).width > w - 40 && s > 20) { s -= 2; g.font = "700 " + s + "px " + FONT; }
    g.fillText(cur, w / 2, h / 2 + 2);
  };
  const t = canvasTex(320, 96, draw);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  sp.scale.set(0.72, 0.216, 1);
  const c = t.userData.canvas;
  sp.userData.redraw = () => { draw(c.getContext("2d"), c.width, c.height); t.needsUpdate = true; };
  sp.userData.setText = s => { cur = s; sp.userData.redraw(); };
  return sp;
}
function loadImg(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
/* kích thước vải theo diện tích (video ngang dài vẫn đủ to, video dọc không quá cao) */
function clothSize(aspect, area) { const a = aspect || 1.6; return [clamp(Math.sqrt(area * a), 0.2, 0.95), clamp(Math.sqrt(area / a), 0.2, 0.62)]; }

export async function createScene(canvas, opts) {
  opts = opts || {};
  const reduce = !!opts.reduceMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  const lowPower = !!opts.lowPower; /* máy yếu / điện thoại: giảm độ phân giải & bóng đổ */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const target = new THREE.Vector3(0, 1.55, 0), basePos = new THREE.Vector3(0, 1.7, 8);

  /* ---------- nhãn đa ngôn ngữ ---------- */
  const labels = { quick: "Nhanh", normal: "Đẹp", deep: "Siêu đẹp", history: "Lịch sử", phases: ["GỬI", "XẾP HÀNG", "GIẶT", "XONG"] };

  /* ---------- ánh sáng ---------- */
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1d28, 0.55));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.4);
  key.position.set(3.2, 5.5, 4.5); key.castShadow = true;
  key.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5, bottom: -2, near: 1, far: 16 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4f9dff, 2.2); rim.position.set(-4, 3, -3); scene.add(rim);
  const drumLight = new THREE.PointLight(0x3a86f0, 3, 3.2, 2);
  const sparkLight = new THREE.PointLight(0xffe08a, 0, 2.2, 2); sparkLight.position.set(SOCKET.x, 0.3, SOCKET.z + 0.2); scene.add(sparkLight);

  /* ---------- sàn ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 10).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.5 }));
  floor.position.y = 0.003; floor.receiveShadow = true; scene.add(floor);
  const rugTex = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(58,134,240,.55)"); r.addColorStop(.6, "rgba(58,134,240,.14)"); r.addColorStop(1, "rgba(58,134,240,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: rugTex, transparent: true, depthWrite: false, toneMapped: false }));
  rug.position.y = 0.001; scene.add(rug);

  /* ---------- MÁY GIẶT ---------- */
  const M = new THREE.Group(); M.position.y = 1.25; scene.add(M);
  const proc = new THREE.Group(); M.add(proc); // phần dựng bằng code (bị ẩn nếu có model GLB)
  const matBody = new THREE.MeshStandardMaterial({ color: 0xf2eee7, roughness: 0.55 });
  const matPlastic = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, roughness: 0.5 });
  const FRONT = 0.67;

  (function body() {
    const W = 1.7, H = 2.1, R = 0.22, holeR = 0.58, holeY = -0.2, x = -W / 2, y = -H / 2;
    const s = new THREE.Shape();
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.absarc(x + W - R, y + R, R, -Math.PI / 2, 0, false);
    s.lineTo(x + W, y + H - R); s.absarc(x + W - R, y + H - R, R, 0, Math.PI / 2, false);
    s.lineTo(x + R, y + H); s.absarc(x + R, y + H - R, R, Math.PI / 2, Math.PI, false);
    s.lineTo(x, y + R); s.absarc(x + R, y + R, R, Math.PI, Math.PI * 1.5, false);
    const hole = new THREE.Path(); hole.absarc(0, holeY, holeR, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 5, curveSegments: 48 });
    g.translate(0, 0, -0.55);
    const m = new THREE.Mesh(g, matBody); m.castShadow = m.receiveShadow = true; proc.add(m);
    const kick = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.17, 0.06, 3, 0.025), new THREE.MeshStandardMaterial({ color: 0x3a86f0, roughness: 0.4 }));
    kick.position.set(0, -1.0, FRONT + 0.02); kick.castShadow = true; proc.add(kick);
    for (const [fx, fz] of [[-0.7, 0.45], [0.7, 0.45], [-0.7, -0.45], [0.7, -0.45]]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.7 }));
      f.position.set(fx, -1.19, fz); f.castShadow = true; proc.add(f);
    }
    const strip = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.38, 0.06, 4, 0.03), matPlastic);
    strip.position.set(0, 0.86, FRONT + 0.015); strip.castShadow = true; strip.userData.pick = "panel"; proc.add(strip);
    const drawer = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.24, 0.05, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.5 }));
    drawer.position.set(-0.63, 0.86, FRONT + 0.06); proc.add(drawer);
    const dh = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.025, 0.02, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x4a4f5a }));
    dh.position.set(-0.63, 0.86, FRONT + 0.095); proc.add(dh);
  })();

  /* màn hình LCD (canvas texture) */
  const lcd = { main: "", sub: "", phase: -1, err: false, off: true };
  const lcdTex = canvasTex(768, 256, () => {});
  const lcdCanvas = lcdTex.userData.canvas;
  function fit(g, text, maxW, size, weight) {
    let s = size; g.font = `${weight} ${s}px ${FONT}`;
    while (g.measureText(text).width > maxW && s > 18) { s -= 2; g.font = `${weight} ${s}px ${FONT}`; }
  }
  let lastLcd = 0;
  function drawLcd() {
    const g = lcdCanvas.getContext("2d"), W = lcdCanvas.width, H = lcdCanvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = lcd.off ? "#04090a" : "#06130f"; g.fillRect(0, 0, W, H);
    if (!lcd.off) {
      const col = lcd.err ? "#ff6b7a" : "#7dffc4";
      g.textBaseline = "top"; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 16;
      fit(g, lcd.main, W - 56, 70, 700); g.fillText(lcd.main, 28, 24);
      g.globalAlpha = 0.8; g.shadowBlur = 8; fit(g, lcd.sub, W - 56, 38, 500); g.fillText(lcd.sub, 28, 112);
      g.globalAlpha = 1;
      const blink = Math.floor(performance.now() / 500) % 2 === 0, segW = (W - 56 - 36) / 4;
      for (let i = 0; i < 4; i++) {
        const x = 28 + i * (segW + 12), done = i < lcd.phase || lcd.phase === 3, on = i === lcd.phase && lcd.phase < 3;
        g.globalAlpha = lcd.err ? 0.5 : done ? 1 : on ? (blink ? 1 : 0.35) : 0.2;
        g.shadowBlur = 8; g.fillRect(x, H - 62, segW, 9);
        g.shadowBlur = 0; g.font = `500 22px ${FONT}`; g.fillText(labels.phases[i], x, H - 44);
      }
    } else { g.fillStyle = "rgba(125,255,196,.12)"; g.fillRect(W / 2 - 60, H / 2 - 3, 120, 6); }
    g.globalAlpha = 1; g.shadowBlur = 0; g.fillStyle = "rgba(0,0,0,.3)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    lcdTex.needsUpdate = true;
  }
  const screenMat = new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.26), screenMat);
  screen.position.set(-0.1, 0.86, FRONT + 0.078); screen.userData.pick = "panel"; proc.add(screen);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.33, 0.04, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x0c1511, roughness: 0.6 }));
  bezel.position.set(-0.1, 0.86, FRONT + 0.05); bezel.userData.pick = "panel"; proc.add(bezel);

  /* núm xoay = chương trình (kích thước) đang xem trước */
  const knob = new THREE.Group(); knob.position.set(0.56, 0.86, FRONT + 0.05); proc.add(knob);
  const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.3, metalness: 0.25 }));
  knobMesh.position.z = 0.04; knobMesh.castShadow = true; knobMesh.userData.pick = "knob"; knob.add(knobMesh);
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x3a86f0, emissive: 0x1a4a9a, emissiveIntensity: 0.6 }));
  pointer.position.set(0, 0.07, 0.085); knob.add(pointer);
  const tickGroup = new THREE.Group(); tickGroup.position.set(0.56, 0.86, FRONT + 0.05); proc.add(tickGroup);
  let knobCount = 8, knobTarget = 0, knobRot = 0;
  function buildTicks(n) {
    tickGroup.clear();
    for (let i = 0; i < n; i++) {
      const a = (-130 + i * (260 / (n - 1))) * Math.PI / 180;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.034, 0.01), new THREE.MeshStandardMaterial({ color: 0x6b7280 }));
      t.position.set(Math.sin(a) * 0.22, Math.cos(a) * 0.22, 0.03); t.rotation.z = -a; tickGroup.add(t);
    }
  }
  buildTicks(knobCount);

  /* cửa kính (bản lề bên trái) */
  const P = { doorPivot: null, drum: null, knob: knob, screen: screen };
  const doorPivot = new THREE.Group(); doorPivot.position.set(-0.66, -0.2, FRONT + 0.03); proc.add(doorPivot);
  const door = new THREE.Group(); door.position.x = 0.66; doorPivot.add(door); P.doorPivot = doorPivot;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.08, 24, 80), new THREE.MeshStandardMaterial({ color: 0xd3d7de, roughness: 0.22, metalness: 0.75 }));
  ring.castShadow = true; ring.userData.pick = "door"; door.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.035, 16, 80), matBody); ring2.position.z = -0.03; ring2.userData.pick = "door"; door.add(ring2);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.58, 64), new THREE.MeshPhysicalMaterial({
    color: 0xbfd9ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05,
    envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false }));
  glass.renderOrder = 6; glass.userData.pick = "door"; door.add(glass);
  const shineTex = canvasTex(256, 256, (g, w) => {
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineCap = "round";
    g.lineWidth = 16; g.beginPath(); g.arc(w / 2, w / 2, w * 0.38, Math.PI * 1.08, Math.PI * 1.4); g.stroke();
    g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w * 0.38, Math.PI * 1.46, Math.PI * 1.56); g.stroke();
  });
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shineTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  shine.position.z = 0.012; shine.renderOrder = 7; door.add(shine);
  const handle = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.24, 0.08, 3, 0.025), matBody);
  handle.position.set(0.66, 0, 0.03); handle.castShadow = true; handle.userData.pick = "door"; door.add(handle);
  const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 16, 64), new THREE.MeshStandardMaterial({ color: 0x252a33, roughness: 0.8 }));
  gasket.position.set(0, -0.2, FRONT - 0.01); proc.add(gasket);

  /* lồng giặt (nhìn xuyên qua cửa) */
  const drum = new THREE.Group(); drum.position.set(0, -0.2, 0); proc.add(drum); P.drum = drum;
  const perf = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#aeb5c2"; g.fillRect(0, 0, w, h); g.fillStyle = "#2a3140";
    for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) { g.beginPath(); g.arc(x + 4, y, 3, 0, 7); g.fill(); }
  });
  perf.wrapS = perf.wrapT = THREE.RepeatWrapping; perf.repeat.set(3, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.495, 0.495, 1.15, 56, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: perf, metalness: 0.55, roughness: 0.4, side: THREE.BackSide, emissive: 0x0b1a33, emissiveIntensity: 0.9 }));
  wall.position.z = FRONT - 0.575; drum.add(wall);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.7, emissive: 0x08142a }));
  back.position.z = FRONT - 1.15; drum.add(back);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, l = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.9, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.45 }));
    l.position.set(Math.cos(a) * 0.455, Math.sin(a) * 0.455, 0.2); l.rotation.z = a - Math.PI / 2; drum.add(l);
  }
  drumLight.position.set(0, 0, 0.35); drum.add(drumLight);

  /* ---------- TẤM VẢI (video) + dây phơi ---------- */
  const loadGroup = new THREE.Group(); loadGroup.position.z = 0.25; drum.add(loadGroup);
  let loadCloth = null;
  function newLoadCloth() {
    loadCloth = new Cloth(0.62, 0.4); loadCloth.setAnchor("center");
    loadCloth.group.position.set(0.1, 0, 0); loadCloth.group.visible = false; loadGroup.add(loadCloth.group);
  }
  newLoadCloth();
  let cs = "none"; /* none | dropping | drum | out | pulled */
  let clothUrl = null, clothReq = 0, dropT = 0, forceDoor = false;

  /* dây phơi */
  const lineG = new THREE.Group(); scene.add(lineG);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.35, metalness: 0.5 });
  for (const sx of [-POLE_X, POLE_X]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, LINE_Y + 0.1, 12), poleMat);
    pole.position.set(sx, (LINE_Y + 0.1) / 2, LINE_Z); pole.castShadow = true; lineG.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 24), poleMat); base.position.set(sx, 0.025, LINE_Z); lineG.add(base);
    const knobTop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), poleMat); knobTop.position.set(sx, LINE_Y + 0.12, LINE_Z); lineG.add(knobTop);
  }
  const ropeCurve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => { const x = -POLE_X + (2 * POLE_X * i) / 8; return new THREE.Vector3(x, ropeY(x) + 0.05, LINE_Z); }));
  const rope = new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 48, 0.012, 6, false), new THREE.MeshStandardMaterial({ color: 0xcdb98f, roughness: 0.9 }));
  rope.castShadow = true; lineG.add(rope);

  const PIN_COL = [0xff8fa3, 0x7dd6ff, 0xffd84d, 0xb7a3ff];
  function addPins(entry) {
    const w = entry.cloth.w, col = PIN_COL[entry.slot % PIN_COL.length];
    entry.pins = [];
    for (const sx of [-1, 1]) {
      const pin = new THREE.Group(); pin.position.set(sx * w * 0.36, 0.012, 0.012);
      const a = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.09, 0.022, 2, 0.008), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })); a.castShadow = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.026), new THREE.MeshStandardMaterial({ color: 0x777f8c, metalness: 0.6, roughness: 0.4 })); b.position.set(0, 0.005, 0);
      pin.add(a, b); pin.userData = { pick: "cloth", id: entry.id };
      entry.cloth.group.add(pin); entry.pins.push(pin);
    }
  }
  const hung = new Map(); /* id → {id, cloth, slot, pins, poster, t0} */
  function allocSlot(id) {
    const used = new Set([...hung.values()].map(h => h.slot));
    for (let i = 0; i < HANG_SLOTS.length; i++) if (!used.has(i)) return i;
    /* đầy: bỏ tấm cũ nhất */
    const oldest = [...hung.values()].sort((a, b) => a.t0 - b.t0)[0]; if (oldest) { removeHung(oldest.id); return oldest.slot; }
    return 0;
  }
  function removeHung(id) {
    const h = hung.get(id); if (!h) return;
    scene.remove(h.cloth.group); h.cloth.dispose(); hung.delete(id);
  }
  async function paintCloth(cloth, url, area) {
    if (!url) { const [w, h] = clothSize(1.6, area); cloth.build(w, h); cloth.setTexture(fabricTexture(null, 1.6)); return; }
    try { const img = await loadImg(url), asp = img.naturalWidth / img.naturalHeight, [w, h] = clothSize(asp, area); cloth.build(w, h); cloth.setTexture(fabricTexture(img, asp)); }
    catch (e) { const [w, h] = clothSize(1.6, area); cloth.build(w, h); cloth.setTexture(fabricTexture(null, 1.6)); }
  }
  function placeHung(h) {
    const x = HANG_SLOTS[h.slot];
    h.cloth.setAnchor("top"); h.cloth.group.position.set(x, ropeY(x) - 0.012, LINE_Z); h.cloth.group.quaternion.identity();
  }
  async function addHung(id, poster, withAnim) {
    const slot = allocSlot(id), cloth = new Cloth(0.5, 0.3); cloth.setAnchor("top");
    const h = { id, cloth, slot, pins: [], poster: poster || "", t0: performance.now() + hung.size };
    hung.set(id, h); cloth.group.visible = false; scene.add(cloth.group);
    await paintCloth(cloth, poster, 0.2);
    if (!hung.has(id)) return; placeHung(h); addPins(h); cloth.group.visible = true;
    cloth.mesh.traverse(o => { o.userData.pick = "cloth"; o.userData.id = id; });
    if (withAnim) { h.appear = 0; cloth.group.scale.setScalar(0.01); }
  }
  /* đồng bộ danh sách vải đang phơi (mới nhất trước); skipId = tấm đang bay ra */
  const hungWanted = { list: [], skip: null };
  function setHung(list, skipId) {
    hungWanted.list = list.slice(0, HANG_SLOTS.length); hungWanted.skip = skipId || null;
    const ids = new Set(hungWanted.list.map(x => x.id));
    for (const id of [...hung.keys()]) if (!ids.has(id) && !(flight && flight.id === id)) removeHung(id);
    for (const it of hungWanted.list) {
      if (flight && flight.id === it.id) continue;
      const h = hung.get(it.id);
      if (!h) addHung(it.id, it.poster, false);
      else if (it.poster && h.poster !== it.poster) { h.poster = it.poster; paintCloth(h.cloth, it.poster, 0.2).then(() => { placeHung(h); h.pins.forEach(p => h.cloth.group.remove(p)); addPins(h); }); }
    }
  }

  /* thả video vào: vải rơi vào lồng giặt */
  function setCloth(url) {
    if (url === clothUrl) return; clothUrl = url;
    if (!url) { if (cs === "dropping" || cs === "drum") { loadCloth.group.visible = false; cs = "none"; } return; }
    if (cs === "out" || cs === "pulled") return;
    const req = ++clothReq;
    loadImg(url).then(img => {
      if (req !== clothReq || cs === "out" || cs === "pulled") return;
      const asp = img.naturalWidth / img.naturalHeight, [w, h] = clothSize(asp, 0.25);
      loadCloth.build(w, h); loadCloth.setTexture(fabricTexture(img, asp)); loadCloth.group.visible = true;
      if (cs === "none") { cs = "dropping"; dropT = 0; }
    }).catch(() => {});
  }

  /* xong việc: mở cửa, vải bay ra theo đường cong rồi được kẹp lên dây phơi */
  let flight = null, pull = null;
  const _bz = new THREE.Vector3(), _qI = new THREE.Quaternion();
  function bezier(a, b, c, d, u, out) {
    const k = 1 - u;
    return out.set(
      k * k * k * a.x + 3 * k * k * u * b.x + 3 * k * u * u * c.x + u * u * u * d.x,
      k * k * k * a.y + 3 * k * k * u * b.y + 3 * k * u * u * c.y + u * u * u * d.y,
      k * k * k * a.z + 3 * k * k * u * b.z + 3 * k * u * u * c.z + u * u * u * d.z);
  }
  function finishLoad(id, poster) {
    if (!(cs === "dropping" || cs === "drum") || flight) return false;
    cs = "out";
    const slot = allocSlot(id), g = loadCloth.group;
    scene.updateMatrixWorld(true); scene.attach(g);
    flight = { id, slot, poster: poster || "", t: 0, delay: reduce ? 0.1 : 0.7, dur: reduce ? 0.4 : 2.1, p0: g.position.clone(), q0: g.quaternion.clone() };
    if (poster) paintCloth(loadCloth, poster, 0.2); /* vải ra khỏi máy đã được resize: hình dạng đổi theo tỉ lệ mới */
    return true;
  }
  function landFlight() {
    const f = flight, c = loadCloth, g = c.group;
    const x = HANG_SLOTS[f.slot];
    c.setAnchor("top"); g.position.set(x, ropeY(x) - 0.012, LINE_Z); g.quaternion.identity();
    if (hung.has(f.id)) removeHung(f.id); /* chốt an toàn: không bao giờ có 2 tấm vải cùng một mẻ */
    const h = { id: f.id, cloth: c, slot: f.slot, pins: [], poster: f.poster, t0: performance.now(), appear: 1 };
    hung.set(f.id, h); addPins(h);
    c.mesh.traverse(o => { o.userData.pick = "cloth"; o.userData.id = f.id; });
    c.group.scale.setScalar(1);
    emitAt(10, new THREE.Vector3(x, ropeY(x) - 0.3, LINE_Z), 0.35);
    flight = null; cs = "none"; clothUrl = null; newLoadCloth();
    if (hungWanted.list.length) setHung(hungWanted.list, null);
  }
  /* lấy vải ra (xoá): mở cửa, vải bị lôi ra rơi xuống sàn rồi tan thành bọt */
  function pullOut(cb) {
    if (!(cs === "dropping" || cs === "drum") || pull) { if (cb) cb(); return false; }
    cs = "pulled"; forceDoor = true;
    const g = loadCloth.group; scene.updateMatrixWorld(true); scene.attach(g);
    pull = { t: 0, delay: reduce ? 0.05 : 0.5, dur: reduce ? 0.3 : 1.15, fade: 0, p0: g.position.clone(), q0: g.quaternion.clone(), cb };
    clothUrl = null; return true;
  }

  /* ---------- bong bóng ---------- */
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.5, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false });
  const bubbleGeo = new THREE.SphereGeometry(1, 14, 10);
  const IN = 26, inside = new THREE.InstancedMesh(bubbleGeo, bubbleMat, IN); inside.renderOrder = 4; inside.frustumCulled = false; M.add(inside);
  const inData = Array.from({ length: IN }, () => ({ ph: Math.random(), sp: 0.12 + Math.random() * 0.2, r: 0.025 + Math.random() * 0.045, z: -0.35 + Math.random() * 0.9, w: Math.random() * 6.3 }));
  const bubTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, w * 0.15, w / 2, w / 2, w / 2);
    r.addColorStop(0, "rgba(160,210,255,.06)"); r.addColorStop(0.8, "rgba(180,220,255,.2)"); r.addColorStop(1, "rgba(255,255,255,.8)");
    g.fillStyle = r; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 3, 0, 7); g.stroke();
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.ellipse(w * 0.35, w * 0.32, w * 0.1, w * 0.06, -0.6, 0, 7); g.fill();
  });
  const OUT = 64, outside = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: bubTex, transparent: true, depthWrite: false, toneMapped: false }), OUT); outside.renderOrder = 8; outside.frustumCulled = false; scene.add(outside);
  const outData = Array.from({ length: OUT }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, size: 0.05, w: Math.random() * 6 }));
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function emit(n, big) {
    let k = 0;
    for (const b of outData) {
      if (b.life > 0 || k >= n) continue;
      k++;
      const ang = Math.random() * Math.PI * 2, rad = Math.random() * (big ? 0.5 : 2.6);
      if (big) b.p.set(Math.cos(ang) * rad * 0.9, 1.0 + Math.sin(ang) * rad * 0.7, 0.9);
      else b.p.set((Math.random() - 0.5) * 5.2, 0.2, (Math.random() - 0.3) * 1.2);
      b.v.set((Math.random() - 0.5) * (big ? 1.4 : 0.1), (big ? 0.7 : 0.18) + Math.random() * (big ? 1.2 : 0.2), (Math.random() - 0.2) * (big ? 0.8 : 0.1));
      b.size = big ? 0.04 + Math.random() * 0.1 : 0.03 + Math.random() * 0.06;
      b.life = big ? 2.2 + Math.random() * 2 : 5 + Math.random() * 4; b.w = Math.random() * 6.3;
    }
  }
  function emitAt(n, at, spread) {
    let k = 0;
    for (const b of outData) {
      if (b.life > 0 || k >= n) continue;
      k++;
      b.p.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread * 0.5);
      b.v.set((Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.5, (Math.random() - 0.3) * 0.3);
      b.size = 0.03 + Math.random() * 0.06; b.life = 1.4 + Math.random() * 1.2; b.w = Math.random() * 6.3;
    }
  }
  for (let i = 0; i < 10; i++) { emit(1, false); outData.forEach(b => { if (b.life > 0) b.life = Math.random() * 6; }); }

  /* ---------- BỌT (linh vật 3D) ---------- */
  const bot = new THREE.Group(); bot.position.set(0, 2.38 + 0.25, 0.15); scene.add(bot);
  const botBase = bot.position.y;
  const botBody = new THREE.Group(); bot.add(botBody);
  const botSphere = new THREE.Mesh(new THREE.SphereGeometry(0.26, 40, 28), new THREE.MeshStandardMaterial({ color: 0x3a86f0, roughness: 0.32, emissive: 0x0a2a6a, emissiveIntensity: 0.35 }));
  botSphere.scale.y = 0.92; botSphere.castShadow = true; botSphere.userData.pick = "bot"; botBody.add(botSphere);
  for (const [x, y, z, r] of [[-0.07, 0.24, 0.02, 0.07], [0.05, 0.27, 0, 0.085], [0.14, 0.2, 0.03, 0.055]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
    f.position.set(x, y, z); botBody.add(f);
  }
  const faceCv = document.createElement("canvas"); faceCv.width = faceCv.height = 17 * 6;
  const faceTex = new THREE.CanvasTexture(faceCv); faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.magFilter = THREE.NearestFilter; faceTex.minFilter = THREE.NearestFilter; faceTex.generateMipmaps = false;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, toneMapped: false }));
  face.position.set(0, -0.005, 0.262); face.renderOrder = 3; botBody.add(face);
  function setFace(expr) {
    const g = faceCv.getContext("2d"); g.clearRect(0, 0, faceCv.width, faceCv.height);
    g.drawImage(mascotCanvas(expr, false, 6), 0, 0); faceTex.needsUpdate = true;
  }

  /* ---------- Ổ ĐIỆN + PHÍCH CẮM ---------- */
  const strip = new THREE.Group(); strip.position.set(STRIP.x, 0, STRIP.z); scene.add(strip);
  const stripBody = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.14, 0.26, 3, 0.05), new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.45 }));
  stripBody.position.y = 0.07; stripBody.castShadow = stripBody.receiveShadow = true; stripBody.userData.pick = "plug"; strip.add(stripBody);
  for (const sx of [-0.3, -0.05, 0.2]) {
    const sk = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.075, 0.02, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.7 }));
    sk.position.set(sx, SOCKET.y, 0.131); sk.userData.pick = "plug"; strip.add(sk);
    for (const hx of [-0.03, 0.03]) { const hole = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.036, 0.004), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.position.set(sx + hx, SOCKET.y, 0.142); strip.add(hole); }
  }
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x331111, emissive: 0x000000, emissiveIntensity: 1 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), ledMat); led.position.set(0.4, 0.105, 0.132); strip.add(led);
  const plug = new THREE.Group(); scene.add(plug);
  const plugBody = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.11, 0.2, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a86f0, roughness: 0.4 }));
  plugBody.castShadow = true; plugBody.userData.pick = "plug"; plug.add(plugBody);
  for (const sx of [-0.03, 0.03]) { const pr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9ced8, metalness: 0.9, roughness: 0.25 })); pr.position.set(sx, 0, -0.15); pr.userData.pick = "plug"; plug.add(pr); }
  const grom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.8 })); grom.position.z = 0.13; plug.add(grom);
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.7 });
  const cord = new THREE.Mesh(new THREE.BufferGeometry(), cordMat); cord.castShadow = false; cord.frustumCulled = false; scene.add(cord);
  let plugT = 0, plugTarget = 0, plugDir = 0, pulseT = 0, sparkT = 0, powerLvl = 0, lastOn = false;
  const cordPts = [new THREE.Vector3(0.55, 0.2, -0.67), new THREE.Vector3(1.0, 0.05, -0.62), new THREE.Vector3(1.28, 0.03, -0.2), new THREE.Vector3(1.3, 0.03, 0.55), new THREE.Vector3(1.2, 0.03, 1.15), new THREE.Vector3()];
  function updatePlug(dt) {
    plugT = clamp(plugT + Math.sign(plugTarget - plugT) * Math.min(Math.abs(plugTarget - plugT), dt / 0.75), 0, 1);
    const e = ease(plugT);
    plug.position.lerpVectors(PLUG_OUT, PLUG_IN, e); plug.position.y += Math.sin(Math.PI * e) * 0.16 * (plugT > 0 && plugT < 1 ? 1 : 0);
    plug.rotation.set(0, lerp(-0.55, 0, e), 0);
    const pulse = pulseT > 0 ? 1 + 0.22 * Math.abs(Math.sin(pulseT * 9)) : 1; plug.scale.setScalar(pulse);
    plug.updateMatrixWorld(true);
    cordPts[5].set(0, -0.015, 0.14); plug.localToWorld(cordPts[5]); cordPts[4].lerpVectors(new THREE.Vector3(1.22, 0.03, 1.18), cordPts[5], 0.12);
    if (plugT !== plugDir || pulseT > 0) {
      cord.geometry.dispose(); cord.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts, false, "catmullrom", 0.4), 70, 0.017, 6, false); plugDir = plugT;
    }
    const on = plugT >= 0.98;
    if (on && !lastOn) { sparkT = 0.35; emitAt(8, new THREE.Vector3(SOCKET.x, 0.18, SOCKET.z + 0.2), 0.25); }
    if (on !== lastOn) { lastOn = on; lcd.off = !on; drawLcd(); }
    const ledOn = on ? 0x39ffa0 : (pulseT > 0 && Math.sin(pulseT * 14) > 0 ? 0xff4a5e : 0x331111);
    ledMat.color.setHex(ledOn); ledMat.emissive.setHex(on || ledOn === 0xff4a5e ? ledOn : 0x000000);
    sparkT = Math.max(0, sparkT - dt); sparkLight.intensity = sparkT > 0 ? 6 * (sparkT / 0.35) : 0;
    pulseT = Math.max(0, pulseT - dt);
  }
  function writeCord() { cord.geometry.dispose(); cord.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPts, false, "catmullrom", 0.4), 70, 0.017, 6, false); }

  /* ---------- 3 CHAI NƯỚC GIẶT ---------- */
  const stool = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.5, 0.72, 4, 0.07), new THREE.MeshStandardMaterial({ color: 0xcfc9bc, roughness: 0.6 }));
  stool.position.set(2.0, 0.25, 0.1); stool.castShadow = stool.receiveShadow = true; scene.add(stool);
  const bottles = {};
  const profile = [[0, 0], [0.13, 0], [0.145, 0.04], [0.145, 0.3], [0.105, 0.39], [0.062, 0.43], [0.062, 0.47], [0, 0.47]].map(p => new THREE.Vector2(p[0], p[1]));
  MODE_ORDER.forEach((m, i) => {
    const g = new THREE.Group(); g.position.set(1.62 + i * 0.38, 0.5, 0.12); scene.add(g);
    const mat = new THREE.MeshPhysicalMaterial({ color: MODE_COLOR[m], roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.93, emissive: MODE_COLOR[m], emissiveIntensity: 0.0 });
    const b = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), mat); b.castShadow = true; b.userData.pick = "bottle"; b.userData.mode = m; g.add(b);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    cap.position.y = 0.51; cap.userData.pick = "bottle"; cap.userData.mode = m; g.add(cap);
    const labelTex = canvasTex(128, 64, (c, w, h) => {
      c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
      for (let d = 0; d < 3; d++) { c.fillStyle = d < MODE_DOTS[m] ? "#1d57b0" : "#cfd8e6"; c.beginPath(); c.arc(w / 2 + (d - 1) * 30, h / 2, 11, 0, 7); c.fill(); }
    });
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.1475, 0.1475, 0.17, 28, 1, true, -0.95, 1.9), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.5 }));
    lab.position.y = 0.2; lab.userData.pick = "bottle"; lab.userData.mode = m; g.add(lab);
    const tag = labelSprite(labels[m], "#ffffff", "#0a1530"); tag.position.set(0, 0.74, 0); g.add(tag);
    bottles[m] = { g, mat, tag, lift: 0, baseX: g.position.x };
  });

  /* ---------- GIỎ ĐỒ = lịch sử ---------- */
  const basket = new THREE.Group(); basket.position.set(-2.05, 0, 0.12); scene.add(basket);
  const weave = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#c79a5c"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 32) { g.fillStyle = (y / 16 + x / 32) % 2 ? "#b78545" : "#d9ad70"; g.fillRect(x + ((y / 16) % 2) * 16, y + 1, 30, 14); }
  });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(2, 1);
  const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.6, 40, 1, true), new THREE.MeshStandardMaterial({ map: weave, roughness: 0.85, side: THREE.DoubleSide }));
  bk.position.y = 0.3; bk.castShadow = true; bk.receiveShadow = true; bk.userData.pick = "basket"; basket.add(bk);
  const bkBottom = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9c6f35 })); bkBottom.position.y = 0.04; basket.add(bkBottom);
  const rimT = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 12, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a5e2c, roughness: 0.7 })); rimT.position.y = 0.6; rimT.userData.pick = "basket"; basket.add(rimT);
  const clothes = [];
  const PASTEL = [0xff8fa3, 0x7dffc4, 0xffd84d, 0x8dbcff, 0xc9a7ff, 0xffa66b];
  PASTEL.forEach((c, i) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.14, 0.26, 3, 0.05), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
    const a = i * 1.7; m.position.set(Math.cos(a) * 0.17, 0.42 + (i % 3) * 0.1 + Math.floor(i / 3) * 0.02, Math.sin(a) * 0.15);
    m.rotation.set(0.2 * Math.sin(i), a, 0.15 * Math.cos(i)); m.castShadow = true; m.visible = false; m.userData.pick = "basket"; basket.add(m); clothes.push(m);
  });
  const basketTag = labelSprite(labels.history, "#ffffff", "#0a1530"); basketTag.position.set(-2.05, 0.98, 0.12); scene.add(basketTag);
  function setBasketCount(n) { clothes.forEach((m, i) => m.visible = i < n); }

  /* ---------- model GLB tuỳ chọn ---------- */
  let glbMachine = null;
  function fitTo(root, height) {
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
    const k = height / (size.y || 1); root.scale.multiplyScalar(k);
    box.setFromObject(root); root.position.y -= box.min.y; root.position.x -= (box.min.x + box.max.x) / 2; root.position.z -= (box.min.z + box.max.z) / 2;
  }
  function adopt(key, root) {
    root.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    if (key === "machine") {
      proc.visible = false; fitTo(root, 2.4); scene.add(root); glbMachine = root;
      const d = root.getObjectByName("Door"), dr = root.getObjectByName("Drum"), kn = root.getObjectByName("Knob"), sc = root.getObjectByName("Screen");
      P.doorPivot = d || null; P.drum = dr || null; P.knob = kn || null;
      P.screen = sc && sc.isMesh ? sc : null; if (P.screen) sc.userData.pick = "panel";
      if (sc && sc.isMesh) { lcdTex.flipY = false; lcdTex.needsUpdate = true; sc.material = new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }); }
      if (dr) dr.add(loadGroup); else { loadGroup.visible = false; }
      if (d) d.traverse(o => { if (o.isMesh) o.userData.pick = "door"; });
      if (kn) kn.traverse(o => { if (o.isMesh) o.userData.pick = "knob"; });
      inside.visible = false;
    } else if (key === "bot") {
      botSphere.visible = false; face.visible = false; botBody.children.forEach(c => { if (c !== face) c.visible = false; });
      fitTo(root, 0.6); root.position.set(0, -0.28, 0); botBody.add(root);
      const f = root.getObjectByName("Face");
      if (f && f.isMesh) { faceTex.flipY = false; faceTex.needsUpdate = true; f.material = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, toneMapped: false }); }
      root.traverse(o => { if (o.isMesh) o.userData.pick = "bot"; });
    }
  }
  async function tryModels() {
    const mm = opts.models || {};
    for (const k of Object.keys(mm)) {
      try {
        const r = await fetch(mm[k], { method: "HEAD", cache: "no-store" });
        if (!r.ok || (r.headers.get("content-type") || "").includes("text/html")) continue;
        const gltf = await new GLTFLoader().loadAsync(mm[k]);
        adopt(k, gltf.scene);
      } catch (e) { console.warn("[scene] không nạp được model", k, e); }
    }
  }

  /* ---------- trạng thái ---------- */
  let st = "off", stT = 0, mode = "normal";
  const lightCol = new THREE.Color(LIGHT_COLOR.idle), lightTarget = new THREE.Color(LIGHT_COLOR.idle);
  let fz = 0, focusT = 0; const _tg = new THREE.Vector3();
  let doorAng = 0, drumSpd = 0, drumRot = 0, shake = 0, lightP = 0, botY = 0, botTilt = 0, botSX = 1, botSY = 1, botRY = 0, botJump = 0;
  const clock = new THREE.Clock();
  const _v = new THREE.Vector3(), WHITE = new THREE.Color(0xffffff);
  setFace("idle"); drawLcd(); writeCord();
  /* khởi tạo vị trí phích/dây (chưa cắm) */
  plug.position.copy(PLUG_OUT); plug.rotation.set(0, -0.55, 0); plug.updateMatrixWorld(true);
  cordPts[5].set(0, -0.015, 0.14); plug.localToWorld(cordPts[5]); cordPts[4].lerpVectors(new THREE.Vector3(1.22, 0.03, 1.18), cordPts[5], 0.12); writeCord();

  const api = {
    setState(s) {
      if (s === st) return;
      st = s; stT = clock.getElapsedTime(); setFace(s === "off" ? "idle" : s); lightTarget.setHex(LIGHT_COLOR[s] || LIGHT_COLOR.idle);
      if (s === "done") emit(OUT / 2, true);
      if (s === "error") shake = 0.03;
    },
    setMode(m) { mode = m; },
    setProgram(idx, count) { if (count !== knobCount) { knobCount = count; buildTicks(count); } knobTarget = -(-130 + idx * (260 / (count - 1))) * Math.PI / 180; },
    setBasketCount,
    setLcd(o) { Object.assign(lcd, o, { off: !lastOn }); drawLcd(); },
    setLabels(l) {
      Object.assign(labels, l);
      for (const m of MODE_ORDER) bottles[m].tag.userData.setText(labels[m]);
      basketTag.userData.setText(labels.history); drawLcd();
    },
    setPower(on, immediate) { plugTarget = on ? 1 : 0; if (immediate) { plugT = plugTarget; powerLvl = on ? 1 : 0; lastOn = !!on; lcd.off = !on; plugDir = -1; drawLcd(); } },
    plugPulse() { pulseT = 1.4; },
    setCloth, pullOut, finishLoad, setHung,
    openDoor(on) { forceDoor = !!on; },
    bounce() { botJump = 1; },
    focus(on) { focusT = on ? 1 : 0; },
    screenRect() { /* khung màn LCD trên canvas (px) — để trang phóng to bảng cài đặt từ đúng chỗ đó */
      const o = P.screen; if (!o) return null;
      camera.updateMatrixWorld(); o.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(o); if (box.isEmpty()) return null;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        const px = (_v.x * 0.5 + 0.5) * canvas.clientWidth, py = (-_v.y * 0.5 + 0.5) * canvas.clientHeight;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    hasCloth() { return cs === "dropping" || cs === "drum"; },
    debug() { return { hung: [...hung.keys()], cs, flight: flight ? flight.id : null, pull: !!pull, hungSlots: [...hung.values()].map(h => h.slot) }; },
    resize,
    get ready() { return true; }
  };

  /* ---------- camera / kích thước ---------- */
  const T = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const ins = (opts.getInsets && opts.getInsets()) || { top: 0, bottom: 0 }, usable = Math.max(120, h - ins.top - ins.bottom);
    const aspect = w / h, needW = aspect < 0.9 ? 3.0 : aspect < 1.3 ? 4.6 : 6.0, needH = 4.0;
    const dW = needW / (2 * T * aspect), dH = needH / (2 * T) * (h / usable);
    basePos.set(0, 1.7, Math.max(dW, dH, 5));
    camera.setViewOffset(w, h, 0, (ins.bottom - ins.top) / 2, w, h);
    camera.updateProjectionMatrix();
    const show = aspect >= 1.3, tiny = h < 420; /* màn quá thấp: bỏ nhãn chữ trong cảnh cho đỡ rối */
    for (const m of MODE_ORDER) { bottles[m].g.visible = show; bottles[m].tag.visible = !tiny; }
    stool.visible = show; basket.visible = show; basketTag.visible = show && !tiny;
  }
  new ResizeObserver(resize).observe(canvas);

  /* ---------- tương tác ---------- */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), cursor = { x: 0, y: 0 };
  function pickAt(ev) {
    const r = canvas.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      let o = h.object; while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData;
    }
    return null;
  }
  canvas.addEventListener("pointermove", ev => {
    cursor.x = (ev.clientX / innerWidth) * 2 - 1; cursor.y = (ev.clientY / innerHeight) * 2 - 1;
    canvas.style.cursor = pickAt(ev) ? "pointer" : "";
  });
  window.addEventListener("pointermove", ev => { cursor.x = (ev.clientX / innerWidth) * 2 - 1; cursor.y = (ev.clientY / innerHeight) * 2 - 1; });
  canvas.addEventListener("click", ev => {
    const u = pickAt(ev); if (!u) return;
    if (u.pick === "bot") api.bounce();
    if (opts.onPick) opts.onPick(u.pick, u.mode, u.id);
  });

  /* ---------- vòng lặp ---------- */
  let fontsRedrawn = false;
  function project(obj, off) { _v.copy(off || new THREE.Vector3()); obj.localToWorld(_v); _v.project(camera); return { x: (_v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-_v.y * 0.5 + 0.5) * canvas.clientHeight }; }

  function tick() {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.getElapsedTime();
    if (!fontsRedrawn && document.fonts && document.fonts.status === "loaded") {
      fontsRedrawn = true; drawLcd(); for (const m of MODE_ORDER) bottles[m].tag.userData.redraw(); basketTag.userData.redraw();
    }
    if (!lcd.off && lcd.phase >= 0 && lcd.phase < 3 && performance.now() - lastLcd > 480) { lastLcd = performance.now(); drawLcd(); }
    updatePlug(dt);
    powerLvl = damp(powerLvl, lastOn ? 1 : 0, 5, dt);

    /* camera + parallax nhẹ */
    const px = reduce ? 0 : cursor.x, py = reduce ? 0 : cursor.y;
    fz = damp(fz, focusT, 3.2, dt); /* zoom vào bảng điều khiển khi mở cài đặt */
    camera.position.set(basePos.x + px * 0.5 * (1 - fz), lerp(basePos.y, 2.35, fz) - py * 0.18, basePos.z * (1 - 0.42 * fz));
    camera.lookAt(_tg.set(0, lerp(target.y, 2.1, fz), 0));

    /* cửa */
    const doorT = (st === "hungry" || st === "done" || forceDoor) ? -1.8 : 0;
    doorAng = damp(doorAng, doorT, 7, dt);
    if (P.doorPivot) P.doorPivot.rotation.y = doorAng;

    /* lồng */
    const spinT = st === "washing" && !reduce ? 3.2 : 0;
    drumSpd = damp(drumSpd, spinT, 2.2, dt); drumRot += drumSpd * dt;
    if (P.drum) P.drum.rotation.z = drumRot;

    /* tấm vải trong lồng */
    const lg = loadCloth.group;
    if (cs === "dropping") {
      dropT += dt / (reduce ? 0.2 : 0.75); const u = Math.min(1, dropT), e = 1 - Math.pow(1 - u, 3);
      lg.position.set(0.1, lerp(0.62, 0, e), lerp(0.7, 0, e)); lg.scale.setScalar(lerp(0.55, 1, e));
      loadCloth.update(t, "fly", 0.14 * (1 - e) + 0.04, 1.3);
      if (u >= 1) { cs = "drum"; lg.position.set(0.1, 0, 0); lg.scale.setScalar(1); }
    } else if (cs === "drum") {
      const w = st === "washing" && !reduce;
      loadCloth.update(t, "drum", w ? 0.1 : 0.05, w ? 2.4 : 0.8);
      lg.rotation.x = w ? Math.sin(t * 3.1) * 0.9 : 0.12; lg.rotation.y = w ? Math.cos(t * 2.3) * 0.9 : 0;
      lg.position.set(0.1 + (w ? Math.sin(t * 2.7) * 0.07 : 0), w ? Math.cos(t * 3.3) * 0.06 : -0.03, 0);
    }
    /* vải bay ra → treo lên dây */
    if (flight) {
      const f = flight, g = loadCloth.group;
      if (f.delay > 0) { f.delay -= dt; loadCloth.update(t, "drum", 0.06, 1); }
      else {
        f.t += dt / f.dur; const u = Math.min(1, f.t), e = ease(u), x = HANG_SLOTS[f.slot];
        const end = new THREE.Vector3(x, ropeY(x) - 0.012 - loadCloth.h / 2, LINE_Z);
        const c1 = new THREE.Vector3(0, 1.05, 1.15), c2 = new THREE.Vector3(x * 0.35, 2.3, 1.45);
        bezier(f.p0, c1, c2, end, e, _bz); g.position.copy(_bz);
        g.quaternion.slerpQuaternions(f.q0, _qI, Math.min(1, e * 1.5));
        loadCloth.update(t, "fly", 0.16 * (1 - e) + 0.03, 1.6);
        if (u >= 1) landFlight();
      }
    }
    /* vải bị lấy ra → rơi xuống sàn → tan thành bọt (xoá) */
    if (pull) {
      const f = pull, g = loadCloth.group;
      if (f.delay > 0) { f.delay -= dt; loadCloth.update(t, "drum", 0.06, 1); }
      else if (f.t < 1) {
        f.t += dt / f.dur; const u = Math.min(1, f.t), e = ease(u);
        g.position.set(lerp(f.p0.x, 0.2, e), lerp(f.p0.y, 0.16, e * e) + Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.35 * (1 - u), lerp(f.p0.z, 1.55, e));
        _qI.setFromEuler(new THREE.Euler(-1.25, 0.3, 0.4)); g.quaternion.slerpQuaternions(f.q0, _qI, e);
        loadCloth.update(t, "fly", 0.15 * (1 - u) + 0.03, 1.4);
        if (u >= 1) { emitAt(14, g.position, 0.4); }
      } else {
        f.fade += dt / 0.55; g.scale.setScalar(Math.max(0.001, 1 - f.fade)); g.rotation.y += dt * 4;
        if (f.fade >= 1) { const cb = f.cb; scene.remove(g); loadCloth.dispose(); pull = null; cs = "none"; forceDoor = false; newLoadCloth(); if (cb) cb(); }
      }
    }
    /* vải đang phơi: đung đưa theo gió + xuất hiện */
    for (const h of hung.values()) {
      if (h.appear !== undefined && h.appear < 1) { h.appear = Math.min(1, h.appear + dt / 0.4); h.cloth.group.scale.setScalar(Math.max(0.01, h.appear)); }
      h.cloth.update(t, "hang", reduce ? 0.01 : 0.05, 1);
    }

    /* rung máy */
    const shakeT = st === "washing" ? 0.0045 : st === "error" ? 0.012 : 0;
    shake = damp(shake, reduce ? 0 : shakeT, 4, dt);
    const sk = shake * Math.sin(t * 60);
    M.position.x = sk; M.position.y = 1.25 + Math.abs(sk) * 0.5;
    if (glbMachine) glbMachine.position.x = sk;

    /* đèn trong lồng */
    lightCol.lerp(lightTarget, 1 - Math.exp(-4 * dt)); drumLight.color.copy(lightCol);
    lightP = damp(lightP, (LIGHT_POWER[st] + (st === "washing" ? Math.sin(t * 8) * 1.2 : 0)) * powerLvl, 4, dt); drumLight.intensity = lightP;
    rug.material.color.copy(lightCol).lerp(WHITE, 0.35);

    /* bong bóng trong lồng */
    const active = st === "washing" ? 1 : 0;
    for (let i = 0; i < IN; i++) {
      const b = inData[i], u = ((t * b.sp + b.ph) % 1), y = -0.42 + u * 0.84, rr = Math.sqrt(Math.max(0, 0.43 * 0.43 - y * y));
      const x = Math.sin(b.w + t * 1.3 + i) * rr * 0.85, s = b.r * active * Math.min(1, u * 6) * Math.min(1, (1 - u) * 6);
      _p.set(x, -0.2 + y, b.z); _s.setScalar(Math.max(s, 0.0001)); _m.compose(_p, _q, _s); inside.setMatrixAt(i, _m);
    }
    inside.instanceMatrix.needsUpdate = true;
    /* bong bóng ngoài (nền + ăn mừng) */
    if (!reduce && lastOn && Math.random() < dt * 1.2) emit(1, false);
    for (let i = 0; i < OUT; i++) {
      const b = outData[i];
      if (b.life > 0) { b.life -= dt; b.p.addScaledVector(b.v, dt); b.p.x += Math.sin(t * 1.5 + b.w) * dt * 0.1; }
      const s = b.life > 0 ? b.size * Math.min(1, b.life * 1.5) : 0.0001;
      _m.compose(b.p, camera.quaternion, _s.setScalar(s)); outside.setMatrixAt(i, _m);
    }
    outside.instanceMatrix.needsUpdate = true;

    /* núm xoay */
    knobRot = damp(knobRot, knobTarget, 8, dt); knob.rotation.z = knobRot;

    /* chai nước giặt: chai đang chọn nhảy lên và phát sáng */
    for (const m of MODE_ORDER) {
      const b = bottles[m], sel = m === mode;
      b.lift = damp(b.lift, sel ? 0.16 : 0, 9, dt);
      b.g.position.y = 0.5 + b.lift + (sel && !reduce ? Math.sin(t * 3) * 0.012 : 0);
      b.mat.emissiveIntensity = damp(b.mat.emissiveIntensity, sel ? 0.45 : 0, 8, dt);
      b.tag.position.y = 0.74 + (sel ? 0.02 : 0);
      b.tag.material.opacity = sel ? 1 : 0.88;
    }

    /* Bọt */
    const tt = t - stT;
    let y = 0, tilt = 0, sx = 1, sy = 1, ry = 0;
    if (!reduce) {
      switch (st) {
        case "off": { tilt = 0.16; sy = 0.94; sx = 1.03; break; }
        case "hungry": { const k = Math.abs(Math.sin(t * 7)); y = k * 0.22; sy = 1 + (1 - k) * -0.05 + k * 0.08; sx = 1 / sy; tilt = Math.sin(t * 14) * 0.06; break; }
        case "loaded": { const k = Math.abs(Math.sin(t * 2.6)); y = k * 0.06; sy = 1 + k * 0.04; sx = 1 / sy; break; }
        case "washing": { y = Math.abs(Math.sin(t * 8)) * 0.03; tilt = Math.sin(t * 8) * 0.2; ry = Math.sin(t * 4) * 0.3; break; }
        case "done": { const k = Math.abs(Math.sin(tt * 5)); y = k * 0.3; sy = 1 + k * 0.1; sx = 1 / sy; ry = Math.sin(tt * 3) * 0.5; break; }
        case "error": { tilt = 0.28 + Math.sin(t * 30) * 0.015; sy = 0.92; sx = 1.06; break; }
        default: { const k = Math.sin(t * 1.4); y = k * 0.01; sy = 1 + k * 0.025; sx = 1 / sy; }
      }
    }
    if (botJump > 0) { botJump = Math.max(0, botJump - dt * 1.6); y += Math.sin((1 - botJump) * Math.PI) * 0.35; }
    botY = damp(botY, y, 14, dt); botTilt = damp(botTilt, tilt, 10, dt); botSX = damp(botSX, sx, 14, dt); botSY = damp(botSY, sy, 14, dt); botRY = damp(botRY, ry, 8, dt);
    bot.position.y = botBase + botY + (M.position.y - 1.25);
    botBody.rotation.set(0, botRY, botTilt); botBody.scale.set(botSX, botSY, botSX);

    /* báo cho trang vị trí cửa / Bọt / phích (để đặt nút & bong bóng thoại) */
    if (opts.onProject) {
      const c = project(M, new THREE.Vector3(0, -0.2, FRONT + 0.05)), e = project(M, new THREE.Vector3(0.62, -0.2, FRONT + 0.05));
      const top = project(bot, new THREE.Vector3(0, 0.5, 0)), pl = project(plug, new THREE.Vector3(0, 0.1, 0));
      opts.onProject({ door: { x: c.x, y: c.y, r: Math.abs(e.x - c.x) }, bot: { x: top.x, y: top.y }, plug: { x: pl.x, y: pl.y }, w: canvas.clientWidth, h: canvas.clientHeight });
    }
    renderer.render(scene, camera);
  }

  resize();
  renderer.setAnimationLoop(tick);
  tryModels();
  return api;
}
