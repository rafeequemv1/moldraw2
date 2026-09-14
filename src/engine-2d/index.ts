/**
 * Optional 2D engine peer — Indigo WASM layout/cleanup + CIP / convert / check /
 * aromatize / calculate / automap. Native generate2D/cleanup live in `src/engine`.
 *
 * Import rule: only this package and the 2D worker should load indigo-ketcher WASM
 * (`indigoKetcherModule`). Features/domain must not import that module.
 */
export * from './indigo';
