/**
 * MolDraw editor course chapters. Used by /course/index.html.
 */
window.MOLDRAW_COURSE_CHAPTERS = [
  {
    id: 'getting-started',
    title: 'Getting started with MolDraw',
    href: '/course/chapters/getting-started-with-moldraw.html',
    html: `
      <h1>Getting started with MolDraw</h1>
      <p>MolDraw is a free browser editor for 2D chemical structures, reactions, and 3D viewing. This course matches the current MolDraw 2D editor.</p>
      <p>When you open the app you see three layers of chrome:</p>
      <ul>
        <li><strong>Top options row</strong> — Community, My designs, Copy SMILES / SVG, Paste SMILES, AI, Request feature, Sign in, Download, Course, and related links.</li>
        <li><strong>Editor row</strong> — File, molecule search, Home / Draw / Style ribbons, Library, PubChem, and Chemistry tools.</li>
        <li><strong>Tools row</strong> — cleanup, selection, rings, bonds, and drawing extras for the active ribbon.</li>
      </ul>
      <p>The left rail holds drawing tools. The infinite canvas is the document. Optional AI chat and 3D panes dock beside the canvas.</p>
      <p>Draw a first molecule with the single-bond tool, drop a ring from the toolbar, then use File → Save or My designs to keep a local copy. Screenshots for each step will be added later.</p>
    `,
  },
  {
    id: 'interface-ribbons',
    title: 'Home, Draw, and Style ribbons',
    href: '/course/chapters/snake-and-flex-modes.html',
    html: `
      <h1>Home, Draw, and Style ribbons</h1>
      <p>Home, Draw, and Style are exclusive ribbons on the second editor row. Only one is open at a time.</p>
      <ul>
        <li><strong>Home</strong> — Cleanup, format, hydrogens, 3D clean up, and extras such as formula display.</li>
        <li><strong>Draw</strong> — Pencil, shapes, images, glassware, and annotation tools.</li>
        <li><strong>Style</strong> — Font, bond thickness, structure theme, and appearance for the selection.</li>
      </ul>
      <p>Library opens structure templates, COFs, MOFs, polymers, and named reaction schemes. It is separate from My designs, which stores your own files on this device.</p>
    `,
  },
  {
    id: 'drawing-atoms',
    title: 'Drawing atoms',
    href: '/course/chapters/drawing-atoms.html',
    html: `
      <h1>Drawing atoms</h1>
      <p>Choose an element from the left atom palette, then click empty canvas or the end of a bond. Carbon is the default placement element for the single-bond tool.</p>
      <p>Click an existing atom to change its element, charge, or alias. The context menu can set isotopes, explicit hydrogens, radicals, and lone pairs.</p>
      <p>Use the periodic table dialog when you need an element that is not on the compact palette.</p>
    `,
  },
  {
    id: 'drawing-bonds',
    title: 'Drawing bonds',
    href: '/course/chapters/drawing-bonds.html',
    html: `
      <h1>Drawing bonds</h1>
      <p>The single-bond tool draws from atom to atom, or from an atom into empty space to create a new atom. Double, triple, wedge, hash, and dative tools change bond order or stereo.</p>
      <p>Click an existing bond to cycle common types, or use the Style ribbon and context menu for thickness and stereo. Chain and ring tools place several bonds in one gesture.</p>
    `,
  },
  {
    id: 'drawing-structures',
    title: 'Drawing structures and rings',
    href: '/course/chapters/drawing-structures-and-bonds.html',
    html: `
      <h1>Drawing structures and rings</h1>
      <p>Use benzene, cyclohexane, and other ring tools from the Home tools row. Functional-group and ligand placement tools drop a fragment that you click onto the canvas.</p>
      <p>Cleanup (native or Indigo when ready) regularizes 2D coordinates. Prefer Indigo layout in Settings when you want ChemDraw-like ring geometry.</p>
      <p>Marquee and lasso select whole fragments. Rotate, scale, and move handles sit on the selection box.</p>
    `,
  },
  {
    id: 'text-shapes',
    title: 'Text, shapes, and images',
    href: '/course/chapters/drawing-graphical-objects.html',
    html: `
      <h1>Text, shapes, and images</h1>
      <p>The Draw ribbon adds free text, shapes, images, and glassware to the canvas. Text uses an inline editor; the transform boundary moves with the letters when you drag.</p>
      <p>Shapes include arrows, boxes, and apparatus outlines. Images import PNG, JPEG, WebP, GIF, or SVG. Glassware can show a liquid fill level.</p>
    `,
  },
  {
    id: 'library',
    title: 'Library and templates',
    href: '/course/chapters/templates-toolbar.html',
    html: `
      <h1>Library and templates</h1>
      <p>Library (Beta) holds structure templates, COFs, MOFs, polymers, dendrimers, amino acids, ligands, and named reaction schemes. Search across categories, then click to place on the canvas.</p>
      <p>My designs is different: it lists drawings saved locally on this device (including older local project cards when present). Use File to open MOL, CDXML, and MolDraw project files.</p>
    `,
  },
  {
    id: 'reactions',
    title: 'Reactions and arrows',
    href: '/course/chapters/drawing-reactions.html',
    html: `
      <h1>Reactions and arrows</h1>
      <p>Place a reaction arrow from the toolbar, then drag endpoints to atoms or empty space. The top bar shows arrow kind (straight, equilibrium, retrosynthetic, and others) and reagent slots above and below the shaft.</p>
      <p>Chemistry → Automap assigns atom-atom maps across an arrow. Insert the built-in SN2 or mechanism demos if you need a teaching example.</p>
    `,
  },
  {
    id: 'stereochemistry',
    title: 'Stereochemistry',
    href: '/course/chapters/stereochemistry.html',
    html: `
      <h1>Stereochemistry</h1>
      <p>Wedge and hash bonds mark tetrahedral stereo. CIP labels (R/S, E/Z) toggle from the Chemistry menu when Indigo is ready.</p>
      <p>Newman, Fischer, and chair/boat helpers live on the selection context menu for suitable bonds or rings. Invert stereo at an atom from the same menu.</p>
    `,
  },
  {
    id: 'lone-pairs',
    title: 'Lone pairs and radicals',
    href: '/course/chapters/add-lone-pair-in-moldraw.html',
    html: `
      <h1>Lone pairs and radicals</h1>
      <p>Use the lone-pair and free-radical tools (or the atom context menu) to place electron pairs and radicals. Drag the mark around the atom to seat it on a convenient side.</p>
      <p>Charge marks are separate: formal charge and delta charge can be offset around the atom the same way.</p>
    `,
  },
  {
    id: 'style',
    title: 'Style and structure display',
    href: '/course/chapters/changing-structure-display.html',
    html: `
      <h1>Style and structure display</h1>
      <p>The Style ribbon sets font, bold/italic, bond thickness, and structure theme (skeletal vs other draw modes). Color applies to atoms, bonds, rings, or annotations depending on the color-target settings.</p>
      <p>Settings also control implicit hydrogens, condensed group labels, colored atom labels, grid, and snap.</p>
    `,
  },
  {
    id: 'copy-smiles',
    title: 'Copy, paste, and SMILES',
    href: '/course/chapters/naming-smiles-and-properties.html',
    html: `
      <h1>Copy, paste, and SMILES</h1>
      <p>The top options row has Copy SMILES, Copy SVG (Ctrl+C), and Paste SMILES. Paste also accepts MOL, CDXML, InChI, and images from the clipboard.</p>
      <p>Copy as… in the context menu adds InChI, MOL V2000/V3000, and other formats. The status bar shows formula and molecular weight for the selection or the whole molecule.</p>
    `,
  },
  {
    id: 'export',
    title: 'Download and file formats',
    href: '/course/chapters/export-and-file-formats.html',
    html: `
      <h1>Download and file formats</h1>
      <p>Download exports PNG, PNG (white), JPEG, SVG, PDF, SMILES, MOL, CDXML, CDX, InChI, SMARTS, CML, and RXN when the document supports them.</p>
      <p>File → Save writes a <code>.moldraw</code> project of the whole canvas (structures, arrows, text, and images). Open File places or replaces content from MOL, CDX/CDXML, and MolDraw files.</p>
    `,
  },
  {
    id: 'my-designs',
    title: 'My designs and local saving',
    href: '/course/chapters/macromolecules-library.html',
    html: `
      <h1>My designs and local saving</h1>
      <p>Drawings autosave locally in the browser. My designs opens every saved file on this device. The MolDraw logo / title also opens that library.</p>
      <p>Sign in is optional for drawing. An account is used for community, feature requests, and some cloud actions. Designs that lived in the previous editor as local project cards are migrated into this library when possible.</p>
    `,
  },
  {
    id: '3d-viewer',
    title: '3D viewer',
    href: '/course/chapters/3d-viewer.html',
    html: `
      <h1>3D viewer</h1>
      <p>Open the 3D pane from the tools row. MolDraw builds a 3D conformer from the 2D structure (Indigo / local engine). You can orbit, choose display styles, and use 3D Clean Up to pose the 2D drawing in perspective.</p>
      <p>Flatten writes the posed coordinates back to the 2D document. Protein / PDB workflows are available from the proteins plugin when enabled.</p>
    `,
  },
  {
    id: 'ai',
    title: 'AI assistant',
    href: '/course/chapters/creating-antisense-chains.html',
    html: `
      <h1>AI assistant</h1>
      <p>The AI button in the top options row (and the tools-row AI toggle) opens a chat dock. Paste a Gemini API key in Settings → AI or in the panel.</p>
      <p>Ask for structures, reactions, naming help, or edits. The assistant can place SMILES on the canvas. Image attach is supported for structure questions.</p>
    `,
  },
  {
    id: 'pubchem',
    title: 'Search and PubChem',
    href: '/course/chapters/macromolecules-and-molecules-mode-integration.html',
    html: `
      <h1>Search and PubChem</h1>
      <p>The header search box looks up a name or CAS and imports a 2D structure. PubChem opens advanced search and batch SMILES import onto the canvas.</p>
      <p>Batch import lays molecules out on a grid so they do not overlap. Quiet import (no extra panels) is used by some tool pages.</p>
    `,
  },
  {
    id: 'r-groups',
    title: 'Atom aliases and R-groups',
    href: '/course/chapters/drawing-r-groups.html',
    html: `
      <h1>Atom aliases and R-groups</h1>
      <p>Click an atom with the alias (A) tool, or choose Edit alias from the context menu, to type a condensed label such as Ph, COOH, or R<sup>1</sup>.</p>
      <p>Aliases replace the element letter on the canvas. Expand or collapse an alias from the context menu when a stored fragment is available. Custom aliases stay as text until you expand them.</p>
    `,
  },
  {
    id: 'sru',
    title: 'Polymer SRU brackets',
    href: '/course/chapters/marking-s-groups.html',
    html: `
      <h1>Polymer SRU brackets</h1>
      <p>Select two or more atoms and use the polymer / SRU tool to wrap them in repeating-unit brackets. Click the subscript to edit <em>n</em> or another label.</p>
      <p>This replaces the older S-group workflow. Brackets stay attached when you move the fragment.</p>
    `,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    href: '/course/chapters/sequence-mode.html',
    html: `
      <h1>Keyboard shortcuts</h1>
      <p>The black question-mark icon in the editor header opens the shortcut list. Common bindings include Ctrl+C (copy SVG), Ctrl+V (paste), Delete, Ctrl+Z / Ctrl+Y, and tool letters from the rail.</p>
      <p>Shortcuts can be remapped in Settings. They are ignored while you type in the text editor or atom-alias field.</p>
    `,
  },
  {
    id: 'reaction-workflows',
    title: 'Reaction workflows',
    href: '/course/chapters/reaction-and-tlc-workflows.html',
    html: `
      <h1>Reaction workflows</h1>
      <p>Build a scheme with molecules, a reaction arrow, and reagent text on the arrow. Export RXN or copy SMILES for the whole scheme when possible.</p>
      <p>Named reaction templates in Library drop a starting scheme you can edit. Mechanism demos help check curved-arrow placement.</p>
    `,
  },
  {
    id: 'properties',
    title: 'Names, formula, and properties',
    href: '/course/chapters/macromolecules-properties.html',
    html: `
      <h1>Names, formula, and properties</h1>
      <p>The info panel and status bar show formula and molecular weight for the selection or the full molecule. PubChem import can attach a compound name.</p>
      <p>Copy InChI or InChIKey from Copy as… for database lookup. Exact-mass and spectroscopy tools live under the Tools hub, not inside the canvas.</p>
    `,
  },
];
