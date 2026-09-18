/** German overrides for TOOL_DEFS labels, titles, and shortLabels. */
export const deToolOverrides: Record<
  string,
  Partial<{ label: string; title: string; shortLabel: string }>
> = {
  hand: {
    label: 'Hand',
    title: 'Leinwand schwenken — ziehen, um die Ansicht zu verschieben',
  },
  select: {
    label: 'Auswahl',
    title:
      'Auswahl (Leertaste temporär). Umschalt+Ziehen auf leerer Leinwand: Lasso; Ziehen ohne Umschalt: Rechteck.',
  },
  lasso_select: { label: 'Lasso', title: 'Lasso-Auswahl' },
  fragment_select: {
    label: 'Fragment',
    title: 'Fragmentauswahl — Klick auf Atom oder Bindung wählt das ganze verbundene Molekül',
  },
  erase: { label: 'Radieren', title: 'Radieren' },
  single_bond: { label: 'Einfach', title: 'Einfachbindung' },
  double_bond: { label: 'Doppel', title: 'Doppelbindung' },
  triple_bond: { label: 'Dreifach', title: 'Dreifachbindung' },
  wedge_bond: { label: 'Keil', title: 'Keilbindung', shortLabel: 'Keil' },
  dash_bond: { label: 'Strich', title: 'Strichbindung', shortLabel: 'Strich' },
  wavy_bond: { label: 'Wellig', title: 'Wellbindung', shortLabel: 'Wellig' },
  dative_bond: {
    label: 'Dativ',
    title: 'Dativ- / Koordinationsbindung (gestrichelter Pfeil; Metallliganden)',
    shortLabel: 'Dat',
  },
  dotted_bond: {
    label: 'Punktiert',
    title:
      'Punktierte Bindung — Wasserstoffbrücken und schwache Wechselwirkungen (verbraucht keine Valenz)',
    shortLabel: '···',
  },
  aromatic_bond: { label: 'Aromatisch', title: 'Aromatische Bindung (durchgezogener Innenkreis im Ring)', shortLabel: 'Arom' },
  either_bond: { label: 'Keil/Hash', title: 'Keil/Hash (unbekannte Stereo)', shortLabel: 'Auf/Ab' },
  cis_trans_bond: { label: 'Cis/Trans', title: 'Cis/Trans-Doppelbindung (E/Z unbestimmt)', shortLabel: 'E/Z' },
  any_bond: { label: 'Beliebig', title: 'Beliebige Bindung (Query)', shortLabel: 'Any' },
  single_double_bond: { label: 'Einfach/Doppel', title: 'Einfach oder Doppel (Query)', shortLabel: '1/2' },
  single_aromatic_bond: { label: 'Einfach/Arom.', title: 'Einfach oder aromatisch (Query)', shortLabel: '1/Ar' },
  double_aromatic_bond: { label: 'Doppel/Arom.', title: 'Doppel oder aromatisch (Query)', shortLabel: '2/Ar' },
  bold_bond: { label: 'Dick', title: 'Dicke Vordergrundbindung (nur Anzeige)', shortLabel: 'Dick' },
  perspective: {
    label: '3D-Ansicht',
    title:
      'Strukturperspektive: ziehen, um eine 3D-Bereinigungs-Pose auf der Leinwand zu drehen',
    shortLabel: '3D',
  },
  chain: { label: 'Kette', title: 'Alkylkette' },
  charge_plus: {
    label: '+',
    title:
      'Positive Ladung (+): einfache Markierung ohne Kreis; erneut klicken für +2, +3…',
  },
  charge_minus: {
    label: '−',
    title:
      'Negative Ladung (−): einfache Markierung ohne Kreis; erneut klicken für −2, −3…',
  },
  oplus: {
    label: '⊕',
    title: 'Karbokation (⊕): positive Ladung im Kreis am Atom; erneut klicken zum Entfernen',
  },
  ominus: {
    label: '⊖',
    title: 'Carbanion (⊖): negative Ladung im Kreis am Atom; erneut klicken zum Entfernen',
  },
  radical_cation: {
    label: '•+',
    title:
      'Radikal-Kation (•+): Atom anklicken für ungepaartes Elektron + formale +1; erneut klicken zum Entfernen',
    shortLabel: '•+',
  },
  radical_anion: {
    label: '•−',
    title:
      'Radikal-Anion (•−): Atom anklicken für ungepaartes Elektron + formale −1; erneut klicken zum Entfernen',
    shortLabel: '•−',
  },
  lone_pair: {
    label: 'Freies Elektronenpaar',
    title: 'Freies Elektronenpaar: Klick fügt eines hinzu; nach Maximum entfernt jeder weitere Klick eines',
    shortLabel: 'EP',
  },
  orbital_p: {
    label: 'p-Orbital',
    title: 'p-Orbital (diagonal): Atom oder leere Leinwand anklicken zum Platzieren',
    shortLabel: 'p',
  },
  orbital_s: {
    label: 's-Orbital',
    title: 's-Orbital: Atom oder leere Leinwand anklicken zum Platzieren',
    shortLabel: 's',
  },
  orbital_p2: {
    label: 'p-Orbital',
    title: 'p-Orbital (gegenläufig diagonal): Atom oder leere Leinwand anklicken zum Platzieren',
    shortLabel: 'p′',
  },
  orbital_d: {
    label: 'd-Orbital',
    title: 'd-Orbital (Kleeblatt): Atom oder leere Leinwand anklicken zum Platzieren',
    shortLabel: 'd',
  },
  orbital_dz2: {
    label: 'dz²-Orbital',
    title: 'dz²-Orbital: Atom oder leere Leinwand anklicken zum Platzieren',
    shortLabel: 'dz²',
  },
  delta_plus: {
    label: 'δ+',
    title: 'Teilweise positive Ladung (δ+): Atom anklicken zum Hinzufügen/Entfernen; ziehen zum Platzieren',
  },
  delta_minus: {
    label: 'δ−',
    title: 'Teilweise negative Ladung (δ−): Atom anklicken zum Hinzufügen/Entfernen; ziehen zum Platzieren',
  },
  stamp_delta: {
    label: 'Δ',
    title: 'Wärmesymbol (Δ) platzieren — leere Leinwand anklicken',
  },
  stamp_delta_tri: {
    label: '△',
    title: 'Wärmedreieck (△) platzieren — leere Leinwand anklicken',
  },
  stamp_nu: {
    label: 'ν',
    title: 'ν platzieren (z. B. hν) — leere Leinwand anklicken',
  },
  stamp_ts: {
    label: '‡',
    title: 'Übergangszustandssymbol (‡) platzieren — leere Leinwand anklicken',
  },
  stamp_celsius: {
    label: '°C',
    title: '°C platzieren — leere Leinwand anklicken',
  },
  free_radical: {
    label: 'Radikal',
    title: 'Freies Radikal: Klick fügt hinzu; erneut, auf den Punkt oder Radierer entfernt',
    shortLabel: '•',
  },
  add_explicit_h: {
    label: 'Explizites H',
    title:
      'Explizites H hinzufügen: Atom(e) auswählen und klicken, oder aktivieren und Atom anklicken (z. B. Aldehyd-H am Carbonyl-C)',
    shortLabel: 'H+',
  },
  add_explicit_c: {
    label: 'Explizites C',
    title:
      'Kohlenstofflabel zeigen: C-Atom(e) auswählen und klicken, oder aktivieren und ein Skelett-C anklicken',
    shortLabel: 'C+',
  },
  cyclopropane: { label: 'Cyclopropan', title: 'Cyclopropan', shortLabel: 'C3' },
  cyclobutane: { label: 'Cyclobutan', title: 'Cyclobutan', shortLabel: 'C4' },
  cyclopentane: { label: 'Cyclopentan', title: 'Cyclopentan', shortLabel: 'C5' },
  cyclopentadiene: { label: 'Cyclopentadien', title: 'Cyclopentadien', shortLabel: 'C5=' },
  benzene: { label: 'Benzol', title: 'Benzolring' },
  hexagon: {
    label: 'Sechseck',
    title: 'Cyclohexan (flaches Sechseck)',
    shortLabel: 'C6',
  },
  cyclohexane: {
    label: 'Sessel',
    title: 'Cyclohexan-Sesselkonformation',
    shortLabel: 'Sessel',
  },
  boat_cyclohexane: {
    label: 'Boot C6',
    title: 'Boot-Cyclohexan',
    shortLabel: 'Boot',
  },
  cycloheptane: { label: 'Cycloheptan', title: 'Cycloheptan', shortLabel: 'C7' },
  cyclooctane: { label: 'Cyclooctan', title: 'Cyclooctan', shortLabel: 'C8' },
  pencil: { label: 'Stift', title: 'Stift / Annotieren' },
  smart_draw: {
    label: 'Smart Draw',
    title:
      'Smart Draw — Bindungen, Ringe und Beschriftungen skizzieren; ~1,2 s Pause oder Eingabe zum Konvertieren',
    shortLabel: 'Smart',
  },
  text: {
    label: 'Text',
    title:
      'Text: leere Leinwand anklicken zum Platzieren; vorhandenen Text anklicken zum Verschieben (Auswahl- oder Textwerkzeug)',
  },
  atom_label: {
    label: 'Atombeschriftung',
    title:
      'Atombeschriftung (A): Atom anklicken — R, Me, Ph, CH3, COOH usw. eingeben. R/R1/R2 sind generische Substituenten an C oder Heteroatomen.',
    shortLabel: 'Label',
  },
  reaction_arrow: {
    label: 'Reaktionspfeil',
    title:
      'Schwanz→Kopf auf der Leinwand ziehen. Menü neben dem Werkzeug für Pfeiltyp. SMILES react>>prod nutzt den ersten Pfeil, der kein Gleichgewicht / Halb-Gleichgewicht / Resonanz ist.',
    shortLabel: 'Pfeil',
  },
  shape: {
    label: 'Form',
    title:
      'Klicken und ziehen, um eine Annotationsform zu zeichnen. Menü neben dem Werkzeug für Rechteck, Linie, Kreis, Dreieck oder Stern.',
  },
  glassware: {
    label: 'Glasware',
    title:
      'Klicken und ziehen, um Laborglas zu platzieren. Menü für Erlenmeyerkolben oder Becherglas (Flüssigkeitsfarbe im Farbmenü).',
    shortLabel: 'Glas',
  },
  sru_bracket: {
    label: 'Polymer',
    title:
      'Polymerklammern. Einmal klicken zum Zeichnen, erneut für das Wiederholungsmenü (Polymer n, Klammer, Copolymer). Kasten über das Monomer ziehen oder mindestens zwei Atome wählen und klicken. Subskript anklicken, um die Anzahl einzugeben.',
    shortLabel: 'Klammern',
  },
  image: {
    label: 'Bild',
    title: 'PNG/JPEG/WebP/GIF-Bildannotation zur Leinwand hinzufügen',
  },
  template_library: {
    label: 'Bibliothek',
    title: 'Bibliothek — R-Gruppen, Liganden, Strukturen, COFs, Reaktionen…',
    shortLabel: 'Lib',
  },
  functional_groups: {
    label: 'R-Gruppen',
    title: 'Funktionelle Gruppen — gängige Substituenten (COOMe, Ph, Boc, …)',
    shortLabel: 'R',
  },
  ligands: {
    label: 'Liganden',
    title: 'Koordinationsliganden — NH₃, CO, PPh₃, bpy, Cp, H₂O…',
    shortLabel: 'L',
  },
};
