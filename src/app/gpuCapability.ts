/**
 * Probe whether the browser can create a usable WebGL context.
 * Used to warn when Chrome “Use graphics acceleration” is off — 2D Canvas
 * may still work (software), but 3Dmol / WebGL will fail or be unusable.
 */

export type GpuCapability = {
  /** Any WebGL context obtainable. */
  webgl: boolean;
  /**
   * True when WebGL only works without `failIfMajorPerformanceCaveat`
   * (typical when hardware acceleration is disabled → software GL).
   */
  softwareLikely: boolean;
  detail: string;
};

const lose = (gl: WebGLRenderingContext | WebGL2RenderingContext) => {
  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* ignore */
  }
};

export function probeGpuCapability(): GpuCapability {
  if (typeof document === 'undefined') {
    return { webgl: true, softwareLikely: false, detail: 'ssr' };
  }
  try {
    const canvas = document.createElement('canvas');
    const hw =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (hw) {
      lose(hw);
      return { webgl: true, softwareLikely: false, detail: 'hardware WebGL' };
    }

    const soft = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (soft) {
      lose(soft);
      return {
        webgl: true,
        softwareLikely: true,
        detail: 'software WebGL only (hardware acceleration likely off)',
      };
    }

    return {
      webgl: false,
      softwareLikely: true,
      detail: 'no WebGL context',
    };
  } catch (err) {
    return {
      webgl: false,
      softwareLikely: true,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export const GPU_BANNER_DISMISS_KEY = 'moldraw.gpuBanner.dismissed';
