/**
 * Floating info card that summarises the currently selected fragment.
 */
import React, { useCallback, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import '../../styles/info-panel.css';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useChromeOverlay } from '../chromeDismiss';

export interface InfoPanelData {
  empirical: { order: string[]; counts: Record<string, number> };
  mw: number;
  smiles: string;
  inchi?: string;
  iupacName?: string;
  smilesLoading: boolean;
  inchiLoading?: boolean;
  iupacLoading: boolean;
  copied: boolean;
  /** Indigo structure-check issues for the selection (or whole mol). */
  checkIssues?: Array<{ type: string; message: string }>;
  /** Formal charge sum for the selection (native). */
  charge?: number;
  /** Indigo calculate + drug-like props (second opinion next to native formula/MW). */
  indigo?: {
    loading?: boolean;
    formula?: string | null;
    mw?: number | null;
    exactMass?: number | null;
    massComposition?: string | null;
    logP?: number | null;
    pKa?: number | null;
    molarRefractivity?: number | null;
  };
}

export interface PubChemImportContext {
  atomIds: string[];
  compoundName: string;
  iupacName?: string;
}

export interface MoleculeInfoPanelProps {
  data: InfoPanelData;
  pubchemImport: PubChemImportContext | null;
  selectionMatchesPubchemImport: boolean;
  onClose: () => void;
  onCopyText: (text: string) => void;
  /** Phone/tablet: open as a bottom sheet instead of a floating card. */
  asSheet?: boolean;
}

function formulaPlain(empirical: InfoPanelData['empirical']): string {
  if (empirical.order.length === 0) return '';
  return empirical.order
    .map(el => `${el}${empirical.counts[el] > 1 ? empirical.counts[el] : ''}`)
    .join('');
}

function CopyIconButton({
  text,
  label,
  onCopy,
}: {
  text: string;
  label: string;
  onCopy: (text: string) => void;
}) {
  const [ok, setOk] = useState(false);
  const handle = useCallback(() => {
    if (!text) return;
    onCopy(text);
    setOk(true);
    window.setTimeout(() => setOk(false), 1200);
  }, [text, onCopy]);

  if (!text) return null;
  return (
    <button
      type="button"
      className={`molecule-info-panel__icon-copy${ok ? ' molecule-info-panel__icon-copy--ok' : ''}`}
      onClick={handle}
      title={ok ? 'Copied' : `Copy ${label}`}
      aria-label={ok ? 'Copied' : `Copy ${label}`}
    >
      {ok ? <Check size={12} strokeWidth={2.2} /> : <Copy size={12} strokeWidth={1.8} />}
    </button>
  );
}

