const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://www.moldraw.com';
const PAGE_SIZE = 20;
const COMMENT_LIMIT = 100;
const LIST_COMMENT_PREVIEW = 3;
const SITEMAP_PAGE = 1000;
const SITEMAP_CAP = 20000;

const SUPABASE_URL =
  process.env.REACT_APP_SUPABASE_URL
  || process.env.VITE_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://wwehouchqznsvnrosaeb.supabase.co';

const SUPABASE_KEY =
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'sb_publishable_lP5X_egPBmD__qqKPjyoyg_M4iNUj_C';

const POST_SELECT = 'id,user_id,title,body,image_urls,author_name,author_designation,author_avatar_key,author_is_admin,author_karma_score,upvote_count,comment_count,created_at';
const COMMENT_SELECT = 'id,post_id,parent_comment_id,user_id,body,image_urls,author_name,author_designation,author_avatar_key,author_is_admin,author_karma_score,created_at';
const FEATURE_SELECT = 'id,name,title,description,image_urls,status,upvote_count,created_at';
const FEATURE_COMMENT_SELECT = 'id,feature_request_id,parent_comment_id,user_id,body,image_urls,author_name,author_designation,author_avatar_key,author_is_admin,author_karma_score,created_at';

let templateCache = null;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const SLUG_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'for', 'in', 'on', 'at', 'by',
  'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this',
  'that', 'these', 'those', 'it', 'its', 'into', 'about', 'over', 'under', 'than',
  'then', 'so', 'if', 'not', 'no', 'yes', 'you', 'your', 'we', 'our', 'they',
  'their', 'can', 'could', 'should', 'would', 'may', 'might', 'will', 'just',
  'also', 'more', 'most', 'some', 'any', 'how', 'what', 'when', 'where', 'which',
  'who', 'why', 'do', 'does', 'did', 'have', 'has', 'had', 'my', 'me', 'please',
  'help', 'hi', 'hey', 'via',
]);

function seoSlug(text, { max = 72, fallback = 'post' } = {}) {
  const raw = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const words = raw.split(/\s+/).filter(Boolean);
  const kept = [];
  for (const word of words) {
    if (SLUG_STOPWORDS.has(word)) continue;
    if (word.length === 1 && !/[0-9]/.test(word)) continue;
    kept.push(word);
    if (kept.join('-').length >= max) break;
  }
  let slug = kept.join('-').slice(0, max).replace(/-+$/g, '');
  if (!slug) {
    slug = raw.replace(/\s+/g, '-').slice(0, max).replace(/^-+|-+$/g, '') || fallback;
  }
  return slug || fallback;
}

function isSafeId(id) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''));
}

function isSafeRemoteUrl(url) {
  const value = String(url || '').trim();
  return /^https?:\/\//i.test(value) && !value.includes('${');
}

function excerpt(text, max = 158) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function timeText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function isoDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function initials(name) {
  return String(name || 'M').trim().slice(0, 1).toUpperCase() || 'M';
}

function safeAvatarKey(key) {
  return ['avatar-teal', 'avatar-blue', 'avatar-purple', 'avatar-amber'].includes(key) ? key : 'avatar-teal';
}

function adminBadge(value) {
  return value ? '<span class="admin-badge">Admin</span>' : '';
}

function karmaBadge(value) {
  return `<span class="karma-badge">${Math.max(0, Number(value) || 0)} karma</span>`;
}

function discussionPath(post) {
  const id = typeof post === 'string' ? post : post?.id;
  const title = typeof post === 'object' ? post?.title : '';
  const slug = seoSlug(title, { fallback: 'discussion' });
  return `/community/p/${id}/${slug}`;
}

function featurePath(request) {
  const id = typeof request === 'string' ? request : request?.id;
  const title = typeof request === 'object' ? request?.title : '';
  const slug = seoSlug(title, { fallback: 'feature-request' });
  return `/community/f/${id}/${slug}`;
}

function commentPath(comment) {
  const id = typeof comment === 'string' ? comment : comment?.id;
  const body = typeof comment === 'object' ? comment?.body : '';
  const slug = seoSlug(body, { max: 56, fallback: 'comment' });
  return `/community/c/${id}/${slug}`;
}

function featureCommentPath(comment) {
  const id = typeof comment === 'string' ? comment : comment?.id;
  const body = typeof comment === 'object' ? comment?.body : '';
  const slug = seoSlug(body, { max: 56, fallback: 'comment' });
  return `/community/fc/${id}/${slug}`;
}

function absUrl(pathname) {
  return `${SITE}${pathname}`;
}

function parseCommunityPath(pathname) {
  let raw = String(pathname || '/');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const path = raw.replace(/\/+$/, '') || '/';
  if (path === '/community') return { view: 'list', kind: 'discussions', page: 1 };
  if (path === '/community/features') return { view: 'list', kind: 'features', page: 1 };

  let match = path.match(/^\/community\/page\/(\d+)$/);
  if (match) return { view: 'list', kind: 'discussions', page: Math.max(1, Number(match[1])) };

  match = path.match(/^\/community\/features\/page\/(\d+)$/);
  if (match) return { view: 'list', kind: 'features', page: Math.max(1, Number(match[1])) };

  match = path.match(/^\/community\/p\/([^/]+)(?:\/([^/]+))?$/);
  if (match) return { view: 'post', id: match[1], slug: match[2] || '' };

  match = path.match(/^\/community\/c\/([^/]+)(?:\/([^/]+))?$/);
  if (match) return { view: 'comment', id: match[1], slug: match[2] || '' };

  match = path.match(/^\/community\/f\/([^/]+)(?:\/([^/]+))?$/);
  if (match) return { view: 'feature', id: match[1], slug: match[2] || '' };

  match = path.match(/^\/community\/fc\/([^/]+)(?:\/([^/]+))?$/);
  if (match) return { view: 'feature-comment', id: match[1], slug: match[2] || '' };

  return null;
}

