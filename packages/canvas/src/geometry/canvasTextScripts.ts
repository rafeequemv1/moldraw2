/**
 * Per-character superscript / subscript ranges on `CanvasText`.
 * Indices are UTF-16 (same as textarea selectionStart / selectionEnd).
 */
import type { CanvasText, CanvasTextScriptRange } from '@moldraw/domain';

export type { CanvasTextScriptRange };
export type CanvasTextScriptKind = CanvasTextScriptRange['script'];

export const CANVAS_TEXT_SCRIPT_SCALE = 0.72;

export const canvasTextScriptDy = (
  fontSize: number,
  script: CanvasTextScriptKind | 'normal',
): number => {
  if (script === 'super') return -fontSize * 0.35;
  if (script === 'sub') return fontSize * 0.28;
  return 0;
};

export const normalizeTextScriptRanges = (
  ranges: readonly CanvasTextScriptRange[],
  textLen?: number,
): CanvasTextScriptRange[] => {
  const clipped = ranges
    .map(r => {
      let s = Math.min(r.start, r.end);
      let e = Math.max(r.start, r.end);
      if (textLen != null) {
        s = Math.max(0, Math.min(s, textLen));
        e = Math.max(0, Math.min(e, textLen));
      }
      return { start: s, end: e, script: r.script };
    })
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: CanvasTextScriptRange[] = [];
  for (const r of clipped) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...r });
      continue;
    }
    if (r.start < last.end && last.script !== r.script) {
      last.end = r.start;
      if (last.end <= last.start) out.pop();
      out.push({ ...r });
      continue;
    }
    if (last.script === r.script && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      continue;
    }
    out.push({ ...r });
  }
  return out.filter(r => r.end > r.start);
};

/** Legacy `textScript` is treated as a whole-string range when no ranges exist. */
export const resolveCanvasTextScripts = (
  t: Pick<CanvasText, 'text' | 'textScript' | 'textScripts'>,
): CanvasTextScriptRange[] => {
  if (t.textScripts && t.textScripts.length > 0) {
    return normalizeTextScriptRanges(t.textScripts, t.text.length);
  }
  if (t.textScript === 'super' || t.textScript === 'sub') {
    const end = t.text.length;
    return end > 0 ? [{ start: 0, end, script: t.textScript }] : [];
  }
  return [];
};

export const scriptAtIndex = (
  ranges: readonly CanvasTextScriptRange[],
  index: number,
): CanvasTextScriptKind | 'normal' => {
  for (const r of ranges) {
    if (index >= r.start && index < r.end) return r.script;
  }
  return 'normal';
};

export const selectionHasUniformScript = (
  ranges: readonly CanvasTextScriptRange[],
  start: number,
  end: number,
  script: CanvasTextScriptKind,
): boolean => {
  if (start >= end) return false;
  for (let i = start; i < end; i++) {
    if (scriptAtIndex(ranges, i) !== script) return false;
  }
  return true;
};

const punchRange = (
  ranges: readonly CanvasTextScriptRange[],
  a: number,
  b: number,
): CanvasTextScriptRange[] => {
  const out: CanvasTextScriptRange[] = [];
  for (const r of ranges) {
    if (r.end <= a || r.start >= b) {
      out.push({ ...r });
      continue;
    }
    if (r.start < a) out.push({ start: r.start, end: a, script: r.script });
    if (r.end > b) out.push({ start: b, end: r.end, script: r.script });
  }
  return out;
};

/** Toggle `script` on `[start, end)`. Empty selection is a no-op. */
export const toggleTextScriptRange = (
  ranges: readonly CanvasTextScriptRange[],
  start: number,
  end: number,
  script: CanvasTextScriptKind,
  textLen?: number,
): CanvasTextScriptRange[] => {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(a, Math.max(start, end));
  if (a >= b) return normalizeTextScriptRanges(ranges, textLen);
  const punched = punchRange(ranges, a, b);
  if (selectionHasUniformScript(ranges, a, b, script)) {
    return normalizeTextScriptRanges(punched, textLen);
  }
  return normalizeTextScriptRanges([...punched, { start: a, end: b, script }], textLen);
};

/**
 * Remap ranges after replacing `[editStart, editEnd)` with `insertLen` chars.
 * Insert at the end of a range expands that range (left affinity).
 */
export const remapTextScriptRanges = (
  ranges: readonly CanvasTextScriptRange[],
  editStart: number,
  editEnd: number,
  insertLen: number,
  textLen?: number,
): CanvasTextScriptRange[] => {
  const a = Math.max(0, Math.min(editStart, editEnd));
  const b = Math.max(a, Math.max(editStart, editEnd));
  const ins = Math.max(0, insertLen);
  const delta = ins - (b - a);
  const next: CanvasTextScriptRange[] = [];
  for (const r of ranges) {
    let ns: number;
    let ne: number;
    if (r.end < a) {
      ns = r.start;
      ne = r.end;
    } else if (r.end === a && r.start < a) {
      ns = r.start;
      ne = r.end + ins;
    } else if (r.start >= b) {
      ns = r.start + delta;
      ne = r.end + delta;
    } else {
      ns = r.start < a ? r.start : a;
      ne = r.end > b ? r.end + delta : a + ins;
    }
    if (ne > ns) next.push({ start: ns, end: ne, script: r.script });
  }
  return normalizeTextScriptRanges(next, textLen);
};

/** Infer a replace span when the pre-change caret is unknown or stale. */
export const inferTextEdit = (
  oldText: string,
  newText: string,
  caret?: { start: number; end: number },
): { start: number; end: number; insertLen: number } => {
  if (caret) {
    const selA = Math.min(caret.start, caret.end);
    const selB = Math.max(caret.start, caret.end);
    const deleted = selB - selA;
    const insertLen = newText.length - (oldText.length - deleted);
    if (insertLen >= 0 && selA <= oldText.length && selB <= oldText.length) {
      const rebuilt =
        oldText.slice(0, selA) + newText.slice(selA, selA + insertLen) + oldText.slice(selB);
      if (rebuilt === newText) return { start: selA, end: selB, insertLen };
    }
  }
  let prefix = 0;
  const maxPref = Math.min(oldText.length, newText.length);
  while (prefix < maxPref && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix++;
  }
  return {
    start: prefix,
    end: oldText.length - suffix,
    insertLen: newText.length - prefix - suffix,
  };
};
