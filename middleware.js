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

function isCommunityPath(pathname) {
  return pathname === '/community' || pathname.startsWith('/community/');
}

/**
 * Vite/Vercel routing middleware is not Next.js. `Response.rewrite` is a
 * NextResponse helper and throws here, which becomes MIDDLEWARE_INVOCATION_FAILED
 * for every rewritten path (including /community). Fail open instead.
 */
function rewriteOrContinue(destination) {
  try {
    if (typeof Response.rewrite === 'function') {
      return Response.rewrite(destination);
    }
  } catch (error) {
    console.error('middleware rewrite failed open', error);
  }
  return undefined;
}

export default function middleware(request) {
  try {
    const url = new URL(request.url);

    if (url.hostname === 'moldraw.com') {
      url.hostname = 'www.moldraw.com';
      return Response.redirect(url.toString(), 301);
    }

    const junkTarget = resolveJunkPathRedirect(url.pathname);
    if (junkTarget) {
      return Response.redirect(new URL(junkTarget, url.origin).toString(), 301);
    }

    // Community SEO is vercel.json → /api/community. Never rewrite here:
    // a middleware throw 500s the whole page instead of serving static HTML.
    if (isCommunityPath(url.pathname)) return;

    const staticTarget = resolveExtensionlessRedirect(url.pathname);
    if (staticTarget) {
      url.pathname = staticTarget;
      return Response.redirect(url.toString(), 301);
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
    return rewriteOrContinue(apiUrl);
  } catch (error) {
    console.error('middleware failed open', error);
    return undefined;
  }
}

export const config = {
  matcher: [
    '/((?!community(?:/|$)|api/).*)',
  ],
};
