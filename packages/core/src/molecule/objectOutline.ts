import type { Molecule, ObjectOutline, ObjectOutlineCollection } from '@moldraw/domain';
import { buildCanvasStateSnapshot } from './canvasState';
import { ensureFragmentIds, fragmentOutlineKey } from './fragmentIds';

export const collectionOutlineKey = (id: string): string => `collection:${id}`;

export function isCollectionKey(key: string): boolean {
  return key.startsWith('collection:');
}

export function parseCollectionId(key: string): string | null {
  return isCollectionKey(key) ? key.slice('collection:'.length) : null;
}

const newId = () => Math.random().toString(36).slice(2, 11);

export type DiscoveredObjectKind = 'Mol' | 'Arrow' | 'Text' | 'Shape' | 'Image' | 'Stroke';

export interface DiscoveredOutlineObject {
  key: string;
  kind: DiscoveredObjectKind;
  label: string;
  sub?: string;
  atomIds?: string[];
  annotationId?: string;
}

/** Live canvas objects for the Objects panel (excludes collections). */
export function discoverOutlineObjects(molecule: Molecule): DiscoveredOutlineObject[] {
  const mol = ensureFragmentIds(molecule);
  // Skip SMILES here — Objects panel virtualizes and resolves labels lazily.
  const snap = buildCanvasStateSnapshot(mol, {
    includeCoords: false,
    includeSmiles: false,
    includeAnnotations: true,
  });
  const out: DiscoveredOutlineObject[] = [];
  const fragMap = mol.fragmentByAtomId ?? {};

  for (const m of snap.molecules) {
    const fid = m.atomIds.map(id => fragMap[id]).find(Boolean);
    const key = fid
      ? fragmentOutlineKey(fid)
      : `mol:${[...m.atomIds].sort().join(',')}`;
    out.push({
      key,
      kind: 'Mol',
      label: `Molecule ${m.index + 1}`,
      sub: `${m.atomCount} atoms`,
      atomIds: m.atomIds,
    });
  }
  for (const arr of mol.instanceArrays ?? []) {
    out.push({
      key: `instance:${arr.id}`,
      kind: 'Mol',
      label: arr.label || `Array ×${arr.sites.length + 1}`,
      sub: `${arr.seedAtomIds.length} atoms · ${arr.sites.length + 1} sites`,
      atomIds: arr.seedAtomIds,
    });
  }
  for (const a of snap.annotations?.reactionArrows ?? []) {
    out.push({
      key: `arrow:${a.id}`,
      kind: 'Arrow',
      label: a.kind ?? 'Arrow',
      sub: a.reagentAbove || a.reagentBelow || undefined,
      annotationId: a.id,
    });
  }
  for (const t of snap.annotations?.canvasTexts ?? []) {
    const preview = t.text.trim().replace(/\s+/g, ' ').slice(0, 32) || 'Text';
    out.push({ key: `text:${t.id}`, kind: 'Text', label: preview, annotationId: t.id });
  }
  for (const s of snap.annotations?.canvasShapes ?? []) {
    out.push({ key: `shape:${s.id}`, kind: 'Shape', label: s.kind, annotationId: s.id });
  }
  for (const img of snap.annotations?.canvasImages ?? []) {
    const named = molecule.canvasImages?.find(i => i.id === img.id)?.name?.trim();
    out.push({
      key: `image:${img.id}`,
      kind: 'Image',
      label: named || `${Math.round(img.width)}×${Math.round(img.height)}`,
      annotationId: img.id,
    });
  }
  for (const st of snap.annotations?.strokes ?? []) {
    out.push({
      key: `stroke:${st.id}`,
      kind: 'Stroke',
      label: `${st.pointCount} pts`,
      annotationId: st.id,
    });
  }
  return out;
}

function emptyOutline(): ObjectOutline {
  return { collections: [], order: [], parent: {}, names: {} };
}

function cloneOutline(o: ObjectOutline | undefined): ObjectOutline {
  if (!o) return emptyOutline();
  return {
    collections: o.collections.map(c => ({ ...c })),
    order: [...o.order],
    parent: { ...(o.parent ?? {}) },
    names: { ...(o.names ?? {}) },
  };
}

