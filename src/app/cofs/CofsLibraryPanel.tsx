import { useMemo } from 'react';
import { cofPreviewMolblock, listCofPresets } from '@moldraw/core';
import { SmilesTemplateCard } from '../components/SmilesTemplateCard';

export type CofsLibraryPanelProps = {
  onInsert: (presetId: string) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
};

export function CofsLibraryPanel({ onInsert, requestSmilesMolblock }: CofsLibraryPanelProps) {
  const presets = listCofPresets();
  const molblocks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of presets) {
      const mb = cofPreviewMolblock(p.id);
      if (mb) map.set(p.id, mb);
    }
    return map;
  }, [presets]);

  return (
    <div className="template-library-body template-library-body--single">
      <section className="template-library-main" aria-label="COFs">
        <div className="template-library-main__head">
          COFs
          <span className="template-library-main__meta">
            {presets.length} {presets.length === 1 ? 'preset' : 'presets'}
          </span>
        </div>
        <div className="template-library-main__scroll">
          <p className="template-library-panel-lead">
            Hexagonal 2D frameworks placed as canvas templates. Pack with the H / V / D sliders
            after insert — 3D shows the same pose, without embedding.
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