function isCommunitySeoPath(pathname) {
  const path = String(pathname || '').split('?')[0];
  if (path === '/community/sitemap.xml') return true;
  return Boolean(parseCommunityPath(path));
}

function wantsMarkdown(acceptHeader) {
  const header = String(acceptHeader || '').toLowerCase();
  if (!header.includes('text/markdown')) return false;
  const parts = header.split(',').map((part) => {
    const [type, ...params] = part.trim().split(';');
    const qParam = params.find((item) => item.trim().startsWith('q='));
    const q = qParam ? Number.parseFloat(qParam.split('=')[1]) : 1;
    return { type: type.trim(), q: Number.isFinite(q) ? q : 1 };
  });
  const markdownQ = parts.find((part) => part.type === 'text/markdown')?.q ?? 0;
  const htmlQ = parts.find((part) => part.type === 'text/html')?.q ?? 0;
  return markdownQ >= htmlQ;
}

function loadTemplate() {
  if (templateCache) return templateCache;
  const candidates = [
    path.join(__dirname, '../public/community/index.html'),
    path.join(process.cwd(), 'public/community/index.html'),
    path.join(process.cwd(), 'dist/community/index.html'),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      templateCache = fs.readFileSync(file, 'utf8');
      return templateCache;
    }
  }
  throw new Error('Community HTML template not found');
}

async function supabaseQuery(table, search, { range } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${search}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
  };
  if (range) headers.Range = `${range.from}-${range.to}`;
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Supabase ${table} ${response.status}`);
    error.status = response.status;
    error.body = text.slice(0, 240);
    throw error;
  }
  const contentRange = response.headers.get('content-range') || '';
  const totalMatch = contentRange.match(/\/(\d+|\*)\s*$/);
  const total = totalMatch && totalMatch[1] !== '*' ? Number(totalMatch[1]) : null;
  return { data: text ? JSON.parse(text) : [], total, contentRange };
}

function encodeEq(value) {
  return encodeURIComponent(String(value));
}

async function fetchPostsPage(page) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  return supabaseQuery(
    'community_posts',
    `select=${POST_SELECT}&order=created_at.desc`,
    { range: { from, to } },
  );
}

async function fetchFeaturesPage(page) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  return supabaseQuery(
    'community_feature_requests',
    `select=${FEATURE_SELECT}&order=upvote_count.desc,created_at.desc`,
    { range: { from, to } },
  );
}

async function fetchPost(id) {
  const { data } = await supabaseQuery(
    'community_posts',
    `select=${POST_SELECT}&id=eq.${encodeEq(id)}`,
  );
  return data[0] || null;
}

async function fetchFeature(id) {
  const { data } = await supabaseQuery(
    'community_feature_requests',
    `select=${FEATURE_SELECT}&id=eq.${encodeEq(id)}`,
  );
  return data[0] || null;
}

async function fetchCommentsForPosts(postIds, limit = COMMENT_LIMIT) {
  if (!postIds.length) return [];
  const inList = `(${postIds.map(encodeEq).join(',')})`;
  const { data } = await supabaseQuery(
    'community_comments',
    `select=${COMMENT_SELECT}&post_id=in.${inList}&order=created_at.asc`,
    { range: { from: 0, to: Math.max(limit - 1, 0) } },
  );
  return data;
}

async function fetchFeatureComments(requestIds, limit = COMMENT_LIMIT) {
  if (!requestIds.length) return [];
  const inList = `(${requestIds.map(encodeEq).join(',')})`;
  try {
    const { data } = await supabaseQuery(
      'feature_request_comments',
      `select=${FEATURE_COMMENT_SELECT}&feature_request_id=in.${inList}&order=created_at.asc`,
      { range: { from: 0, to: Math.max(limit - 1, 0) } },
    );
    return data;
  } catch {
    return [];
  }
}

async function fetchComment(id) {
  const { data } = await supabaseQuery(
    'community_comments',
    `select=${COMMENT_SELECT}&id=eq.${encodeEq(id)}`,
  );
  return data[0] || null;
}

async function fetchFeatureComment(id) {
  try {
    const { data } = await supabaseQuery(
      'feature_request_comments',
      `select=${FEATURE_COMMENT_SELECT}&id=eq.${encodeEq(id)}`,
    );
    return data[0] || null;
  } catch {
    return null;
  }
}

async function fetchAllRows(table, select, order) {
  const rows = [];
  let from = 0;
  while (rows.length < SITEMAP_CAP) {
    const to = from + SITEMAP_PAGE - 1;
    const { data } = await supabaseQuery(table, `select=${select}&order=${order}`, { range: { from, to } });
    rows.push(...data);
    if (data.length < SITEMAP_PAGE) break;
    from += SITEMAP_PAGE;
  }
  return rows;
}

function groupBy(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const id = item[key];
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
  });
  return map;
}

function buildCommentTree(comments) {
  const byId = new Map();
  const roots = [];
  comments.forEach((comment) => byId.set(comment.id, { ...comment, replies: [] }));
  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(comment.parent_comment_id)) {
      let root = byId.get(comment.parent_comment_id);
      while (root?.parent_comment_id && byId.has(root.parent_comment_id)) {
        root = byId.get(root.parent_comment_id);
      }
      root.replies.push(comment);
    } else {
      roots.push(comment);
    }
  });
  return roots;
}

function renderImages(imageUrls, altText) {
  const images = Array.isArray(imageUrls) ? imageUrls.filter(isSafeRemoteUrl) : [];
  if (!images.length) return '';
  return `<div class="card-images">${images.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(url)}" loading="lazy" alt="${escapeHtml(altText)}"></a>`).join('')}</div>`;
}

