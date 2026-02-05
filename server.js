const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOKEN_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const ACCESS_TTL_MS = 1000 * 60 * 60 * 6;
const MAX_COMMENT_DEPTH = 6;
const COLLAPSE_DEFAULT_DEPTH = 3;
const MIN_ACCOUNT_AGE_FOR_THREAD_MS = 1000 * 60 * 5;
const THREAD_AUT0_LOCK_HOURS_POST_MATCH = 24;
const OFFICIAL_THREAD_PIN_AFTER_LIVE_HOURS = 6;
const RATE_LIMIT_WINDOW_MS = 1000 * 60;
const RATE_LIMIT_POSTS_PER_WINDOW = 6;
const BANNED_WORDS = ['slur-placeholder', 'spamlink'];
const AUTO_HIDE_COMMENT_SCORE = -5;
const SLOW_MODE_SECONDS = 30;
const REPUTATION_TIERS = [
  { name: 'Veteran', min: 650 },
  { name: 'Analyst', min: 450 },
  { name: 'Trusted', min: 200 },
  { name: 'Regular', min: 40 },
  { name: 'New', min: 0 }
];
const DB_ADAPTER = process.env.DB_ADAPTER || 'memory';

const state = {
  users: [
    {
      id: 'u-admin',
      username: 'admin',
      passwordHash: hashPassword('adminpass'),
      role: 'admin',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
      reputation_bonus: 40,
      is_banned: false,
      is_shadowbanned: false,
      ban_expires_at: null,
      preferences: { favorite_teams: ['t-sen'], regions: ['NA'], muted_teams: [], muted_events: [] }
    },
    {
      id: 'u-mod',
      username: 'modwatch',
      passwordHash: hashPassword('modpass'),
      role: 'moderator',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      reputation_bonus: 10,
      is_banned: false,
      is_shadowbanned: false,
      ban_expires_at: null,
      preferences: { favorite_teams: [], regions: ['EMEA'], muted_teams: [], muted_events: [] }
    },
    {
      id: 'u-analyst',
      username: 'tacticalace',
      passwordHash: hashPassword('analystpass'),
      role: 'verified_analyst',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 12).toISOString(),
      reputation_bonus: 80,
      is_banned: false,
      is_shadowbanned: false,
      ban_expires_at: null,
      preferences: { favorite_teams: ['t-prx'], regions: ['APAC'], muted_teams: [], muted_events: [] }
    },
    {
      id: 'u-1',
      username: 'aimdiff',
      passwordHash: hashPassword('pass123'),
      role: 'user',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
      reputation_bonus: 0,
      is_banned: false,
      is_shadowbanned: false,
      ban_expires_at: null,
      preferences: { favorite_teams: ['t-sen'], regions: ['NA'], muted_teams: [], muted_events: [] }
    }
  ],
  featuredPosts: [
    {
      id: 'news-1',
      headline: 'Riot confirms Stage 2 format adjustments for VCT Americas',
      source: 'Riot Esports',
      summary: 'Playoff seeding and map veto rules updated for better cross-regional parity.',
      thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
      tag: 'Format Update'
    }
  ],
  matches: [
    {
      id: 'm-100',
      event: 'VCT Masters Madrid',
      status: 'LIVE',
      bestOf: 3,
      server: 'EU Central',
      startTime: '2026-02-05T18:00:00Z',
      teams: [
        { id: 't-sen', name: 'Sentinels', short: 'SEN', logo: '🟥' },
        { id: 't-prx', name: 'Paper Rex', short: 'PRX', logo: '🟦' }
      ],
      score: [1, 1],
      maps: [],
      officialThreadId: null
    }
  ],
  threads: [
    {
      id: 'th-1',
      title: 'SEN vs PRX was overcooked by timeout economy',
      body: 'SEN burned both tactical timeouts before round 18 and lost momentum.',
      author_id: 'u-1',
      context_type: 'match',
      context_id: 'm-100',
      tags: ['meta', 'ascent'],
      created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      updated_at: null,
      is_locked: false,
      is_pinned: false,
      is_official: false,
      thread_type: 'discussion',
      flair_override: null,
      deleted_at: null
    }
  ],
  comments: [
    {
      id: 'c-1',
      thread_id: 'th-1',
      parent_id: null,
      depth: 0,
      author_id: 'u-analyst',
      body: 'Timeouts were fine, the real issue was ult economy into round 21.',
      created_at: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
      anchor: { map: 'Ascent', half: 'Attack', round_start: 19, round_end: 21 },
      deleted_at: null
    }
  ],
  votes: [],
  analystEndorsements: [],
  moderationLog: [],
  reports: [],
  threadCooldowns: [],
  revokedTokens: new Set(),
  rateLimits: new Map(),
  requestMetrics: { total: 0, byRoute: {}, lastSlow: [] }
};

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || state.revokedTokens.has(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
  if (expected !== signature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicUser(user) {
  const reputation = reputationForUser(user.id);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    karma_score: karmaForUser(user.id),
    reputation_score: reputation,
    reputation_tier: tierForReputation(reputation),
    is_banned: user.is_banned,
    is_shadowbanned: user.is_shadowbanned,
    preferences: user.preferences || { favorite_teams: [], regions: [], muted_teams: [], muted_events: [] }
  };
}

function writeJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        return resolve(JSON.parse(body));
      } catch (e) {
        return reject(e);
      }
    });
    req.on('error', reject);
  });
}

