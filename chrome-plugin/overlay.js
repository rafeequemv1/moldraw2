(() => {
  if (typeof globalThis.__moldrawCaptureStop === 'function') {
    globalThis.__moldrawCaptureStop();
  }

  const host = document.createElement('div');
  host.id = 'moldraw-capture-host';
  host.style.all = 'initial';
  host.style.display = 'block';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'auto';

  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: Inter, system-ui, "Segoe UI", sans-serif; }
      .root {
        position: fixed;
        inset: 0;
        pointer-events: auto;
        cursor: crosshair;
        background: rgba(15, 23, 42, 0.28);
      }
      .hint {
        position: fixed;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid rgba(45, 212, 191, 0.45);
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        letter-spacing: 0.01em;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
        pointer-events: none;
        white-space: nowrap;
      }
      .hint b { color: #5eead4; font-weight: 600; }
      .box {
        position: fixed;
        border: 1.5px solid #2c7a7b;
        background: rgba(13, 148, 136, 0.12);
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
        pointer-events: none;
        display: none;
      }
      .size {
        position: absolute;
        right: 0;
        bottom: -22px;
        background: #0f766e;
        color: #fff;
        font-size: 11px;
        line-height: 1;
        padding: 4px 6px;
        border-radius: 4px;
      }
    </style>
    <div class="root" id="root">
      <div class="hint">Drag to select a molecule · <b>Esc</b> cancel</div>
      <div class="box" id="box"><span class="size" id="size"></span></div>
    </div>
  `;

  document.documentElement.appendChild(host);

  const root = shadow.getElementById('root');
  const box = shadow.getElementById('box');
  const size = shadow.getElementById('size');

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let done = false;

  function cleanup() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    host.remove();
    if (globalThis.__moldrawCaptureStop === stop) globalThis.__moldrawCaptureStop = null;
  }

  function stop() {
    if (done) return;
    done = true;
    cleanup();
  }

  function finish(payload) {
    if (done) return;
    done = true;
    cleanup();
    chrome.runtime.sendMessage({ type: 'REGION_SELECTED', ...payload });
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish({ cancelled: true });
    }
  }

  function normRect(x0, y0, x1, y1) {
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    return { x, y, w, h };
  }

  function onMove(event) {
    if (!dragging) return;
    const rect = normRect(startX, startY, event.clientX, event.clientY);
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.w}px`;
    box.style.height = `${rect.h}px`;
    size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
  }

  function onUp(event) {
    if (!dragging) return;
    dragging = false;
    const rect = normRect(startX, startY, event.clientX, event.clientY);
    if (rect.w < 8 || rect.h < 8) {
      box.style.display = 'none';
      return;
    }
    finish({
      cancelled: false,
      rect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }

  root.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.style.display = 'block';
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
  });

  root.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  globalThis.__moldrawCaptureStop = stop;
})();
