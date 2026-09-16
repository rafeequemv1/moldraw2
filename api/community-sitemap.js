const { renderCommunitySitemap } = require('../server/community-seo');

module.exports = async function handler(req, res) {
  try {
    const result = await renderCommunitySitemap();
    res.status(result.status);
    Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.send(result.body);
  } catch {
    res.status(503);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=30');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.moldraw.com/community/</loc>
  </url>
</urlset>
`);
  }
};
