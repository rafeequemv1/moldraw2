import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { ProteinChain, ResidueSelection } from './types';

const CHAIN_COLORS = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#0891b2',
  '#ea580c',
  '#4f46e5',
];

function chainColor(chainId: string, chains: ProteinChain[]): string {
  const idx = chains.findIndex(c => c.id === chainId);
  return CHAIN_COLORS[idx % CHAIN_COLORS.length] ?? '#64748b';
}

function rangeSelection(
  chains: ProteinChain[],
  chain: string,
  a: number,
  b: number,
): ResidueSelection[] {
  const chainData = chains.find(c => c.id === chain);
  if (!chainData) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return chainData.residues
    .filter(r => r.resi >= lo && r.resi <= hi)
    .map(r => ({ chain, resi: r.resi }));
}

export interface SequenceStripProps {
  chains: ProteinChain[];
  selection: ResidueSelection[];
  onSelectionChange: (sel: ResidueSelection[]) => void;
  onSelectionComplete?: () => void;
}

export function SequenceStrip({
  chains,
  selection,
  onSelectionChange,
  onSelectionComplete,
}: SequenceStripProps) {
  const dragRef = useRef<{ chain: string; resi: number } | null>(null);
  const draggingRef = useRef(false);
  const [hoverResi, setHoverResi] = useState<ResidueSelection | null>(null);

  const isSelected = useCallback(
    (chain: string, resi: number) =>
      selection.some(s => s.chain === chain && s.resi === resi),
    [selection],
  );

  useEffect(() => {
    const endDrag = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        dragRef.current = null;
        onSelectionComplete?.();
      }
    };
    window.addEventListener('mouseup', endDrag);
    return () => window.removeEventListener('mouseup', endDrag);
  }, [onSelectionComplete]);

  const handleMouseDown = (chain: string, resi: number) => {
    draggingRef.current = true;
    dragRef.current = { chain, resi };
    onSelectionChange(rangeSelection(chains, chain, resi, resi));
  };

  const handleMouseEnter = (chain: string, resi: number) => {
    setHoverResi({ chain, resi });
    if (!draggingRef.current || !dragRef.current) return;
    const anchor = dragRef.current;
    if (anchor.chain !== chain) return;
    onSelectionChange(rangeSelection(chains, chain, anchor.resi, resi));
  };

  const handleClick = (e: ReactMouseEvent, chain: string, resi: number) => {
    if (draggingRef.current) return;
    const residue = { chain, resi };
    if (e.metaKey || e.ctrlKey) {
      if (isSelected(chain, resi)) {
        onSelectionChange(selection.filter(s => !(s.chain === chain && s.resi === resi)));
      } else {
        onSelectionChange([...selection, residue]);
      }
    } else {
      onSelectionChange([residue]);
    }
    onSelectionComplete?.();
  };

  if (chains.length === 0) {
    return (
      <div className="protein-seq protein-seq--empty">
        Load a PDB structure to view the sequence.
      </div>
    );
  }

  return (
    <div className="protein-seq" role="listbox" aria-label="Protein sequence">
      {chains.map(chain => (
        <div key={chain.id} className="protein-seq__chain">
          <div
            className="protein-seq__chain-label"
            style={{ borderColor: chainColor(chain.id, chains) }}
          >
            Chain {chain.id}
            <span className="protein-seq__chain-len">{chain.residues.length} res</span>
          </div>
          <div className="protein-seq__residues">
            {chain.residues.map((r, i) => {
              const selected = isSelected(chain.id, r.resi);
              const hovered = hoverResi?.chain === chain.id && hoverResi.resi === r.resi;
              return (
                <button
                  key={`${chain.id}-${r.resi}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[
                    'protein-seq__res',
                    selected ? 'protein-seq__res--selected' : '',
                    hovered ? 'protein-seq__res--hover' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={`${r.resn} ${r.resi} (chain ${chain.id})`}
                  onMouseDown={e => {
                    e.preventDefault();
                    handleMouseDown(chain.id, r.resi);
                  }}
                  onMouseEnter={() => handleMouseEnter(chain.id, r.resi)}
                  onMouseLeave={() => setHoverResi(null)}
                  onClick={e => handleClick(e, chain.id, r.resi)}
                >
                  <span className="protein-seq__res-num">
                    {i === 0 || r.resi % 10 === 0 ? r.resi : ''}
                  </span>
                  <span className="protein-seq__res-letter">{r.oneLetter}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="protein-seq__hint">
        Drag to select range · Click one · Ctrl/Cmd+click toggle
      </p>
    </div>
  );
}
