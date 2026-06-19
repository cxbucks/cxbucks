// popup.js - Automatic CX-Bucks

let streamers = [];
let settings = {};

// ─── INIT ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderStreamers();
  renderSettings();
  bindEvents();
});

async function loadData() {
  return new Promise(resolve => {
    chrome.storage.local.get(['streamers', 'settings'], (data) => {
      streamers = data.streamers || [];
      settings = data.settings || {
        autoOpenTabs: true,
        reopenClosedTabs: true,
        parrot: true
      };
      resolve();
    });
  });
}

// ─── TABS ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── EVENTS ───────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('addBtn').addEventListener('click', addStreamer);
  document.getElementById('streamerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addStreamer();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');
    btn.disabled = true;
    chrome.runtime.sendMessage({ type: 'POLL_NOW' }, () => {
      setTimeout(async () => {
        await loadData();
        renderStreamers();
        btn.classList.remove('spinning');
        btn.disabled = false;
        updateLastChecked();
      }, 1500);
    });
  });

  document.getElementById('saveBtn').addEventListener('click', saveSettings);
}

// ─── ADD STREAMER ─────────────────────────────────────────────────────────

async function addStreamer() {
  const input = document.getElementById('streamerInput');
  const username = input.value.trim().toLowerCase().replace(/^@/, '');
  if (!username) return;

  if (streamers.find(s => s.username === username)) {
    showToast('Already in the list!');
    return;
  }

  const newStreamer = {
    username,
    isLive: false,
    viewerCount: 0,
    streamTitle: '',
    avatarUrl: '',
    addedAt: Date.now(),
    lastChecked: null
  };

  streamers.push(newStreamer);
  await saveStreamers();
  renderStreamers();
  input.value = '';
  showToast(`Added @${username}`);

  chrome.runtime.sendMessage({ type: 'POLL_NOW' }, () => {
    setTimeout(async () => {
      await loadData();
      renderStreamers();
    }, 2000);
  });
}

// ─── REMOVE STREAMER ──────────────────────────────────────────────────────

async function removeStreamer(username) {
  streamers = streamers.filter(s => s.username !== username);
  await saveStreamers();
  renderStreamers();
  showToast(`Removed @${username}`);
}

// ─── RENDER STREAMERS ─────────────────────────────────────────────────────

function renderStreamers() {
  const list = document.getElementById('streamerList');
  const liveCountEl = document.getElementById('liveCount');

  if (streamers.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📡</div>
        <p>No streamers added yet.<br/>Enter a Kick username above to start monitoring.</p>
      </div>`;
    liveCountEl.textContent = '0 live';
    return;
  }

  const sorted = [...streamers].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.username.localeCompare(b.username);
  });

  const liveCount = sorted.filter(s => s.isLive).length;
  liveCountEl.textContent = `${liveCount} live`;

  list.innerHTML = sorted.map(s => {
    const initial = s.username[0].toUpperCase();
    const avatarHtml = s.avatarUrl
      ? `<img src="${escHtml(s.avatarUrl)}" alt="${escHtml(s.username)}" onerror="this.parentElement.textContent='${initial}'" />`
      : initial;

    const metaText = s.isLive
      ? `${formatViewers(s.viewerCount)} viewers${s.streamTitle ? ' · ' + truncate(s.streamTitle, 28) : ''}`
      : s.lastChecked ? `Checked ${timeAgo(s.lastChecked)}` : 'Not yet checked';

    return `
      <div class="streamer-card ${s.isLive ? 'is-live' : ''}" data-username="${escHtml(s.username)}">
        <div class="streamer-avatar">${avatarHtml}</div>
        <div class="streamer-info">
          <div class="streamer-name">
            @${escHtml(s.username)}
            ${s.isLive ? '<span class="live-badge">LIVE</span>' : ''}
          </div>
          <div class="streamer-meta">${escHtml(metaText)}</div>
        </div>
        <div class="streamer-actions">
          ${s.isLive ? `<button class="icon-btn" title="Open stream" data-action="open" data-username="${escHtml(s.username)}">▶</button>` : ''}
          <button class="icon-btn danger" title="Remove" data-action="remove" data-username="${escHtml(s.username)}">✕</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const username = btn.dataset.username;
      if (action === 'remove') removeStreamer(username);
      if (action === 'open') chrome.runtime.sendMessage({ type: 'OPEN_STREAM', username });
    });
  });

  updateLastChecked();
}

// ─── RENDER SETTINGS ──────────────────────────────────────────────────────

function renderSettings() {
  const toggles = ['autoOpenTabs', 'reopenClosedTabs', 'parrot'];
  toggles.forEach(key => {
    const el = document.getElementById(`toggle-${key}`);
    if (el) el.checked = !!settings[key];
  });
}

// ─── SAVE SETTINGS ────────────────────────────────────────────────────────

async function saveSettings() {
  const toggles = ['autoOpenTabs', 'reopenClosedTabs', 'parrot'];
  toggles.forEach(key => {
    const el = document.getElementById(`toggle-${key}`);
    if (el) settings[key] = el.checked;
  });

  await new Promise(resolve => chrome.storage.local.set({ settings }, resolve));

  chrome.tabs.query({ url: 'https://kick.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    });
  });

  showToast('✓ Settings saved!');
}

// ─── STORAGE ──────────────────────────────────────────────────────────────

function saveStreamers() {
  return new Promise(resolve => chrome.storage.local.set({ streamers }, resolve));
}

// ─── LISTEN FOR LIVE UPDATES ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STREAMER_STATUS_UPDATE') {
    const s = streamers.find(x => x.username === message.username);
    if (s) {
      s.isLive = message.isLive;
      s.viewerCount = message.viewerCount;
      s.streamTitle = message.streamTitle;
      s.lastChecked = Date.now();
      renderStreamers();
    }
  }
});

// ─── UTILS ────────────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function updateLastChecked() {
  const checked = streamers.filter(s => s.lastChecked);
  if (checked.length === 0) return;
  const latest = Math.max(...checked.map(s => s.lastChecked));
  document.getElementById('lastChecked').textContent = `Checked ${timeAgo(latest)}`;
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatViewers(n) {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