function renderSingleComment(comment, { permalinkHref, heading = 'h3', showAllReplies = true, highlightId = '' }) {
  const replies = showAllReplies ? (comment.replies || []) : (comment.replies || []).slice(0, 2);
  const hiddenReplies = Math.max((comment.replies || []).length - replies.length, 0);
  const replyHtml = replies.map((reply) => renderSingleComment(reply, { permalinkHref, heading, showAllReplies, highlightId })).join('');
  const images = renderImages(comment.image_urls, 'Reply attachment');
  const highlighted = highlightId && comment.id === highlightId;
  return `
        <article class="comment${comment.parent_comment_id ? ' comment-reply' : ''}${highlighted ? ' is-highlight' : ''}" id="comment-${escapeHtml(comment.id)}" data-comment-id="${escapeHtml(comment.id)}">
          <${heading} class="comment-heading">${escapeHtml(comment.author_name || 'Community member')}</${heading}>
          <div class="author" style="margin-bottom:3px;">
            <span class="avatar ${escapeHtml(safeAvatarKey(comment.author_avatar_key))}" style="width:24px;height:24px;font-size:10px;">${escapeHtml(initials(comment.author_name))}</span>
            <div>
              <strong>${escapeHtml(comment.author_name || 'Community member')} ${adminBadge(comment.author_is_admin)} ${karmaBadge(comment.author_karma_score)}</strong>
              <div class="author-meta">${escapeHtml(comment.author_designation || 'MolDraw user')} · <time datetime="${escapeHtml(isoDate(comment.created_at) || '')}">${escapeHtml(timeText(comment.created_at))}</time></div>
            </div>
          </div>
          <p class="comment-body">${escapeHtml(comment.body)}</p>
          ${images}
          <p class="comment-tools"><a class="comment-permalink" href="${escapeHtml(permalinkHref(comment))}">Permalink</a></p>
          ${replyHtml || hiddenReplies ? `<div class="comment-replies">${replyHtml}${hiddenReplies > 0 ? `<a class="more-thread" href="${escapeHtml(permalinkHref(comment))}">View ${hiddenReplies} more ${hiddenReplies === 1 ? 'reply' : 'replies'}</a>` : ''}</div>` : ''}
        </article>`;
}

function renderReplyComposer() {
  return `
        <section class="thread-reply-composer" aria-label="Reply to this post">
          <h2 class="comments-heading">Post your reply</h2>
          <div class="comment-form" data-comment-form="main">
            <textarea placeholder="Post your reply" aria-label="Post your reply"></textarea>
            <label class="comment-image-chip">Image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label>
            <button class="btn btn-primary" type="button">Reply</button>
          </div>
          <p class="author-meta">Sign in to reply. Public comments below are crawlable on their own permalinks.</p>
        </section>`;
}

function renderCommentThread(comments, { permalinkHref, pageUrl, showAll = false, highlightId = '' }) {
  const roots = buildCommentTree(comments);
  const visible = showAll ? roots : roots.slice(0, LIST_COMMENT_PREVIEW);
  const hidden = Math.max(roots.length - visible.length, 0);
  const rendered = visible.map((comment) => renderSingleComment(comment, { permalinkHref, showAllReplies: showAll, highlightId })).join('');
  return `
        ${showAll ? renderReplyComposer() : ''}
        <section class="comments visible" aria-label="Comments">
          <h2 class="comments-heading">Comments</h2>
          ${rendered || '<p class="author-meta">No replies yet. Be the first to reply.</p>'}
          ${hidden > 0 ? `<a class="more-thread" href="${escapeHtml(pageUrl)}">View ${hidden} more ${hidden === 1 ? 'thread' : 'threads'}</a>` : ''}
        </section>`;
}

function renderPostCard(post, comments, { heading = 'h2', showAllComments = false, includeComments = false, selected = false, highlightId = '' } = {}) {
  const url = discussionPath(post);
  const titleTag = heading;
  return `
          <article class="community-card${selected ? ' is-selected' : ''}" id="post-${escapeHtml(post.id)}" data-post-id="${escapeHtml(post.id)}">
            <div class="card-top">
              <div class="author">
                <span class="avatar ${escapeHtml(safeAvatarKey(post.author_avatar_key))}">${escapeHtml(initials(post.author_name))}</span>
                <div>
                  <div class="author-name">${escapeHtml(post.author_name || 'Community member')} ${adminBadge(post.author_is_admin)} ${karmaBadge(post.author_karma_score)}</div>
                  <div class="author-meta">${escapeHtml(post.author_designation || 'MolDraw user')} · <time datetime="${escapeHtml(isoDate(post.created_at) || '')}">${escapeHtml(timeText(post.created_at))}</time></div>
                </div>
              </div>
            </div>
            <${titleTag} class="card-title"><a class="card-title-link" href="${escapeHtml(url)}">${escapeHtml(post.title)}</a></${titleTag}>
            <p class="card-body">${escapeHtml(post.body)}</p>
            ${renderImages(post.image_urls, 'Community attachment')}
            <div class="card-actions">
              <span class="pill">▲ ${escapeHtml(post.upvote_count || 0)}</span>
              <a class="pill" data-open-thread href="${escapeHtml(url)}">${escapeHtml(post.comment_count || comments.length || 0)} replies</a>
            </div>
            ${includeComments ? renderCommentThread(comments, { permalinkHref: commentPath, pageUrl: url, showAll: showAllComments, highlightId }) : ''}
          </article>`;
}

