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

const EXTENSIONLESS_STATIC = [
  { pattern: /^\/blog\/([^/]+)$/, build: (m) => `/blog/${m[1]}.html` },
  { pattern: /^\/blog\/molecules\/([^/]+)$/, build: (m) => `/blog/molecules/${m[1]}.html` },
  { pattern: /^\/tools\/free-chem-tools\/([^/]+)$/, build: (m) => `/tools/free-chem-tools/${m[1]}.html` },
  { pattern: /^\/pages\/([^/]+)$/, build: (m) => `/pages/${m[1]}.html` },
  { pattern: /^\/course\/chapters\/([^/]+)$/, build: (m) => `/course/chapters/${m[1]}.html` },
  { pattern: /^\/course\/ketcher-help-complete$/, build: () => '/course/ketcher-help-complete.html' },
];

function resolveExtensionlessRedirect(pathname) {
  if (!pathname || pathname.includes('.')) return null;
  for (const rule of EXTENSIONLESS_STATIC) {
    const match = pathname.match(rule.pattern);
    if (match) return rule.build(match);
  }
  return null;
}

function resolveJunkPathRedirect(pathname) {
  if (!pathname.includes('${') && !pathname.includes('%7B')) return null;
  if (pathname.startsWith('/community/')) return '/community/';
  if (pathname.startsWith('/tools/')) return '/tools/';
  return '/';
}

export default function middleware(request) {
  const url = new URL(request.url);

  if (url.hostname === 'moldraw.com') {
    url.hostname = 'www.moldraw.com';
    return Response.redirect(url.toString(), 301);
  }

  const junkTarget = resolveJunkPathRedirect(url.pathname);
  if (junkTarget) {
    return Response.redirect(new URL(junkTarget, url.origin).toString(), 301);
  }

  const staticTarget = resolveExtensionlessRedirect(url.pathname);
  if (staticTarget) {
    url.pathname = staticTarget;
    return Response.redirect(url.toString(), 301);
  }

  const accept = request.headers.get('accept');
  if (!wantsMarkdown(accept)) return;
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
    '/:path*',
  ],
};
