import { useMemo } from 'react';
import { listMofPresets, mofPreviewMolblock } from '@moldraw/core';
import { SmilesTemplateCard } from '../components/SmilesTemplateCard';

export type MofsLibraryPanelProps = {
  onInsert: (presetId: string) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
};

export function MofsLibraryPanel({ onInsert, requestSmilesMolblock }: MofsLibraryPanelProps) {
  const presets = listMofPresets();
  const molblocks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of presets) {
      const mb = mofPreviewMolblock(p.id);
      if (mb) map.set(p.id, mb);
    }
    return map;
  }, [presets]);

  return (
    <div className="template-library-body template-library-body--single">
      <section className="template-library-main" aria-label="MOFs">
        <div className="template-library-main__head">
          MOFs
          <span className="template-library-main__meta">
            {presets.length} {presets.length === 1 ? 'preset' : 'presets'}
          </span>
        </div>
        <div className="template-library-main__scroll">
          <p className="template-library-panel-lead">
            Layered 2D metal–organic frameworks (honeycomb HHTP and square paddlewheel–BDC).
            Pack with the H / V / D sliders after insert — 3D shows the same pose, without embedding.
          </p>
          <div className="template-library-grid">
            {presets.map(p => (
              <SmilesTemplateCard
                key={p.id}
                code={p.label}
                name={p.name}
                hint={p.conditions ?? p.summary}
                molblock={molblocks.get(p.id)}
                requestMolblock={requestSmilesMolblock}
                onInsert={() => onInsert(p.id)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
