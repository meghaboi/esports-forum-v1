const view = document.getElementById('view');
const pulseBar = document.getElementById('pulseBar');
const refreshBtn = document.getElementById('refreshBtn');
const refreshTime = document.getElementById('refreshTime');
const authBtn = document.getElementById('authBtn');
const logoutBtn = document.getElementById('logoutBtn');
const identity = document.getElementById('identity');
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const switchAuth = document.getElementById('switchAuth');
const authTitle = document.getElementById('authTitle');
const newThreadBtn = document.getElementById('newThreadBtn');
const threadModal = document.getElementById('threadModal');
const threadForm = document.getElementById('threadForm');
const preview = document.getElementById('preview');

let mode = 'login';
let accessToken = null;
let me = null;
let home = null;
let selectedThreadIndex = 0;
const savedThreads = new Set(JSON.parse(localStorage.getItem('savedThreads') || '[]'));
const watchedMatches = new Set(JSON.parse(localStorage.getItem('watchedMatches') || '[]'));


function md(text) {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setIdentity() {
  if (!me) {
    identity.textContent = 'Guest';
    newThreadBtn.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    return;
  }
  identity.innerHTML = `${me.username} <span class="badge ${me.role}">${me.role}</span>`;
  newThreadBtn.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
}

function relativeTime(iso) {
  const delta = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return delta < 60 ? `${delta}m ago` : `${Math.floor(delta / 60)}h ago`;
}

function pulse(matches) {
  pulseBar.innerHTML = matches.map((m) => `<div class="pulse-item" data-id="${m.id}">${m.status} • ${m.teams[0].short} ${m.score[0]}-${m.score[1]} ${m.teams[1].short} <button data-watch-match="${m.id}">${watchedMatches.has(m.id) ? 'Unwatch' : 'Watch'}</button></div>`).join('');
  pulseBar.querySelectorAll('.pulse-item').forEach((el) => el.addEventListener('click', (event) => {
    if (event.target.matches('[data-watch-match]')) return;
    renderMatch(el.dataset.id);
  }));
  pulseBar.querySelectorAll('[data-watch-match]').forEach((btn) => btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = btn.dataset.watchMatch;
    if (watchedMatches.has(id)) watchedMatches.delete(id); else watchedMatches.add(id);
    localStorage.setItem('watchedMatches', JSON.stringify(Array.from(watchedMatches)));
    pulse(matches);
  }));
}

function modActions(thread) {
  if (!me || !['moderator', 'admin'].includes(me.role)) return '';
  return `<button data-mod-lock="${thread.id}">${thread.is_locked ? 'Unlock' : 'Lock'}</button> <button data-mod-pin="${thread.id}">${thread.is_pinned ? 'Unpin' : 'Pin'}</button>`;
}

function threadRow(thread) {
  const author = thread.author || { username: 'unknown', role: 'user' };
  const banned = author.is_shadowbanned ? ' • shadowbanned' : '';
  return `
    <div class="thread-row ${thread.deleted_at ? 'soft' : ''}">
      <div class="score-col">
        <button class="vote-btn" data-vote="1" data-type="thread" data-id="${thread.id}">▲</button>
        ${thread.score || 0}
        <button class="vote-btn" data-vote="-1" data-type="thread" data-id="${thread.id}">▼</button>
      </div>
      <div>${thread.is_locked ? '🔒' : ''}</div>
      <div>
        <a href="#thread/${thread.id}"><strong>${thread.title}</strong></a>
        <div class="meta">u/${author.username} <span class="badge ${author.role}">${author.role}</span> • ${relativeTime(thread.created_at)}${banned} • heat ${thread.heat || 0}</div>
      </div>
      <div><button data-save-thread="${thread.id}">${savedThreads.has(thread.id) ? 'Unsave' : 'Save'}</button> ${modActions(thread)}</div>
    </div>`;
}

function renderHome() {
  view.innerHTML = `
    <div class="panel">
      <h2>Match Summaries</h2>
      ${(home.summaries || []).map((thread) => `<div class="section"><a href="#thread/${thread.id}"><strong>${thread.title}</strong></a><div class="meta">${thread.author?.username || 'unknown'} • ▲${thread.score}</div></div>`).join('') || '<div class="section">No summaries yet.</div>'}
      <h2>Hot Threads</h2>
      ${home.threads.map(threadRow).join('') || '<div class="section">No threads yet.</div>'}
    </div>`;
  bindThreadActions();
  highlightThreadSelection();
}

function commentTree(comments, parent = null) {
  return comments.filter((c) => c.parent_id === parent).map((c) => {
    const author = c.author || { username: 'unknown', role: 'user' };
    const anchor = c.anchor && c.anchor.map ? `<div class="meta">${c.anchor.map}${c.anchor.half ? ` • ${c.anchor.half}` : ''}${c.anchor.round_start ? ` • R${c.anchor.round_start}${c.anchor.round_end ? `-R${c.anchor.round_end}` : ''}` : ''}</div>` : '';
    return `<div class="comment ${c.collapsedByDefault ? 'collapsed' : ''}">${c.auto_hidden ? '<div class="meta">Auto-hidden by threshold</div>' : ''}<div><strong>u/${author.username}</strong> <span class="badge ${author.role}">${author.role}</span> ▲${c.score}</div>${anchor}<div>${c.body}</div>${commentTree(comments, c.id)}</div>`;
  }).join('');
}