/** Sync outline with live objects: keep order/names/parents, drop stale, append new. */
export function reconcileObjectOutline(molecule: Molecule): ObjectOutline {
  const live = discoverOutlineObjects(ensureFragmentIds(molecule));
  const liveKeys = new Set(live.map(o => o.key));
  const prev = cloneOutline(molecule.objectOutline);
  const collectionIds = new Set(prev.collections.map(c => c.id));
  const collectionKeys = new Set([...collectionIds].map(collectionOutlineKey));

  const nextOrder: string[] = [];
  const seen = new Set<string>();
  for (const key of prev.order) {
    if (seen.has(key)) continue;
    if (isCollectionKey(key)) {
      if (!collectionKeys.has(key)) continue;
    } else if (!liveKeys.has(key)) {
      continue;
    }
    nextOrder.push(key);
    seen.add(key);
  }
  for (const c of prev.collections) {
    const ck = collectionOutlineKey(c.id);
    if (!seen.has(ck)) {
      nextOrder.push(ck);
      seen.add(ck);
    }
  }
  for (const o of live) {
    if (!seen.has(o.key)) {
      nextOrder.push(o.key);
      seen.add(o.key);
    }
  }

  const parent: Record<string, string> = {};
  for (const [k, colId] of Object.entries(prev.parent ?? {})) {
    if (!liveKeys.has(k)) continue;
    if (!collectionIds.has(colId)) continue;
    parent[k] = colId;
  }

  const names: Record<string, string> = {};
  for (const [k, name] of Object.entries(prev.names ?? {})) {
    if (!name.trim()) continue;
    if (isCollectionKey(k) ? collectionKeys.has(k) : liveKeys.has(k)) {
      names[k] = name;
    }
  }

  return {
    collections: prev.collections,
    order: nextOrder,
    parent,
    names,
  };
}

function withOutline(mol: Molecule, outline: ObjectOutline): Molecule {
  const hasMeta =
    outline.collections.length > 0 ||
    Object.keys(outline.parent ?? {}).length > 0 ||
    Object.keys(outline.names ?? {}).length > 0 ||
    (mol.objectOutline?.order?.length ?? 0) > 0;
  if (!hasMeta && outline.order.length === 0) {
    if (!mol.objectOutline) return mol;
    const { objectOutline: _drop, ...rest } = mol;
    return rest;
  }
  return { ...mol, objectOutline: outline };
}

export function createObjectCollection(
  prev: Molecule,
  opts?: { name?: string; afterKey?: string; collapsed?: boolean },
): { molecule: Molecule; collectionId: string } {
  const outline = reconcileObjectOutline(prev);
  const id = newId();
  const name = (opts?.name ?? 'Collection').trim() || 'Collection';
  const collection: ObjectOutlineCollection = {
    id,
    name,
    ...(opts?.collapsed ? { collapsed: true } : {}),
  };
  outline.collections = [...outline.collections, collection];
  const ck = collectionOutlineKey(id);
  outline.names = { ...outline.names, [ck]: name };
  const after = opts?.afterKey;
  if (after && outline.order.includes(after)) {
    const i = outline.order.indexOf(after);
    outline.order = [...outline.order.slice(0, i + 1), ck, ...outline.order.slice(i + 1)];
  } else {
    outline.order = [ck, ...outline.order];
  }
  return { molecule: withOutline(prev, outline), collectionId: id };
}

export function renameObjectOutline(prev: Molecule, key: string, name: string): Molecule {
  const outline = reconcileObjectOutline(prev);
  const trimmed = name.trim();
  const colId = parseCollectionId(key);
  if (colId) {
    outline.collections = outline.collections.map(c =>
      c.id === colId ? { ...c, name: trimmed || c.name } : c,
    );
  }
  if (!trimmed) {
    const { [key]: _n, ...rest } = outline.names ?? {};
    outline.names = rest;
  } else {
    outline.names = { ...outline.names, [key]: trimmed };
  }
  return withOutline(prev, outline);
}

export function setObjectCollectionCollapsed(
  prev: Molecule,
  collectionId: string,
  collapsed: boolean,
): Molecule {
  const outline = reconcileObjectOutline(prev);
  outline.collections = outline.collections.map(c =>
    c.id === collectionId ? { ...c, collapsed } : c,
  );
  return withOutline(prev, outline);
}

