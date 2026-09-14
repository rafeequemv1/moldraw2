/**
 * Deterministic-ish id generation for engine-created atoms/bonds. Each parse
 * gets a fresh prefix so multiple parsed molecules can coexist on one canvas
 * without id collisions (matching the previous molblock parser behavior).
 */

let counter = 0;

/** Short random-ish prefix, unique per call. */
export const newPrefix = (): string => {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${rand}${counter.toString(36)}`;
};

export interface IdFactory {
  atom: (i: number) => string;
  bond: (i: number) => string;
}

export const makeIdFactory = (prefix = newPrefix()): IdFactory => ({
  atom: (i: number) => `${prefix}_a${i}`,
  bond: (i: number) => `${prefix}_b${i}`,
});
