/**
 * Builds the action ring for `TouchQuickMenu` from the long-press target
 * (atom / bond / selection / empty canvas) using the same handlers the full
 * context menu uses. Kept out of the component file so Fast Refresh sees a
 * components-only module there.
 */
import {
  Atom,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  FlaskConical,
  Group,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RefreshCw,
  Scan,
  Triangle,
  Type,
  Undo2,
  Ungroup,
  Wand2,
} from 'lucide-react';
import type { Molecule } from '@moldraw/domain';
import { selectionIsGrouped } from '@moldraw/core';
import type { CanvasContextMenuState } from './CanvasContextMenu';
import type { TouchQuickMenuItem } from './TouchQuickMenu';

export interface TouchQuickMenuActions {
  copySmiles: () => void;
  paste: () => void;
  duplicate: () => void;
  /** Delete the current selection (atoms, bonds, objects). */
  deleteSelection: () => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  editAtomLabel: (atomId: string) => void;
  updateAtomCharge: (atomId: string, delta: number) => void;
  addExplicitHydrogen: () => void;
  selectConnectedFragment: (atomId: string) => void;
  invertStereoAtAtom: (atomId: string) => void;
  deleteAtom: (atomId: string) => void;

  cycleBondOrder: (bondId: string) => void;
  cycleBondStereo: (bondId: string) => void;
  deleteBond: (bondId: string) => void;
  launchNewman: (bondId: string) => void;
  launchEZ: (bondId: string) => void;

  groupSelection: () => void;
  ungroupSelection: () => void;
}

export interface TouchQuickMenuModel {
  title: string;
  items: TouchQuickMenuItem[];
}

const ICON = 20;

/**
 * Decide which quick actions fit the long-press target. Returns `null` for
 * targets that are better served by the full menu straight away (text,
 * arrows, glassware, images, ink, SRU brackets).
 */
