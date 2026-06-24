const SITE_ORIGIN = 'https://www.moldraw.com';

const wantsMarkdown = (acceptHeader) => {
  const header = String(acceptHeader || '').toLowerCase();
  if (!header.includes('text/markdown')) return false;

  const parts = header.split(',').map((part) => {
    const [type, ...params] = part.trim().split(';');
    const qParam = params.find((p) => p.trim().startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.split('=')[1]) : 1;
    return { type: type.trim(), q: Number.isFinite(q) ? q : 1 };
  });

  const markdownQ = parts.find((p) => p.type === 'text/markdown')?.q ?? 0;
  const htmlQ = parts.find((p) => p.type === 'text/html')?.q ?? 0;
  return markdownQ >= htmlQ;
};

const resolveMarkdownPath = (pathname) => {
  let path = String(pathname || '/');
  if (path.endsWith('/')) path += 'index.html';
  if (!path.includes('.') && !path.endsWith('.html')) path = `${path}/index.html`;
  path = path.replace(/^\//, '').replace(/\.html$/, '');
  if (!path || path === 'index') return '/index.md';
  return `/${path}.md`;
};

module.exports = {
  SITE_ORIGIN,
  wantsMarkdown,
  resolveMarkdownPath,
};
