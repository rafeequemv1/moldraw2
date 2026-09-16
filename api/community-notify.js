const crypto = require('node:crypto');

const SITE = 'https://www.moldraw.com';
function fromAddress() {
  const configured = String(process.env.RESEND_FROM || '').trim();
  if (/@rafeeque\.com>/i.test(configured) || /@rafeeque\.com$/i.test(configured)) {
    return configured.includes('<') ? configured : `MolDraw <${configured}>`;
  }
  return 'MolDraw <notify@rafeeque.com>';
}

const FROM = fromAddress();
const REPLY_TO = process.env.RESEND_REPLY_TO || 'rafeequemavoor@gmail.com';

const SUPABASE_URL =
  process.env.REACT_APP_SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://wwehouchqznsvnrosaeb.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.REACT_APP_SUPABASE_ANON_KEY
  || 'sb_publishable_lP5X_egPBmD__qqKPjyoyg_M4iNUj_C';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  if (kind === 'feature-comment') return `${SITE}/community/fc/${id}/${slugFrom(title, 'comment')}`;
  if (kind === 'comment') return `${SITE}/community/c/${id}/${slugFrom(title, 'comment')}`;
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

function uuidParam(value) {
  const text = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return '';
  }
  return text;
}

async function supabaseRequest(method, path, { search = '', body, extraHeaders } = {}) {
  const headers = serviceHeaders();
  if (!headers) return { ok: false, status: 0, data: null };
  const url = `${SUPABASE_URL}/rest/v1/${path}${search ? `?${search}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function supabaseGet(table, search) {
  const { ok, data } = await supabaseRequest('GET', table, { search });
  if (!ok || !data) return null;
  return Array.isArray(data) ? data[0] || null : data;
}

async function supabaseQuery(table, search) {
  const { ok, data } = await supabaseRequest('GET', table, { search });
  if (!ok || !Array.isArray(data)) return [];
  return data;
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function isUnsubscribed({ userId, email }) {
  const filters = [];
  if (userId && uuidParam(userId)) filters.push(`user_id.eq.${uuidParam(userId)}`);
  if (email) filters.push(`email.eq.${encodeURIComponent(String(email).trim().toLowerCase())}`);
  if (!filters.length) return false;
  const rows = await supabaseQuery(
    'community_email_unsubscribes',
    `select=id,unsubscribed_at&or=(${filters.join(',')})&unsubscribed_at=not.is.null&limit=1`,
  );
  return Boolean(rows[0]);
}

async function ensureUnsubToken({ userId, email }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return '';
  const filters = [`email.eq.${encodeURIComponent(normalized)}`];
  if (userId && uuidParam(userId)) filters.push(`user_id.eq.${uuidParam(userId)}`);
  const existing = await supabaseGet(
    'community_email_unsubscribes',
    `select=token,unsubscribed_at&or=(${filters.join(',')})&limit=1`,
  );
  if (existing?.unsubscribed_at) return '';
  if (existing?.token) return existing.token;
  const token = newToken();
  const { ok } = await supabaseRequest('POST', 'community_email_unsubscribes', {
    body: {
      user_id: userId && uuidParam(userId) ? userId : null,
      email: normalized,
      token,
    },
    extraHeaders: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
  });
  if (!ok) {
    const retry = await supabaseGet(
      'community_email_unsubscribes',
      `select=token,unsubscribed_at&email=eq.${encodeURIComponent(normalized)}&limit=1`,
    );
    return retry?.unsubscribed_at ? '' : (retry?.token || '');
  }
  return token;
}

async function claimEvent(eventKey) {
  const { ok, status } = await supabaseRequest('POST', 'community_notify_log', {
    body: { event_key: String(eventKey).slice(0, 240) },
    extraHeaders: { Prefer: 'return=minimal' },
  });
  if (ok) return true;
  if (status === 409) return false;
  return true;
}

async function emailForUser(userId) {
  if (!uuidParam(userId)) return '';
  const row = await supabaseGet('users', `select=email&id=eq.${encodeURIComponent(userId)}`);
  return String(row?.email || '').trim().toLowerCase();
}

async function sendResend({ to, subject, html, text, idempotencyKey, unsubUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: 'missing_resend_key' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': String(idempotencyKey || '').slice(0, 256),
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: [REPLY_TO],
      subject,
      html,
      text,
      headers: unsubUrl
        ? {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
        : undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: payload?.message || `resend_${response.status}` };
  }
  return { id: payload?.id || null };
}

function brandedHtml({ heading, preview, href, cta, unsubUrl }) {
  const footer = unsubUrl
    ? `<tr><td style="padding:0 24px 24px;font-size:12px;line-height:1.5;color:#7a9088;">
        You’re receiving this because of activity on MolDraw Community.
        <a href="${escapeHtml(unsubUrl)}" style="color:#3d6b5c;">Unsubscribe</a>
      </td></tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f4f7f5;font-family:Georgia,serif;color:#16302b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #d7e4dc;border-radius:12px;">
    <tr><td style="padding:20px 24px 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#3d6b5c;">MolDraw Community</td></tr>
    <tr><td style="padding:0 24px 8px;font-size:22px;line-height:1.3;">${escapeHtml(heading)}</td></tr>
    <tr><td style="padding:0 24px 16px;font-size:16px;line-height:1.5;color:#35564c;">${escapeHtml(preview)}</td></tr>
    <tr><td style="padding:0 24px 28px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1f6b4a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">${escapeHtml(cta)}</a></td></tr>
    ${footer}
  </table>
</body>
</html>`;
}

async function deliver({ userId, email, subject, heading, preview, href, cta, eventKey }) {
  const to = String(email || '').trim().toLowerCase() || await emailForUser(userId);
  if (!to) return { skipped: 'no_email' };
  if (await isUnsubscribed({ userId, email: to })) return { skipped: 'unsubscribed' };
  if (!(await claimEvent(eventKey))) return { skipped: 'already_sent' };
  const token = await ensureUnsubToken({ userId, email: to });
  if (!token && await isUnsubscribed({ userId, email: to })) return { skipped: 'unsubscribed' };
  const unsubUrl = token ? `${SITE}/community/unsubscribe?token=${encodeURIComponent(token)}` : '';
  return sendResend({
    to,
    subject,
    text: `${preview}\n\n${href}${unsubUrl ? `\n\nUnsubscribe: ${unsubUrl}` : ''}`,
    html: brandedHtml({ heading, preview, href, cta, unsubUrl }),
    idempotencyKey: eventKey,
    unsubUrl,
  });
}

async function getAuthUser(token) {
  if (!token || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id ? user : null;
}

function bearerToken(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

async function dbWebhookSecret() {
  const row = await supabaseGet('community_notify_settings', 'select=webhook_secret&id=eq.1');
  return String(row?.webhook_secret || '');
}

async function secretAuthorized(req) {
  const header = String(req.headers['x-moldraw-notify-secret'] || '').trim()
    || (bearerToken(req).includes('.') ? '' : bearerToken(req));
  if (!header) return false;
  const expected = process.env.COMMUNITY_NOTIFY_SECRET || '';
  if (expected && header === expected) return true;
  const dbSecret = await dbWebhookSecret();
  return Boolean(dbSecret) && header === dbSecret;
}

async function isAdminUser(userId) {
  if (!uuidParam(userId)) return false;
  const row = await supabaseGet('users', `select=is_admin,role&id=eq.${encodeURIComponent(userId)}`);
  return Boolean(row?.is_admin || row?.role === 'admin');
}

function statusLabel(value) {
  return String(value || '').replace(/_/g, ' ') || 'updated';
}

async function notifyFeatureStatus(record, oldRecord, auth) {
  const id = uuidParam(record?.id);
  if (!id) return { skipped: 'no_request' };
  const current = await supabaseGet(
    'feature_requests',
    `select=id,user_id,email,title,status&id=eq.${encodeURIComponent(id)}`,
  );
  if (!current) return { skipped: 'missing_row' };
  if (oldRecord && String(oldRecord.status || '') === String(current.status || '')) {
    return { skipped: 'status_unchanged' };
  }
  if (auth?.via === 'jwt' && !(await isAdminUser(auth.user.id))) {
    return { skipped: 'not_admin' };
  }
  const to = String(current.email || '').trim().toLowerCase() || await emailForUser(current.user_id);
  if (current.user_id && auth?.via === 'jwt' && auth.user.id === current.user_id) {
    return { skipped: 'self_update' };
  }
  const href = permalink('feature', current.id, current.title);
  const label = statusLabel(current.status);
  return deliver({
    userId: current.user_id,
    email: to,
    subject: `Your feature request is now “${label}”`,
    heading: `Your request is now “${label}”`,
    preview: current.title || 'A MolDraw feature request you submitted has a new status.',
    href,
    cta: 'Open the request',
    eventKey: `feature-status/${current.id}/${current.status || 'updated'}`,
  });
}

function addRecipient(recipients, { userId, email, kind, subject, heading, preview, href, cta }) {
  const normalized = String(email || '').trim().toLowerCase();
  const key = uuidParam(userId) || normalized;
  if (!key) return;
  if (recipients.has(key)) return;
  recipients.set(key, { userId, email: normalized, kind, subject, heading, preview, href, cta });
}

async function notifyComment(source, record, auth) {
  const commentId = uuidParam(record?.id);
  if (!commentId) return { skipped: 'no_comment' };
  const comment = await supabaseGet(
    source,
    source === 'feature_request_comments'
      ? `select=id,feature_request_id,parent_comment_id,user_id,body,author_name,status&id=eq.${encodeURIComponent(commentId)}`
      : `select=id,post_id,parent_comment_id,user_id,body,author_name,status&id=eq.${encodeURIComponent(commentId)}`,
  );
  if (!comment || comment.status === 'hidden') return { skipped: 'missing_row' };
  if (auth?.via === 'jwt' && auth.user.id !== comment.user_id && !(await isAdminUser(auth.user.id))) {
    return { skipped: 'not_actor' };
  }

  const actorId = comment.user_id;
  const actorName = comment.author_name || 'Someone';
  const preview = String(comment.body || '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'New activity on MolDraw Community.';
  const href = source === 'feature_request_comments'
    ? permalink('feature-comment', comment.id, comment.body)
    : permalink('comment', comment.id, comment.body);
  const recipients = new Map();

  if (comment.parent_comment_id) {
    const parent = await supabaseGet(
      source,
      `select=id,user_id&id=eq.${encodeURIComponent(comment.parent_comment_id)}`,
    );
    if (parent?.user_id && parent.user_id !== actorId) {
      addRecipient(recipients, {
        userId: parent.user_id,
        email: await emailForUser(parent.user_id),
        kind: 'reply',
        subject: `${actorName} replied to your comment`,
        heading: `${actorName} replied to your comment`,
        preview,
        href,
        cta: 'View the reply',
      });
    }
  } else if (source === 'community_comments') {
    const post = await supabaseGet(
      'community_posts',
      `select=id,user_id,title&id=eq.${encodeURIComponent(comment.post_id)}`,
    );
    if (post?.user_id && post.user_id !== actorId) {
      addRecipient(recipients, {
        userId: post.user_id,
        email: await emailForUser(post.user_id),
        kind: 'post_comment',
        subject: `New comment on “${post.title || 'your post'}”`,
        heading: `New comment on “${post.title || 'your post'}”`,
        preview,
        href: permalink('post', post.id, post.title),
        cta: 'View the discussion',
      });
    }
  } else {
    const request = await supabaseGet(
      'feature_requests',
      `select=id,user_id,email,title&id=eq.${encodeURIComponent(comment.feature_request_id)}`,
    );
    const requestEmail = String(request?.email || '').trim().toLowerCase();
    const actorEmail = await emailForUser(actorId);
    if (request && request.user_id !== actorId && (!requestEmail || requestEmail !== actorEmail)) {
      addRecipient(recipients, {
        userId: request.user_id,
        email: requestEmail || await emailForUser(request.user_id),
        kind: 'feature_comment',
        subject: `New comment on “${request.title || 'your request'}”`,
        heading: `New comment on “${request.title || 'your request'}”`,
        preview,
        href: permalink('feature', request.id, request.title),
        cta: 'Open the request',
      });
    }
  }

  const mentions = await supabaseQuery(
    'community_comment_mentions',
    `select=mentioned_user_id&source=eq.${encodeURIComponent(source)}&comment_id=eq.${encodeURIComponent(commentId)}`,
  );
  for (const mention of mentions) {
    if (!mention.mentioned_user_id || mention.mentioned_user_id === actorId) continue;
    const email = await emailForUser(mention.mentioned_user_id);
    addRecipient(recipients, {
      userId: mention.mentioned_user_id,
      email,
      kind: 'mention',
      subject: `${actorName} mentioned you in a comment`,
      heading: `${actorName} mentioned you`,
      preview,
      href,
      cta: 'View the comment',
    });
  }

  const results = [];
  for (const recipient of recipients.values()) {
    if (recipient.userId && recipient.userId === actorId) continue;
    results.push(await deliver({
      ...recipient,
      eventKey: `community-comment/${commentId}/${recipient.userId || recipient.email}`,
    }));
  }
  return { sent: results.length, results };
}

async function notifyMention(record, auth) {
  const commentId = uuidParam(record?.comment_id);
  const source = record?.source === 'feature_request_comments'
    ? 'feature_request_comments'
    : 'community_comments';
  if (!commentId) return { skipped: 'no_comment' };
  return notifyComment(source, { id: commentId }, auth);
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

  let payload;
  try {
    payload = await readJson(req);
  } catch {
    return json(res, 400, { error: 'invalid_json' });
  }

  const table = String(payload.table || '');
  const type = String(payload.type || payload.event || '').toUpperCase();
  const record = payload.record || payload.new || payload.row || null;
  const oldRecord = payload.old_record || payload.old || null;
  const token = bearerToken(req);
  const jwtUser = token.includes('.') ? await getAuthUser(token) : null;
  const viaSecret = await secretAuthorized(req);
  const auth = viaSecret
    ? { via: 'secret' }
    : (jwtUser ? { via: 'jwt', user: jwtUser } : null);

  if (!viaSecret && !jwtUser) {
    return json(res, 401, { error: 'unauthorized' });
  }

  try {
    if (table === 'community_comments' && type === 'INSERT') {
      return json(res, 200, await notifyComment('community_comments', record, auth));
    }
    if (table === 'feature_request_comments' && type === 'INSERT') {
      return json(res, 200, await notifyComment('feature_request_comments', record, auth));
    }
    if (table === 'community_comment_mentions' && type === 'INSERT') {
      return json(res, 200, await notifyMention(record, auth));
    }
    if (
      (table === 'feature_requests' || table === 'community_feature_requests')
      && type === 'UPDATE'
    ) {
      if (!viaSecret && !(jwtUser && await isAdminUser(jwtUser.id))) {
        return json(res, 401, { error: 'unauthorized' });
      }
      return json(res, 200, await notifyFeatureStatus(record, oldRecord, auth));
    }
    return json(res, 202, { skipped: 'unhandled_event', table, type });
  } catch (error) {
    console.error('community notify failed', error);
    return json(res, 200, { skipped: 'handler_error' });
  }
};
