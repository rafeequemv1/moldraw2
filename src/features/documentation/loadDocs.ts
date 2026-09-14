/** Lazy-load markdown from `documentation/` — one chunk per file at navigation time. */

const loaders = import.meta.glob('../../../documentation/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

const pathByFile = new Map<string, string>();

for (const fullPath of Object.keys(loaders)) {
  const normalized = fullPath.replace(/\\/g, '/');
  const idx = normalized.indexOf('/documentation/');
  if (idx === -1) continue;
  const rel = normalized.slice(idx + '/documentation/'.length);
  pathByFile.set(rel, fullPath);
}

const cache = new Map<string, string>();

export const loadDocMarkdown = async (relativeFile: string): Promise<string> => {
  const cached = cache.get(relativeFile);
  if (cached !== undefined) return cached;

  const modulePath = pathByFile.get(relativeFile);
  if (!modulePath) {
    const missing = `# Not found\n\nMissing documentation file: \`${relativeFile}\`.`;
    cache.set(relativeFile, missing);
    return missing;
  }

  const loader = loaders[modulePath];
  if (!loader) {
    const missing = `# Not found\n\nMissing documentation loader: \`${relativeFile}\`.`;
    cache.set(relativeFile, missing);
    return missing;
  }

  const content = await loader();
  cache.set(relativeFile, content);
  return content;
};

/** Sync read after a page has been loaded (e.g. for link resolution). */
export const getCachedDocMarkdown = (relativeFile: string): string | undefined =>
  cache.get(relativeFile);
