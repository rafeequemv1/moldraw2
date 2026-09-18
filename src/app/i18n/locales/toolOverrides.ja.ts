/** Japanese overrides for TOOL_DEFS labels, titles, and shortLabels. */
export const jaToolOverrides: Record<
  string,
  Partial<{ label: string; title: string; shortLabel: string }>
> = {
  hand: {
    label: 'ハンド',
    title: 'キャンバスをパン — ドラッグで表示を移動',
  },
  select: {
    label: '選択',
    title:
      '選択（スペースバーで一時切替）。Shift+空キャンバスドラッグ：ラッソ；Shiftなしドラッグ：矩形。',
  },
  lasso_select: { label: 'ラッソ', title: 'ラッソ選択' },
  fragment_select: {
    label: 'フラグメント',
    title: 'フラグメント選択 — 原子または結合をクリックして連結分子全体を選択',
  },
  erase: { label: '消去', title: '消去' },
  single_bond: { label: '単', title: '単結合' },
  double_bond: { label: '二重', title: '二重結合' },
  triple_bond: { label: '三重', title: '三重結合' },
  wedge_bond: { label: 'ウェッジ', title: 'ウェッジ結合', shortLabel: 'ウェッジ' },
  dash_bond: { label: '破線', title: '破線結合', shortLabel: '破線' },
  wavy_bond: { label: '波線', title: '波線結合', shortLabel: '波線' },
  dative_bond: {
    label: '配位',
    title: '配位結合 / ダチーブ結合（破線矢印；金属配位子）',
    shortLabel: '配位',
  },
  dotted_bond: {
    label: '点線',
    title: '点線結合 — 水素結合と弱い相互作用（価数を消費しない）',
    shortLabel: '···',
  },
  aromatic_bond: { label: '芳香', title: '芳香結合（環内の実線円）', shortLabel: '芳香' },
  either_bond: { label: '楔/破線', title: '楔/破線（未指定立体）', shortLabel: '上下' },
  cis_trans_bond: { label: 'シス/トランス', title: 'シス/トランス二重結合（E/Z 未指定）', shortLabel: 'E/Z' },
  any_bond: { label: '任意', title: '任意結合（クエリ）', shortLabel: '任意' },
  single_double_bond: { label: '単/二重', title: '単結合または二重結合（クエリ）', shortLabel: '1/2' },
  single_aromatic_bond: { label: '単/芳香', title: '単結合または芳香結合（クエリ）', shortLabel: '1/芳' },
  double_aromatic_bond: { label: '二重/芳香', title: '二重結合または芳香結合（クエリ）', shortLabel: '2/芳' },
  bold_bond: { label: '太線', title: '太線（前景、表示のみ）', shortLabel: '太' },
  perspective: {
    label: '3Dビュー',
    title: '構造パースペクティブ：ドラッグでキャンバス上の3D整理ポーズを回転',
    shortLabel: '3D',
  },
  chain: { label: '鎖', title: 'アルキル鎖' },
  charge_plus: {
    label: '+',
    title: '正電荷（+）：円なしの単純マーク；再度クリックで+2、+3…',
  },
  charge_minus: {
    label: '−',
    title: '負電荷（−）：円なしの単純マーク；再度クリックで−2、−3…',
  },
  oplus: {
    label: '⊕',
    title: 'カーボカチオン（⊕）：原子上の円囲み正電荷；再度クリックで解除',
  },
  ominus: {
    label: '⊖',
    title: 'カルバアニオン（⊖）：原子上の円囲み負電荷；再度クリックで解除',
  },
  radical_cation: {
    label: '•+',
    title: 'ラジカルカチオン（•+）：原子をクリックで不対電子+形式+1；再度クリックで解除',
    shortLabel: '•+',
  },
  radical_anion: {
    label: '•−',
    title: 'ラジカルアニオン（•−）：原子をクリックで不対電子+形式−1；再度クリックで解除',
    shortLabel: '•−',
  },
  lone_pair: {
    label: '孤立電子対',
    title: '孤立電子対：原子をクリックして孤立電子対を追加',
    shortLabel: 'LP',
  },
  orbital_p: {
    label: 'p軌道',
    title: 'p軌道（対角）：原子または空キャンバスをクリックして配置',
    shortLabel: 'p',
  },
  orbital_s: {
    label: 's軌道',
    title: 's軌道：原子または空キャンバスをクリックして配置',
    shortLabel: 's',
  },
  orbital_p2: {
    label: 'p軌道',
    title: 'p軌道（反対対角）：原子または空キャンバスをクリックして配置',
    shortLabel: 'p′',
  },
  orbital_d: {
    label: 'd軌道',
    title: 'd軌道（クローバー）：原子または空キャンバスをクリックして配置',
    shortLabel: 'd',
  },
  orbital_dz2: {
    label: 'dz²軌道',
    title: 'dz²軌道：原子または空キャンバスをクリックして配置',
    shortLabel: 'dz²',
  },
  delta_plus: {
    label: 'δ+',
    title: '部分正電荷（δ+）：原子をクリックで追加/解除；ドラッグで配置',
  },
  delta_minus: {
    label: 'δ−',
    title: '部分負電荷（δ−）：原子をクリックで追加/解除；ドラッグで配置',
  },
  stamp_delta: {
    label: 'Δ',
    title: '加熱記号（Δ）を配置 — 空キャンバスをクリック',
  },
  stamp_delta_tri: {
    label: '△',
    title: '加熱三角（△）を配置 — 空キャンバスをクリック',
  },
  stamp_nu: {
    label: 'ν',
    title: 'νを配置（例：hν） — 空キャンバスをクリック',
  },
  stamp_ts: {
    label: '‡',
    title: '遷移状態記号（‡）を配置 — 空キャンバスをクリック',
  },
  stamp_celsius: {
    label: '°C',
    title: '°Cを配置 — 空キャンバスをクリック',
  },
  free_radical: {
    label: 'ラジカル',
    title: 'フリーラジカル：原子をクリックで不対電子を追加/削除',
    shortLabel: '•',
  },
  add_explicit_h: {
    label: '明示的H追加',
    title:
      '明示的Hを追加：原子を選択してクリック、または有効化して原子をクリック（例：カルボニルCのアルデヒドH）',
    shortLabel: 'H+',
  },
  add_explicit_c: {
    label: '明示的C',
    title: '炭素ラベルを表示：炭素を選択してクリック、または有効化して骨格炭素をクリック',
    shortLabel: 'C+',
  },
  cyclopropane: { label: 'シクロプロパン', title: 'シクロプロパン', shortLabel: 'C3' },
  cyclobutane: { label: 'シクロブタン', title: 'シクロブタン', shortLabel: 'C4' },
  cyclopentane: { label: 'シクロペンタン', title: 'シクロペンタン', shortLabel: 'C5' },
  cyclopentadiene: { label: 'シクロペンタジエン', title: 'シクロペンタジエン', shortLabel: 'C5=' },
  benzene: { label: 'ベンゼン', title: 'ベンゼン環' },
  hexagon: {
    label: '六角形',
    title: 'シクロヘキサン（平面六角形環）',
    shortLabel: 'C6',
  },
  cyclohexane: {
    label: 'チェア',
    title: 'シクロヘキサン チェア型',
    shortLabel: 'チェア',
  },
  boat_cyclohexane: {
    label: 'ボート C6',
    title: 'ボート型シクロヘキサン',
    shortLabel: 'ボート',
  },
  cycloheptane: { label: 'シクロヘプタン', title: 'シクロヘプタン', shortLabel: 'C7' },
  cyclooctane: { label: 'シクロオクタン', title: 'シクロオクタン', shortLabel: 'C8' },
  pencil: { label: 'ペンシル', title: 'ペンシル / 注釈' },
  smart_draw: {
    label: 'スマート描画',
    title:
      'スマート描画 — 結合、環、ラベルをスケッチ；約1.2秒停止またはEnterで変換',
    shortLabel: 'Smart',
  },
  text: {
    label: 'テキスト',
    title:
      'テキスト：空キャンバスをクリックで配置；既存テキストをクリックで移動（選択またはテキストツール）',
  },
  atom_label: {
    label: '原子ラベル',
    title:
      '原子ラベル（A）：原子をクリック — R、Me、Ph、CH3、COOHなどを入力。R/R1/R2はCまたはヘテロ原子上の一般置換基。',
    shortLabel: 'Label',
  },
  reaction_arrow: {
    label: '反応矢印',
    title:
      'キャンバス上で尻尾→先端をドラッグ。ツール横のメニューで矢印タイプを選択。SMILES react>>prodは平衡/半平衡/共鳴以外の最初の矢印を使用。',
    shortLabel: '矢印',
  },
  shape: {
    label: '図形',
    title:
      'クリック＆ドラッグで注釈図形を描画。ツール横のメニューで矩形、線、円、三角、星を選択。',
  },
  glassware: {
    label: 'ガラス器具',
    title:
      'クリック＆ドラッグで実験器具を配置。メニューで三角フラスコまたはビーカー（液体色はカラーメニュー）。',
    shortLabel: 'Glass',
  },
  sru_bracket: {
    label: 'ポリマー',
    title:
      'ポリマー括弧。1回クリックで描画、もう1回で繰り返しメニュー（ポリマー n、括弧、共重合体）。モノマー上で枠をドラッグするか、原子を2つ以上選んでクリック。添字をクリックして数を入力。',
    shortLabel: '括弧',
  },
  image: {
    label: '画像',
    title: 'PNG/JPEG/WebP/GIF画像注釈をキャンバスに追加',
  },
  template_library: {
    label: 'ライブラリ',
    title: 'ライブラリ — R基、配位子、構造、COF、反応…',
    shortLabel: 'Lib',
  },
  functional_groups: {
    label: 'R基',
    title: '官能基 — 一般的置換基（COOMe、Ph、Boc…）',
    shortLabel: 'R',
  },
  ligands: {
    label: '配位子',
    title: '配位配位子 — NH₃、CO、PPh₃、bpy、Cp、H₂O…',
    shortLabel: 'L',
  },
};
