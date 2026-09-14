import { classifyChatIntent, toolIdsForIntent } from '../chat/intentRouter';

for (const t of [
  'add blue color in all rings',
  'color all rings blue',
  'paint all rings',
]) {
  const i = classifyChatIntent(t);
  console.log(t, '→', i);
  if (i !== 'edit') {
    console.error('FAIL: expected edit');
    process.exit(1);
  }
  if (!toolIdsForIntent(i).includes('molecule.color_rings')) {
    console.error('FAIL: color_rings missing');
    process.exit(1);
  }
}

for (const t of ['make all oxygen red', 'make all oxygen red colored', 'color all N blue']) {
  const i = classifyChatIntent(t);
  console.log(t, '→', i);
  if (i !== 'edit') {
    console.error('FAIL: expected edit for element color request');
    process.exit(1);
  }
  if (!toolIdsForIntent(i).includes('molecule.color_by_element')) {
    console.error('FAIL: color_by_element missing');
    process.exit(1);
  }
}

for (const t of ['make all double bonds blue', 'color all triples red']) {
  const i = classifyChatIntent(t);
  console.log(t, '→', i);
  if (i !== 'edit') {
    console.error('FAIL: expected edit for bond color request');
    process.exit(1);
  }
  if (!toolIdsForIntent(i).includes('molecule.color_by_bond_order')) {
    console.error('FAIL: color_by_bond_order missing');
    process.exit(1);
  }
}

for (const t of ['make labels bigger', 'thicker bonds', 'oxygen labels 18pt']) {
  const i = classifyChatIntent(t);
  console.log(t, '→', i);
  if (i !== 'edit') {
    console.error('FAIL: expected edit for display style request');
    process.exit(1);
  }
  if (!toolIdsForIntent(i).includes('molecule.apply_display_style')) {
    console.error('FAIL: apply_display_style missing');
    process.exit(1);
  }
}

if (classifyChatIntent('add aspirin') !== 'import') {
  console.error('FAIL: add aspirin should stay import');
  process.exit(1);
}
console.log('OK');
