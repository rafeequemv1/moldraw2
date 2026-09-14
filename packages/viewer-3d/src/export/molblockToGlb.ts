import { parseMolblockAtoms3d } from './molblockToXyz';

/**
 * Minimal GLB (glTF 2.0 binary) with atom positions as POINTS.
 * Compatible with most glTF viewers that support the POINTS mode.
 */
export function molblockToGlb(molblock: string): ArrayBuffer | null {
  const atoms = parseMolblockAtoms3d(molblock);
  if (atoms.length === 0) return null;

  const n = atoms.length;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = atoms[i]!.x;
    positions[i * 3 + 1] = atoms[i]!.y;
    positions[i * 3 + 2] = atoms[i]!.z;
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const bin = new Uint8Array(positions.buffer);
  const binPad = (4 - (bin.byteLength % 4)) % 4;
  const binChunkLen = bin.byteLength + binPad;

  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'Moldraw' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            mode: 0, // POINTS
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: n,
        type: 'VEC3',
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    buffers: [{ byteLength: binChunkLen }],
  };

  let jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBytes = new TextEncoder().encode(jsonStr);

  const total = 12 + 8 + jsonBytes.byteLength + 8 + binChunkLen;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const u8 = new Uint8Array(out);

  // header
  view.setUint32(0, 0x46546c67, true); // glTF
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);

  // JSON chunk
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true); // JSON
  u8.set(jsonBytes, 20);

  // BIN chunk
  const binChunkStart = 20 + jsonBytes.byteLength;
  view.setUint32(binChunkStart, binChunkLen, true);
  view.setUint32(binChunkStart + 4, 0x004e4942, true); // BIN
  u8.set(bin, binChunkStart + 8);

  return out;
}