function renderFeatureCard(request, comments, { heading = 'h2', showAllComments = false, includeComments = false, selected = false, highlightId = '' } = {}) {
  const url = featurePath(request);
  const titleTag = heading;
  const status = request.status || 'new';
  return `
          <article class="community-card${selected ? ' is-selected' : ''}" id="feature-${escapeHtml(request.id)}" data-feature-id="${escapeHtml(request.id)}">
            <div class="card-top">
              <div class="author">
                <span class="avatar">${escapeHtml(initials(request.name))}</span>
                <div>
                  <div class="author-name">${escapeHtml(request.name || 'MolDraw user')}</div>
                  <div class="author-meta">Feature request · <time datetime="${escapeHtml(isoDate(request.created_at) || '')}">${escapeHtml(timeText(request.created_at))}</time></div>
                </div>
              </div>
              <span class="pill">${escapeHtml(status.replace(/_/g, ' '))}</span>
            </div>
            <${titleTag} class="card-title"><a class="card-title-link" href="${escapeHtml(url)}">${escapeHtml(request.title)}</a></${titleTag}>
            <p class="card-body">${escapeHtml(request.description)}</p>
            ${renderImages(request.image_urls, 'Feature request attachment')}
            <div class="card-actions">
              <span class="pill">▲ ${escapeHtml(request.upvote_count || 0)}</span>
              <a class="pill" data-open-thread href="${escapeHtml(url)}">${escapeHtml(comments.length || 0)} replies</a>
            </div>
            ${includeComments ? renderCommentThread(comments, { permalinkHref: featureCommentPath, pageUrl: url, showAll: showAllComments, highlightId }) : ''}
          </article>`;
}

function renderPagination(kind, page, total) {
  const pages = Math.max(1, Math.ceil((Number(total) || 0) / PAGE_SIZE));
  if (pages <= 1) return '';
  const hrefFor = (n) => {
    if (kind === 'features') return n <= 1 ? '/community/features' : `/community/features/page/${n}`;
    return n <= 1 ? '/community/' : `/community/page/${n}`;
  };
  const items = [];
  if (page > 1) items.push(`<a rel="prev" href="${hrefFor(page - 1)}">Previous</a>`);
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  for (let n = start; n <= end; n += 1) {
    items.push(n === page
      ? `<span aria-current="page">${n}</span>`
      : `<a href="${hrefFor(n)}">${n}</a>`);
  }
  if (page < pages) items.push(`<a rel="next" href="${hrefFor(page + 1)}">Next</a>`);
  return `<nav id="community-pagination" class="community-pagination" aria-label="Community pagination">${items.join('')}</nav>`;
}

function organizationLd() {
  return {
    '@type': 'Organization',
    '@id': `${SITE}/#organization`,
    name: 'MolDraw',
    url: `${SITE}/`,
    logo: `${SITE}/logo.png`,
    sameAs: [
      'https://www.youtube.com/@MolDraw',
      'https://x.com/DrawMol35803',
      'https://www.linkedin.com/company/moldraw',
    ],
  };
}

function commentLd(comment, { permalink, parentId }) {
  const href = permalink(comment);
  const node = {
    '@type': 'Comment',
    '@id': absUrl(href),
    url: absUrl(href),
    text: comment.body || '',
    datePublished: isoDate(comment.created_at),
    author: {
      '@type': 'Person',
      name: comment.author_name || 'Community member',
    },
    parentItem: { '@id': parentId },
  };
  const images = Array.isArray(comment.image_urls) ? comment.image_urls.filter(isSafeRemoteUrl) : [];
  if (images.length) node.image = images;
  if (comment.replies?.length) {
    node.comment = comment.replies.map((reply) => commentLd(reply, { permalink, parentId: node['@id'] }));
  }
  return node;
}

function discussionLd(post, comments, canonical) {
  const roots = buildCommentTree(comments);
  const node = {
    '@type': 'DiscussionForumPosting',
    '@id': `${canonical}#post`,
    url: canonical,
    headline: post.title || 'MolDraw community post',
    text: post.body || '',
    datePublished: isoDate(post.created_at),
    author: {
      '@type': 'Person',
      name: post.author_name || 'Community member',
    },
    publisher: { '@id': `${SITE}/#organization` },
    isPartOf: { '@id': `${SITE}/community/#webpage` },
    commentCount: Number(post.comment_count || comments.length || 0),
  };
  const images = Array.isArray(post.image_urls) ? post.image_urls.filter(isSafeRemoteUrl) : [];
  if (images.length) node.image = images;
  if (roots.length) {
    node.comment = roots.map((comment) => commentLd(comment, {
      permalink: commentPath,
      parentId: node['@id'],
    }));
  }
  return node;
}

