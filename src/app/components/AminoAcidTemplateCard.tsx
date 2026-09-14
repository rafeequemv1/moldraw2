import { useEffect, useState } from 'react';
import type { AminoAcidTemplate } from '@moldraw/templates';
import { TemplateStructurePreview } from './TemplateStructurePreview';

export function AminoAcidTemplateCard({
  template,
  requestMolblock,
  onInsert,
}: {
  template: AminoAcidTemplate;
  requestMolblock: (smiles: string) => Promise<string | null>;
  onInsert: () => void;
}) {
  const [molblock, setMolblock] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMolblock(null);
    void requestMolblock(template.smiles).then(mb => {
      if (!cancelled) setMolblock(mb);
    });
    return () => {
      cancelled = true;
    };
  }, [template.smiles, requestMolblock]);

  return (
    <button type="button" className="template-library-card" onClick={onInsert}>
      <TemplateStructurePreview
        molblock={molblock}
        label={`${template.name} (${template.code})`}
      />
      <span className="template-library-card__code">{template.code}</span>
      <span className="template-library-card__name">{template.name}</span>
    </button>
  );
}
