const SITE = 'https://www.moldraw.com';

const SUPABASE_URL =
  process.env.REACT_APP_SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://wwehouchqznsvnrosaeb.supabase.co';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(JSON.stringify(body));
}

function authorized(req) {
  const expected = process.env.COMMUNITY_NOTIFY_SECRET || '';
  if (!expected) return false;
  const header = req.headers['x-moldraw-notify-secret']
    || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return Boolean(header) && header === expected;
}

function slugFrom(text, fallback) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return raw || fallback;
}

function permalink(kind, id, title) {
  if (kind === 'feature') return `${SITE}/community/f/${id}/${slugFrom(title, 'feature-request')}`;
  return `${SITE}/community/p/${id}/${slugFrom(title, 'discussion')}`;
}

function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!key) return null;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };
}

async function supabaseGet(table, search) {
  const headers = serviceHeaders();
  if (!headers) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${search}`, { headers });
  if (!response.ok) return null;
  const data = await response.json();
  return Array.isArray(data) ? data[0] || null : data;
}

async function emailForUser(userId) {
  if (!userId) return '';
  const row = await supabaseGet('users', `select=email&id=eq.${encodeURIComponent(userId)}`);
  return String(row?.email || '').trim();
}

async function sendResend({ to, subject, html, text, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: 'missing_resend_key' };
  const from = process.env.RESEND_FROM || 'MolDraw <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': String(idempotencyKey || '').slice(0, 256),
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: payload?.message || `resend_${response.status}` };
  }
  return { id: payload?.id || null };
}

function brandedHtml({ heading, preview, href, cta }) {
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f4f7f5;font-family:Georgia,serif;color:#16302b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #d7e4dc;border-radius:12px;">
    <tr><td style="padding:20px 24px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#3d6b5c;">MolDraw Community</td></tr>
    <tr><td style="padding:0 24px 8px;font-size:22px;line-height:1.3;">${heading}</td></tr>
    <tr><td style="padding:0 24px 16px;font-size:16px;line-height:1.5;color:#35564c;">${preview}</td></tr>
    <tr><td style="padding:0 24px 28px;"><a href="${href}" style="display:inline-block;background:#1f6b4a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">${cta}</a></td></tr>
  </table>
</body>
</html>`;
}

async function notifyPostReply(record) {
  const postId = record?.post_id;
  const commenterId = record?.user_id;
  if (!postId) return { skipped: 'no_post' };
  const post = await supabaseGet(
    'community_posts',
    `select=id,user_id,title&id=eq.${encodeURIComponent(postId)}`,
  );
  if (!post?.user_id) return { skipped: 'no_author' };
  if (commenterId && commenterId === post.user_id) return { skipped: 'self_reply' };
  const to = await emailForUser(post.user_id);
  if (!to) return { skipped: 'no_email' };
  const href = permalink('post', post.id, post.title);
  const preview = String(record.body || 'Someone replied to your post.').slice(0, 180);
  return sendResend({
    to,
    subject: `New reply on “${post.title || 'your post'}”`,
    text: `${preview}\n\n${href}`,
    html: brandedHtml({
      heading: `New reply on “${post.title || 'your post'}”`,
      preview,
      href,
      cta: 'View the discussion',
    }),
    idempotencyKey: `community-reply/${record.id || postId}`,
  });
}

function statusLabel(value) {
  return String(value || '').replace(/_/g, ' ') || 'updated';
}

async function notifyFeatureStatus(record, oldRecord) {
  if (!record?.id) return { skipped: 'no_request' };
  if (oldRecord && String(oldRecord.status || '') === String(record.status || '')) {
    return { skipped: 'status_unchanged' };
  }
  const to = String(record.email || '').trim() || await emailForUser(record.user_id);
  if (!to) return { skipped: 'no_email' };
  if (record.updated_by && record.user_id && record.updated_by === record.user_id) {
    return { skipped: 'self_update' };
  }
  const href = permalink('feature', record.id, record.title);
  const label = statusLabel(record.status);
  return sendResend({
    to,
    subject: `Your feature request is now “${label}”`,
    text: `Status update: ${label}\n\n${href}`,
    html: brandedHtml({
      heading: `Your request is now “${label}”`,
      preview: record.title || 'A MolDraw feature request you submitted has a new status.',
      href,
      cta: 'Open the request',
    }),
    idempotencyKey: `feature-status/${record.id}/${record.status || 'updated'}`,
  });
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return json(res, 400, { error: 'invalid_json' });
  }

  const table = String(payload.table || payload.type || '');
  const type = String(payload.type || payload.event || '').toUpperCase();
  const record = payload.record || payload.new || payload.row || null;
  const oldRecord = payload.old_record || payload.old || null;

  try {
    if ((table === 'community_comments' || payload.table === 'community_comments') && type === 'INSERT') {
      return json(res, 200, await notifyPostReply(record));
    }
    if (
      (table === 'feature_requests' || table === 'community_feature_requests')
      && type === 'UPDATE'
    ) {
      return json(res, 200, await notifyFeatureStatus(record, oldRecord));
    }
    return json(res, 202, { skipped: 'unhandled_event', table, type });
  } catch (error) {
    console.error('community notify failed', error);
    return json(res, 200, { skipped: 'handler_error' });
  }
};