function featureLd(request, comments, canonical) {
  const roots = buildCommentTree(comments);
  const node = {
    '@type': 'DiscussionForumPosting',
    '@id': `${canonical}#post`,
    url: canonical,
    headline: request.title || 'MolDraw feature request',
    text: request.description || '',
    datePublished: isoDate(request.created_at),
    author: {
      '@type': 'Person',
      name: request.name || 'MolDraw user',
    },
    publisher: { '@id': `${SITE}/#organization` },
    isPartOf: { '@id': `${SITE}/community/#webpage` },
    keywords: 'feature request',
    commentCount: comments.length,
  };
  const images = Array.isArray(request.image_urls) ? request.image_urls.filter(isSafeRemoteUrl) : [];
  if (images.length) node.image = images;
  if (roots.length) {
    node.comment = roots.map((comment) => commentLd(comment, {
      permalink: featureCommentPath,
      parentId: node['@id'],
    }));
  }
  return node;
}

function breadcrumbLd(items) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${items[items.length - 1].item}#breadcrumbs`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

function replaceAttr(html, pattern, value) {
  return html.replace(pattern, value);
}

function applyDocument(template, {
  title,
  description,
  canonical,
  ogType = 'website',
  ogImage = `${SITE}/og-image.png`,
  robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
  jsonLd,
  pageHeading,
  pageHeadingHtml = '',
  feedHtml,
  threadHtml = '',
  paginationHtml = '',
  statusText = '',
  discussionsActive = true,
  prevHref = '',
  nextHref = '',
}) {
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = replaceAttr(html, /<meta name="description" content="[^"]*">/, `<meta name="description" id="meta-description" content="${escapeHtml(description)}">`);
  html = replaceAttr(html, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${escapeHtml(robots)}">`);
  html = replaceAttr(html, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${escapeHtml(ogType)}">`);
  html = replaceAttr(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeHtml(title)}">`);
  html = replaceAttr(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeHtml(description)}">`);
  html = replaceAttr(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeHtml(canonical)}">`);
  html = replaceAttr(html, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeHtml(ogImage)}">`);
  html = replaceAttr(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escapeHtml(title)}">`);
  html = replaceAttr(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escapeHtml(description)}">`);
  html = replaceAttr(html, /<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${escapeHtml(ogImage)}">`);
  html = replaceAttr(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" id="canonical-url" href="${escapeHtml(canonical)}">`);

  const extraLinks = [
    prevHref ? `<link rel="prev" href="${escapeHtml(absUrl(prevHref))}">` : '',
    nextHref ? `<link rel="next" href="${escapeHtml(absUrl(nextHref))}">` : '',
  ].filter(Boolean).join('\n  ');
  if (extraLinks) {
    html = html.replace('<link rel="canonical"', `${extraLinks}\n  <link rel="canonical"`);
  }

  html = html.replace(
    /<script type="application\/ld\+json" id="community-jsonld">[\s\S]*?<\/script>/,
    `<script type="application/ld+json" id="community-jsonld">\n${JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')}\n  </script>`,
  );

  html = html.replace(
    /<h1 class="community-page-title"[^>]*>[\s\S]*?<\/h1>/,
    pageHeadingHtml || `<h1 class="community-page-title">${escapeHtml(pageHeading)}</h1>`,
  );

  html = html.replace(
    /<div id="status" class="status">[\s\S]*?<\/div>/,
    `<div id="status" class="status">${escapeHtml(statusText)}</div>`,
  );
  html = html.replace(
    /<div id="feed" class="feed">[\s\S]*?<\/div>/,
    `<div id="feed" class="feed">${feedHtml}</div>`,
  );
  html = html.replace(
    /<nav id="community-pagination"[\s\S]*?<\/nav>/,
    paginationHtml || '<nav id="community-pagination" class="community-pagination" aria-label="Community pagination"></nav>',
  );

  if (threadHtml) {
    html = html.replace('<body>', '<body class="thread-modal-open">');
    html = html.replace('id="thread-modal" class="thread-modal" hidden', 'id="thread-modal" class="thread-modal is-open"');
    html = html.replace(
      /<div id="thread-panel-body" class="thread-modal-body"><\/div>/,
      `<div id="thread-panel-body" class="thread-modal-body">${threadHtml}</div>`,
    );
  }

  if (discussionsActive) {
    html = html.replace(/id="tab-discussions" class="tab-btn(?: active)?"/, 'id="tab-discussions" class="tab-btn active"');
    html = html.replace(/id="tab-features" class="tab-btn(?: active)?"/, 'id="tab-features" class="tab-btn"');
  } else {
    html = html.replace(/id="tab-discussions" class="tab-btn(?: active)?"/, 'id="tab-discussions" class="tab-btn"');
    html = html.replace(/id="tab-features" class="tab-btn(?: active)?"/, 'id="tab-features" class="tab-btn active"');
  }

  return html;
}

function listJsonLd({ canonical, title, description, items, breadcrumbs }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd(),
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        isPartOf: { '@id': `${SITE}/#website` },
        publisher: { '@id': `${SITE}/#organization` },
      },
      breadcrumbLd(breadcrumbs),
      {
        '@type': 'ItemList',
        '@id': `${canonical}#posts`,
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: item.url,
          name: item.name,
        })),
      },
      ...(canonical === `${SITE}/community/` ? [{
        '@type': 'FAQPage',
        '@id': `${SITE}/community/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What is the MolDraw Community?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The MolDraw Community is a chemistry-focused discussion page for MolDraw users to ask molecular drawing questions, share workflows, comment on posts, and vote on feature requests.',
            },
          },
          {
            '@type': 'Question',
            name: 'Who can post, reply, or upvote in the MolDraw Community?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Everyone can read public community posts without signing in. Signed-in MolDraw users can create posts, reply to threads, upload images, and upvote discussions or feature requests.',
            },
          },
          {
            '@type': 'Question',
            name: 'What topics belong in the MolDraw Community?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Relevant topics include chemical structure drawing, editor tips, 3D molecule visualization, spectroscopy and export workflows, classroom usage, bug reports, and product feature requests.',
            },
          },
        ],
      }] : []),
    ],
  };
}

function postJsonLd({ canonical, post, comments, breadcrumbs, extra }) {
  const graph = [
    organizationLd(),
    discussionLd(post, comments, canonical),
    breadcrumbLd(breadcrumbs),
  ];
  if (extra) graph.push(extra);
  return { '@context': 'https://schema.org', '@graph': graph };
}

function markdownFromPost(post, comments, url) {
  const lines = [
    `# ${post.title || 'MolDraw community post'}`,
    '',
    `Author: ${post.author_name || 'Community member'}`,
    `Published: ${isoDate(post.created_at) || ''}`,
    `URL: ${url}`,
    '',
    post.body || '',
    '',
    '## Comments',
    '',
  ];
  const walk = (comment, depth) => {
    const prefix = '#'.repeat(Math.min(depth + 3, 6));
    lines.push(`${prefix} ${comment.author_name || 'Community member'}`);
    lines.push('');
    lines.push(comment.body || '');
    lines.push('');
    lines.push(`Permalink: ${absUrl(commentPath(comment))}`);
    lines.push('');
    (comment.replies || []).forEach((reply) => walk(reply, depth + 1));
  };
  buildCommentTree(comments).forEach((comment) => walk(comment, 0));
  return `${lines.join('\n').trim()}\n`;
}

function markdownFromFeature(request, comments, url) {
  return markdownFromPost(
    {
      title: request.title,
      author_name: request.name,
      created_at: request.created_at,
      body: request.description,
    },
    comments.map((comment) => ({ ...comment, _feature: true })),
    url,
  ).replace(/\/community\/c\//g, '/community/fc/');
}

function paginationHrefs(kind, page, total) {
  const pages = Math.max(1, Math.ceil((Number(total) || 0) / PAGE_SIZE));
  const hrefFor = (n) => {
    if (kind === 'features') return n <= 1 ? '/community/features' : `/community/features/page/${n}`;
    return n <= 1 ? '/community/' : `/community/page/${n}`;
  };
  return {
    prevHref: page > 1 ? hrefFor(page - 1) : '',
    nextHref: page < pages ? hrefFor(page + 1) : '',
  };
}

function ogImageFrom(urls) {
  const images = Array.isArray(urls) ? urls.filter(isSafeRemoteUrl) : [];
  return images[0] || `${SITE}/og-image.png`;
}

async function renderListPage(route, { accept } = {}) {
  const isFeatures = route.kind === 'features';
  const page = route.page || 1;
  const fetched = isFeatures ? await fetchFeaturesPage(page) : await fetchPostsPage(page);
  const rows = fetched.data || [];
  const total = fetched.total || rows.length;
  const ids = rows.map((row) => row.id);
  const comments = isFeatures
    ? await fetchFeatureComments(ids, LIST_COMMENT_PREVIEW * PAGE_SIZE)
    : await fetchCommentsForPosts(ids, LIST_COMMENT_PREVIEW * PAGE_SIZE);
  const grouped = groupBy(comments, isFeatures ? 'feature_request_id' : 'post_id');

  const canonicalPath = isFeatures
    ? (page <= 1 ? '/community/features' : `/community/features/page/${page}`)
    : (page <= 1 ? '/community/' : `/community/page/${page}`);
  const canonical = absUrl(canonicalPath);
  const title = isFeatures
    ? (page <= 1 ? 'MolDraw Feature Requests | Community' : `MolDraw Feature Requests · Page ${page}`)
    : (page <= 1 ? 'MolDraw Community | Chemistry Discussion Forum and Feature Requests' : `MolDraw Community discussions · Page ${page}`);
  const description = isFeatures
    ? 'Public MolDraw feature requests with titles, descriptions, votes, and replies. Sign in to submit or vote.'
    : excerpt(rows.map((row) => row.title).filter(Boolean).join('. ') || 'Public MolDraw community discussions about chemical structure drawing, editor workflows, and 3D molecule viewing.');

  const feedHtml = isFeatures
    ? `<section class="feature-cta-card"><div><h2>Have an idea for MolDraw?</h2><p>Request a feature here so the community can vote and track progress. Sign in to submit.</p></div></section>${rows.map((request) => renderFeatureCard(request, grouped.get(request.id) || [])).join('')}`
    : rows.map((post) => renderPostCard(post, grouped.get(post.id) || [])).join('')
      || '<p>No discussions yet. Start the first one.</p>';

  const items = rows.map((row) => ({
    url: absUrl(isFeatures ? featurePath(row) : discussionPath(row)),
    name: row.title || 'Community post',
  }));
  const { prevHref, nextHref } = paginationHrefs(isFeatures ? 'features' : 'discussions', page, total);
  const jsonLd = listJsonLd({
    canonical,
    title,
    description,
    items,
    breadcrumbs: [
      { name: 'MolDraw', item: `${SITE}/` },
      { name: 'Community', item: `${SITE}/community/` },
      ...(isFeatures ? [{ name: 'Feature requests', item: `${SITE}/community/features` }] : []),
      ...(page > 1 ? [{ name: `Page ${page}`, item: canonical }] : []),
    ],
  });

  if (wantsMarkdown(accept)) {
    const md = [
      `# ${title}`,
      '',
      description,
      '',
      ...items.map((item) => `- [${item.name}](${item.url})`),
      '',
      prevHref ? `Previous: ${absUrl(prevHref)}` : '',
      nextHref ? `Next: ${absUrl(nextHref)}` : '',
    ].filter(Boolean).join('\n');
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      },
      body: `${md}\n`,
    };
  }

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
    body: applyDocument(loadTemplate(), {
      title,
      description,
      canonical,
      jsonLd,
      pageHeading: isFeatures ? 'MolDraw feature requests' : 'MolDraw Community',
      feedHtml,
      paginationHtml: renderPagination(isFeatures ? 'features' : 'discussions', page, total),
      statusText: rows.length ? '' : (isFeatures ? 'No feature requests yet.' : 'No discussions yet. Start the first one.'),
      discussionsActive: !isFeatures,
      prevHref,
      nextHref,
    }),
  };
}

