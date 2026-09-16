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
  { pattern: /^\/course\/ketcher-help-complete$/, build: () => '/course/reference.html' },
  { pattern: /^\/course\/reference$/, build: () => '/course/reference.html' },
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

function resolveCommunityRewrite(pathname) {
  if (pathname === '/community/sitemap.xml') return '/api/community-sitemap';
  if (pathname === '/community/index.html') return null;
  if (
    pathname === '/community'
    || pathname === '/community/'
    || /^\/community\/(page\/\d+|features(?:\/page\/\d+)?|p\/[^/]+(?:\/[^/]+)?|c\/[^/]+|f\/[^/]+(?:\/[^/]+)?|fc\/[^/]+)\/?$/.test(pathname)
  ) {
    return `/api/community?path=${encodeURIComponent(pathname)}`;
  }
  return null;
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

  const communityTarget = resolveCommunityRewrite(url.pathname);
  if (communityTarget) {
    const apiUrl = new URL(communityTarget, url.origin);
    url.searchParams.forEach((value, key) => {
      if (!apiUrl.searchParams.has(key)) apiUrl.searchParams.set(key, value);
    });
    return Response.rewrite(apiUrl);
  }

  // Never content-negotiate machine-readable discovery / static assets through /api/markdown
  const path = url.pathname;
  if (
    path === '/sitemap.xml'
    || path === '/robots.txt'
    || path === '/llms.txt'
    || path === '/llm.text'
    || path === '/favicon.ico'
    || path.startsWith('/api/')
    || path.startsWith('/md/')
    || path.startsWith('/.well-known/')
    || path.startsWith('/static/')
    || path.startsWith('/css/')
    || path.startsWith('/js/')
    || path.startsWith('/fonts/')
    || path.startsWith('/images/')
    || /\.(?:xml|txt|json|css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|pdf)$/i.test(path)
  ) {
    return;
  }

  const accept = request.headers.get('accept');
  if (!wantsMarkdown(accept)) return;

  const apiUrl = new URL('/api/markdown', url.origin);
  apiUrl.searchParams.set('path', url.pathname);
  return Response.rewrite(apiUrl);
}

export const config = {
  matcher: [
    '/:path*',
  ],
};
