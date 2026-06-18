const ELEMENT_COLORS = {
  H: [1, 1, 1],
  C: [0.6, 0.6, 0.6],
  N: [0.2, 0.2, 1],
  O: [1, 0.05, 0.05],
  S: [1, 1, 0.2],
  P: [1, 0.5, 0],
  F: [0.7, 1, 1],
  Cl: [0.1, 1, 0.1],
  Br: [0.6, 0.2, 0.2],
};

const DEFAULT_COLOR = [0.5, 0.5, 0.5];
const BOND_COLOR = [0.7, 0.7, 0.7];

const ATOM_RADII = {
  H: 0.2,
  C: 0.28,
  N: 0.27,
  O: 0.26,
  S: 0.32,
  P: 0.32,
  F: 0.25,
  Cl: 0.3,
};

const getAtomColor = (elem, atom) => {
  if (atom?.color) {
    return [
      ((atom.color >> 16) & 255) / 255,
      ((atom.color >> 8) & 255) / 255,
      (atom.color & 255) / 255,
    ];
  }
  return ELEMENT_COLORS[elem] || DEFAULT_COLOR;
};

const getAtomRadius = (elem) => ATOM_RADII[elem] || 0.25;

const rotatePoint = (point, axis, angle) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const { x, y, z } = point;
  const { x: u, y: v, z: w } = axis;

  return {
    x: (u * u * t + c) * x + (u * v * t - w * s) * y + (u * w * t + v * s) * z,
    y: (v * u * t + w * s) * x + (v * v * t + c) * y + (v * w * t - u * s) * z,
    z: (w * u * t - v * s) * x + (w * v * t + u * s) * y + (w * w * t + c) * z,
  };
};

const createMeshBucket = () => ({
  positions: [],
  normals: [],
  indices: [],
});

const pushVertex = (bucket, x, y, z, nx, ny, nz) => {
  const index = bucket.positions.length / 3;
  bucket.positions.push(x, y, z);
  bucket.normals.push(nx, ny, nz);
  return index;
};

const SPHERE_LAT_BANDS = 10;
const SPHERE_LONG_BANDS = 10;
const CYLINDER_RADIAL_SEGMENTS = 8;

const addSphere = (bucket, cx, cy, cz, radius) => {
  const latBands = SPHERE_LAT_BANDS;
  const longBands = SPHERE_LONG_BANDS;
  const startVertex = bucket.positions.length / 3;
  const ringStride = longBands + 1;

  for (let lat = 0; lat <= latBands; lat += 1) {
    const theta = (lat * Math.PI) / latBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let long = 0; long <= longBands; long += 1) {
      const phi = (long * 2 * Math.PI) / longBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const nx = cosPhi * sinTheta;
      const ny = cosTheta;
      const nz = sinPhi * sinTheta;

      pushVertex(
        bucket,
        cx + radius * nx,
        cy + radius * ny,
        cz + radius * nz,
        nx,
        ny,
        nz,
      );
    }
  }

  for (let lat = 0; lat < latBands; lat += 1) {
    for (let long = 0; long < longBands; long += 1) {
      const first = startVertex + lat * ringStride + long;
      const second = first + ringStride;
      bucket.indices.push(first, second, first + 1);
      bucket.indices.push(second, second + 1, first + 1);
    }
  }
};

const addCylinder = (bucket, start, end, radius) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const height = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

  const bondVector = { x: dx, y: dy, z: dz };
  const yAxis = { x: 0, y: 1, z: 0 };

  const cross = {
    x: yAxis.y * bondVector.z - yAxis.z * bondVector.y,
    y: yAxis.z * bondVector.x - yAxis.x * bondVector.z,
    z: yAxis.x * bondVector.y - yAxis.y * bondVector.x,
  };
  const crossLen = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);

  let angle = 0;
  let axis = { x: 1, y: 0, z: 0 };

  if (crossLen > 0.0001) {
    axis = { x: cross.x / crossLen, y: cross.y / crossLen, z: cross.z / crossLen };
    const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
    angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  } else {
    const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
    if (dot < 0) {
      axis = { x: 1, y: 0, z: 0 };
      angle = Math.PI;
    }
  }

  const radialSegments = CYLINDER_RADIAL_SEGMENTS;
  const startVertex = bucket.positions.length / 3;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const midZ = (start.z + end.z) / 2;

  for (let i = 0; i <= radialSegments; i += 1) {
    const theta = (i * 2 * Math.PI) / radialSegments;
    const radialX = Math.cos(theta);
    const radialZ = Math.sin(theta);
    const top = rotatePoint({ x: radius * radialX, y: height / 2, z: radius * radialZ }, axis, angle);
    const bottom = rotatePoint({ x: radius * radialX, y: -height / 2, z: radius * radialZ }, axis, angle);
    const normal = rotatePoint({ x: radialX, y: 0, z: radialZ }, axis, angle);

    pushVertex(bucket, top.x + midX, top.y + midY, top.z + midZ, normal.x, normal.y, normal.z);
    pushVertex(bucket, bottom.x + midX, bottom.y + midY, bottom.z + midZ, normal.x, normal.y, normal.z);
  }

  for (let i = 0; i < radialSegments; i += 1) {
    const base = startVertex + i * 2;
    bucket.indices.push(base, base + 1, base + 2);
    bucket.indices.push(base + 1, base + 3, base + 2);
  }
};

