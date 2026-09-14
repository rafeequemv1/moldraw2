import { useEffect, useState } from 'react';
import { TemplateStructurePreview } from './TemplateStructurePreview';

/** Generic library card for SMILES- or molblock-backed templates. */
export function SmilesTemplateCard({
  code,
  name,
  hint,
  smiles,
  molblock: fixedMolblock,
  requestMolblock,
  onInsert,
}: {
  code: string;
  name: string;
  hint?: string;
  smiles?: string;
  molblock?: string;
  requestMolblock: (smiles: string) => Promise<string | null>;
  onInsert: () => void;
}) {
  const [molblock, setMolblock] = useState<string | null>(fixedMolblock ?? null);

  useEffect(() => {
    if (fixedMolblock) {
      setMolblock(fixedMolblock);
      return;
    }
    if (!smiles) {
      setMolblock(null);
      return;
    }
    let cancelled = false;
    setMolblock(null);
    void requestMolblock(smiles).then(mb => {
      if (!cancelled) setMolblock(mb);
    });
    return () => {
      cancelled = true;
    };
  }, [smiles, fixedMolblock, requestMolblock]);

  const ready = Boolean(fixedMolblock || molblock);

  return (
    <button
      type="button"
      className="template-library-card"
      onClick={onInsert}
      disabled={!ready}
      title={hint ?? name}
    >
      <TemplateStructurePreview molblock={molblock} label={`${name} (${code})`} />
      <span className="template-library-card__code">{code}</span>
      <span className="template-library-card__name">{name}</span>
      {hint ? <span className="template-library-card__hint">{hint}</span> : null}
    </button>
  );
}
