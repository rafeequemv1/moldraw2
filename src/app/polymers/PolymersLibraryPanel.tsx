import { useMemo } from 'react';
import { listPolymerPresets, polymerPreviewMolblock } from '@moldraw/core';
import { SmilesTemplateCard } from '../components/SmilesTemplateCard';

export type PolymersLibraryPanelProps = {
  onInsert: (presetId: string) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
};

export function PolymersLibraryPanel({
  onInsert,
  requestSmilesMolblock,
}: PolymersLibraryPanelProps) {
  const presets = listPolymerPresets();
  const molblocks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of presets) {
      const mb = polymerPreviewMolblock(p.id);
      if (mb) map.set(p.id, mb);
    }
    return map;
  }, [presets]);

  return (
    <div className="template-library-body template-library-body--single">
      <section className="template-library-main" aria-label="Polymers">
        <div className="template-library-main__head">
          Polymers
          <span className="template-library-main__meta">
            {presets.length} {presets.length === 1 ? 'SRU' : 'SRUs'}
          </span>
        </div>
        <div className="template-library-main__scroll">
          <p className="template-library-panel-lead">
            ChemDraw-style repeating units with [ ]ₙ brackets. One monomer is placed — edit the
            subscript after insert. Use the Polymer tool for custom SRUs.
          </p>
          <div className="template-library-grid">
            {presets.map(p => (
              <SmilesTemplateCard
                key={p.id}
                code={p.label}
                name={p.name}
                hint={p.formula ?? p.summary}
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