const align4 = (value) => (value + 3) & ~3;

const encodeGlb = (parts) => {
  const materials = parts.map((part, index) => ({
    name: part.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...part.color, 1],
      metallicFactor: 0.65,
      roughnessFactor: 0.18,
    },
    doubleSided: true,
  }));

  const bufferViews = [];
  const accessors = [];
  const primitives = [];
  const chunks = [];
  let byteOffset = 0;

  parts.forEach((part, partIndex) => {
    const positionArray = new Float32Array(part.positions);
    const normalArray = new Float32Array(part.normals);
    const indexArray = part.indices.length > 65535
      ? new Uint32Array(part.indices)
      : new Uint16Array(part.indices);

    const positionBytes = new Uint8Array(positionArray.buffer);
    const normalBytes = new Uint8Array(normalArray.buffer);
    const indexBytes = new Uint8Array(indexArray.buffer);

    const positionOffset = byteOffset;
    chunks.push(positionBytes);
    byteOffset += align4(positionBytes.byteLength);

    const normalOffset = byteOffset;
    chunks.push(normalBytes);
    byteOffset += align4(normalBytes.byteLength);

    const indexOffset = byteOffset;
    chunks.push(indexBytes);
    byteOffset += align4(indexBytes.byteLength);

    const positionViewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: positionOffset,
      byteLength: positionBytes.byteLength,
      target: 34962,
    });
    const normalViewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normalOffset,
      byteLength: normalBytes.byteLength,
      target: 34962,
    });
    const indexViewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: indexOffset,
      byteLength: indexBytes.byteLength,
      target: 34963,
    });

    const positionAccessorIndex = accessors.length;
    accessors.push({
      bufferView: positionViewIndex,
      componentType: 5126,
      count: part.positions.length / 3,
      type: 'VEC3',
      min: part.min,
      max: part.max,
    });
    const normalAccessorIndex = accessors.length;
    accessors.push({
      bufferView: normalViewIndex,
      componentType: 5126,
      count: part.normals.length / 3,
      type: 'VEC3',
    });
    const indexAccessorIndex = accessors.length;
    accessors.push({
      bufferView: indexViewIndex,
      componentType: indexArray instanceof Uint32Array ? 5125 : 5123,
      count: part.indices.length,
      type: 'SCALAR',
    });

    primitives.push({
      attributes: {
        POSITION: positionAccessorIndex,
        NORMAL: normalAccessorIndex,
      },
      indices: indexAccessorIndex,
      material: partIndex,
      mode: 4,
    });
  });

  const binaryLength = byteOffset;
  const binaryChunk = new Uint8Array(binaryLength);
  let writeOffset = 0;
  chunks.forEach((chunk) => {
    binaryChunk.set(chunk, writeOffset);
    writeOffset += align4(chunk.byteLength);
  });

  const gltf = {
    asset: { version: '2.0', generator: 'MolDraw' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Molecule' }],
    meshes: [{ name: 'Molecule', primitives }],
    materials,
    buffers: [{ byteLength: binaryLength }],
    bufferViews,
    accessors,
  };

  const jsonText = JSON.stringify(gltf);
  const jsonPadding = (4 - (jsonText.length % 4)) % 4;
  const jsonChunkLength = jsonText.length + jsonPadding;
  const binaryPadding = (4 - (binaryLength % 4)) % 4;
  const binaryChunkLength = binaryLength + binaryPadding;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binaryChunkLength;

  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  let offset = 12;
  view.setUint32(offset, jsonChunkLength, true);
  offset += 4;
  view.setUint32(offset, 0x4e4f534a, true);
  offset += 4;
  output.set(new TextEncoder().encode(jsonText), offset);
  offset += jsonText.length;
  for (let i = 0; i < jsonPadding; i += 1) {
    output[offset] = 0x20;
    offset += 1;
  }

  view.setUint32(offset, binaryChunkLength, true);
  offset += 4;
  view.setUint32(offset, 0x004e4942, true);
  offset += 4;
  output.set(binaryChunk, offset);
  offset += binaryLength;
  for (let i = 0; i < binaryPadding; i += 1) {
    output[offset] = 0;
    offset += 1;
  }

  return output.buffer;
};

