const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "public", "tools", "free-chem-tools");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));

const pairs = [
  ["| MolDraw Free Chem Tools", "| MolDraw"],
  ["| Free Chemist Tools", "| MolDraw"],
  ["| MolDraw Tools", "| MolDraw"],
  ["| Free Chemistry Tool", "| MolDraw"],
];

for (const f of files) {
  const p = path.join(dir, f);
  let c = fs.readFileSync(p, "utf8");
  const orig = c;
  for (const [from, to] of pairs) {
    c = c.split(from).join(to);
  }
  if (c !== orig) {
    fs.writeFileSync(p, c);
    console.log("updated", f);
  }
}
