const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const OUT = path.join(PUBLIC, "sitemap.xml");
const BASE = "https://www.moldraw.com";
const TODAY = new Date().toISOString().slice(0, 10);

const SKIP_DIRS = new Set(["ketcher", "dashboard"]);
const SKIP_FILES = new Set(["ketcher-editor.html", "ketcher-bridge.html"]);

function walk(dir) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      entries.push(...walk(full));
    } else if (item.name.endsWith(".html")) {
      entries.push(full);
    }
  }
  return entries;
}

function inferUrl(relPath) {
  if (relPath === "index.html") return `${BASE}/`;
  if (relPath.endsWith("/index.html")) {
    return `${BASE}/${relPath.replace(/\/index\.html$/, "/")}`;
  }
  return `${BASE}/${relPath}`;
}

function readCanonical(html) {
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  return match ? match[1].trim() : null;
}

function isNoindex(html) {
  const match = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  if (!match) return false;
  return /noindex/i.test(match[1]);
}

function priorityFor(url) {
  if (url === `${BASE}/`) return "1.0";
  if (url === `${BASE}/tools/` || url === `${BASE}/blog/`) return "0.8";
  if (url.startsWith(`${BASE}/tools/free-chem-tools/`)) return "0.72";
  if (url.startsWith(`${BASE}/blog/`)) return "0.74";
  if (url.startsWith(`${BASE}/course/`)) return "0.7";
  if (url.startsWith(`${BASE}/reaction/`)) return "0.68";
  if (url.startsWith(`${BASE}/pages/`)) return "0.65";
  if (url === `${BASE}/community/`) return "0.66";
  return "0.6";
}

function changefreqFor(url) {
  if (url === `${BASE}/`) return "weekly";
  if (url.includes("/tools/")) return "monthly";
  return "monthly";
}

const files = walk(PUBLIC).filter((file) => !SKIP_FILES.has(path.basename(file)));
const urlSet = new Map();

for (const file of files) {
  const rel = path.relative(PUBLIC, file).split(path.sep).join("/");
  const html = fs.readFileSync(file, "utf8");
  if (isNoindex(html)) continue;

  const canonical = readCanonical(html);
  const url = canonical && canonical.startsWith(BASE) ? canonical : inferUrl(rel);
  if (!url.startsWith(BASE)) continue;

  if (!urlSet.has(url)) {
    urlSet.set(url, { url, file: rel });
  }
}

const urls = [...urlSet.values()].sort((a, b) => a.url.localeCompare(b.url));
const home = urls.find((entry) => entry.url === `${BASE}/`);
const rest = urls.filter((entry) => entry.url !== `${BASE}/`);
const ordered = home ? [home, ...rest] : urls;

const body = ordered
  .map((entry) => {
    const loc = entry.url;
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${TODAY}</lastmod>`,
      `    <changefreq>${changefreqFor(loc)}</changefreq>`,
      `    <priority>${priorityFor(loc)}</priority>`,
      "  </url>",
    ].join("\n");
  })
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

fs.writeFileSync(OUT, xml);
console.log(`Wrote ${ordered.length} URLs to ${OUT} (lastmod ${TODAY})`);