function serveFile(filePath, res) {
  const typeMap = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  fs.readFile(filePath, (err, data) => {
    if (err) return writeJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': typeMap[path.extname(filePath)] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

function nextId(prefix, collection) {
  return `${prefix}-${collection.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
}

function getAuthToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.replace('Bearer ', '');
  return null;
}

function getUserFromReq(req) {
  const payload = verifyToken(getAuthToken(req));
  if (!payload) return null;
  return state.users.find((u) => u.id === payload.sub) || null;
}

function canModerate(user) {
  return user && (user.role === 'moderator' || user.role === 'admin');
}

function isAdmin(user) {
  return user && user.role === 'admin';
}

function isBanned(user) {
  if (!user) return false;
  if (!user.is_banned) return false;
  if (!user.ban_expires_at) return true;
  if (new Date(user.ban_expires_at).getTime() > Date.now()) return true;
  user.is_banned = false;
  user.ban_expires_at = null;
  return false;
}

function checkRateLimit(req, user) {
  const key = `${req.socket.remoteAddress}:${user ? user.id : 'anon'}`;
  const now = Date.now();
  const history = (state.rateLimits.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  history.push(now);
  state.rateLimits.set(key, history);
  return history.length <= RATE_LIMIT_POSTS_PER_WINDOW;
}

function containsBlockedWords(text) {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((word) => lower.includes(word));
}

function scoreFor(targetType, targetId) {
  return state.votes
    .filter((vote) => vote.target_type === targetType && vote.target_id === targetId)
    .reduce((sum, vote) => sum + vote.value, 0);
}

function karmaForUser(userId) {
  const threadIds = state.threads.filter((thread) => thread.author_id === userId).map((thread) => thread.id);
  const commentIds = state.comments.filter((comment) => comment.author_id === userId).map((comment) => comment.id);
  return threadIds.reduce((sum, id) => sum + scoreFor('thread', id), 0) + commentIds.reduce((sum, id) => sum + scoreFor('comment', id), 0);
}

function tierForReputation(score) {
  return REPUTATION_TIERS.find((tier) => score >= tier.min)?.name || 'New';
}

function reputationForUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  const threadScore = state.threads.filter((thread) => thread.author_id === userId).reduce((sum, thread) => sum + scoreFor('thread', thread.id), 0);
  const commentScore = state.comments.filter((comment) => comment.author_id === userId).reduce((sum, comment) => sum + scoreFor('comment', comment.id), 0);
  const liveAccuracy = state.comments.filter((comment) => comment.author_id === userId && isLiveMatchThread(comment.thread_id)).reduce((sum, comment) => sum + Math.max(scoreFor('comment', comment.id), 0), 0);
  const endorsements = state.analystEndorsements.filter((item) => item.user_id === userId).length * 25;
  return threadScore + commentScore + liveAccuracy + endorsements + (user?.reputation_bonus || 0);
}

function hasSummaryPrivileges(user) {
  if (!user) return false;
  if (canModerate(user) || user.role === 'admin' || user.role === 'verified_analyst') return true;
  return reputationForUser(user.id) >= 200;
}

function isLiveMatchThread(threadId) {
  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread || thread.context_type !== 'match') return false;
  const match = state.matches.find((item) => item.id === thread.context_id);
  return !!match && match.status === 'LIVE';
}

function threadWeight(thread) {
  const authorRep = reputationForUser(thread.author_id);
  return 1 + Math.min(authorRep / 500, 0.6);
}

function isOfficialThreadPinned(match) {
  if (!match.startTime) return false;
  const cutoff = new Date(match.startTime).getTime() + OFFICIAL_THREAD_PIN_AFTER_LIVE_HOURS * 3600000;
  return match.status === 'LIVE' || Date.now() <= cutoff;
}

function ensureOfficialMatchThreads() {
  state.matches.forEach((match) => {
    if (match.officialThreadId) return;
    const thread = {
      id: nextId('th', state.threads),
      title: `Official Match Thread: ${match.teams[0].short} vs ${match.teams[1].short}`,
      body: `Auto-created official thread for ${match.event}. Use timeline anchors to track key rounds.`,
      context_type: 'match',
      context_id: match.id,
      tags: ['official', 'live'],
      author_id: 'u-admin',
      created_at: new Date().toISOString(),
      updated_at: null,
      is_locked: false,
      is_pinned: isOfficialThreadPinned(match),
      is_official: true,
      thread_type: 'official_match',
      flair_override: 'Official',
      deleted_at: null
    };
    state.threads.push(thread);
    match.officialThreadId = thread.id;
  });
}

function applyThreadLifecycleRules() {
  state.matches.forEach((match) => {
    const official = state.threads.find((thread) => thread.id === match.officialThreadId);
    if (!official) return;
    official.is_pinned = isOfficialThreadPinned(match);
    const lockThreshold = new Date(match.startTime).getTime() + THREAD_AUT0_LOCK_HOURS_POST_MATCH * 3600000;
    if (Date.now() > lockThreshold) official.is_locked = true;
  });
}

function routeMetricKey(pathname) {
  if (/^\/threads\/[^/]+$/.test(pathname)) return '/threads/:id';
  if (/^\/threads\/[^/]+\/comments$/.test(pathname)) return '/threads/:id/comments';
  if (/^\/matches\/[^/]+$/.test(pathname)) return '/matches/:id';
  return pathname;
}

function logModAction(actor, action, detail) {
  state.moderationLog.push({ id: nextId('mod', state.moderationLog), actor_id: actor.id, action, detail, created_at: new Date().toISOString() });
}

function isInCooldown(threadId) {
  const cooldown = state.threadCooldowns.find((item) => item.thread_id === threadId && new Date(item.until).getTime() > Date.now());
  return cooldown || null;
}

function withAuthor(entity) {
  const author = state.users.find((u) => u.id === entity.author_id);
  return {
    ...entity,
    author: author ? { username: author.username, role: author.role, is_shadowbanned: author.is_shadowbanned } : null
  };
}

function shouldAutoLock(thread) {
  if (thread.context_type !== 'match') return false;
  const match = state.matches.find((item) => item.id === thread.context_id);
  if (!match || !match.startTime) return false;
  const threshold = new Date(match.startTime).getTime() + THREAD_AUT0_LOCK_HOURS_POST_MATCH * 60 * 60 * 1000;
  return Date.now() > threshold;
}

function visibleThread(thread, viewer) {
  if (thread.deleted_at && !canModerate(viewer)) return false;
  const author = state.users.find((u) => u.id === thread.author_id);
  if (!author) return false;
  if (author.is_shadowbanned && !(canModerate(viewer) || viewer?.id === author.id)) return false;
  return true;
}

function rankedThreads(feed, rangeHours, viewer) {
  const now = Date.now();
  const base = state.threads.filter((thread) => visibleThread(thread, viewer)).map((thread) => {
    if (shouldAutoLock(thread)) thread.is_locked = true;
    const score = scoreFor('thread', thread.id);
    const ageHours = Math.max((now - new Date(thread.created_at).getTime()) / 3600000, 0.01);
    const weightedScore = score * threadWeight(thread);
    const rank = weightedScore / Math.pow(ageHours + 2, 1.3);
    return { ...withAuthor(thread), score, weightedScore, rank, heat: Number((rank * 100).toFixed(2)) };
  });

  let filtered = base;
  if (feed === 'top' && rangeHours) {
    filtered = base.filter((thread) => now - new Date(thread.created_at).getTime() <= rangeHours * 3600000);
  }

  if (feed === 'new') return filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (feed === 'top') return filtered.sort((a, b) => b.score - a.score);
  return filtered.sort((a, b) => {
    if (b.is_pinned !== a.is_pinned) return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
    return b.rank - a.rank;
  });
}

const server = http.createServer(async (req, res) => {
  const requestStart = Date.now();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const viewer = getUserFromReq(req);
  state.requestMetrics.total += 1;
  const routeKey = routeMetricKey(pathname);
  state.requestMetrics.byRoute[routeKey] = (state.requestMetrics.byRoute[routeKey] || 0) + 1;

  if (pathname === '/auth/register' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) return writeJson(res, 400, { error: 'username and password required' });
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return writeJson(res, 400, { error: 'username format invalid' });
      if (state.users.some((u) => u.username === username)) return writeJson(res, 409, { error: 'username already exists' });
      const user = {
        id: nextId('u', state.users),
        username,
        passwordHash: hashPassword(password),
        role: 'user',
        created_at: new Date().toISOString(),
        reputation_bonus: 0,
        is_banned: false,
        is_shadowbanned: false,
        ban_expires_at: null,
        preferences: { favorite_teams: [], regions: [], muted_teams: [], muted_events: [] }
      };
      state.users.push(user);
      return writeJson(res, 201, { user: publicUser(user) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  if (pathname === '/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      const user = state.users.find((u) => u.username === username && u.passwordHash === hashPassword(password || ''));
      if (!user) return writeJson(res, 401, { error: 'invalid credentials' });
      if (isBanned(user)) return writeJson(res, 403, { error: 'user is banned' });
      const token = signToken({ sub: user.id, role: user.role, exp: Date.now() + ACCESS_TTL_MS });
      return writeJson(res, 200, { access_token: token, user: publicUser(user) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  if (pathname === '/auth/logout' && req.method === 'POST') {
    const token = getAuthToken(req);
    if (token) state.revokedTokens.add(token);
    return writeJson(res, 200, { ok: true });
  }

  if (pathname === '/auth/me' && req.method === 'GET') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    return writeJson(res, 200, { user: publicUser(viewer) });
  }

  if (pathname === '/home' && req.method === 'GET') {
    ensureOfficialMatchThreads();
    applyThreadLifecycleRules();
    const feed = rankedThreads('hot', null, viewer).slice(0, 20);
    const prefs = viewer?.preferences || { favorite_teams: [], regions: [], muted_teams: [], muted_events: [] };
    const matchPulse = state.matches.filter((match) => !prefs.muted_events.includes(match.event) && !match.teams.some((team) => prefs.muted_teams.includes(team.id)));
    const summaries = state.threads
      .filter((thread) => thread.thread_type === 'match_summary' && visibleThread(thread, viewer))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map((thread) => ({ ...withAuthor(thread), score: scoreFor('thread', thread.id) }));
    return writeJson(res, 200, { refreshedAt: new Date().toISOString(), db_adapter: DB_ADAPTER, matchPulse, featuredPosts: state.featuredPosts, summaries, threads: feed });
  }

  if (pathname === '/threads' && req.method === 'GET') {
    const feed = url.searchParams.get('feed') || 'hot';
    const range = url.searchParams.get('range') || 'all';
    const rangeHours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : null;
    return writeJson(res, 200, { threads: rankedThreads(feed, rangeHours, viewer) });
  }

  if (pathname === '/threads' && req.method === 'POST') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    if (isBanned(viewer)) return writeJson(res, 403, { error: 'banned users cannot post' });
    if (!checkRateLimit(req, viewer)) return writeJson(res, 429, { error: 'rate limit exceeded' });
    if (Date.now() - new Date(viewer.created_at).getTime() < MIN_ACCOUNT_AGE_FOR_THREAD_MS) {
      return writeJson(res, 403, { error: 'account age too low for thread creation' });
    }
    try {
      const { title, body, context_type, context_id, tags = [], thread_type = 'discussion' } = await parseBody(req);
      if (!title || !body || !context_type || !context_id) return writeJson(res, 400, { error: 'missing required fields' });
      if (!['match', 'team', 'event', 'patch'].includes(context_type)) return writeJson(res, 400, { error: 'invalid context_type' });
      if (!['discussion', 'match_summary'].includes(thread_type)) return writeJson(res, 400, { error: 'invalid thread_type' });
      if (thread_type === 'match_summary' && !hasSummaryPrivileges(viewer)) return writeJson(res, 403, { error: 'match summaries require analyst/trusted role' });
      if (containsBlockedWords(`${title} ${body}`)) return writeJson(res, 400, { error: 'content blocked by word filter' });
      const thread = {
        id: nextId('th', state.threads),
        title,
        body,
        context_type,
        context_id,
        tags,
        author_id: viewer.id,
        created_at: new Date().toISOString(),
        updated_at: null,
        is_locked: false,
        is_pinned: false,
        is_official: false,
        thread_type,
        flair_override: thread_type === 'match_summary' ? 'Summary' : null,
        deleted_at: null
      };
      state.threads.push(thread);
      return writeJson(res, 201, { thread: withAuthor(thread) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const threadEditMatch = pathname.match(/^\/threads\/([^/]+)$/);
  if (threadEditMatch && req.method === 'PUT') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    const thread = state.threads.find((item) => item.id === threadEditMatch[1]);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    if (!(thread.author_id === viewer.id || canModerate(viewer))) return writeJson(res, 403, { error: 'forbidden' });
    try {
      const { title, body, tags } = await parseBody(req);
      if (title) thread.title = title;
      if (body) thread.body = body;
      if (Array.isArray(tags)) thread.tags = tags;
      thread.updated_at = new Date().toISOString();
      return writeJson(res, 200, { thread: withAuthor(thread) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  if (threadEditMatch && req.method === 'DELETE') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const thread = state.threads.find((item) => item.id === threadEditMatch[1]);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    thread.deleted_at = new Date().toISOString();
    logModAction(viewer, 'thread_soft_delete', { thread_id: thread.id });
    return writeJson(res, 200, { ok: true, soft_deleted: true });
  }

  const threadCommentsMatch = pathname.match(/^\/threads\/([^/]+)\/comments$/);
  if (threadCommentsMatch && req.method === 'GET') {
    const threadId = threadCommentsMatch[1];
    const thread = state.threads.find((item) => item.id === threadId);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    const comments = state.comments
      .filter((comment) => comment.thread_id === threadId && !comment.deleted_at)
      .map((comment) => ({ ...withAuthor(comment), score: scoreFor('comment', comment.id), collapsedByDefault: comment.depth > COLLAPSE_DEFAULT_DEPTH, auto_hidden: scoreFor('comment', comment.id) <= AUTO_HIDE_COMMENT_SCORE }))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return writeJson(res, 200, { comments, maxDepth: MAX_COMMENT_DEPTH, collapseAfterDepth: COLLAPSE_DEFAULT_DEPTH });
  }

  if (threadCommentsMatch && req.method === 'POST') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    if (isBanned(viewer)) return writeJson(res, 403, { error: 'banned users cannot comment' });
    if (!checkRateLimit(req, viewer)) return writeJson(res, 429, { error: 'rate limit exceeded' });
    const threadId = threadCommentsMatch[1];
    const thread = state.threads.find((item) => item.id === threadId && !item.deleted_at);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    if (thread.is_locked) return writeJson(res, 403, { error: 'thread is locked' });
    const cooldown = isInCooldown(threadId);
    const ownRecent = state.comments.find((item) => item.thread_id === threadId && item.author_id === viewer.id && new Date(item.created_at).getTime() > Date.now() - SLOW_MODE_SECONDS * 1000);
    if (cooldown && ownRecent) return writeJson(res, 429, { error: `slow mode active (${SLOW_MODE_SECONDS}s)` });
    try {
      const { body, parent_id = null, anchor = null } = await parseBody(req);
      if (!body) return writeJson(res, 400, { error: 'body required' });
      if (containsBlockedWords(body)) return writeJson(res, 400, { error: 'content blocked by word filter' });
      let depth = 0;
      if (parent_id) {
        const parent = state.comments.find((item) => item.id === parent_id && item.thread_id === threadId && !item.deleted_at);
        if (!parent) return writeJson(res, 404, { error: 'parent comment not found' });
        depth = parent.depth + 1;
      }
      if (depth > MAX_COMMENT_DEPTH) return writeJson(res, 400, { error: `max depth ${MAX_COMMENT_DEPTH} exceeded` });
      const comment = {
        id: nextId('c', state.comments),
        thread_id: threadId,
        parent_id,
        depth,
        author_id: viewer.id,
        body,
        created_at: new Date().toISOString(),
        anchor: anchor && typeof anchor === 'object' ? {
          map: anchor.map || null,
          half: anchor.half || null,
          round_start: Number(anchor.round_start) || null,
          round_end: Number(anchor.round_end) || null
        } : null,
        deleted_at: null
      };
      state.comments.push(comment);
      return writeJson(res, 201, { comment: { ...withAuthor(comment), score: 0 } });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const commentMatch = pathname.match(/^\/comments\/([^/]+)$/);
  if (commentMatch && req.method === 'DELETE') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    const comment = state.comments.find((item) => item.id === commentMatch[1]);
    if (!comment) return writeJson(res, 404, { error: 'comment not found' });
    if (!(comment.author_id === viewer.id || canModerate(viewer))) return writeJson(res, 403, { error: 'forbidden' });
    comment.deleted_at = new Date().toISOString();
    return writeJson(res, 200, { ok: true });
  }

  if (pathname === '/vote' && req.method === 'POST') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    try {
      const { target_type, target_id, value } = await parseBody(req);
      if (!['thread', 'comment'].includes(target_type)) return writeJson(res, 400, { error: 'invalid target_type' });
      if (![1, -1].includes(value)) return writeJson(res, 400, { error: 'value must be +1 or -1' });
      const entity = (target_type === 'thread' ? state.threads : state.comments).find((item) => item.id === target_id && !item.deleted_at);
      if (!entity) return writeJson(res, 404, { error: 'target not found' });
      if (entity.author_id === viewer.id) return writeJson(res, 403, { error: 'authors cannot vote on own content' });
      const existing = state.votes.find((vote) => vote.user_id === viewer.id && vote.target_type === target_type && vote.target_id === target_id);
      if (existing) {
        if (existing.value === value) {
          existing.value = 0;
        } else {
          existing.value = value;
        }
      } else {
        state.votes.push({ user_id: viewer.id, target_type, target_id, value });
      }
      if (viewer.is_shadowbanned) {
        return writeJson(res, 200, { ok: true, score: scoreFor(target_type, target_id), note: 'shadowbanned votes do not impact score' });
      }
      const author = state.users.find((user) => user.id === viewer.id);
      if (author?.is_shadowbanned) {
        const vote = state.votes.find((item) => item.user_id === viewer.id && item.target_type === target_type && item.target_id === target_id);
        if (vote) vote.value = 0;
      }
      return writeJson(res, 200, { ok: true, score: scoreFor(target_type, target_id) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  if (pathname === '/vote' && req.method === 'DELETE') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    try {
      const { target_type, target_id } = await parseBody(req);
      const idx = state.votes.findIndex((vote) => vote.user_id === viewer.id && vote.target_type === target_type && vote.target_id === target_id);
      if (idx >= 0) state.votes.splice(idx, 1);
      return writeJson(res, 200, { ok: true, score: scoreFor(target_type, target_id) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const modLock = pathname.match(/^\/mod\/thread\/([^/]+)\/lock$/);
  if (modLock && req.method === 'POST') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const thread = state.threads.find((item) => item.id === modLock[1]);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    thread.is_locked = !thread.is_locked;
    logModAction(viewer, 'thread_lock_toggle', { thread_id: thread.id, is_locked: thread.is_locked });
    return writeJson(res, 200, { ok: true, is_locked: thread.is_locked });
  }

  const modPin = pathname.match(/^\/mod\/thread\/([^/]+)\/pin$/);
  if (modPin && req.method === 'POST') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const thread = state.threads.find((item) => item.id === modPin[1]);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    thread.is_pinned = !thread.is_pinned;
    logModAction(viewer, 'thread_pin_toggle', { thread_id: thread.id, is_pinned: thread.is_pinned });
    return writeJson(res, 200, { ok: true, is_pinned: thread.is_pinned });
  }

  const modBan = pathname.match(/^\/mod\/user\/([^/]+)\/ban$/);
  if (modBan && req.method === 'POST') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const user = state.users.find((item) => item.id === modBan[1]);
    if (!user) return writeJson(res, 404, { error: 'user not found' });
    try {
      const { duration_hours } = await parseBody(req);
      user.is_banned = true;
      user.ban_expires_at = duration_hours ? new Date(Date.now() + duration_hours * 3600000).toISOString() : null;
      logModAction(viewer, 'user_ban', { user_id: user.id, duration_hours: duration_hours || null });
      return writeJson(res, 200, { ok: true, user: publicUser(user) });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const modShadow = pathname.match(/^\/mod\/user\/([^/]+)\/shadowban$/);
  if (modShadow && req.method === 'POST') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const user = state.users.find((item) => item.id === modShadow[1]);
    if (!user) return writeJson(res, 404, { error: 'user not found' });
    user.is_shadowbanned = !user.is_shadowbanned;
    logModAction(viewer, 'user_shadowban_toggle', { user_id: user.id, is_shadowbanned: user.is_shadowbanned });
    return writeJson(res, 200, { ok: true, user: publicUser(user) });
  }

  const adminEdit = pathname.match(/^\/admin\/match\/([^/]+)\/edit$/);
  if (adminEdit && req.method === 'POST') {
    if (!isAdmin(viewer)) return writeJson(res, 403, { error: 'admin required' });
    const match = state.matches.find((item) => item.id === adminEdit[1]);
    if (!match) return writeJson(res, 404, { error: 'match not found' });
    try {
      const { score, status } = await parseBody(req);
      if (Array.isArray(score) && score.length === 2) match.score = score;
      if (status) match.status = status;
      return writeJson(res, 200, { ok: true, match });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const adminAssign = pathname.match(/^\/admin\/match\/([^/]+)\/assign-thread$/);
  if (adminAssign && req.method === 'POST') {
    if (!isAdmin(viewer)) return writeJson(res, 403, { error: 'admin required' });
    const match = state.matches.find((item) => item.id === adminAssign[1]);
    if (!match) return writeJson(res, 404, { error: 'match not found' });
    try {
      const { thread_id } = await parseBody(req);
      const thread = state.threads.find((item) => item.id === thread_id);
      if (!thread) return writeJson(res, 404, { error: 'thread not found' });
      match.officialThreadId = thread_id;
      return writeJson(res, 200, { ok: true, match });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const matchGet = pathname.match(/^\/matches\/([^/]+)$/);
  if (matchGet && req.method === 'GET') {
    const match = state.matches.find((item) => item.id === matchGet[1]);
    if (!match) return writeJson(res, 404, { error: 'match not found' });
    const communityThreads = state.threads
      .filter((thread) => thread.context_type === 'match' && thread.context_id === match.id && visibleThread(thread, viewer))
      .map((thread) => ({ ...withAuthor(thread), score: scoreFor('thread', thread.id) }));
    return writeJson(res, 200, { match, communityThreads });
  }

  const threadGet = pathname.match(/^\/threads\/([^/]+)$/);
  if (threadGet && req.method === 'GET') {
    const thread = state.threads.find((item) => item.id === threadGet[1]);
    if (!thread || !visibleThread(thread, viewer)) return writeJson(res, 404, { error: 'thread not found' });
    const comments = state.comments
      .filter((comment) => comment.thread_id === thread.id && !comment.deleted_at)
      .map((comment) => ({ ...withAuthor(comment), score: scoreFor('comment', comment.id), collapsedByDefault: comment.depth > COLLAPSE_DEFAULT_DEPTH, auto_hidden: scoreFor('comment', comment.id) <= AUTO_HIDE_COMMENT_SCORE }));
    return writeJson(res, 200, { thread: { ...withAuthor(thread), score: scoreFor('thread', thread.id) }, comments });
  }


  if (pathname === '/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const map = url.searchParams.get('map');
    const agent = url.searchParams.get('agent');
    const patch = url.searchParams.get('patch');
    const results = state.threads
      .filter((thread) => visibleThread(thread, viewer))
      .map((thread) => {
        const rep = reputationForUser(thread.author_id);
        const score = scoreFor('thread', thread.id);
        const recency = 1 / Math.max((Date.now() - new Date(thread.created_at).getTime()) / 3600000, 1);
        const blob = `${thread.title} ${thread.body} ${(thread.tags || []).join(' ')}`.toLowerCase();
        const queryHit = !q || blob.includes(q);
        const mapHit = !map || blob.includes(map.toLowerCase());
        const agentHit = !agent || blob.includes(agent.toLowerCase());
        const patchHit = !patch || blob.includes(patch.toLowerCase());
        return { thread: { ...withAuthor(thread), score }, rank: rep * 0.4 + score * 3 + recency * 12, include: queryHit && mapHit && agentHit && patchHit };
      })
      .filter((item) => item.include)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 25);
    return writeJson(res, 200, { results: results.map((item) => item.thread) });
  }

  if (pathname === '/me/preferences' && req.method === 'PUT') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    try {
      const { favorite_teams = [], regions = [], muted_teams = [], muted_events = [] } = await parseBody(req);
      viewer.preferences = { favorite_teams, regions, muted_teams, muted_events };
      return writeJson(res, 200, { ok: true, preferences: viewer.preferences });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  if (pathname === '/mod/log' && req.method === 'GET') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    return writeJson(res, 200, { actions: state.moderationLog.slice(-100).reverse() });
  }

  const reportMatch = pathname.match(/^\/comments\/([^/]+)\/report$/);
  if (reportMatch && req.method === 'POST') {
    if (!viewer) return writeJson(res, 401, { error: 'unauthorized' });
    const comment = state.comments.find((item) => item.id === reportMatch[1] && !item.deleted_at);
    if (!comment) return writeJson(res, 404, { error: 'comment not found' });
    try {
      const { reason = 'unspecified' } = await parseBody(req);
      const weight = Math.max(1, Math.floor(reputationForUser(viewer.id) / 50));
      state.reports.push({ id: nextId('rep', state.reports), comment_id: comment.id, reporter_id: viewer.id, reason, weight, created_at: new Date().toISOString() });
      return writeJson(res, 201, { ok: true });
    } catch {
      return writeJson(res, 400, { error: 'invalid request body' });
    }
  }

  const cooldownMatch = pathname.match(/^\/mod\/thread\/([^/]+)\/cooldown$/);
  if (cooldownMatch && req.method === 'POST') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    const thread = state.threads.find((item) => item.id === cooldownMatch[1]);
    if (!thread) return writeJson(res, 404, { error: 'thread not found' });
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    state.threadCooldowns = state.threadCooldowns.filter((item) => item.thread_id !== thread.id);
    state.threadCooldowns.push({ thread_id: thread.id, until, seconds_between_posts: SLOW_MODE_SECONDS });
    logModAction(viewer, 'thread_cooldown_enabled', { thread_id: thread.id, until });
    return writeJson(res, 200, { ok: true, until, seconds_between_posts: SLOW_MODE_SECONDS });
  }

  if (pathname === '/system/metrics' && req.method === 'GET') {
    if (!viewer || !canModerate(viewer)) return writeJson(res, 403, { error: 'moderator required' });
    return writeJson(res, 200, { request_metrics: state.requestMetrics, moderation_actions: state.moderationLog.length, deletion_reasons: state.reports.reduce((acc, item) => { acc[item.reason] = (acc[item.reason] || 0) + 1; return acc; }, {}) });
  }

  const sanitizedPath = pathname === '/' ? '/index.html' : pathname;
  const targetPath = path.join(PUBLIC_DIR, sanitizedPath);
  if (!targetPath.startsWith(PUBLIC_DIR)) return writeJson(res, 403, { error: 'forbidden' });
  return serveFile(targetPath, res);
});

server.listen(PORT, () => {
  console.log(`Valorant forum running at http://localhost:${PORT}`);
});