async function renderThread(id) {
  const data = await request(`/threads/${id}`);
  view.innerHTML = `<div class="section"><h3>${data.thread.title}</h3><p>${data.thread.body}</p><div class="meta">${data.thread.context_type}:${data.thread.context_id} ${data.thread.is_locked ? '🔒 locked' : ''}</div></div><div class="section"><h3>Comments</h3>${commentTree(data.comments)}</div>`;
  bindThreadActions();
}

async function renderMatch(id) {
  const data = await request(`/matches/${id}`);
  view.innerHTML = `<div class="section"><h3>${data.match.event}: ${data.match.teams[0].short} vs ${data.match.teams[1].short}</h3><p>Score ${data.match.score[0]}-${data.match.score[1]} • ${data.match.status}</p><h4>Community Threads</h4>${data.communityThreads.map(threadRow).join('')}</div>`;
  bindThreadActions();
}

function bindThreadActions() {
  document.querySelectorAll('[data-vote]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!me) return alert('Login required');
    await request('/vote', { method: 'POST', body: JSON.stringify({ target_type: btn.dataset.type, target_id: btn.dataset.id, value: Number(btn.dataset.vote) }) });
    await loadHome();
    if (window.location.hash.startsWith('#thread/')) await renderThread(window.location.hash.replace('#thread/', ''));
  }));
  document.querySelectorAll('[data-mod-lock]').forEach((btn) => btn.addEventListener('click', async () => {
    await request(`/mod/thread/${btn.dataset.modLock}/lock`, { method: 'POST' });
    await loadHome();
  }));
  document.querySelectorAll('[data-mod-pin]').forEach((btn) => btn.addEventListener('click', async () => {
    await request(`/mod/thread/${btn.dataset.modPin}/pin`, { method: 'POST' });
    await loadHome();
  }));
  document.querySelectorAll('[data-save-thread]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.dataset.saveThread;
    if (savedThreads.has(id)) savedThreads.delete(id); else savedThreads.add(id);
    localStorage.setItem('savedThreads', JSON.stringify(Array.from(savedThreads)));
    renderHome();
  }));
}


function highlightThreadSelection() {
  const rows = Array.from(document.querySelectorAll('.thread-row'));
  rows.forEach((row, index) => row.classList.toggle('selected', index === selectedThreadIndex));
}

function moveSelection(dir) {
  const rows = Array.from(document.querySelectorAll('.thread-row'));
  if (!rows.length) return;
  selectedThreadIndex = Math.max(0, Math.min(rows.length - 1, selectedThreadIndex + dir));
  highlightThreadSelection();
  rows[selectedThreadIndex].scrollIntoView({ block: 'nearest' });
}

async function loadHome() {
  home = await request('/home');
  refreshTime.textContent = `Refreshed ${new Date(home.refreshedAt).toLocaleTimeString()}`;
  pulse(home.matchPulse);
  renderHome();
}

function route() {
  const hash = window.location.hash;
  if (hash.startsWith('#thread/')) return renderThread(hash.replace('#thread/', '')).catch((e) => alert(e.message));
  renderHome();
}

authBtn.addEventListener('click', () => authModal.showModal());

switchAuth.addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  authTitle.textContent = mode === 'login' ? 'Login' : 'Register';
  switchAuth.textContent = mode === 'login' ? 'Need account?' : 'Have account?';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  try {
    if (mode === 'register') await request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    accessToken = login.access_token;
    me = login.user;
    setIdentity();
    authModal.close();
    await loadHome();
  } catch (err) {
    alert(err.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await request('/auth/logout', { method: 'POST' });
  } catch {
    // ignore logout failures
  }
  accessToken = null;
  me = null;
  setIdentity();
  await loadHome();
});

refreshBtn.addEventListener('click', () => loadHome().catch((e) => alert(e.message)));
newThreadBtn.addEventListener('click', () => threadModal.showModal());
document.getElementById('togglePreview').addEventListener('click', () => {
  preview.classList.toggle('hidden');
  preview.innerHTML = md(document.getElementById('threadBody').value);
});

threadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!me) return alert('Login required');
  try {
    await request('/threads', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('threadTitle').value,
        body: document.getElementById('threadBody').value,
        context_type: document.getElementById('contextType').value,
        context_id: document.getElementById('contextId').value,
        tags: document.getElementById('threadTags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
        thread_type: document.getElementById('threadType').value
      })
    });
    threadModal.close();
    await loadHome();
  } catch (err) {
    alert(err.message);
  }
});

window.addEventListener('hashchange', route);
window.addEventListener('keydown', (event) => {
  if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (event.key === 'j') moveSelection(1);
  if (event.key === 'k') moveSelection(-1);
});

(async function init() {
  try {
    await loadHome();
    route();
    setIdentity();
  } catch (err) {
    console.error(err);
  }
})();
