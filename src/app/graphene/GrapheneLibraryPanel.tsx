/**
 * Library → Graphene: place a pristine sheet, a circular flake, or reduced
 * graphene oxide. Size / shape / rGO are then tuned in the left params panel
 * that opens while the sheet is selected.
 */
import { useMemo } from 'react';
import { buildGrapheneSheet, moleculeToMolblock, type GrapheneOxidation, type GrapheneShape } from '@moldraw/core';
import { SmilesTemplateCard } from '../components/SmilesTemplateCard';

export type GrapheneLibraryInsert = {
  shape: GrapheneShape;
  oxidation: GrapheneOxidation;
  cols: number;
  rows: number;
};

export type GrapheneLibraryPanelProps = {
  onInsert: (opts: GrapheneLibraryInsert) => void;
  requestSmilesMolblock: (smiles: string) => Promise<string | null>;
};

const PRESETS: Array<GrapheneLibraryInsert & { id: string; label: string; name: string; hint: string }> = [
  {
    id: 'graphene-rect',
    label: 'Graphene',
    name: 'Graphene sheet (rectangular)',
    hint: 'Gapless sp² honeycomb, 4 × 3 hexes. Grow with the W / H sliders.',
    shape: 'rectangular',
    oxidation: 'none',
    cols: 4,
    rows: 3,
  },
  {
    id: 'graphene-flake',
    label: 'Flake',
    name: 'Graphene flake (circular)',
    hint: 'Round nanoflake, 5 hexes across. Diameter slider in the params panel.',
    shape: 'circular',
    oxidation: 'none',
    cols: 5,
    rows: 5,
  },
  {
    id: 'rgo',
    label: 'rGO',
    name: 'Reduced graphene oxide',
    hint: 'Residual edge –OH / –COOH, sparse basal –OH and epoxide bridges (C/O ≈ 10). Toggle rGO off in the panel for pristine graphene.',
    shape: 'rectangular',
    oxidation: 'rgo',
    cols: 5,
    rows: 4,
  },
];

export function GrapheneLibraryPanel({ onInsert, requestSmilesMolblock }: GrapheneLibraryPanelProps) {
  const molblocks = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of PRESETS) {
      const sheet = buildGrapheneSheet({
        cols: p.cols,
        rows: p.rows,
        shape: p.shape,
        bondLength: 40,
        cx: 0,
        cy: 0,
        oxidation: p.oxidation,
        sheetId: 'lib',
      });
      map.set(p.id, moleculeToMolblock({ atoms: sheet.atoms, bonds: sheet.bonds }));
    }
    return map;
  }, []);

  return (
    <div className="template-library-body template-library-body--single">
      <section className="template-library-main" aria-label="Graphene">
        <div className="template-library-main__head">
          Graphene
          <span className="template-library-main__meta">{PRESETS.length} presets</span>
        </div>
        <div className="template-library-main__scroll">
          <p className="template-library-panel-lead">
            Place a sheet, then use the Graphene panel (left, closable) to change width, height,
            shape, bond length, or switch to reduced graphene oxide. The panel reopens whenever the
            sheet is selected.
          </p>
          <div className="template-library-grid">
            {PRESETS.map(p => (
              <SmilesTemplateCard
                key={p.id}
                code={p.label}
                name={p.name}
                hint={p.hint}
                molblock={molblocks.get(p.id)}
                requestMolblock={requestSmilesMolblock}
                onInsert={() =>
                  onInsert({ shape: p.shape, oxidation: p.oxidation, cols: p.cols, rows: p.rows })
                }
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
