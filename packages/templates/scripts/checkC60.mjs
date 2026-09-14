import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../src/library/c60Molblock.ts'), 'utf8');
const eq = src.indexOf('=');
const mb = JSON.parse(src.slice(eq + 1).trim().replace(/;$/, ''));

const lines = mb.split(/\r?\n/);
const counts = lines[3];
const nAtoms = parseInt(counts.slice(0, 3).trim(), 10);
const nBonds = parseInt(counts.slice(3, 6).trim(), 10);
console.log('header atoms/bonds', nAtoms, nBonds);

const atoms = [];
for (let i = 0; i < nAtoms; i++) {
  const line = lines[4 + i];
  atoms.push({
    x: +line.slice(0, 10),
    y: +line.slice(10, 20),
    z: +line.slice(20, 30) || 0,
    el: line.slice(31, 34).trim(),
  });
}
const bonds = [];
for (let i = 0; i < nBonds; i++) {
  const line = lines[4 + nAtoms + i];
  bonds.push([parseInt(line.slice(0, 3), 10) - 1, parseInt(line.slice(3, 6), 10) - 1]);
}

const deg = Array(nAtoms).fill(0);
const adj = Array.from({ length: nAtoms }, () => []);
for (const [a, b] of bonds) {
  deg[a]++;
  deg[b]++;
  adj[a].push(b);
  adj[b].push(a);
}
const degHist = {};
for (const d of deg) degHist[d] = (degHist[d] || 0) + 1;
console.log('degree histogram', degHist);
console.log('all C?', atoms.every(a => a.el === 'C'));
console.log(
  'z min/max',
  Math.min(...atoms.map(a => a.z)),
  Math.max(...atoms.map(a => a.z)),
);

const key = (a, b) => `${a}>${b}`;
function countFacesByWalk() {
  const dirs = [];
  for (const [a, b] of bonds) {
    dirs.push([a, b]);
    dirs.push([b, a]);
  }
  const used = new Set();
  let pent = 0;
  let hex = 0;
  const other = {};
  for (const [u0, v0] of dirs) {
    if (used.has(key(u0, v0))) continue;
    let u = u0;
    let v = v0;
    const face = [u0];
    let guard = 0;
    while (guard++ < 30) {
      used.add(key(u, v));
      face.push(v);
      const inx = atoms[u].x - atoms[v].x;
      const iny = atoms[u].y - atoms[v].y;
      let best = null;
      let bestAng = -Infinity;
      for (const w of adj[v]) {
        if (w === u) continue;
        const ox = atoms[w].x - atoms[v].x;
        const oy = atoms[w].y - atoms[v].y;
        const ang = Math.atan2(-inx * oy - -iny * ox, -inx * ox + -iny * oy);
        if (ang > bestAng) {
          bestAng = ang;
          best = w;
        }
      }
      if (best == null) break;
      u = v;
      v = best;
      if (u === u0 && v === v0) break;
    }
    if (u === u0 && v === v0) {
      const L = face.length - 1;
      if (L === 5) pent++;
      else if (L === 6) hex++;
      else other[L] = (other[L] || 0) + 1;
    }
  }
  return { pent: pent / 2, hex: hex / 2, other };
}

console.log('faces 2D left-walk', countFacesByWalk());
console.log('Euler V-E+32 (expect 2):', nAtoms - nBonds + 32);

const lens = bonds.map(([a, b]) =>
  Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y),
);
lens.sort((a, b) => a - b);
console.log(
  '2D bond len min/med/max',
  lens[0].toFixed(2),
  lens[Math.floor(lens.length / 2)].toFixed(2),
  lens.at(-1).toFixed(2),
);

// Rebuild 3D truncated icosahedron and check topology independently
const phi = (1 + Math.sqrt(5)) / 2;
const ico = [];
for (const [x, y, z] of [
  [0, 1, phi],
  [0, -1, phi],
  [0, 1, -phi],
  [0, -1, -phi],
  [1, phi, 0],
  [-1, phi, 0],
  [1, -phi, 0],
  [-1, -phi, 0],
  [phi, 0, 1],
  [-phi, 0, 1],
  [phi, 0, -1],
  [-phi, 0, -1],
]) {
  const L = Math.hypot(x, y, z);
  ico.push({ x: x / L, y: y / L, z: z / L });
}
const icoEdges = [];
for (let i = 0; i < 12; i++) {
  for (let j = i + 1; j < 12; j++) {
    const d = Math.hypot(ico[i].x - ico[j].x, ico[i].y - ico[j].y, ico[i].z - ico[j].z);
    if (d < 1.15) icoEdges.push([i, j]);
  }
}
console.log('icosahedron edges (expect 30):', icoEdges.length);

