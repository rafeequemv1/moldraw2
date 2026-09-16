/**
 * @moldraw/core — commands, editor store, I/O, molecule mutations.
 * Public surface for embeds and peer packages (prefer this barrel over deep paths).
 */
export { createMoleculeStore } from './editor/createMoleculeStore';
export type {
  MoleculeEditor,
  MoleculeEditorSnapshot,
  MoleculeHistoryStacks,
  MoleculeSelection,
  CreateMoleculeStoreOptions,
} from './editor/types';
export {
  CMD,
  getCommand,
  listCommands,
  listCommandIds,
  ASYNC_CONTEXT_COMMAND_IDS,
} from './commands/registry';
export type { CommandId, NewIdsExtra } from './commands/registry';
export { runCommand } from './commands/executor';
export {
  formatZodIssues,
  findUnknownReferences,
  describeUnknownReferences,
  LENIENT_REFERENCE_COMMANDS,
} from './commands/validation';
export type {
  FormattedIssue,
  FormattedValidationError,
  UnknownReferences,
} from './commands/validation';
export { moleculesStructurallyEqual } from './editor/createMoleculeStore';
export { commandMeta, COMMAND_META_IDS } from './commands/commandMeta';
export { elementSymbol } from './commands/schemas';
export {
  ringPlacementForAttach,
  ringPlacementForFusion,
  openDirection,
  nextFreePoint,
  contentBounds,
  zigzagChainPoints,
  regularRingRadius,
} from './molecule/ringPlacement';
export type { CommandMeta } from './commands/commandMeta';
export type {
  MoleculeCommand,
  AnyMoleculeCommand,
  CommandResult,
  CommandSuccess,
  CommandFailure,
  CommandVisibility,
} from './commands/types';
export { CommandFailureError } from './commands/types';
export { TRANSACTION_COMMAND_ID, transactionInputSchema } from './commands/transaction';
export type { TransactionExtra } from './commands/transaction';
export {
  createMoleculeWorkerClient,
  createMoleculeWorkerFromUrl,
  type MoleculeWorkerClient,
} from './moleculeWorker/client';
export type { MoleculeWorkerRequest, MoleculeWorkerResponse } from './moleculeWorker/messages';
export type {
  Molecule3dWorkerRequest,
  Molecule3dWorkerResponse,
} from './moleculeWorker/messages3d';
export {
  resolveCanvasPreferences,
  resolveAtomLabelFonts,
  type ResolvedCanvasPreferences,
  type ResolveCanvasPreferencesInput,
} from './canvasPreferences';

/** Mutations / fragments / color (canvas + commands). */
export type { EraseHit } from './molecule/mutations';
export {
  SRU_BRACKET_PAD,
  sruBracketBoxForAtoms,
  pruneSruBrackets,
  syncSruBracketsToAtoms,
  clampChargeMarkOffset,
  CHARGE_MARK_R_MIN_PX,
  CHARGE_MARK_R_MAX_PX,
  CHARGE_MARK_R_DEFAULT_PX,
  MAX_CHARGE_MARK_OFFSET_PX,
} from './molecule/mutations';
export {
  PLACE_FRAGMENT_TOOL_ID,
  type FragmentPlacementSession,
  type FragmentPlacementCommit,
  type FragmentPlacementPreview,
  scaleFragmentToBondLength,
  positionFragmentSnappedToAtom,
  previewFragmentPlacement,
  placeFragmentAtConnectionPoint,
  inferTemplateConnectionAtomId,
  prepareFragmentFromSmilesMol,
  commitFragmentPlacement,
} from './molecule/fragmentPlacement';
export { normalizeHexColor } from './color/selectionColor';
export {
  applySelectionDisplayStyle,
  mergeDocumentAtomOpacity,
  LABEL_FONT_SIZE_PRESETS_PT,
  BOND_THICKNESS_PRESETS_PX,
} from './color/selectionDisplayStyle';
export {
  addExplicitHydrogensToAtoms,
  computeNextExplicitHydrogenAngle,
} from './molecule/addExplicitHydrogen';
export {
  poseFromMolblock3D,
  apply3DPose,
  mergePerspectivePositions,
  clear3DPose,
  flatten3DPose,
  rotate3DPose,
  rotateCofViewOrPose,
  rotateOffset3D,
  setPerspectiveDepthShading,
  setPerspectiveDepthFade,
  setPerspectiveDepthWedges,
  clampDepthFade,
  projectPerspectiveForDisplay,
  hasPerspectivePose,
  displayCoordsMolecule,
  midPerspectiveZ,
  joinAtomsIntoPerspectivePose,
  molblock3DFromPerspectivePose,
  perspectivePoseFingerprint,
  perspectiveZFingerprint,
  perspectivePoseSeedAngstrom,
  alignPositionsToReference,
  kabschRotation,
  type PoseFromMolblockOptions,
} from './molecule/perspective3D';
export { setStructureTheme, type StructureDrawMode } from './molecule/structureTheme';
export {
  isBuckminsterfullereneC60,
  buildC60SpherePose,
} from './molecule/fullereneC60';

