const { renderCommunityPage } = require('../server/community-seo');

module.exports = async function handler(req, res) {
  const pathname = typeof req.query.path === 'string' && req.query.path
    ? req.query.path
    : (req.url || '/community/').split('?')[0];

  try {
    const result = await renderCommunityPage(pathname, {
      accept: req.headers.accept || '',
    });
    res.status(result.status);
    Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.send(result.body);
  } catch {
    res.status(503);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Community unavailable | MolDraw</title>
  <meta name="robots" content="noindex,follow">
  <link rel="canonical" href="https://www.moldraw.com/community/">
</head>
<body>
  <main>
    <h1>MolDraw Community is temporarily unavailable</h1>
    <p>Public posts are still intended to be readable without signing in. Please retry shortly.</p>
    <p><a href="/community/">Back to community</a></p>
  </main>
</body>
</html>`);
  }
};
