const view = document.getElementById('view');
const pulseBar = document.getElementById('pulseBar');
const refreshBtn = document.getElementById('refreshBtn');
const refreshTime = document.getElementById('refreshTime');

let homeData;

function statusClass(status) {
  return status.toLowerCase();
}

function relativeTime(iso) {
  const deltaMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (deltaMins < 60) return `${Math.max(deltaMins, 0)}m ago`;
  return `${Math.floor(deltaMins / 60)}h ago`;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderPulseBar(matches) {
  pulseBar.innerHTML = matches
    .map(
      (match) => `
      <div class="pulse-item" data-match-id="${match.id}">
        <div class="status ${statusClass(match.status)}">${match.status}</div>
        <div><strong>${match.teams[0].logo} ${match.teams[0].short}</strong> ${match.score[0]} - ${match.score[1]} <strong>${match.teams[1].short} ${match.teams[1].logo}</strong></div>
        <div class="meta">Bo${match.bestOf} • ${match.server} • ${match.event}</div>
      </div>
    `
    )
    .join('');

  pulseBar.querySelectorAll('.pulse-item').forEach((node) => {
    node.addEventListener('click', () => renderMatchHub(node.dataset.matchId));
  });
}

function renderHome() {
  const left = homeData.featuredPosts
    .map(
      (post) => `
    <article class="feature-item">
      <img src="${post.thumbnail}" alt="${post.headline}" />
      <div class="meta">${post.tag} • ${post.source}</div>
      <h3>${post.headline}</h3>
      <p class="muted">${post.summary}</p>
    </article>
  `
    )
    .join('');

  const right = homeData.recentThreads
    .map(
      (thread) => `
      <div class="thread-row ${thread.marker === 'hot' ? 'hot' : ''}">
        <div class="vote">▲ ${thread.upvotes}</div>
        <div>
          <a href="#thread/${thread.id}"><strong>${thread.title}</strong></a>
          <div class="meta">${thread.author} • ${relativeTime(thread.createdAt)} • ${thread.commentCount} comments ${thread.isLocked ? '• 🔒 locked' : ''}</div>
        </div>
      </div>
    `
    )
    .join('');

  view.innerHTML = `
    <section class="layout">
      <div class="panel">
        <h2>Featured News</h2>
        ${left}
      </div>
      <div class="panel">
        <h2>Recent Discussions</h2>
        ${right}
      </div>
    </section>
  `;
}

function commentTree(comments, parentId = null) {
  return comments
    .filter((comment) => comment.parentId === parentId)
    .map(
      (comment) => `
      <div class="comment">
        <div><strong>${comment.author}</strong> <span class="muted">▲${comment.score}</span></div>
        <div>${comment.body}</div>
        ${commentTree(comments, comment.id)}
      </div>
    `
    )
    .join('');
}

async function renderThread(threadId) {
  const data = await getJson(`/api/threads/${threadId}`);
  view.innerHTML = `
    <div class="context-bar">
      <strong>Thread</strong> • sort: Best | New | Old | Controversial
    </div>
    <div class="section">
      <h2>${data.thread.title}</h2>
      <p>${data.thread.body}</p>
      <div class="meta">${data.thread.author} • ${data.thread.tags.join(' • ')} ${data.thread.isLocked ? '• 🔒 locked' : ''}</div>
    </div>
    <div class="section">
      <h3>Replies</h3>
      ${commentTree(data.comments)}
    </div>
  `;
}

async function renderMatchHub(matchId) {
  const data = await getJson(`/api/matches/${matchId}`);
  const maps = data.match.maps
    .map((map) => `<li>${map.name}: ${map.score}${map.winner ? ` (${map.winner})` : ''}</li>`)
    .join('');
  const leaders = data.match.stats.acsLeaders
    .map((entry) => `<li>${entry.player} — ACS ${entry.acs} (${entry.kd})</li>`)
    .join('');
  const threads = data.communityThreads
    .map(
      (thread) => `<li><a href="#thread/${thread.id}">${thread.title}</a> <span class="meta">▲${thread.upvotes}</span></li>`
    )
    .join('');

  view.innerHTML = `
    <div class="context-bar">
      <div><strong>Match Hub:</strong> ${data.match.teams[0].short} vs ${data.match.teams[1].short} — ${data.match.event}</div>
      <div class="meta">Quick links: Stats | VOD | Timeline</div>
    </div>
    <div class="layout">
      <div class="section">
        <h3>Overview</h3>
        <p>Series score: ${data.match.score[0]} - ${data.match.score[1]} • Bo${data.match.bestOf} • ${data.match.status}</p>
        <ul>${maps || '<li>No maps played yet.</li>'}</ul>
      </div>
      <div class="section">
        <h3>Stats Snapshot</h3>
        <ul>${leaders || '<li>Stats available post-match.</li>'}</ul>
        <p class="muted">Result impact: ${data.match.impact}</p>
      </div>
    </div>
    <div class="section">
      <h3>Community Threads</h3>
      <ul>${threads || '<li>No threads yet for this match.</li>'}</ul>
    </div>
    <button id="backHome">Back to Home</button>
  `;

  document.getElementById('backHome').addEventListener('click', () => {
    window.location.hash = '';
    renderHome();
  });
}

async function loadHome() {
  homeData = await getJson('/api/home');
  refreshTime.textContent = `Last refreshed: ${new Date(homeData.refreshedAt).toLocaleTimeString()}`;
  renderPulseBar(homeData.matchPulse);
  renderHome();
}

function onRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#thread/')) {
    renderThread(hash.replace('#thread/', '')).catch(console.error);
    return;
  }
  renderHome();
}

refreshBtn.addEventListener('click', () => {
  loadHome().catch(console.error);
});

window.addEventListener('hashchange', onRoute);

loadHome().then(onRoute).catch(console.error);
