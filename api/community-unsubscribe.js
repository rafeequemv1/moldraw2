const SITE = 'https://www.moldraw.com';

const SUPABASE_URL =
  process.env.REACT_APP_SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://wwehouchqznsvnrosaeb.supabase.co';

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="canonical" href="${SITE}/community/unsubscribe">
</head>
<body style="margin:0;background:#f3f7f7;font-family:Georgia,serif;color:#16302b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:48px auto;background:#fff;border:1px solid #d0e0e0;border-radius:12px;">
    <tr><td style="padding:20px 24px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2C7A7B;">MolDraw Community</td></tr>
    <tr><td style="padding:0 24px 24px;font-size:20px;line-height:1.4;">${body}</td></tr>
    <tr><td style="padding:0 24px 28px;"><a href="${SITE}/community/" style="color:#2C7A7B;">Back to community</a></td></tr>
  </table>
</body>
</html>`;
}

function html(res, status, title, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(page(title, body));
}

function tokenFrom(req) {
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
  if (queryToken) return queryToken.trim();
  const url = new URL(req.url || '/', SITE);
  return (url.searchParams.get('token') || '').trim();
}

async function optOut(token) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key || !token || token.length < 16 || token.length > 128) return { ok: false, reason: 'invalid' };
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const found = await fetch(
    `${SUPABASE_URL}/rest/v1/community_email_unsubscribes?select=id,unsubscribed_at&token=eq.${encodeURIComponent(token)}&limit=1`,
    { headers },
  );
  const rows = await found.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.id) return { ok: false, reason: 'not_found' };
  if (row.unsubscribed_at) return { ok: true, already: true };
  const patched = await fetch(
    `${SUPABASE_URL}/rest/v1/community_email_unsubscribes?id=eq.${encodeURIComponent(row.id)}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
    },
  );
  if (!patched.ok) return { ok: false, reason: 'write_failed' };
  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    return res.send('Method not allowed');
  }
  const result = await optOut(tokenFrom(req));
  if (!result.ok) {
    return html(
      res,
      result.reason === 'not_found' ? 404 : 400,
      'Unsubscribe',
      'This unsubscribe link is invalid or has expired.',
    );
  }
  return html(
    res,
    200,
    'Unsubscribed',
    result.already
      ? 'You were already unsubscribed from MolDraw Community emails.'
      : 'You are unsubscribed from MolDraw Community notification emails.',
  );
};