const pts = [];
const map = new Map();
const pkey = p => [p.x, p.y, p.z].map(v => v.toFixed(5)).join(',');
const addPt = p => {
  const k = pkey(p);
  if (!map.has(k)) {
    map.set(k, pts.length);
    pts.push({ ...p });
  }
  return map.get(k);
};
const ePairs = icoEdges.map(([i, j]) => {
  const a = ico[i];
  const b = ico[j];
  return [
    addPt({ x: (2 * a.x + b.x) / 3, y: (2 * a.y + b.y) / 3, z: (2 * a.z + b.z) / 3 }),
    addPt({ x: (a.x + 2 * b.x) / 3, y: (a.y + 2 * b.y) / 3, z: (a.z + 2 * b.z) / 3 }),
  ];
});
for (const p of pts) {
  const L = Math.hypot(p.x, p.y, p.z) || 1;
  p.x /= L;
  p.y /= L;
  p.z /= L;
}
const bonds3 = [];
const bset = new Set();
const addB = (a, b) => {
  const i = Math.min(a, b);
  const j = Math.max(a, b);
  const k = `${i},${j}`;
  if (!bset.has(k)) {
    bset.add(k);
    bonds3.push([i, j]);
  }
};
for (const [a, b] of ePairs) addB(a, b);
const dists = [];
for (let i = 0; i < pts.length; i++) {
  for (let j = i + 1; j < pts.length; j++) {
    dists.push({
      i,
      j,
      d: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z),
    });
  }
}
dists.sort((a, b) => a.d - b.d);
for (const { i, j } of dists) {
  if (bonds3.length >= 90) break;
  addB(i, j);
}
const deg3 = Array(pts.length).fill(0);
const adj3 = Array.from({ length: pts.length }, () => []);
for (const [a, b] of bonds3) {
  deg3[a]++;
  deg3[b]++;
  adj3[a].push(b);
  adj3[b].push(a);
}
const deg3Hist = {};
for (const d of deg3) deg3Hist[d] = (deg3Hist[d] || 0) + 1;
console.log('3D rebuild atoms/bonds', pts.length, bonds3.length, 'deg', deg3Hist);

// Count chordless 5/6 cycles in 3D graph (faces of fullerene)
function countChordless(len) {
  const faces = new Set();
  const canon = arr => {
    const n = arr.length;
    let best = null;
    for (let rev = 0; rev < 2; rev++) {
      const seq = rev ? [...arr].reverse() : [...arr];
      for (let s = 0; s < n; s++) {
        const rot = seq
          .slice(s)
          .concat(seq.slice(0, s))
          .join(',');
        if (best == null || rot < best) best = rot;
      }
    }
    return best;
  };
  function isChordless(c) {
    const set = new Set(c);
    for (let i = 0; i < c.length; i++) {
      for (const nb of adj3[c[i]]) {
        if (!set.has(nb)) continue;
        const j = c.indexOf(nb);
        const dist = Math.min(
          Math.abs(i - j),
          c.length - Math.abs(i - j),
        );
        if (dist > 1) return false;
      }
    }
    return true;
  }
  function dfs(start, path) {
    if (path.length === len) {
      if (adj3[path[path.length - 1]].includes(start) && isChordless(path)) {
        faces.add(canon(path));
      }
      return;
    }
    const last = path[path.length - 1];
    for (const nb of adj3[last]) {
      if (nb === start) continue;
      if (path.includes(nb)) continue;
      if (nb < start) continue; // prune
      path.push(nb);
      dfs(start, path);
      path.pop();
    }
  }
  for (let s = 0; s < pts.length; s++) {
    for (const nb of adj3[s]) {
      if (nb < s) continue;
      dfs(s, [s, nb]);
    }
  }
  return faces.size;
}

console.log('3D chordless C5 count (expect 12):', countChordless(5));
console.log('3D chordless C6 count (expect 20):', countChordless(6));

// Bond length uniformity on unit sphere
const bl = bonds3.map(([a, b]) =>
  Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y, pts[a].z - pts[b].z),
);
bl.sort((a, b) => a - b);
console.log(
  '3D bond chord min/med/max',
  bl[0].toFixed(4),
  bl[Math.floor(bl.length / 2)].toFixed(4),
  bl.at(-1).toFixed(4),
);
console.log(
  '3D bond length CV%',
  (
    (100 *
      Math.sqrt(bl.reduce((s, v) => s + (v - bl[Math.floor(bl.length / 2)]) ** 2, 0) / bl.length)) /
    bl[Math.floor(bl.length / 2)]
  ).toFixed(2),
);
