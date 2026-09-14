import { createMoldrawTsupConfig } from '../../scripts/createMoldrawTsupConfig'

// Second entry keeps the DOM-free SVG renderer (used by the `molecule.render`
// AI tool in Node) out of the React root bundle; matches the package.json
// `./export/renderMoleculeSvgHeadless` export.
export default createMoldrawTsupConfig(['src/index.ts', 'src/export/renderMoleculeSvgHeadless.ts'])