async function renderPostPage(post, comments, { canonicalPath, accept, robots, extraLd, highlightId } = {}) {
  const canonical = absUrl(canonicalPath);
  const focus = highlightId ? comments.find((comment) => comment.id === highlightId) : null;
  const title = focus
    ? `${excerpt(focus.body, 70)} — ${post.title || 'Discussion'} | MolDraw Community`
    : `${post.title || 'Community post'} | MolDraw Community`;
  const description = excerpt((focus && focus.body) || post.body || post.title || 'A public MolDraw community discussion.');
  const jsonLd = postJsonLd({
    canonical: absUrl(discussionPath(post)),
    post,
    comments,
    breadcrumbs: [
      { name: 'MolDraw', item: `${SITE}/` },
      { name: 'Community', item: `${SITE}/community/` },
      { name: post.title || 'Discussion', item: absUrl(discussionPath(post)) },
    ],
    extra: extraLd,
  });

  if (wantsMarkdown(accept)) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      },
      body: markdownFromPost(post, comments, canonical),
    };
  }

  const list = await fetchPostsPage(1).catch(() => ({ data: [] }));
  let listRows = list.data || [];
  if (!listRows.some((row) => row.id === post.id)) listRows = [post, ...listRows];
  const feedHtml = listRows.map((row) => renderPostCard(row, [], { selected: row.id === post.id })).join('');
  const threadHtml = `${renderPostCard(post, comments, { heading: 'h1', showAllComments: true, includeComments: true, highlightId })}${highlightId ? `<p class="author-meta">Showing the indexed comment <a href="#comment-${escapeHtml(highlightId)}">#${escapeHtml(highlightId)}</a>.</p>` : ''}`;

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
    body: applyDocument(loadTemplate(), {
      title,
      description,
      canonical,
      ogType: 'article',
      ogImage: ogImageFrom(post.image_urls),
      robots: robots || 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
      jsonLd,
      pageHeading: post.title || 'Community discussion',
      pageHeadingHtml: `<p class="community-page-title"><a href="/community/">MolDraw Community</a></p>`,
      feedHtml,
      threadHtml,
      statusText: '',
      discussionsActive: true,
    }),
  };
}

