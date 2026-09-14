/**
 * Load and register OpenChemLib static resources (required for ConformerGenerator).
 * Served from /vendor/openchemlib-resources.json (~1.3 MB), fetched once.
 */
const RESOURCES_URL = `${import.meta.env.BASE_URL}vendor/openchemlib-resources.json`;

let registerPromise: Promise<void> | null = null;

export const ensureOclResources = async (): Promise<void> => {
  if (registerPromise) return registerPromise;
  registerPromise = (async () => {
    const { Resources } = await import('openchemlib');
    try {
      await Resources.registerFromUrl(RESOURCES_URL);
    } catch {
      const res = await fetch(RESOURCES_URL);
      if (!res.ok) {
        throw new Error(`Failed to fetch OpenChemLib resources (${res.status})`);
      }
      const data = (await res.json()) as Record<string, string>;
      Resources.register(data);
    }
  })();
  try {
    await registerPromise;
  } catch (err) {
    registerPromise = null;
    throw err;
  }
};

/** Reset for tests. */
export const resetOclResourcesForTests = (): void => {
  registerPromise = null;
};
