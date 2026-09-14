/**
 * Major cages / polycycles useful with Structure Perspective (3D Clean Up).
 * SMILES templates go through the worker; C60 uses a precomputed molblock + 3D pose.
 */
import { C60_FULLERENE_MOLBLOCK } from './c60Molblock';
import { C60_COORDS_3D, type Coord3 } from './c60Coords3d';

export type Structure3DTemplate = {
  id: string;
  label: string;
  name: string;
  /** SMILES for 2D layout via engine worker (omit when molblock is set). */
  smiles?: string;
  /** Precomputed molblock for heavy cages (e.g. C60). */
  molblock?: string;
  /**
   * Optional unit-sphere (or similar) 3D coords in molblock atom order.
   * Applied as Structure Perspective pose on place (skips organic UFF Clean Up).
   */
  coords3D?: readonly Coord3[];
  /** Hint shown in the library card. */
  hint?: string;
};

export const STRUCTURE_3D_TEMPLATES: readonly Structure3DTemplate[] = [
  {
    id: 'cubane',
    label: 'Cubane',
    name: 'Cubane',
    smiles: 'C12C3C4C1C5C2C3C45',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'adamantane',
    label: 'Adamantane',
    name: 'Adamantane',
    smiles: 'C1C2CC3CC1CC(C2)C3',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'norbornane',
    label: 'Norbornane',
    name: 'Norbornane',
    smiles: 'C1CC2CCC1C2',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'norbornene',
    label: 'Norbornene',
    name: 'Norbornene',
    smiles: 'C1CC2C=CC1C2',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'prismane',
    label: 'Prismane',
    name: 'Prismane',
    smiles: 'C12C3C1C4C2C34',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'barrelene',
    label: 'Barrelene',
    name: 'Barrelene',
    smiles: 'C1=CC2C=CC1C=C2',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'triptycene',
    label: 'Triptycene',
    name: 'Triptycene',
    smiles: 'c1ccc2c(c1)C3c4ccccc4C2c5ccccc35',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'dodecahedrane',
    label: 'Dodecahedrane',
    name: 'Dodecahedrane',
    smiles: 'C1C2C3C4C5C1C6C7C2C8C3C9C4C%10C5C6C%11C7C8C9C%10%11',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'twistane',
    label: 'Twistane',
    name: 'Twistane',
    smiles: 'C1CC2CCC3C2CCC3C1',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'bullvalene',
    label: 'Bullvalene',
    name: 'Bullvalene',
    smiles: 'C1=CC2C=CC3C=CC1C23',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'bicyclo222',
    label: 'Bicyclo[2.2.2]',
    name: 'Bicyclo[2.2.2]octane',
    smiles: 'C1CC2CCC1CC2',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'quadricyclane',
    label: 'Quadricyclane',
    name: 'Quadricyclane',
    smiles: 'C1C2C3C2C4C1C3C4',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'fenestrane',
    label: '[4.4.4.4]Fenestrane',
    name: '[4.4.4.4]Fenestrane',
    smiles: 'C12CCC3C1CCC3C2',
    hint: 'Place, then 3D Clean Up',
  },
  {
    id: 'pagodane',
    label: 'Pagodane',
    name: 'Pagodane (core)',
    smiles: 'C1C2C3C4C1C5C2C3C45',
    hint: 'Simplified core — refine after 3D Clean Up',
  },
  {
    id: 'c60',
    label: 'C₆₀',
    name: 'Buckminsterfullerene',
    molblock: C60_FULLERENE_MOLBLOCK,
    coords3D: C60_COORDS_3D,
    hint: 'C₆₀ special case — spherical pose on place; 3D Clean Up uses cage layout (not UFF)',
  },
  {
    id: 'naphthalene',
    label: 'Naphthalene',
    name: 'Naphthalene',
    smiles: 'c1ccc2ccccc2c1',
  },
  {
    id: 'anthracene',
    label: 'Anthracene',
    name: 'Anthracene',
    smiles: 'c1ccc2cc3ccccc3cc2c1',
  },
  {
    id: 'phenanthrene',
    label: 'Phenanthrene',
    name: 'Phenanthrene',
    smiles: 'c1ccc2c(c1)ccc3ccccc32',
  },
  {
    id: 'pyrene',
    label: 'Pyrene',
    name: 'Pyrene',
    smiles: 'c1cc2ccc3ccc4ccc1c1c2c3c41',
  },
  {
    id: 'corannulene',
    label: 'Corannulene',
    name: 'Corannulene',
    smiles: 'c1cc2ccc3ccc4ccc5ccc1c1c2c3c4c51',
    hint: 'Bowl — place, then 3D Clean Up',
  },
] as const;

export const STRUCTURE_3D_BY_ID: ReadonlyMap<string, Structure3DTemplate> = new Map(
  STRUCTURE_3D_TEMPLATES.map(t => [t.id, t]),
);