async function renderFeaturePage(request, comments, { canonicalPath, accept, extraLd, highlightId } = {}) {
  const canonical = absUrl(canonicalPath);
  const focus = highlightId ? comments.find((comment) => comment.id === highlightId) : null;
  const title = focus
    ? `${excerpt(focus.body, 70)} — ${request.title || 'Feature request'} | MolDraw Community`
    : `${request.title || 'Feature request'} | MolDraw Community`;
  const description = excerpt((focus && focus.body) || request.description || request.title || 'A public MolDraw feature request.');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      organizationLd(),
      featureLd(request, comments, absUrl(featurePath(request))),
      breadcrumbLd([
        { name: 'MolDraw', item: `${SITE}/` },
        { name: 'Community', item: `${SITE}/community/` },
        { name: 'Feature requests', item: `${SITE}/community/features` },
        { name: request.title || 'Feature request', item: absUrl(featurePath(request)) },
      ]),
      extraLd,
    ].filter(Boolean),
  };

  if (wantsMarkdown(accept)) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
      },
      body: markdownFromFeature(request, comments, canonical),
    };
  }

  const list = await fetchFeaturesPage(1).catch(() => ({ data: [] }));
  let listRows = list.data || [];
  if (!listRows.some((row) => row.id === request.id)) listRows = [request, ...listRows];
  const feedHtml = `<section class="feature-cta-card"><div><h2>Have an idea for MolDraw?</h2><p>Request a feature here so the community can vote and track progress. Sign in to submit.</p></div></section>${listRows.map((row) => renderFeatureCard(row, [], { selected: row.id === request.id })).join('')}`;
  const threadHtml = `${renderFeatureCard(request, comments, { heading: 'h1', showAllComments: true, includeComments: true, highlightId })}${highlightId ? `<p class="author-meta">Showing the indexed comment <a href="#comment-${escapeHtml(highlightId)}">#${escapeHtml(highlightId)}</a>.</p>` : ''}`;

  return {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600',
    },
    body: applyDocument(loadTemplate(), {
      title,
      description,
      canonical,
      ogType: 'article',
      ogImage: ogImageFrom(request.image_urls),
      jsonLd,
      pageHeading: request.title || 'Feature request',
      pageHeadingHtml: `<p class="community-page-title"><a href="/community/features">MolDraw feature requests</a></p>`,
      feedHtml,
      threadHtml,
      statusText: '',
      discussionsActive: false,
    }),
  };
}

