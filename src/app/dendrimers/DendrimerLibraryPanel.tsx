import { useMemo } from 'react';
import { dendrimerPreviewMolblock, listDendrimerPresets } from '@moldraw/core';
import { SmilesTemplateCard } from '../components/SmilesTemplateCard';

export type DendrimerLibraryPanelProps = {
  onInsert: (presetId: string) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
};

export function DendrimerLibraryPanel({
  onInsert,
  requestSmilesMolblock,
}: DendrimerLibraryPanelProps) {
  const presets = listDendrimerPresets();
  const molblocks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of presets) {
      const mb = dendrimerPreviewMolblock(p.id);
      if (mb) map.set(p.id, mb);
    }
    return map;
  }, [presets]);

  return (
    <div className="template-library-body template-library-body--single">
      <section className="template-library-main" aria-label="Dendrimers">
        <div className="template-library-main__head">
          Dendrimers
          <span className="template-library-main__meta">
            {presets.length} {presets.length === 1 ? 'example' : 'examples'}
          </span>
        </div>
        <div className="template-library-main__scroll">
          <p className="template-library-panel-lead">
            Large authored examples. Si–Fc G3 uses the dendrimer setup (core + one wedge, 3-fold
            copies). For a custom dendrimer, select a core, draw one branch, then Generate →
            Dendrimer.
          </p>
          <div className="template-library-grid">
            {presets.map(p => (
              <SmilesTemplateCard
                key={p.id}
                code={p.label}
                name={p.name}
                hint={p.summary}
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
