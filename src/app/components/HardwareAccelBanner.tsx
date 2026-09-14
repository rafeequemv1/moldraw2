/**
 * Warn when WebGL / hardware acceleration looks unavailable.
 * 2D Canvas often still runs on CPU; 3D requires WebGL.
 */
import { useEffect, useState } from 'react';
import {
  GPU_BANNER_DISMISS_KEY,
  probeGpuCapability,
  type GpuCapability,
} from '../gpuCapability';

export function HardwareAccelBanner() {
  const [cap, setCap] = useState<GpuCapability | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(GPU_BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setCap(probeGpuCapability());
  }, []);

  if (!cap || dismissed) return null;
  if (cap.webgl && !cap.softwareLikely) return null;

  const noWebgl = !cap.webgl;

  return (
    <div className="app-engine-banner app-engine-banner--gpu" role="alert">
      <span>
        {noWebgl ? (
          <>
            This browser cannot start WebGL (graphics acceleration looks off). The 2D editor may
            still work on the CPU, but slowly or not at all; <strong>3D view needs WebGL</strong>.
          </>
        ) : (
          <>
            Graphics acceleration looks off — WebGL is using a software path. The 2D editor can
            still run on the CPU, but may be slow; <strong>3D view needs hardware acceleration</strong>.
          </>
        )}{' '}
        <strong>Chrome / Edge:</strong> paste <code>chrome://settings/system</code> in the address
        bar → turn on <strong>Use graphics acceleration when available</strong> → click{' '}
        <strong>Relaunch</strong>, then reload Moldraw.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            sessionStorage.setItem(GPU_BANNER_DISMISS_KEY, '1');
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
