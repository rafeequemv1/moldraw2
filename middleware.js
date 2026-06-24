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

export default function middleware(request) {
  const accept = request.headers.get('accept');
  if (!wantsMarkdown(accept)) return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/md/')
    || url.pathname.startsWith('/.well-known/')
    || url.pathname.startsWith('/static/')) {
    return;
  }

  const apiUrl = new URL('/api/markdown', url.origin);
  apiUrl.searchParams.set('path', url.pathname);
  return Response.rewrite(apiUrl);
}

export const config = {
  matcher: [
    '/',
    '/((?!api|md|static|_next|.*\\..*).*)',
  ],
};