function notFoundPage(message, { accept } = {}) {
  if (wantsMarkdown(accept)) {
    return {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      body: `# Not found\n\n${message}\n\n[MolDraw Community](${SITE}/community/)\n`,
    };
  }
  return {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
    body: applyDocument(loadTemplate(), {
      title: 'Not found | MolDraw Community',
      description: 'This MolDraw community URL is not available.',
      canonical: `${SITE}/community/`,
      robots: 'noindex,follow',
      jsonLd: { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Not found' },
      pageHeading: 'Not found',
      feedHtml: `<p>${escapeHtml(message)}</p><p><a href="/community/">Back to community</a></p>`,
      statusText: message,
      discussionsActive: true,
    }),
  };
}

async function renderCommunityPage(pathname, options = {}) {
  const route = parseCommunityPath(pathname);
  if (!route) return notFoundPage('Unknown community URL.', options);

  if (route.view === 'list') return renderListPage(route, options);

  if (route.view === 'post') {
    if (!isSafeId(route.id)) return notFoundPage('Invalid post URL.', options);
    const post = await fetchPost(route.id);
    if (!post) return notFoundPage('This community post is not available.', options);
    const comments = await fetchCommentsForPosts([post.id]);
    return renderPostPage(post, comments, {
      canonicalPath: discussionPath(post),
      accept: options.accept,
    });
  }

  if (route.view === 'comment') {
    if (!isSafeId(route.id)) return notFoundPage('Invalid comment URL.', options);
    const comment = await fetchComment(route.id);
    if (!comment?.post_id) return notFoundPage('This comment is not available.', options);
    const post = await fetchPost(comment.post_id);
    if (!post) return notFoundPage('This community post is not available.', options);
    const comments = await fetchCommentsForPosts([post.id]);
    return renderPostPage(post, comments, {
      canonicalPath: commentPath(comment),
      accept: options.accept,
      highlightId: comment.id,
      extraLd: commentLd(comment, {
        permalink: commentPath,
        parentId: `${absUrl(discussionPath(post))}#post`,
      }),
    });
  }

  if (route.view === 'feature') {
    if (!isSafeId(route.id)) return notFoundPage('Invalid feature request URL.', options);
    const request = await fetchFeature(route.id);
    if (!request) return notFoundPage('This feature request is not available.', options);
    const comments = await fetchFeatureComments([request.id]);
    return renderFeaturePage(request, comments, {
      canonicalPath: featurePath(request),
      accept: options.accept,
    });
  }

  if (route.view === 'feature-comment') {
    if (!isSafeId(route.id)) return notFoundPage('Invalid comment URL.', options);
    const comment = await fetchFeatureComment(route.id);
    if (!comment?.feature_request_id) return notFoundPage('This comment is not available.', options);
    const request = await fetchFeature(comment.feature_request_id);
    if (!request) return notFoundPage('This feature request is not available.', options);
    const comments = await fetchFeatureComments([request.id]);
    return renderFeaturePage(request, comments, {
      canonicalPath: featureCommentPath(comment),
      accept: options.accept,
      highlightId: comment.id,
      extraLd: commentLd(comment, {
        permalink: featureCommentPath,
        parentId: `${absUrl(featurePath(request))}#post`,
      }),
    });
  }

  return notFoundPage('Unknown community URL.', options);
}

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sitemapUrl(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : '',
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n');
}

async function renderCommunitySitemap() {
  const [posts, features, comments, featureComments] = await Promise.all([
    fetchAllRows('community_posts', 'id,title,created_at', 'created_at.desc'),
    fetchAllRows('community_feature_requests', 'id,title,created_at', 'created_at.desc').catch(() => []),
    fetchAllRows('community_comments', 'id,body,created_at', 'created_at.desc').catch(() => []),
    fetchAllRows('feature_request_comments', 'id,body,created_at', 'created_at.desc').catch(() => []),
  ]);

  const discussionPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const featurePages = Math.max(1, Math.ceil(features.length / PAGE_SIZE));
  const urls = [
    sitemapUrl(`${SITE}/community/`, new Date().toISOString().slice(0, 10), 'hourly', '0.7'),
    sitemapUrl(`${SITE}/community/features`, new Date().toISOString().slice(0, 10), 'hourly', '0.64'),
  ];

  for (let page = 2; page <= discussionPages; page += 1) {
    urls.push(sitemapUrl(`${SITE}/community/page/${page}`, new Date().toISOString().slice(0, 10), 'hourly', '0.5'));
  }
  for (let page = 2; page <= featurePages; page += 1) {
    urls.push(sitemapUrl(`${SITE}/community/features/page/${page}`, new Date().toISOString().slice(0, 10), 'hourly', '0.45'));
  }

  posts.forEach((post) => {
    urls.push(sitemapUrl(absUrl(discussionPath(post)), isoDate(post.created_at)?.slice(0, 10), 'weekly', '0.55'));
  });
  features.forEach((request) => {
    urls.push(sitemapUrl(absUrl(featurePath(request)), isoDate(request.created_at)?.slice(0, 10), 'weekly', '0.5'));
  });
  comments.forEach((comment) => {
    urls.push(sitemapUrl(absUrl(commentPath(comment)), isoDate(comment.created_at)?.slice(0, 10), 'weekly', '0.35'));
  });
  featureComments.forEach((comment) => {
    urls.push(sitemapUrl(absUrl(featureCommentPath(comment)), isoDate(comment.created_at)?.slice(0, 10), 'weekly', '0.3'));
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
    body: xml,
  };
}

module.exports = {
  PAGE_SIZE,
  parseCommunityPath,
  isCommunitySeoPath,
  renderCommunityPage,
  renderCommunitySitemap,
};