export function deleteObjectCollection(
  prev: Molecule,
  collectionId: string,
  opts?: { deleteContents?: boolean },
): Molecule {
  const outline0 = reconcileObjectOutline(prev);
  let next = prev;
  if (opts?.deleteContents) {
    const childKeys = Object.entries(outline0.parent ?? {})
      .filter(([, p]) => p === collectionId)
      .map(([k]) => k);
    let shapes = next.canvasShapes ?? [];
    let texts = next.canvasTexts ?? [];
    let images = next.canvasImages ?? [];
    let arrows = next.reactionArrows ?? [];
    let strokes = next.strokes ?? [];
    let changed = false;
    for (const key of childKeys) {
      if (key.startsWith('shape:')) {
        const id = key.slice('shape:'.length);
        const n = shapes.filter(s => s.id !== id);
        if (n.length !== shapes.length) {
          shapes = n;
          changed = true;
        }
      } else if (key.startsWith('text:')) {
        const id = key.slice('text:'.length);
        const n = texts.filter(t => t.id !== id);
        if (n.length !== texts.length) {
          texts = n;
          changed = true;
        }
      } else if (key.startsWith('image:')) {
        const id = key.slice('image:'.length);
        const n = images.filter(i => i.id !== id);
        if (n.length !== images.length) {
          images = n;
          changed = true;
        }
      } else if (key.startsWith('arrow:')) {
        const id = key.slice('arrow:'.length);
        const n = arrows.filter(a => a.id !== id);
        if (n.length !== arrows.length) {
          arrows = n;
          changed = true;
        }
      } else if (key.startsWith('stroke:')) {
        const id = key.slice('stroke:'.length);
        const n = strokes.filter(s => s.id !== id);
        if (n.length !== strokes.length) {
          strokes = n;
          changed = true;
        }
      }
    }
    if (changed) {
      next = {
        ...next,
        canvasShapes: shapes,
        canvasTexts: texts,
        canvasImages: images,
        reactionArrows: arrows,
        strokes,
      };
    }
  }

  const outline = reconcileObjectOutline(next);
  const ck = collectionOutlineKey(collectionId);
  outline.collections = outline.collections.filter(c => c.id !== collectionId);
  outline.order = outline.order.filter(k => k !== ck);
  const parent: Record<string, string> = {};
  for (const [k, p] of Object.entries(outline.parent ?? {})) {
    if (p !== collectionId) parent[k] = p;
  }
  outline.parent = parent;
  const { [ck]: _n, ...names } = outline.names ?? {};
  outline.names = names;
  return withOutline(next, outline);
}

export function setObjectOutlineParent(
  prev: Molecule,
  key: string,
  collectionId: string | null,
): Molecule {
  if (isCollectionKey(key)) return prev;
  const outline = reconcileObjectOutline(prev);
  if (collectionId && !outline.collections.some(c => c.id === collectionId)) return prev;
  const parent = { ...(outline.parent ?? {}) };
  if (!collectionId) delete parent[key];
  else parent[key] = collectionId;
  outline.parent = parent;

  // Keep the item near its new siblings in order.
  outline.order = outline.order.filter(k => k !== key);
  if (collectionId) {
    const ck = collectionOutlineKey(collectionId);
    let insertAt = outline.order.indexOf(ck) + 1;
    if (insertAt <= 0) insertAt = outline.order.length;
    while (
      insertAt < outline.order.length &&
      outline.parent?.[outline.order[insertAt]!] === collectionId
    ) {
      insertAt++;
    }
    outline.order = [
      ...outline.order.slice(0, insertAt),
      key,
      ...outline.order.slice(insertAt),
    ];
  } else {
    outline.order = [...outline.order, key];
  }
  return withOutline(prev, outline);
}

export function reorderObjectOutline(prev: Molecule, orderedKeys: string[]): Molecule {
  const outline = reconcileObjectOutline(prev);
  const allowed = new Set(outline.order);
  const next: string[] = [];
  const seen = new Set<string>();
  for (const k of orderedKeys) {
    if (!allowed.has(k) || seen.has(k)) continue;
    next.push(k);
    seen.add(k);
  }
  for (const k of outline.order) {
    if (!seen.has(k)) next.push(k);
  }
  outline.order = next;
  return withOutline(prev, outline);
}

/**
 * Drag-drop helper: move `key` before `targetKey`, or into `targetKey` when it is a collection.
 */
