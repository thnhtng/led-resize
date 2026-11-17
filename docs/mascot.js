/* Bọt — linh vật pixel của tiệm giặt. Dùng chung cho thẻ lịch sử (SVG) và model 3D (canvas texture). */
const N = 17;
const E = ".................";
/* các hàng y=5..12 của lưới 17x17; k=đen w=trắng p=má hồng t=nước mắt y=vàng */
export const FACES = {
  idle: [E, E, "....kkk...kkk....", E, "..pp.........pp..", E, ".......kkk.......", E],
  hungry: [E, "....kkk...kkk....", "....kwk...kwk....", "....kkk...kkk....", "..pp.........pp..", ".......kkk.......", ".......kpk.......", ".......kkk......."],
  loaded: [E, ".....k.....k.....", "....k.k...k.k....", E, "..pp.........pp..", "......k...k......", ".......kkk.......", E],
  washing: [E, "....k.k...k.k....", ".....k.....k.....", "....k.k...k.k....", "..pp.........pp..", E, "......k.k.k......", ".......k.k......."],
  done: [E, ".....y.....y.....", "....yyy...yyy....", ".....y.....y.....", "..pp.........pp..", "......kkkkk......", ".......kkk.......", E],
  error: [".....kk...kk.....", "....k.......k....", "....kkk...kkk....", "....kwk...kwk....", "..ppt.......tpp..", "....t.......t....", ".......kkk.......", "......k...k......"]
};
export const MCOL = { k: "#0a1530", w: "#ffffff", p: "#ff8fa3", t: "#9fd8ff", y: "#ffd84d" };

function buildGrid(expr, withBody) {
  const grid = [];
  const hl = { "3,5": 1, "3,6": 1, "4,4": 1, "5,3": 1, "6,3": 1 };
  for (let y = 0; y < N; y++) {
    grid[y] = [];
    for (let x = 0; x < N; x++) {
      const dx = x - 8, dy = y - 8, d = Math.sqrt(dx * dx + dy * dy);
      let c = null;
      if (withBody && d <= 8.4) c = d > 7.4 ? "#1d57b0" : (hl[x + "," + y] ? "#8dbcff" : (d > 6.2 && dy > 3 ? "#2f6fd0" : "#3a86f0"));
      grid[y][x] = c;
    }
  }
  (FACES[expr] || FACES.idle).forEach((row, i) => {
    for (let x = 0; x < N; x++) {
      const ch = row.charAt(x);
      if (ch === ".") continue;
      if (withBody ? grid[5 + i][x] : true) grid[5 + i][x] = MCOL[ch];
    }
  });
  return grid;
}

const SVG_CACHE = {};
export function mascotSVG(expr) {
  if (SVG_CACHE[expr]) return SVG_CACHE[expr];
  const grid = buildGrid(expr, true);
  let out = '<svg viewBox="0 0 17 17" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = grid[y][x];
      if (!c) { x++; continue; }
      let x1 = x;
      while (x1 + 1 < N && grid[y][x1 + 1] === c) x1++;
      out += `<rect x="${x}" y="${y}" width="${x1 - x + 1}" height="1" fill="${c}"/>`;
      x = x1 + 1;
    }
  }
  return (SVG_CACHE[expr] = out + "</svg>");
}

/* canvas pixel-art; withBody=false chỉ vẽ khuôn mặt (dán lên quả cầu 3D) */
export function mascotCanvas(expr, withBody, px) {
  px = px || 8;
  const c = document.createElement("canvas");
  c.width = c.height = N * px;
  const g = c.getContext("2d");
  const grid = buildGrid(expr, withBody);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!grid[y][x]) continue;
    g.fillStyle = grid[y][x];
    g.fillRect(x * px, y * px, px, px);
  }
  return c;
}