export {
  resolveArrowAnchor,
  resolveReactionArrowGeometry,
  quadraticControlAwayFromCentroid,
  snapArrowEndpointToStructure,
  applyElectronFlowEndpointResnap,
  moleculeCentroid,
  buildElectronFlowArrow,
  type ResolvedPoint,
  type BuildElectronFlowArrowOpts,
  type ArrowSnapKind,
  type ArrowEndpointSnap,
  type SnapArrowEndpointOpts,
  lonePairSlotCountForAtom,
} from './molecule/arrowAnchors';
export {
  getLonePairPlacements,
  labelBoxFromExtents,
  resolveLonePairWorldPoint,
  defaultChargeSeatAngle,
  defaultChargeSeatDirection,
  LONE_PAIR_DIST_PX,
  LONE_PAIR_DOT_SEP_PX,
  LONE_PAIR_DOT_R_PX,
  RADICAL_DIST_PX,
  RADICAL_DOT_R_PX,
  type LabelBoxLocal,
  type LonePairPlacement,
  type LonePairPreferSide,
  type Point2,
} from './molecule/lonePairLayout';
export { buildDemoMechanismMolecule } from './molecule/demoMechanism';

/** Geometry helpers used by canvas. */
export { computeAutoExtendAngle } from './geometry/autoExtendAngle';
export { boatRingVertices } from './geometry/boatRing';
export { chairRingVertices } from './geometry/chairRing';

/** Chemistry / I/O shared with engines & viewer. */
export {
  vdwRadius,
  covalentRadius,
  targetBondLengthA,
  type BondOrderForLength,
} from './chemistry/atomicData';
export { formatReagentLineForCanvas } from './chemistry/reagentFormat';
export { normalizeMolBondLines } from './io/normalizeMolBondLines';
export { moleculeToMolblock, parseMolblock } from './io/molblock';
export {
  moleculeCoordsTableText,
  parseMoleculeCoordsTable,
  applyMoleculeCoordsTable,
  setAtomCanvasCoords,
  type MoleculeCoordsTableOptions,
  type ParsedCoordsTableRow,
  type ParseCoordsTableResult,
  type ApplyCoordsTableResult,
  type AtomCanvasCoordUpdate,
  resolveCoordsPasteAtomIds,
  normalizeClipboardText,
  looksLikeCoordsTableText,
} from './io/moleculeCoordsTable';
export { findMolfileCountsLineIndex } from './io/molblockHeader';
export { xyzTextToMolblock } from './io/xyzToMolblock';
export { perceiveBondsFromAtomRows } from './io/perceiveBondsFromCoords';

