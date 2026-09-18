import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SNIPPET = '<script defer src="https://data.moldraw.com/piqo.js" data-site="i9cwwugh"></script>';
const SKIP_DIRS = new Set(["ketcher"]);
const SKIP_FILES = new Set(["ketcher-editor.html", "ketcher-bridge.html"]);

function hasSnippet(html) {
  return /data-site=["']i9cwwugh["']/.test(html) || html.includes("data.moldraw.com/piqo.js");
}

function walk(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (SKIP_DIRS.has(item.name)) continue;
      out.push(...walk(full));
    } else if (item.name.endsWith(".html") && !SKIP_FILES.has(item.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = [path.join(ROOT, "index.html"), ...walk(PUBLIC)];
let added = 0;
let skipped = 0;
const addedFiles = [];

for (const file of files) {
  let html = fs.readFileSync(file, "utf8");
  if (hasSnippet(html)) {
    skipped += 1;
    continue;
  }
  if (!/<head[^>]*>/i.test(html)) {
    console.warn("NO_HEAD", path.relative(ROOT, file));
    continue;
  }
  html = html.replace(/<head[^>]*>/i, (match) => `${match}\n  ${SNIPPET}`);
  fs.writeFileSync(file, html);
  added += 1;
  addedFiles.push(path.relative(ROOT, file).split(path.sep).join("/"));
}

console.log(`Added piqo snippet to ${added} files; ${skipped} already had it.`);
if (addedFiles.length) {
  console.log(addedFiles.join("\n"));
}