export function buildTouchQuickMenuItems(
  menu: CanvasContextMenuState,
  molecule: Molecule,
  selectedAtomIds: string[],
  act: TouchQuickMenuActions,
): TouchQuickMenuModel | null {
  if (
    menu.canvasTextId ||
    menu.reactionArrowId ||
    menu.strokeId ||
    menu.canvasShapeId ||
    menu.canvasImageId ||
    menu.sruBracketId
  ) {
    return null;
  }

  const atom = menu.atomId ? molecule.atoms.find(a => a.id === menu.atomId) : undefined;
  const bond = menu.bondId ? molecule.bonds.find(b => b.id === menu.bondId) : undefined;
  const hasSelection = selectedAtomIds.length > 0;

  if (atom) {
    const atomInSelection = hasSelection && selectedAtomIds.includes(atom.id);
    const stereoInvertible = molecule.bonds.some(
      b =>
        (b.fromAtomId === atom.id || b.toAtomId === atom.id) &&
        (b.stereo === 'wedge' || b.stereo === 'dash'),
    );
    const items: TouchQuickMenuItem[] = [
      { id: 'label', label: 'Label', icon: <Type size={ICON} />, onSelect: () => act.editAtomLabel(atom.id) },
      { id: 'charge+', label: '+ charge', icon: <Plus size={ICON} />, onSelect: () => act.updateAtomCharge(atom.id, 1) },
      { id: 'addH', label: 'Add H', icon: <Atom size={ICON} />, onSelect: act.addExplicitHydrogen },
      {
        id: 'select',
        label: 'Molecule',
        icon: <Scan size={ICON} />,
        onSelect: () => act.selectConnectedFragment(atom.id),
      },
      {
        id: 'delete',
        label: atomInSelection && selectedAtomIds.length > 1 ? 'Delete sel.' : 'Delete',
        icon: <Eraser size={ICON} />,
        danger: true,
        onSelect: () =>
          atomInSelection && selectedAtomIds.length > 1 ? act.deleteSelection() : act.deleteAtom(atom.id),
      },
      { id: 'duplicate', label: 'Duplicate', icon: <CopyPlus size={ICON} />, onSelect: act.duplicate },
      { id: 'charge-', label: '− charge', icon: <Minus size={ICON} />, onSelect: () => act.updateAtomCharge(atom.id, -1) },
      stereoInvertible
        ? { id: 'stereo', label: 'Invert', icon: <Triangle size={ICON} />, onSelect: () => act.invertStereoAtAtom(atom.id) }
        : { id: 'copy', label: 'Copy', icon: <Copy size={ICON} />, onSelect: act.copySmiles },
    ];
    const label = atom.alias?.trim() || atom.element;
    return { title: `Atom ${label}${atom.isotope ? `-${atom.isotope}` : ''}`, items };
  }

  if (bond) {
    const orderLabel = bond.order === 1 ? 'Double' : bond.order === 2 ? 'Triple' : 'Single';
    const stereoLabel = bond.stereo === 'wedge' ? 'Dash' : bond.stereo === 'dash' ? 'Plain' : 'Wedge';
    const items: TouchQuickMenuItem[] = [
      { id: 'order', label: orderLabel, icon: <RefreshCw size={ICON} />, onSelect: () => act.cycleBondOrder(bond.id) },
      { id: 'stereo', label: stereoLabel, icon: <Triangle size={ICON} />, onSelect: () => act.cycleBondStereo(bond.id) },
      {
        id: 'select',
        label: 'Molecule',
        icon: <Scan size={ICON} />,
        onSelect: () => act.selectConnectedFragment(bond.fromAtomId),
      },
      { id: 'duplicate', label: 'Duplicate', icon: <CopyPlus size={ICON} />, onSelect: act.duplicate },
      { id: 'delete', label: 'Delete', icon: <Eraser size={ICON} />, danger: true, onSelect: () => act.deleteBond(bond.id) },
      { id: 'newman', label: 'Newman', icon: <FlaskConical size={ICON} />, onSelect: () => act.launchNewman(bond.id) },
      bond.order === 2
        ? { id: 'ez', label: 'E / Z', icon: <Wand2 size={ICON} />, onSelect: () => act.launchEZ(bond.id) }
        : { id: 'copy', label: 'Copy', icon: <Copy size={ICON} />, onSelect: act.copySmiles },
    ];
    return { title: 'Bond', items };
  }

  if (hasSelection) {
    const grouped = selectionIsGrouped(molecule, selectedAtomIds);
    const items: TouchQuickMenuItem[] = [
      { id: 'copy', label: 'Copy', icon: <Copy size={ICON} />, onSelect: act.copySmiles },
      { id: 'duplicate', label: 'Duplicate', icon: <CopyPlus size={ICON} />, onSelect: act.duplicate },
      { id: 'addH', label: 'Add H', icon: <Atom size={ICON} />, onSelect: act.addExplicitHydrogen },
      grouped
        ? { id: 'ungroup', label: 'Ungroup', icon: <Ungroup size={ICON} />, onSelect: act.ungroupSelection }
        : { id: 'group', label: 'Group', icon: <Group size={ICON} />, onSelect: act.groupSelection },
      { id: 'delete', label: 'Delete', icon: <Eraser size={ICON} />, danger: true, onSelect: act.deleteSelection },
      { id: 'paste', label: 'Paste', icon: <ClipboardPaste size={ICON} />, onSelect: act.paste },
      { id: 'selectAll', label: 'Select all', icon: <MousePointer2 size={ICON} />, onSelect: act.selectAll },
    ];
    return {
      title: `${selectedAtomIds.length} atom${selectedAtomIds.length === 1 ? '' : 's'} selected`,
      items,
    };
  }

  const hasAtoms = molecule.atoms.length > 0;
  const items: TouchQuickMenuItem[] = [
    { id: 'paste', label: 'Paste', icon: <ClipboardPaste size={ICON} />, onSelect: act.paste },
    { id: 'undo', label: 'Undo', icon: <Undo2 size={ICON} />, onSelect: act.undo, disabled: !act.canUndo },
    { id: 'copy', label: 'Copy', icon: <Copy size={ICON} />, onSelect: act.copySmiles, disabled: !hasAtoms },
    { id: 'selectAll', label: 'Select all', icon: <MousePointer2 size={ICON} />, onSelect: act.selectAll, disabled: !hasAtoms },
    { id: 'redo', label: 'Redo', icon: <Redo2 size={ICON} />, onSelect: act.redo, disabled: !act.canRedo },
  ];
  return { title: 'Canvas', items };
}
