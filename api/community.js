const fs = require('node:fs');
const path = require('node:path');

function sendStaticCommunity(res) {
  const candidates = [
    path.join(__dirname, '../public/community/index.html'),
    path.join(process.cwd(), 'public/community/index.html'),
    path.join(process.cwd(), 'dist/community/index.html'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=30');
        return res.send(fs.readFileSync(file, 'utf8'));
      }
    } catch {
      // try next candidate
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=30');
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MolDraw Community</title>
  <link rel="canonical" href="https://www.moldraw.com/community/">
</head>
<body>
  <p>MolDraw Community is loading the static page.</p>
  <p><a href="/community/">Retry community</a></p>
</body>
</html>`);
}

module.exports = async function handler(req, res) {
  try {
    const { renderCommunityPageSafe } = require('../server/community-seo');
    const pathname = typeof req.query.path === 'string' && req.query.path
      ? req.query.path
      : (req.url || '/community/').split('?')[0];

    const result = await renderCommunityPageSafe(pathname, {
      accept: req.headers.accept || '',
    });
    if (!result?.body) return sendStaticCommunity(res);
    res.status(result.status);
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    return res.send(result.body);
  } catch (error) {
    console.error('community API failed open', error);
    return sendStaticCommunity(res);
  }
};
