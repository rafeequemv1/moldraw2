import React, { useMemo, useState } from 'react';

const DEFAULT_LANES = [
  { id: 1, label: 'A', spots: [{ id: 1, rf: 0.35, color: '#1f2937', size: 8 }, { id: 2, rf: 0.62, color: '#0f766e', size: 7 }] },
  { id: 2, label: 'B', spots: [{ id: 1, rf: 0.4, color: '#1f2937', size: 8 }] },
];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function TlcModal({ onClose }) {
  const [title, setTitle] = useState('TLC Plate Diagram');
  const [solventSystem, setSolventSystem] = useState('Hexane : EtOAc (7:3)');
  const [stationaryPhase, setStationaryPhase] = useState('Silica gel');
  const [plateWidth, setPlateWidth] = useState(260);
  const [plateHeight, setPlateHeight] = useState(360);
  const [solventFrontPercent, setSolventFrontPercent] = useState(18);
  const [lanes, setLanes] = useState(DEFAULT_LANES);
  const [showRfLabels, setShowRfLabels] = useState(true);

  const baselineY = plateHeight - 28;
  const solventFrontY = 24 + ((baselineY - 24) * (solventFrontPercent / 100));

  const svgMarkup = useMemo(() => {
    const canvasPad = 40;
    const W = plateWidth + canvasPad * 2;
    const H = plateHeight + 120;
    const plateX = canvasPad;
    const plateY = 36;
    const n = Math.max(lanes.length, 1);
    const laneGap = plateWidth / (n + 1);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff;font-family:Arial,Helvetica,sans-serif">`;
    svg += `<text x="${W / 2}" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="#111827">${title}</text>`;
    svg += `<text x="${W / 2}" y="34" text-anchor="middle" font-size="11" fill="#4b5563">${stationaryPhase} | Solvent: ${solventSystem}</text>`;

    svg += `<rect x="${plateX}" y="${plateY}" width="${plateWidth}" height="${plateHeight}" fill="#fcfcfd" stroke="#1f2937" stroke-width="1.3"/>`;
    svg += `<line x1="${plateX + 8}" y1="${plateY + baselineY}" x2="${plateX + plateWidth - 8}" y2="${plateY + baselineY}" stroke="#111827" stroke-width="1.5"/>`;
    svg += `<line x1="${plateX + 8}" y1="${plateY + solventFrontY}" x2="${plateX + plateWidth - 8}" y2="${plateY + solventFrontY}" stroke="#334155" stroke-width="1.2" stroke-dasharray="5 4"/>`;

    svg += `<text x="${plateX + plateWidth + 8}" y="${plateY + baselineY + 4}" font-size="9" fill="#374151">Baseline</text>`;
    svg += `<text x="${plateX + plateWidth + 8}" y="${plateY + solventFrontY + 4}" font-size="9" fill="#374151">Solvent front</text>`;

    for (let i = 0; i < n; i += 1) {
      const lane = lanes[i];
      const x = plateX + laneGap * (i + 1);
      svg += `<line x1="${x}" y1="${plateY + baselineY}" x2="${x}" y2="${plateY + baselineY - 6}" stroke="#111827" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${plateY + baselineY + 18}" text-anchor="middle" font-size="11" font-weight="700" fill="#111827">${lane.label || `L${i + 1}`}</text>`;

      lane.spots.forEach((spot) => {
        const rf = clamp(Number(spot.rf) || 0, 0, 1);
        const y = plateY + baselineY - rf * (baselineY - solventFrontY);
        const r = clamp(Number(spot.size) || 7, 3, 18);
        const fill = spot.color || '#111827';
        svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" fill-opacity="0.82" stroke="#0f172a" stroke-opacity="0.2" stroke-width="1"/>`;
        if (showRfLabels) {
          svg += `<text x="${x + r + 5}" y="${y + 3}" font-size="9" fill="#1f2937">Rf ${rf.toFixed(2)}</text>`;
        }
      });
    }

    svg += `</svg>`;
    return svg;
  }, [title, stationaryPhase, solventSystem, plateWidth, plateHeight, baselineY, solventFrontY, lanes, showRfLabels]);

  const addLane = () => {
    const id = Date.now();
    setLanes((prev) => [...prev, { id, label: `L${prev.length + 1}`, spots: [{ id: 1, rf: 0.4, color: '#1f2937', size: 8 }] }]);
  };

  const removeLane = (laneId) => {
    setLanes((prev) => prev.filter((l) => l.id !== laneId));
  };

  const updateLane = (laneId, patch) => {
    setLanes((prev) => prev.map((l) => (l.id === laneId ? { ...l, ...patch } : l)));
  };

  const addSpot = (laneId) => {
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? { ...l, spots: [...l.spots, { id: Date.now(), rf: 0.5, color: '#1f2937', size: 8 }] }
          : l
      )
    );
  };

  const updateSpot = (laneId, spotId, patch) => {
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? { ...l, spots: l.spots.map((s) => (s.id === spotId ? { ...s, ...patch } : s)) }
          : l
      )
    );
  };

  const removeSpot = (laneId, spotId) => {
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? { ...l, spots: l.spots.filter((s) => s.id !== spotId) }
          : l
      )
    );
  };

  const downloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tlc-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPng = () => {
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = 'tlc-diagram.png';
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="tlc-modal-backdrop" onClick={onClose}>
      <div className="tlc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tlc-header">
          <div className="tlc-title">TLC Diagram Builder</div>
          <button className="tlc-close" onClick={onClose}>x</button>
        </div>

        <div className="tlc-body">
          <div className="tlc-controls">
            <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <label>Solvent system<input value={solventSystem} onChange={(e) => setSolventSystem(e.target.value)} /></label>
            <label>Stationary phase<input value={stationaryPhase} onChange={(e) => setStationaryPhase(e.target.value)} /></label>

            <div className="tlc-grid-2">
              <label>Plate width<input type="number" min="160" max="500" value={plateWidth} onChange={(e) => setPlateWidth(clamp(parseInt(e.target.value || '0', 10), 160, 500))} /></label>
              <label>Plate height<input type="number" min="220" max="700" value={plateHeight} onChange={(e) => setPlateHeight(clamp(parseInt(e.target.value || '0', 10), 220, 700))} /></label>
            </div>

            <label>
              Solvent front height (% of run)
              <input type="range" min="8" max="95" value={solventFrontPercent} onChange={(e) => setSolventFrontPercent(parseInt(e.target.value, 10))} />
              <span className="tlc-muted">{solventFrontPercent}%</span>
            </label>
            <label className="tlc-checkbox">
              <input type="checkbox" checked={showRfLabels} onChange={(e) => setShowRfLabels(e.target.checked)} />
              Show Rf labels
            </label>

            <div className="tlc-lane-actions">
              <button onClick={addLane}>+ Add lane</button>
            </div>

            <div className="tlc-lane-list">
              {lanes.map((lane, idx) => (
                <div className="tlc-lane-card" key={lane.id}>
                  <div className="tlc-lane-row">
                    <strong>Lane {idx + 1}</strong>
                    <button onClick={() => removeLane(lane.id)} disabled={lanes.length <= 1}>Remove lane</button>
                  </div>
                  <label>Lane label<input value={lane.label} onChange={(e) => updateLane(lane.id, { label: e.target.value })} /></label>
                  {lane.spots.map((spot) => (
                    <div className="tlc-spot-row" key={spot.id}>
                      <label>Rf
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={spot.rf}
                          onChange={(e) => updateSpot(lane.id, spot.id, { rf: clamp(parseFloat(e.target.value || '0'), 0, 1) })}
                        />
                      </label>
                      <label>Size
                        <input
                          type="number"
                          min="3"
                          max="18"
                          value={spot.size}
                          onChange={(e) => updateSpot(lane.id, spot.id, { size: clamp(parseInt(e.target.value || '7', 10), 3, 18) })}
                        />
                      </label>
                      <label>Color
                        <input
                          type="color"
                          value={spot.color}
                          onChange={(e) => updateSpot(lane.id, spot.id, { color: e.target.value })}
                        />
                      </label>
                      <button onClick={() => removeSpot(lane.id, spot.id)} disabled={lane.spots.length <= 1}>x</button>
                    </div>
                  ))}
                  <button onClick={() => addSpot(lane.id)}>+ Add spot</button>
                </div>
              ))}
            </div>
          </div>

          <div className="tlc-preview">
            <div className="tlc-preview-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
            <div className="tlc-downloads">
              <button onClick={downloadSvg}>Download SVG</button>
              <button onClick={downloadPng}>Download PNG</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TlcModal;
