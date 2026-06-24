const { wantsMarkdown, resolveMarkdownPath } = require('../server/agent-discovery');

const AGENT_LINK_HEADER = [
  '</llms.txt>; rel="llms-txt"; type="text/plain"',
  '</.well-known/mcp.json>; rel="mcp-server-card"; type="application/json"',
  '</.well-known/agent-skills/index.json>; rel="agent-skills"; type="application/json"',
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
].join(', ');

module.exports = async function handler(req, res) {
  const pagePath = typeof req.query.path === 'string' ? req.query.path : '/';
  const mdPath = resolveMarkdownPath(pagePath);
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.moldraw.com';
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  const mdUrl = `${protocol}://${host}/md${mdPath}`;

  let content = '';
  try {
    const response = await fetch(mdUrl);
    if (response.ok) {
      content = await response.text();
    }
  } catch {
    content = '';
  }

  if (!content.trim()) {
    content = [
      '# MolDraw',
      '',
      `Requested path: ${pagePath}`,
      '',
      'MolDraw is a free browser chemical structure editor and 3D viewer.',
      '',
      '- Site index: https://www.moldraw.com/llms.txt',
      '- Tools: https://www.moldraw.com/tools/',
      '- Editor: https://www.moldraw.com/',
      '',
    ].join('\n');
  }

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Vary', 'Accept');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Link', AGENT_LINK_HEADER);
  return res.status(200).send(content);
};
