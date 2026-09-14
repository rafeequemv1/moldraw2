/**
 * Scaffold template registry — fingerprint → layout hints for polycyclic cores.
 */
export interface ScaffoldTemplate {
  id: string;
  /** Sorted ring sizes, e.g. "5-6-6-6" for steroids. */
  fingerprint: string;
  /** First ring to place (largest core ring for most scaffolds). */
  preferredFirstRingSize: number;
  description: string;
}

export const SCAFFOLD_TEMPLATES: ScaffoldTemplate[] = [
  { id: 'steroid', fingerprint: '5-6-6-6', preferredFirstRingSize: 6, description: 'Steroid nucleus' },
  { id: 'taxane', fingerprint: '4-6-6-8', preferredFirstRingSize: 8, description: 'Taxane core' },
  { id: 'decalin', fingerprint: '6-6', preferredFirstRingSize: 6, description: 'Decalin fused bicyclic' },
  { id: 'indole', fingerprint: '5-6', preferredFirstRingSize: 6, description: 'Indole bicyclic' },
  { id: 'purine', fingerprint: '5-6', preferredFirstRingSize: 6, description: 'Purine bicyclic' },
  { id: 'naphthalene', fingerprint: '6-6', preferredFirstRingSize: 6, description: 'Naphthalene' },
  { id: 'anthracene', fingerprint: '6-6-6', preferredFirstRingSize: 6, description: 'Anthracene' },
  { id: 'phenanthrene', fingerprint: '6-6-6', preferredFirstRingSize: 6, description: 'Phenanthrene' },
  { id: 'beta-lactam', fingerprint: '4-5', preferredFirstRingSize: 5, description: 'Beta-lactam' },
  { id: 'bicyclo-222', fingerprint: '6-6-6', preferredFirstRingSize: 6, description: 'Bicyclo[2.2.2]octane' },
  { id: 'adamantane', fingerprint: '6-6-6-6', preferredFirstRingSize: 6, description: 'Adamantane cage' },
];

export const matchScaffoldTemplate = (fingerprint: string): ScaffoldTemplate | null => {
  const exact = SCAFFOLD_TEMPLATES.find(t => t.fingerprint === fingerprint);
  if (exact) return exact;
  // Longest-prefix match for partial fingerprints (e.g. steroid subset).
  let best: ScaffoldTemplate | null = null;
  for (const t of SCAFFOLD_TEMPLATES) {
    if (fingerprint.includes(t.fingerprint) || t.fingerprint.includes(fingerprint)) {
      if (!best || t.fingerprint.length > best.fingerprint.length) best = t;
    }
  }
  return best;
};

export const preferredCoreRingSizeFromRegistry = (fingerprint: string): number | undefined =>
  matchScaffoldTemplate(fingerprint)?.preferredFirstRingSize;
