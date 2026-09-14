import { useEffect, useRef, useState } from 'react';
import { parseMolblock, moleculeToMolblock } from '@moldraw/core/io/molblock';
import { prepareFunctionalGroupFragment } from '@moldraw/core/molecule/functionalGroupFragment';
import { TemplateStructurePreview } from './TemplateStructurePreview';

export function FunctionalGroupPreviewCell({
  label,
  smiles,
  requestMolblock,
  onPick,
}: {
  label: string;
  smiles: string;
  requestMolblock: (smiles: string) => Promise<string | null>;
  /** Raw SMILES molblock (still includes `[*]` when present) for immediate placement. */
  onPick: (rawMolblock: string | null) => void;
}) {
  const [molblock, setMolblock] = useState<string | null>(null);
  const rawMolblockRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMolblock(null);
    rawMolblockRef.current = null;
    void requestMolblock(smiles)
      .then(mb => {
        if (cancelled || !mb?.trim()) return;
        rawMolblockRef.current = mb;
        try {
          const { fragment } = prepareFunctionalGroupFragment(parseMolblock(mb));
          setMolblock(fragment.atoms.length > 0 ? moleculeToMolblock(fragment) : mb);
        } catch {
          if (!cancelled) setMolblock(mb);
        }
      })
      .catch(() => {
        /* preview optional */
      });
    return () => {
      cancelled = true;
    };
  }, [smiles, requestMolblock]);

  const pick = () => onPick(rawMolblockRef.current);

  return (
    <button
      type="button"
      className="toolbar-fg-item"
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault();
        pick();
      }}
      onClick={e => {
        e.stopPropagation();
        pick();
      }}
      title={`${label} — click an atom to attach, or drag onto an atom`}
    >
      <TemplateStructurePreview molblock={molblock} width={64} height={44} label={label} compact />
      <span className="toolbar-fg-item__label">{label}</span>
    </button>
  );
}