function ValueRow({
  label,
  display,
  copyText,
  onCopy,
  mono,
}: {
  label: string;
  display: React.ReactNode;
  copyText: string;
  onCopy: (text: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="molecule-info-panel__row">
      <span className="molecule-info-panel__row-label">{label}</span>
      <span className="molecule-info-panel__row-value-wrap">
        <span
          className={`molecule-info-panel__row-value${mono ? ' molecule-info-panel__value--mono' : ''}`}
        >
          {display}
        </span>
        <CopyIconButton text={copyText} label={label} onCopy={onCopy} />
      </span>
    </div>
  );
}

export function MoleculeInfoPanel({
  data,
  pubchemImport,
  selectionMatchesPubchemImport,
  onClose,
  onCopyText,
  asSheet = false,
}: MoleculeInfoPanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  useChromeOverlay(!asSheet, onClose, 'dock');
  useChromeOverlay(moreOpen, () => setMoreOpen(false));

  const displayName =
    selectionMatchesPubchemImport && pubchemImport
      ? pubchemImport.compoundName
      : data.iupacName
        ? data.iupacName.split(/[;,]/)[0].trim()
        : '—';

  const formulaText = formulaPlain(data.empirical);
  const formula =
    data.empirical.order.length === 0
      ? '—'
      : data.empirical.order.map(el => (
          <React.Fragment key={el}>
            {el}
            {data.empirical.counts[el] > 1 ? (
              <sub style={{ fontSize: '0.72em', lineHeight: 0, verticalAlign: 'baseline' }}>
                {data.empirical.counts[el]}
              </sub>
            ) : null}
          </React.Fragment>
        ));

  const massText = data.mw ? `${data.mw.toFixed(2)} g/mol` : '';
  const chargeText =
    data.charge != null && data.charge !== 0
      ? data.charge > 0
        ? `+${data.charge}`
        : String(data.charge)
      : '';

  const iupacText =
    selectionMatchesPubchemImport && pubchemImport?.iupacName
      ? pubchemImport.iupacName
      : data.iupacName && !selectionMatchesPubchemImport
        ? data.iupacName
        : '';

  const body = (
      <div className="molecule-info-panel__body">
        <div className="molecule-info-panel__name-row">
          <span className="molecule-info-panel__name">{displayName}</span>
          {displayName !== '—' ? (
            <CopyIconButton text={displayName} label="name" onCopy={onCopyText} />
          ) : null}
        </div>

        <ValueRow label="Formula" display={formula} copyText={formulaText} onCopy={onCopyText} />
        <ValueRow
          label="MW"
          display={massText || '—'}
          copyText={massText}
          onCopy={onCopyText}
        />
        {chargeText ? (
          <ValueRow label="Charge" display={chargeText} copyText={chargeText} onCopy={onCopyText} />
        ) : null}

        {data.checkIssues && data.checkIssues.length > 0 ? (
          <div className="molecule-info-panel__section">
            <span className="molecule-info-panel__label">Structure check</span>
            <ul className="molecule-info-panel__check-list">
              {data.checkIssues.map((issue, i) => (
                <li key={`${issue.type}-${i}`}>
                  <strong>{issue.type}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="molecule-info-panel__accordion">
          <button
            type="button"
            className="molecule-info-panel__accordion-trigger"
            onClick={() => setMoreOpen(v => !v)}
            aria-expanded={moreOpen}
          >
            {moreOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            More details
          </button>
          {moreOpen ? (
            <div className="molecule-info-panel__accordion-body">
              {data.iupacLoading ? (
                <div className="molecule-info-panel__row">
                  <span className="molecule-info-panel__row-label">IUPAC</span>
                  <span className="molecule-info-panel__muted">Loading…</span>
                </div>
              ) : iupacText ? (
                <ValueRow
                  label="IUPAC"
                  display={iupacText}
                  copyText={iupacText}
                  onCopy={onCopyText}
                />
              ) : null}

              <div className="molecule-info-panel__section">
                <div className="molecule-info-panel__label-row">
                  <span className="molecule-info-panel__label">SMILES</span>
                  {!data.smilesLoading && data.smiles ? (
                    <CopyIconButton text={data.smiles} label="SMILES" onCopy={onCopyText} />
                  ) : null}
                </div>
                {data.smilesLoading ? (
                  <span className="molecule-info-panel__muted">Loading…</span>
                ) : (
                  <span className="molecule-info-panel__value molecule-info-panel__value--mono molecule-info-panel__value--block">
                    {data.smiles || '—'}
                  </span>
                )}
              </div>

              <div className="molecule-info-panel__section">
                <div className="molecule-info-panel__label-row">
                  <span className="molecule-info-panel__label">InChI</span>
                  {!data.inchiLoading && data.inchi ? (
                    <CopyIconButton text={data.inchi} label="InChI" onCopy={onCopyText} />
                  ) : null}
                </div>
                {data.inchiLoading ? (
                  <span className="molecule-info-panel__muted">Loading…</span>
                ) : (
                  <span className="molecule-info-panel__value molecule-info-panel__value--mono molecule-info-panel__value--block">
                    {data.inchi || '—'}
                  </span>
                )}
              </div>

              {data.indigo ? (
                <div className="molecule-info-panel__section">
                  <span className="molecule-info-panel__label">Indigo (offline)</span>
                  {data.indigo.loading ? (
                    <span className="molecule-info-panel__muted">Calculating…</span>
                  ) : (
                    <div className="molecule-info-panel__indigo-grid">
                      {data.indigo.formula ? (
                        <ValueRow
                          label="Formula"
                          display={data.indigo.formula}
                          copyText={data.indigo.formula}
                          onCopy={onCopyText}
                          mono
                        />
                      ) : null}
                      {data.indigo.mw != null ? (
                        <ValueRow
                          label="MW"
                          display={data.indigo.mw.toFixed(4)}
                          copyText={data.indigo.mw.toFixed(4)}
                          onCopy={onCopyText}
                        />
                      ) : null}
                      {data.indigo.exactMass != null ? (
                        <ValueRow
                          label="Exact mass"
                          display={data.indigo.exactMass.toFixed(4)}
                          copyText={data.indigo.exactMass.toFixed(4)}
                          onCopy={onCopyText}
                        />
                      ) : null}
                      {data.indigo.logP != null ? (
                        <ValueRow
                          label="logP"
                          display={data.indigo.logP.toFixed(3)}
                          copyText={data.indigo.logP.toFixed(3)}
                          onCopy={onCopyText}
                        />
                      ) : null}
                      {data.indigo.pKa != null ? (
                        <ValueRow
                          label="pKa"
                          display={data.indigo.pKa.toFixed(3)}
                          copyText={data.indigo.pKa.toFixed(3)}
                          onCopy={onCopyText}
                        />
                      ) : null}
                      {data.indigo.molarRefractivity != null ? (
                        <ValueRow
                          label="MR"
                          display={data.indigo.molarRefractivity.toFixed(3)}
                          copyText={data.indigo.molarRefractivity.toFixed(3)}
                          onCopy={onCopyText}
                        />
                      ) : null}
                      {data.indigo.massComposition ? (
                        <ValueRow
                          label="Composition"
                          display={data.indigo.massComposition}
                          copyText={data.indigo.massComposition}
                          onCopy={onCopyText}
                          mono
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
  );

  if (asSheet) {
    return (
      <MobileBottomSheet
        open
        onClose={onClose}
        title="Molecule details"
        size="auto"
        className="mobile-sheet--info"
      >
        <div className="molecule-info-panel molecule-info-panel--sheet">{body}</div>
      </MobileBottomSheet>
    );
  }

  return (
    <aside className="molecule-info-panel" aria-label="Molecule details">
      <header className="molecule-info-panel__header">
        <span className="molecule-info-panel__title">Molecule details</span>
        <button type="button" className="molecule-info-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {body}
    </aside>
  );
}
