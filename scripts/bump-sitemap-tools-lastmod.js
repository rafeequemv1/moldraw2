const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "public", "sitemap.xml");
let xml = fs.readFileSync(file, "utf8");

xml = xml.replace(/<lastmod>2024-01-01<\/lastmod>/g, "<lastmod>2026-03-29</lastmod>");

const NEW = "2026-03-29";
xml = xml.replace(
  /(<loc>https:\/\/www\.moldraw\.com\/tools\/[^<]+<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/g,
  `$1${NEW}$2`
);

fs.writeFileSync(file, xml);
console.log("sitemap updated");
