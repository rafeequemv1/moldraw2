import type { IndigoKetcher, IndigoStringMap } from './types';

/** Default Indigo options used across layout / CIP / convert / check / aromatize. */
export const makeIndigoOptions = (indigo: IndigoKetcher): IndigoStringMap => {
  const opts = new indigo.MapStringString();
  opts.set('smart-layout', 'true');
  opts.set('ignore-stereochemistry-errors', 'true');
  opts.set('ignore-no-chiral-flag', 'true');
  opts.set('aromatize-skip-superatoms', 'true');
  opts.set('dearomatize-on-load', 'false');
  return opts;
};
