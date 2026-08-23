const fs = require("fs");
const path = require("path");

const chaptersDir = path.join(__dirname, "..", "public", "course", "chapters");
const robotsTag = '<meta name="robots" content="index,follow,max-image-preview:large">';

for (const file of fs.readdirSync(chaptersDir)) {
  if (!file.endsWith(".html")) continue;
  const filePath = path.join(chaptersDir, file);
  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes("name=\"robots\"") || html.includes("name='robots'")) continue;
  if (html.includes("<meta name=\"viewport\"")) {
    html = html.replace(
      /<meta name="viewport"[^>]*>/,
      (match) => `${match}\n  ${robotsTag}`
    );
  } else if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n  ${robotsTag}`);
  } else {
    continue;
  }
  fs.writeFileSync(filePath, html);
  console.log("patched", file);
}

console.log("course chapter robots tags updated");