export function placeObjectOutlineItem(
  prev: Molecule,
  key: string,
  targetKey: string,
): Molecule {
  if (key === targetKey) return prev;
  let outline = reconcileObjectOutline(prev);
  if (!outline.order.includes(key) || !outline.order.includes(targetKey)) return prev;

  const intoCollection =
    isCollectionKey(targetKey) && !isCollectionKey(key)
      ? parseCollectionId(targetKey)
      : null;

  if (intoCollection) {
    return setObjectOutlineParent(prev, key, intoCollection);
  }

  // Reorder before target; adopt target's parent for non-collection keys.
  const order = outline.order.filter(k => k !== key);
  const insertAt = order.indexOf(targetKey);
  if (insertAt < 0) order.push(key);
  else order.splice(insertAt, 0, key);
  outline.order = order;

  if (!isCollectionKey(key)) {
    const targetParent = outline.parent?.[targetKey] ?? null;
    const parent = { ...(outline.parent ?? {}) };
    if (!targetParent) delete parent[key];
    else parent[key] = targetParent;
    outline.parent = parent;
  }

  return withOutline(prev, outline);
}

/** Move an item among its siblings (same parent). */
export function moveObjectOutline(
  prev: Molecule,
  key: string,
  direction: 'up' | 'down',
): Molecule {
  const outline = reconcileObjectOutline(prev);
  if (!outline.order.includes(key)) return prev;
  const parentId = isCollectionKey(key) ? null : outline.parent?.[key] ?? null;
  const siblings = outline.order.filter(k => {
    if (isCollectionKey(k)) return parentId === null;
    return (outline.parent?.[k] ?? null) === parentId;
  });
  const idx = siblings.indexOf(key);
  if (idx < 0) return prev;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= siblings.length) return prev;
  const a = siblings[idx]!;
  const b = siblings[swapWith]!;
  const order = [...outline.order];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  order[ia] = b;
  order[ib] = a;
  outline.order = order;
  return withOutline(prev, outline);
}

export interface ResolvedOutlineRow {
  key: string;
  depth: number;
  isCollection: boolean;
  collectionId?: string;
  collapsed?: boolean;
  kind: string;
  label: string;
  sub?: string;
  atomIds?: string[];
  annotationId?: string;
  objectKind?: DiscoveredOutlineObject['kind'];
  /**
   * Shape-only groups (e.g. COF schematic) are listed as one object —
   * no expandable children in the Objects panel.
   */
  unified?: boolean;
  childCount?: number;
}

/** Flatten outline for UI: collections with optional nested children. */
export function resolveOutlineRows(molecule: Molecule): ResolvedOutlineRow[] {
  const outline = reconcileObjectOutline(molecule);
  const live = discoverOutlineObjects(molecule);
  const byKey = new Map(live.map(o => [o.key, o]));
  const rows: ResolvedOutlineRow[] = [];

  const labelFor = (key: string, fallback: string) =>
    outline.names?.[key]?.trim() || fallback;

  const childrenOf = (colId: string) =>
    outline.order
      .filter(k => outline.parent?.[k] === colId)
      .map(k => byKey.get(k))
      .filter((o): o is DiscoveredOutlineObject => Boolean(o));

  for (const key of outline.order) {
    const colId = parseCollectionId(key);
    if (colId) {
      const col = outline.collections.find(c => c.id === colId);
      if (!col) continue;
      const children = childrenOf(colId);
      const shapeOnly =
        children.length > 0 && children.every(c => c.kind === 'Shape');
      const name = labelFor(key, col.name);
      // Collections always appear as one Objects-panel row (COF / groups).
      const unified = true;
      const childCount = children.length;
      const sub = shapeOnly
        ? childCount === 1
          ? '1 shape'
          : `${childCount} shapes`
        : childCount > 0
          ? `${childCount} items`
          : undefined;
      rows.push({
        key,
        depth: 0,
        isCollection: true,
        collectionId: colId,
        collapsed: true,
        kind: 'Group',
        label: name,
        sub,
        unified,
        childCount,
      });
      continue;
    }

    if (outline.parent?.[key]) continue; // nested — rendered under folder
    const obj = byKey.get(key);
    if (!obj) continue;
    rows.push({
      key,
      depth: 0,
      isCollection: false,
      kind: obj.kind,
      label: labelFor(key, obj.label),
      sub: obj.sub,
      atomIds: obj.atomIds,
      annotationId: obj.annotationId,
      objectKind: obj.kind,
    });
  }

  return rows;
}
