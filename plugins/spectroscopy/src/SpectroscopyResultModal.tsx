import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import type { SpectroscopyPrediction } from './types';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export interface SpectroscopyResultModalProps {
  open: boolean;
  result: SpectroscopyPrediction | null;
  onClose: () => void;
}

const drawChart = (
  canvas: HTMLCanvasElement,
  result: SpectroscopyPrediction,
  dark: boolean,
): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = dark ? '#1a1a1a' : '#ffffff';
  const ink = dark ? '#e5e7eb' : '#0f172a';
  const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const accent = dark ? '#60a5fa' : '#2563eb';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const padL = 48;
  const padR = 16;
  const padT = 20;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const peaks = result.peaks;
  if (peaks.length === 0) return;

  const xs = peaks.map(p => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const spanX = Math.max(maxX - minX, 1);
  const maxY = Math.max(...peaks.map(p => p.y), 1);

  const xFor = (x: number) => padL + ((x - minX) / spanX) * plotW;
  const yFor = (y: number) => padT + plotH - (y / maxY) * plotH;

  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  for (const p of peaks) {
    const x = xFor(p.x);
    const yTop = yFor(p.y);
    const yBase = padT + plotH;
    ctx.beginPath();
    ctx.moveTo(x, yBase);
    ctx.lineTo(x, yTop);
    ctx.stroke();
  }

  ctx.fillStyle = ink;
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(result.xLabel, padL + plotW / 2, h - 10);
  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(result.yLabel, 0, 0);
  ctx.restore();
};

export function SpectroscopyResultModal({ open, result, onClose }: SpectroscopyResultModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const dark =
    typeof document !== 'undefined' &&
    (document.documentElement.dataset.theme === 'elegant-dark' ||
      document.documentElement.dataset.theme === 'ink-dark');

  useEffect(() => {
    if (!open || !result || !canvasRef.current) return;
    drawChart(canvasRef.current, result, dark);
  }, [open, result, dark]);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      downloadBlob(blob, `${result.kind}-spectrum.png`);
    });
  }, [result]);

  const downloadCsv = useCallback(() => {
    if (!result) return;
    const lines = result.table.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `${result.kind}-spectrum.csv`);
  }, [result]);

  if (!open || !result) return null;

  return createPortal(
    <div className="spec-modal" role="dialog" aria-modal="true" aria-labelledby="spec-modal-title">
      <div className="spec-modal__backdrop" aria-hidden />
      <div className="spec-modal__panel">
        <header className="spec-modal__header">
          <div>
            <h2 id="spec-modal-title" className="spec-modal__title">
              {result.title}
            </h2>
            <p className="spec-modal__meta">
              {result.formula} · MW {result.molecularWeight}
            </p>
          </div>
          <button type="button" className="spec-modal__close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <canvas ref={canvasRef} className="spec-modal__chart" aria-label="Spectrum chart" />

        <div className="spec-modal__table-wrap">
          <table className="spec-modal__table">
            <thead>
              <tr>
                {result.table[0]?.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.table.slice(1).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result.notes.length > 0 ? (
          <ul className="spec-modal__notes">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
        <p className="spec-modal__disclaimer">{result.disclaimer}</p>

        <footer className="spec-modal__actions">
          <button type="button" className="spec-modal__btn" onClick={downloadPng}>
            <Download size={14} aria-hidden />
            Download PNG
          </button>
          <button type="button" className="spec-modal__btn" onClick={downloadCsv}>
            <Download size={14} aria-hidden />
            Download CSV
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