export { getMolecularData, type MolecularData } from './molecule/properties';
export {
  buildCanvasStateSnapshot,
  countDocumentMolecules,
  type BuildCanvasStateOptions,
  type CanvasStateSnapshot,
  type CanvasStateMolecule,
  type CanvasStateAnnotations,
  type CanvasMoleculeRole,
} from './molecule/canvasState';
export {
  collectionOutlineKey,
  discoverOutlineObjects,
  reconcileObjectOutline,
  resolveOutlineRows,
  type DiscoveredOutlineObject,
  type ResolvedOutlineRow,
} from './molecule/objectOutline';
export {
  ensureFragmentIds,
  fragmentOutlineKey,
  fragmentIdsForAtomIds,
} from './molecule/fragmentIds';
export {
  expandInstanceArrays,
  materializeInstanceArraysForDisplay,
  attachInstanceArray,
  upsertInstanceArray,
  upsertInstanceArraySeeds,
  shouldUseInstanceArray,
  hasInstanceArrays,
  isInstanceAtomId,
  parseInstanceAtomId,
  parseInstanceBondId,
  isValidInstanceAtomId,
  isValidInstanceBondId,
  virtualAtomIdsForArray,
  seedAtomIdsOfInstanceArrays,
  expandAtomIdsToInstanceArrays,
  growDendrimerSeed,
  upsertDendrimerInstanceArray,
  syncDendrimerCoreCenters,
  INSTANCE_ARRAY_THRESHOLD,
} from './molecule/instanceArrays';
export {
  collectAtomsAsObjectCollection,
  collectShapesAsObjectCollection,
  siblingShapeIdsInCollection,
  groupAtomsAsObjectCollection,
  ungroupAtomsFromObjectCollections,
  selectionIsGrouped,
  expandAtomIdsToObjectCollections,
} from './molecule/arrayCollection';
export {
  listCofPresets,
  getCofBuilder,
  generateCofInMolecule,
  cofLatticeForAtomIds,
  cofStackAtomIds,
  cofPreviewMolblock,
  COF_PROGRAMMATIC_PRESETS,
  COF_PACK_MIN,
  COF_PACK_MAX,
  COF_PACK_DEFAULT,
  COF_LAYERS_MIN,
  COF_LAYERS_MAX,
  COF_LAYERS_DEFAULT,
  type CofPresetInfo,
  type GenerateCofOptions,
} from './cofs';
export {
  listDendrimerPresets,
  getDendrimerBuilder,
  generateDendrimerInMolecule,
  dendrimerPreviewMolblock,
  DENDRIMER_PROGRAMMATIC_PRESETS,
  type DendrimerPresetInfo,
  type GenerateDendrimerOptions,
} from './dendrimers';
export {
  listMofPresets,
  getMofBuilder,
  mofPreviewMolblock,
  MOF_PROGRAMMATIC_PRESETS,
} from './mofs';
export {
  listPolymerPresets,
  getPolymerBuilder,
  generatePolymerInMolecule,
  polymerPreviewMolblock,
  POLYMER_PROGRAMMATIC_PRESETS,
  type PolymerPresetInfo,
  type GeneratePolymerOptions,
} from './polymers';
export {
  buildGrapheneSheet,
  generateGrapheneInMolecule,
  GRAPHENE_COLS_MIN,
  GRAPHENE_COLS_MAX,
  GRAPHENE_RINGS_MIN,
  GRAPHENE_RINGS_MAX,
  type GrapheneShape,
  type GrapheneOxidation,
  type GrapheneSheetOptions,
  type GenerateGrapheneOptions,
} from './molecule/grapheneSheet';
export {
  documentFragmentBoxes,
  selectedDocumentFragmentBoxes,
  suggestCircleArrangeRadius,
  type DistributeSelectedFragmentsOptions,
  type FragmentBox,
  type SelectionAlignMode,
  type SelectionDistributeAxis,
} from './align/selectionArrange';
export {
  circularArrayAtoms,
  type CircularArrayOptions,
} from './align/circularArray';
export {
  linearArrayAtoms,
  suggestLinearSpacing,
  type LinearArrayOptions,
} from './align/linearArray';
export {
  dendrimerArrayAtoms,
  suggestDendrimerFolds,
  DENDRIMER_FOLDS_MIN,
  DENDRIMER_FOLDS_MAX,
  type DendrimerArrayOptions,
} from './align/dendrimerArray';
export {
  layoutReactionScheme,
  type LayoutReactionSchemeOpts,
  type ReactionSchemeLayout,
  type SchemeArrowSlot,
  type SchemeMoleculeSlot,
} from './align/reactionSchemeLayout';
export {
  subsetMoleculeByAtomIds,
  partitionAtomsAcrossArrow,
  reactionSmilesSplit,
} from './molecule/partition';
export {
  mergeExplicitHydrogensFromMolblock,
  moleculeHasExplicitHydrogens,
} from './molecule/explicitHydrogens';
export { schemas, schemas as commandSchemas } from './commands/schemas';
export {
  resolveCleanupBondLength,
  mergeGlobalCleanup,
  medianBondLength,
  spliceLocalCleanup,
  alignCleanupCoordsPerComponent,
  listConnectedComponents,
  collectConnectedComponent,
  buildCleanupWorkerPayload,
} from './io/localCleanup';
