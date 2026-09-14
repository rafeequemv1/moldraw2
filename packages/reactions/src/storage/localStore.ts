/** Local persistence for reaction library (favorites / recents) until Supabase sync. */

const STORAGE_KEY = 'moldraw.reaction-library.v1';

export type ReactionLibraryLocalState = {
  favoriteIds: string[];
  recentIds: string[];
};

const defaultState = (): ReactionLibraryLocalState => ({
  favoriteIds: [],
  recentIds: [],
});

const readRaw = (): ReactionLibraryLocalState => {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ReactionLibraryLocalState>;
    return {
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds.filter(x => typeof x === 'string') : [],
      recentIds: Array.isArray(parsed.recentIds) ? parsed.recentIds.filter(x => typeof x === 'string') : [],
    };
  } catch {
    return defaultState();
  }
};

const writeRaw = (state: ReactionLibraryLocalState): void => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
};

export const loadReactionLibraryLocal = (): ReactionLibraryLocalState => readRaw();

export const saveReactionLibraryLocal = (state: ReactionLibraryLocalState): void => writeRaw(state);

export const toggleReactionFavorite = (id: string): ReactionLibraryLocalState => {
  const state = readRaw();
  const set = new Set(state.favoriteIds);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = { ...state, favoriteIds: [...set] };
  writeRaw(next);
  return next;
};

export const pushReactionRecent = (id: string, max = 12): ReactionLibraryLocalState => {
  const state = readRaw();
  const recentIds = [id, ...state.recentIds.filter(x => x !== id)].slice(0, max);
  const next = { ...state, recentIds };
  writeRaw(next);
  return next;
};