const finalizePart = (name, color, bucket) => {
  if (!bucket.indices.length) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < bucket.positions.length; i += 3) {
    min[0] = Math.min(min[0], bucket.positions[i]);
    min[1] = Math.min(min[1], bucket.positions[i + 1]);
    min[2] = Math.min(min[2], bucket.positions[i + 2]);
    max[0] = Math.max(max[0], bucket.positions[i]);
    max[1] = Math.max(max[1], bucket.positions[i + 1]);
    max[2] = Math.max(max[2], bucket.positions[i + 2]);
  }

  return {
    name,
    color,
    positions: bucket.positions,
    normals: bucket.normals,
    indices: bucket.indices,
    min,
    max,
  };
};

export const buildMoleculeGlbBuffer = (viewer, { showHydrogens = true } = {}) => {
  const model = viewer.getModel(0);
  if (!model) {
    throw new Error('No 3D model available to export.');
  }

  let atoms = model.selectedAtoms({});
  if (!showHydrogens) {
    atoms = atoms.filter((atom) => atom.elem !== 'H');
  }

  const atomMap = new Map();
  atoms.forEach((atom, idx) => {
    atomMap.set(atom.index !== undefined ? atom.index : idx, atom);
  });

  const buckets = new Map();
  const colors = new Map();
  const getBucket = (key) => {
    if (!buckets.has(key)) buckets.set(key, createMeshBucket());
    return buckets.get(key);
  };

  atoms.forEach((atom) => {
    const key = `atom_${atom.elem}`;
    colors.set(key, getAtomColor(atom.elem, atom));
    const bucket = getBucket(key);
    addSphere(bucket, atom.x, atom.y, atom.z, getAtomRadius(atom.elem));
  });

  const processedBonds = new Set();
  atoms.forEach((atom1) => {
    if (!atom1.bonds) return;

    atom1.bonds.forEach((neighborIndex, i) => {
      let atom2 = atomMap.get(neighborIndex);
      if (!atom2 && neighborIndex < atoms.length) atom2 = atoms[neighborIndex];
      if (!atom2) return;
      if (!showHydrogens && (atom1.elem === 'H' || atom2.elem === 'H')) return;

      const idx1 = atom1.index !== undefined ? atom1.index : -1;
      const idx2 = atom2.index !== undefined ? atom2.index : -1;
      if (idx1 >= idx2) return;

      const bondKey = `${idx1}-${idx2}`;
      if (processedBonds.has(bondKey)) return;
      processedBonds.add(bondKey);

      let bondOrder = 1;
      if (atom1.bondOrder && atom1.bondOrder[i]) bondOrder = atom1.bondOrder[i];

      const bondBucket = getBucket('bond');
      colors.set('bond', BOND_COLOR);

      const dx = atom2.x - atom1.x;
      const dy = atom2.y - atom1.y;
      const dz = atom2.z - atom1.z;
      const bondLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const u = { x: dx / bondLen, y: dy / bondLen, z: dz / bondLen };
      let perp = { x: 0, y: 0, z: 0 };
      if (Math.abs(u.z) < 0.9) perp = { x: -u.y, y: u.x, z: 0 };
      else perp = { x: 0, y: -u.z, z: u.y };
      const pLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z) || 1;
      perp = { x: perp.x / pLen, y: perp.y / pLen, z: perp.z / pLen };

      if (bondOrder === 2) {
        const off = 0.1;
        addCylinder(
          bondBucket,
          { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off },
          { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off },
          0.04,
        );
        addCylinder(
          bondBucket,
          { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off },
          { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off },
          0.04,
        );
      } else if (bondOrder === 3) {
        const off = 0.12;
        addCylinder(bondBucket, atom1, atom2, 0.04);
        addCylinder(
          bondBucket,
          { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off },
          { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off },
          0.04,
        );
        addCylinder(
          bondBucket,
          { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off },
          { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off },
          0.04,
        );
      } else {
        addCylinder(bondBucket, atom1, atom2, 0.08);
      }
    });
  });

  const parts = [];
  buckets.forEach((bucket, key) => {
    const part = finalizePart(key, colors.get(key) || DEFAULT_COLOR, bucket);
    if (part) parts.push(part);
  });

  if (!parts.length) {
    throw new Error('No geometry available to export.');
  }

  return encodeGlb(parts);
};
