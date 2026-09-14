/**
 * Generate accurate C60 (truncated icosahedron):
 * - topology: 60 C, 90 bonds, 12 pentagons, 20 hexagons
 * - 2D: Schlegel (stereographic) projection for a readable canvas sketch
 * - 3D: unit-sphere coords for Structure Perspective pose after place
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const edges = [];
for (let i = 0; i < ico.length; i++) {
  for (let j = i + 1; j < ico.length; j++) {
    const d = Math.hypot(ico[i].x - ico[j].x, ico[i].y - ico[j].y, ico[i].z - ico[j].z);
    if (d < 1.15) edges.push([i, j]);
  }
}

const pts = [];
const map = new Map();
const key = p => [p.x, p.y, p.z].map(v => v.toFixed(5)).join(',');
const addPt = p => {
  const k = key(p);
  if (!map.has(k)) {
    map.set(k, pts.length);
    pts.push({ ...p });
  }
  return map.get(k);
};

const ePairs = edges.map(([i, j]) => {
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

const bonds = [];
const bondSet = new Set();
const addBond = (a, b) => {
  const i = Math.min(a, b);
  const j = Math.max(a, b);
  const k = `${i},${j}`;
  if (!bondSet.has(k)) {
    bondSet.add(k);
    bonds.push([i, j]);
  }
};
for (const [a, b] of ePairs) addBond(a, b);
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
  if (bonds.length >= 90) break;
  addBond(i, j);
}

// Rotate so a hexagon faces +Z (nicer Schlegel + 3D default view).
const adj = Array.from({ length: pts.length }, () => []);
for (const [a, b] of bonds) {
  adj[a].push(b);
  adj[b].push(a);
}
function findHexCenter() {
  for (let s = 0; s < pts.length; s++) {
    for (const n1 of adj[s]) {
      for (const n2 of adj[n1]) {
        if (n2 === s) continue;
        for (const n3 of adj[n2]) {
          if (n3 === n1) continue;
          for (const n4 of adj[n3]) {
            if (n4 === n2) continue;
            for (const n5 of adj[n4]) {
              if (n5 === n3) continue;
              if (!adj[n5].includes(s)) continue;
              const ring = [s, n1, n2, n3, n4, n5];
              if (new Set(ring).size !== 6) continue;
              let cx = 0;
              let cy = 0;
              let cz = 0;
              for (const i of ring) {
                cx += pts[i].x;
                cy += pts[i].y;
                cz += pts[i].z;
              }
              return { x: cx / 6, y: cy / 6, z: cz / 6 };
            }
          }
        }
      }
    }
  }
  return { x: 0, y: 0, z: 1 };
}
const face = findHexCenter();
const fL = Math.hypot(face.x, face.y, face.z) || 1;
const target = { x: face.x / fL, y: face.y / fL, z: face.z / fL };
// Rodrigues rotation: target → +Z
const axis = {
  x: target.y,
  y: -target.x,
  z: 0,
};
const axisL = Math.hypot(axis.x, axis.y, axis.z);
let rotated = pts.map(p => ({ ...p }));
if (axisL > 1e-8) {
  axis.x /= axisL;
  axis.y /= axisL;
  const angle = Math.acos(Math.max(-1, Math.min(1, target.z)));
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ax = axis.x;
  const ay = axis.y;
  const az = 0;
  rotated = pts.map(p => {
    const dot = ax * p.x + ay * p.y + az * p.z;
    return {
      x: p.x * c + (ay * p.z - az * p.y) * s + ax * dot * (1 - c),
      y: p.y * c + (az * p.x - ax * p.z) * s + ay * dot * (1 - c),
      z: p.z * c + (ax * p.y - ay * p.x) * s + az * dot * (1 - c),
    };
  });
}

// Stereographic Schlegel from near +Z pole (project from slightly above north).
const poleZ = 1.15;
const schlegel = rotated.map(p => {
  const denom = poleZ - p.z;
  return { x: (poleZ * p.x) / denom, y: (poleZ * p.y) / denom };
});
let maxR = 0;
for (const p of schlegel) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
const scale2d = 55 / (maxR || 1);
const atoms2d = schlegel.map(p => ({ x: p.x * scale2d, y: p.y * scale2d }));

const pad = (n, w) => String(n).padStart(w, ' ');
const fmt = v => v.toFixed(4).padStart(10, ' ');
const lines = [
  'C60 Fullerene',
  '  Moldraw truncated icosahedron Schlegel',
  '',
  `${pad(60, 3)}${pad(90, 3)}  0  0  0  0  0  0  0  0999 V2000`,
];
for (const a of atoms2d) {
  // Store z=0 in molblock (canvas is 2D); true 3D exported separately.
  lines.push(`${fmt(a.x)}${fmt(a.y)}${fmt(0)} C   0  0  0  0  0  0  0  0  0  0  0`);
}
for (const [i, j] of bonds) {
  lines.push(`${pad(i + 1, 3)}${pad(j + 1, 3)}  1  0  0  0  0`);
}
lines.push('M  END');
const mb = `${lines.join('\n')}\n`;

const dir = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(dir, '../src/library/c60Molblock.ts'),
  `/** C60 Schlegel 2D layout (truncated icosahedron). Pair with C60_COORDS_3D for Perspective. */\n` +
    `export const C60_FULLERENE_MOLBLOCK = ${JSON.stringify(mb)};\n`,
);

// Unit-sphere 3D (after hex-upright rotation) — scale applied at place time.
const coords3d = rotated.map(p => ({
  x: +p.x.toFixed(6),
  y: +p.y.toFixed(6),
  z: +p.z.toFixed(6),
}));
writeFileSync(
  join(dir, '../src/library/c60Coords3d.ts'),
  `/** Unit-sphere C60 xyz (atom order matches C60_FULLERENE_MOLBLOCK). */\n` +
    `export type Coord3 = { x: number; y: number; z: number };\n` +
    `export const C60_COORDS_3D: readonly Coord3[] = ${JSON.stringify(coords3d)} as const;\n`,
);

console.log('wrote Schlegel molblock + 3D coords', pts.length, bonds.length);
