const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const state = {
  featuredPosts: [
    {
      id: 'news-1',
      headline: 'Riot confirms Stage 2 format adjustments for VCT Americas',
      source: 'Riot Esports',
      summary: 'Playoff seeding and map veto rules updated for better cross-regional parity.',
      thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80',
      tag: 'Format Update'
    },
    {
      id: 'news-2',
      headline: 'DRX trialing sixth-man system ahead of Masters',
      source: 'VALORANT Esports Daily',
      summary: 'Coaching staff confirms role-flex experiments on Bind and Lotus.',
      thumbnail: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
      tag: 'Roster'
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
      maps: [
        { name: 'Ascent', score: '13-11', winner: 'SEN' },
        { name: 'Split', score: '8-13', winner: 'PRX' },
        { name: 'Lotus', score: '6-5', winner: null }
      ],
      stats: {
        acsLeaders: [
          { player: 'zekken', acs: 261, kd: '39/31' },
          { player: 'something', acs: 248, kd: '35/29' }
        ]
      },
      impact: 'Winner secures upper-bracket semifinal seeding.'
    },
    {
      id: 'm-101',
      event: 'VCT Masters Madrid',
      status: 'COMPLETED',
      bestOf: 3,
      server: 'Madrid LAN',
      startTime: '2026-02-05T15:00:00Z',
      teams: [
        { id: 't-g2', name: 'G2 Esports', short: 'G2', logo: '⚪' },
        { id: 't-edg', name: 'EDward Gaming', short: 'EDG', logo: '🟨' }
      ],
      score: [2, 0],
      winner: 'G2',
      maps: [
        { name: 'Bind', score: '13-7', winner: 'G2' },
        { name: 'Sunset', score: '13-10', winner: 'G2' }
      ],
      stats: {
        acsLeaders: [{ player: 'leaf', acs: 287, kd: '43/24' }]
      },
      impact: 'G2 qualifies for playoffs; EDG drops to elimination path.'
    },
    {
      id: 'm-102',
      event: 'Americas Challengers',
      status: 'UPCOMING',
      bestOf: 5,
      server: 'NA East',
      startTime: '2026-02-05T22:00:00Z',
      teams: [
        { id: 't-mibr', name: 'MIBR', short: 'MIBR', logo: '🟩' },
        { id: 't-lev', name: 'Leviatán', short: 'LEV', logo: '🟪' }
      ],
      score: [0, 0],
      maps: [],
      stats: { acsLeaders: [] },
      impact: 'Winner earns direct slot into regional finals.'
    }
  ],
  threads: [
    {
      id: 'th-1',
      title: 'SEN vs PRX was overcooked by timeout economy',
      body: 'SEN burned both tactical timeouts before round 18 and lost momentum. Coaching diff?',
      author: 'u/aimdiff',
      createdAt: '2026-02-05T18:40:00Z',
      upvotes: 124,
      commentCount: 89,
      tags: ['Meta Shift', 'Ascent', 'Jett'],
      marker: 'hot',
      context: [
        { type: 'match', id: 'm-100' },
        { type: 'event', id: 'vct-masters-madrid' }
      ]
    },
    {
      id: 'th-2',
      title: 'Is Viper mandatory on Lotus after 10.02?',
      body: 'Controllers look solved but teams keep forcing double-initiator. Why?',
      author: 'u/defaultplant',
      createdAt: '2026-02-05T16:30:00Z',
      upvotes: 91,
      commentCount: 44,
      tags: ['Patch 10.02', 'Lotus', 'Viper'],
      marker: 'meta',
      context: [{ type: 'patch', id: '10.02' }]
    },
    {
      id: 'th-3',
      title: 'EDG looked lost on anti-eco pathing vs G2',
      body: 'Three rounds thrown to sheriff stacks. Their spacing looked disconnected.',
      author: 'u/sloworb',
      createdAt: '2026-02-05T15:55:00Z',
      upvotes: 67,
      commentCount: 22,
      tags: ['Upset', 'Bind'],
      marker: 'upset',
      context: [
        { type: 'match', id: 'm-101' },
        { type: 'team', id: 't-edg' }
      ]
    }
  ],
  comments: [
    {
      id: 'c-1',
      threadId: 'th-1',
      parentId: null,
      path: '0001',
      author: 'u/fragfinance',
      score: 35,
      body: 'Timeouts were fine, the real issue was ult economy into round 21.',
      createdAt: '2026-02-05T18:45:00Z'
    },
    {
      id: 'c-2',
      threadId: 'th-1',
      parentId: 'c-1',
      path: '0001.0001',
      author: 'u/aimdiff',
      score: 18,
      body: 'Agree on ults, but they still forced low-buy to protect op funds.',
      createdAt: '2026-02-05T18:52:00Z'
    },
    {
      id: 'c-3',
      threadId: 'th-1',
      parentId: null,
      path: '0002',
      author: 'u/mapveto',
      score: 21,
      body: 'PRX read the B splits after halftime. Mid defaults were too predictable.',
      createdAt: '2026-02-05T18:50:00Z'
    }
  ],
  moderation: {
    lockedThreads: ['th-3'],
    shadowBannedUsers: []
  }
};

function writeJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveFile(filePath, res) {
  const ext = path.extname(filePath);
  const typeMap = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      writeJson(res, 404, { error: 'Not found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': typeMap[ext] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function enrichThread(thread) {
  return {
    ...thread,
    isLocked: state.moderation.lockedThreads.includes(thread.id),
    freshness: 'reload'
  };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith('/api')) {
    if (req.method === 'GET' && pathname === '/api/home') {
      writeJson(res, 200, {
        refreshedAt: new Date().toISOString(),
        matchPulse: state.matches,
        featuredPosts: state.featuredPosts,
        recentThreads: state.threads.map(enrichThread)
      });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/matches/')) {
      const id = pathname.split('/').pop();
      const match = state.matches.find((item) => item.id === id);
      if (!match) {
        writeJson(res, 404, { error: 'Match not found' });
        return;
      }
      const relatedThreads = state.threads
        .filter((thread) => thread.context.some((ctx) => ctx.type === 'match' && ctx.id === id))
        .map(enrichThread);
      writeJson(res, 200, {
        refreshedAt: new Date().toISOString(),
        match,
        communityThreads: relatedThreads
      });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/api/threads/')) {
      const threadId = pathname.split('/').pop();
      const thread = state.threads.find((item) => item.id === threadId);
      if (!thread) {
        writeJson(res, 404, { error: 'Thread not found' });
        return;
      }
      const comments = state.comments
        .filter((comment) => comment.threadId === threadId)
        .sort((a, b) => a.path.localeCompare(b.path));
      writeJson(res, 200, {
        refreshedAt: new Date().toISOString(),
        thread: enrichThread(thread),
        comments
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/mod/lock-thread') {
      try {
        const { threadId } = await parseBody(req);
        if (!threadId) {
          writeJson(res, 400, { error: 'threadId is required' });
          return;
        }
        if (!state.moderation.lockedThreads.includes(threadId)) {
          state.moderation.lockedThreads.push(threadId);
        }
        writeJson(res, 200, { ok: true, lockedThreads: state.moderation.lockedThreads });
      } catch {
        writeJson(res, 400, { error: 'Invalid JSON payload' });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/mod/edit-match-result') {
      try {
        const { matchId, score, winner } = await parseBody(req);
        const match = state.matches.find((item) => item.id === matchId);
        if (!match) {
          writeJson(res, 404, { error: 'Match not found' });
          return;
        }
        if (Array.isArray(score) && score.length === 2) {
          match.score = score;
        }
        if (winner) {
          match.winner = winner;
          match.status = 'COMPLETED';
        }
        writeJson(res, 200, { ok: true, match });
      } catch {
        writeJson(res, 400, { error: 'Invalid JSON payload' });
      }
      return;
    }

    writeJson(res, 404, { error: 'API route not found' });
    return;
  }

  const sanitizedPath = pathname === '/' ? '/index.html' : pathname;
  const targetPath = path.join(PUBLIC_DIR, sanitizedPath);
  if (!targetPath.startsWith(PUBLIC_DIR)) {
    writeJson(res, 403, { error: 'Forbidden' });
    return;
  }

  serveFile(targetPath, res);
});

server.listen(PORT, () => {
  console.log(`Valorant forum running at http://localhost:${PORT}`);
});
