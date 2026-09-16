import { createContext, useContext } from 'react';
import type { AppSettings, GeneralSettings } from './types';
import { MoleculePreviewCanvas } from './MoleculePreviewCanvas';
import { createAspirinMolecule } from './aspirinPreviewMolecule';
import {
  CHIRAL_CIP_ATOM_ID,
  createAceticAcidMolecule,
  createAcetoneMolecule,
  createAngleSnapMolecule,
  createChiralMolecule,
  createEthanolamineMolecule,
  createEthanolMolecule,
} from './examplePreviewMolecules';

export type SettingExampleKind =
  | 'implicitH'
  | 'atomColor'
  | 'bondColor'
  | 'condensed'
  | 'cip'
  | 'showGrid'
  | 'snapToGrid'
  | 'structureTheme'
  | 'fontFamily'
  | 'boldLabels'
  | 'fontSize'
  | 'subFontSize'
  | 'bondLength'
  | 'bondSpacing'
  | 'bondThickness'
  | 'stereoWedge'
  | 'hashSpacing'
  | 'bondAngleSnap';

export const ShowSettingsExamplesContext = createContext(false);
export const SettingsSnapshotContext = createContext<AppSettings | null>(null);

const PREVIEW_H = 80;

const CIP_ATOM_LABELS: ReadonlyMap<string, string> = new Map([[CHIRAL_CIP_ATOM_ID, 'R']]);

function withGeneral(settings: AppSettings, patch: Partial<GeneralSettings>): AppSettings {
  return { ...settings, general: { ...settings.general, ...patch } };
}

function SinglePreview({ children }: { children: React.ReactNode }) {
  return <div className="app-settings-example">{children}</div>;
}

function SettingExamplePreview({ kind, settings }: { kind: SettingExampleKind; settings: AppSettings }) {
  const g = settings.general;

  if (kind === 'implicitH') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            condensedGroupLabels: false,
            showImplicitHydrogens: g.showImplicitHydrogens === true,
          })}
          molecule={createEthanolMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'atomColor') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            showImplicitHydrogens: false,
            condensedGroupLabels: false,
            applyAtomColorsToBonds: false,
            colorAtomLabels: g.colorAtomLabels === true,
          })}
          molecule={createEthanolamineMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'bondColor') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            showImplicitHydrogens: false,
            condensedGroupLabels: false,
            colorAtomLabels: true,
            applyAtomColorsToBonds: g.applyAtomColorsToBonds === true,
          })}
          molecule={createEthanolamineMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'condensed') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            showImplicitHydrogens: false,
            condensedGroupLabels: g.condensedGroupLabels === true,
          })}
          molecule={createAceticAcidMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'cip') {
    const on = g.showCipLabels === true;
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            condensedGroupLabels: false,
            showImplicitHydrogens: false,
            showCipLabels: on,
          })}
          molecule={createChiralMolecule()}
          height={PREVIEW_H}
          cipAtomLabels={on ? CIP_ATOM_LABELS : null}
        />
      </SinglePreview>
    );
  }

  if (kind === 'showGrid') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { showImplicitHydrogens: false, condensedGroupLabels: false })}
          molecule={createEthanolMolecule()}
          height={PREVIEW_H}
          showGrid={g.showGrid === true}
        />
      </SinglePreview>
    );
  }

  if (kind === 'snapToGrid') {
    const on = g.snapToGrid === true;
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { showImplicitHydrogens: false, condensedGroupLabels: false })}
          molecule={createEthanolMolecule()}
          height={PREVIEW_H}
          showGrid
          gridAlign={on ? 'snapped' : 'free'}
        />
      </SinglePreview>
    );
  }

  if (kind === 'boldLabels') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, {
            showImplicitHydrogens: false,
            condensedGroupLabels: false,
            boldAtomLabels: g.boldAtomLabels === true,
          })}
          molecule={createEthanolamineMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'structureTheme' || kind === 'fontFamily' || kind === 'fontSize') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas settings={settings} molecule={createAspirinMolecule()} height={PREVIEW_H} />
      </SinglePreview>
    );
  }

  if (kind === 'subFontSize') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { condensedGroupLabels: true, showImplicitHydrogens: false })}
          molecule={createAceticAcidMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'bondLength' || kind === 'bondThickness') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { showImplicitHydrogens: false, condensedGroupLabels: false })}
          molecule={createEthanolMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'bondSpacing') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { showImplicitHydrogens: false, condensedGroupLabels: false })}
          molecule={createAcetoneMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'stereoWedge' || kind === 'hashSpacing') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { condensedGroupLabels: false, showImplicitHydrogens: false })}
          molecule={createChiralMolecule()}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  if (kind === 'bondAngleSnap') {
    return (
      <SinglePreview>
        <MoleculePreviewCanvas
          settings={withGeneral(settings, { showImplicitHydrogens: false, condensedGroupLabels: false })}
          molecule={createAngleSnapMolecule(settings.bonds.bondAngleSnapDeg, settings.bonds.bondLengthPx)}
          height={PREVIEW_H}
        />
      </SinglePreview>
    );
  }

  return null;
}

/** Renders the visual example for a setting when “Show examples” is on. */
export function SettingExampleSlot({ kind }: { kind: SettingExampleKind }) {
  const show = useContext(ShowSettingsExamplesContext);
  const settings = useContext(SettingsSnapshotContext);
  if (!show || !settings) return null;
  return <SettingExamplePreview kind={kind} settings={settings} />;
}
