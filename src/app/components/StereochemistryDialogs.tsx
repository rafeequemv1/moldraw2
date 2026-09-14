/**
 * Container that renders any open stereochemistry overlay (Newman, Fischer,
 * chair/boat, E/Z analyzer). Each one is mutually exclusive in the UI but
 * mounting them through this single host keeps `App.tsx` readable.
 */
import {
  ChairBoatTool,
  EZAnalyzerTool,
  FischerProjectionTool,
  NewmanProjectionTool,
} from '../../features/stereochemistry';
import type { Molecule } from '@moldraw/domain';

export interface StereochemistryDialogsProps {
  molecule: Molecule;
  cipStereoTags: unknown;
  molblock3D: string;
  atomIndexTo2DId: Record<number, string>;

  newmanBondId: string | null;
  onCloseNewman: () => void;

  fischerChainAtomIds: string[] | null;
  onCloseFischer: () => void;

  chairBoatRingAtomIds: string[] | null;
  onCloseChairBoat: () => void;

  ezAnalyzerBondId: string | null;
  onCloseEZ: () => void;
}

export function StereochemistryDialogs(props: StereochemistryDialogsProps) {
  const {
    molecule,
    cipStereoTags,
    molblock3D,
    atomIndexTo2DId,
    newmanBondId,
    onCloseNewman,
    fischerChainAtomIds,
    onCloseFischer,
    chairBoatRingAtomIds,
    onCloseChairBoat,
    ezAnalyzerBondId,
    onCloseEZ,
  } = props;

  return (
    <>
      {newmanBondId ? (
        <NewmanProjectionTool
          molecule={molecule}
          bondId={newmanBondId}
          bondIndex={molecule.bonds.findIndex(b => b.id === newmanBondId)}
          cipStereoTags={cipStereoTags}
          molblock3D={molblock3D}
          atomIndexTo2DId={atomIndexTo2DId}
          onClose={onCloseNewman}
        />
      ) : null}
      {fischerChainAtomIds ? (
        <FischerProjectionTool
          molecule={molecule}
          chainAtomIds={fischerChainAtomIds}
          onClose={onCloseFischer}
        />
      ) : null}
      {chairBoatRingAtomIds ? (
        <ChairBoatTool
          molecule={molecule}
          ringAtomIds={chairBoatRingAtomIds}
          onClose={onCloseChairBoat}
        />
      ) : null}
      {ezAnalyzerBondId ? (
        <EZAnalyzerTool
          molecule={molecule}
          bondId={ezAnalyzerBondId}
          onClose={onCloseEZ}
        />
      ) : null}
    </>
  );
}
