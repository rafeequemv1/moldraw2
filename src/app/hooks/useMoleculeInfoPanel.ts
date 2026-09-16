/**
 * Molecule info panel state — connectivity key, open-while-selected, worker
 * refresh posts, PubChem selection match, and 3D viewer title.
 * Extracted from App.tsx (hooks-first path).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import { getMolecularData } from '@moldraw/core/molecule/properties';
import { moleculeToMolblock } from '@moldraw/core/io/molblock';
import type { StructureCheckResult } from '@moldraw/engine-2d';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';
import type { InfoPanelData, PubChemImportContext } from '../components';

const INFO_PANEL_OPEN_KEY = 'moldraw.infoPanel.open';

function readInfoPanelOpenPref(): boolean {
  try {
    const stored = localStorage.getItem(INFO_PANEL_OPEN_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    /* ignore */
  }
  return false;
}

function writeInfoPanelOpenPref(open: boolean): void {
  try {
    localStorage.setItem(INFO_PANEL_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export interface UseMoleculeInfoPanelOptions {
  molecule: Molecule;
  selectedAtomIds: string[];
  structureCheck: StructureCheckResult | null;
  workerRef: React.MutableRefObject<MoleculeWorkerClient | null>;
  pubchemImport: PubChemImportContext | null;
}

export function useMoleculeInfoPanel({
  molecule,
  selectedAtomIds,
  structureCheck,
  workerRef,
  pubchemImport,
}: UseMoleculeInfoPanelOptions) {
  const [showInfoPanel, setShowInfoPanel] = useState(readInfoPanelOpenPref);
  /**
   * After the user closes the panel, stay closed until they open it again.
   * Starts dismissed so we do not auto-open on the first selection; once opened,
   * the panel stays visible (including after canvas deselect) until Close.
   * Restored from localStorage when the user left the panel open.
   */
  const [infoPanelDismissed, setInfoPanelDismissed] = useState(() => !readInfoPanelOpenPref());
  const [infoData, setInfoData] = useState<InfoPanelData | null>(null);

  /** Connectivity of the current selection (or whole molecule) — refresh when chemistry changes. */
  const selectedInfoConnectivityKey = useMemo(() => {
    const idSet = selectedAtomIds.length > 0 ? new Set(selectedAtomIds) : null;
    const atoms = idSet ? molecule.atoms.filter(a => idSet.has(a.id)) : molecule.atoms;
    const bonds = idSet
      ? molecule.bonds.filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId))
      : molecule.bonds;
    const aKey = atoms
      .map(a => `${a.id}:${a.element}:${a.charge ?? 0}`)
      .sort()
      .join('|');
    const bKey = bonds
      .map(b => `${b.fromAtomId}-${b.toAtomId}-${b.order}`)
      .sort()
      .join('|');
    return `${idSet ? 'sel' : 'mol'}#${aKey}#${bKey}`;
  }, [molecule.atoms, molecule.bonds, selectedAtomIds]);

  // Re-show when selection returns (unless user dismissed). Do not clear on deselect.
  useEffect(() => {
    if (selectedAtomIds.length === 0) return;
    if (!infoPanelDismissed) {
      setShowInfoPanel(true);
    }
  }, [selectedAtomIds.length, infoPanelDismissed]);

  useEffect(() => {
    if (!showInfoPanel) return;
    const idSet = selectedAtomIds.length > 0 ? new Set(selectedAtomIds) : null;
    const atoms = idSet ? molecule.atoms.filter(a => idSet.has(a.id)) : molecule.atoms;
    const bonds = idSet
      ? molecule.bonds.filter(b => idSet.has(b.fromAtomId) && idSet.has(b.toAtomId))
      : molecule.bonds;
    if (atoms.length === 0) {
      setInfoData({
        empirical: { order: [], counts: {} },
        mw: 0,
        charge: 0,
        smiles: '',
        smilesLoading: false,
        inchiLoading: false,
        iupacLoading: false,
        copied: false,
      });
      return;
    }
    const subMol: Molecule = { atoms, bonds };
    const { empirical, mw } = getMolecularData(subMol);
    const charge = atoms.reduce((s, a) => s + (a.charge || 0), 0);
    setInfoData({
      empirical,
      mw,
      charge,
      smiles: '',
      smilesLoading: true,
      inchiLoading: true,
      iupacLoading: true,
      copied: false,
      checkIssues: structureCheck && !structureCheck.ok
        ? structureCheck.issues.map(i => ({ type: i.type, message: i.message }))
        : undefined,
      indigo: { loading: true },
    });
    const mb = moleculeToMolblock(subMol);
    workerRef.current?.post({
      type: 'GET_SMILES',
      payload: { molBlock: mb },
      id: 'info_smiles',
    });
    workerRef.current?.post({
      type: 'CONVERT',
      payload: { input: mb, outputFormat: 'inchi' },
      id: 'info_inchi',
    });
    workerRef.current?.post({
      type: 'CALCULATE_PROPERTIES',
      payload: { molBlock: mb },
      id: 'info_indigo',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- molecule read from latest render when connectivity key changes
  }, [showInfoPanel, selectedInfoConnectivityKey, selectedAtomIds, structureCheck]);

  const openInfoPanel = useCallback(() => {
    setInfoPanelDismissed(false);
    setShowInfoPanel(true);
    writeInfoPanelOpenPref(true);
  }, []);

  const closeInfoPanel = useCallback(() => {
    setInfoPanelDismissed(true);
    setShowInfoPanel(false);
    writeInfoPanelOpenPref(false);
  }, []);

  const toggleInfoPanel = useCallback(() => {
    if (showInfoPanel) {
      closeInfoPanel();
      return;
    }
    openInfoPanel();
  }, [showInfoPanel, closeInfoPanel, openInfoPanel]);

  const selectionMatchesPubchemImport =
    !!pubchemImport &&
    selectedAtomIds.length > 0 &&
    selectedAtomIds.length === pubchemImport.atomIds.length &&
    [...selectedAtomIds].sort().join('|') === [...pubchemImport.atomIds].sort().join('|');

  const viewer3DMoleculeTitle = useMemo(() => {
    if (selectedAtomIds.length === 0) return '';
    if (selectionMatchesPubchemImport && pubchemImport) {
      return pubchemImport.compoundName;
    }
    if (infoData?.iupacName) {
      return infoData.iupacName.split(/[;,]/)[0].trim();
    }
    if (infoData?.smiles) {
      const s = infoData.smiles;
      return s.length > 40 ? `${s.slice(0, 37)}…` : s;
    }
    return 'Selection';
  }, [
    selectedAtomIds.length,
    selectionMatchesPubchemImport,
    pubchemImport,
    infoData?.iupacName,
    infoData?.smiles,
  ]);

  /** Drop-in setter that keeps dismiss/reopen semantics for legacy callers. */
  const setShowInfoPanelCompat = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(showInfoPanel) : v;
    if (next) {
      setInfoPanelDismissed(false);
      setShowInfoPanel(true);
      writeInfoPanelOpenPref(true);
    } else {
      setInfoPanelDismissed(true);
      setShowInfoPanel(false);
      writeInfoPanelOpenPref(false);
    }
  }, [showInfoPanel]);

  return {
    showInfoPanel,
    setShowInfoPanel: setShowInfoPanelCompat,
    openInfoPanel,
    closeInfoPanel,
    toggleInfoPanel,
    infoData,
    setInfoData,
    selectedInfoConnectivityKey,
    selectionMatchesPubchemImport,
    viewer3DMoleculeTitle,
  };
}
