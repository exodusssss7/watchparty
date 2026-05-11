// ── WatchParty Client ──
const socket = io();

let isAdmin = false;
let currentRoomId = null;
let videoElement = null;
let ignoreEvents = false; // prevent sync loops

// ── DOM refs ──
const $landing = document.getElementById('landing');
const $room = document.getElementById('room');
const $modalCreate = document.getElementById('modal-create');
const $modalJoin = document.getElementById('modal-join');

// ── Modal controls ──
document.getElementById('btn-create-open').onclick = () => $modalCreate.classList.add('active');
document.getElementById('btn-join-open').onclick = () => $modalJoin.classList.add('active');
window.closeModals = () => {
  $modalCreate.classList.remove('active');
  $modalJoin.classList.remove('active');
};
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) closeModals(); });
});

// ── Create Room ──
document.getElementById('btn-create').onclick = () => {
  const username = document.getElementById('create-name').value.trim();
  const videoUrl = document.getElementById('create-url').value.trim();
  if (!username) return showError('create-error', 'Enter your name');
  socket.emit('create-room', { username, videoUrl });
};

// ── Join Room ──
document.getElementById('btn-join').onclick = () => {
  const username = document.getElementById('join-name').value.trim();
  const roomId = document.getElementById('join-code').value.trim().toUpperCase();
  if (!username) return showError('join-error', 'Enter your name');
  if (!roomId) return showError('join-error', 'Enter a room code');
  socket.emit('join-room', { roomId, username });
};

// Enter key support
document.getElementById('create-name').onkeydown = e => { if (e.key === 'Enter') document.getElementById('btn-create').click(); };
document.getElementById('join-code').onkeydown = e => { if (e.key === 'Enter') document.getElementById('btn-join').click(); };

// ── Socket: Room Created ──
socket.on('room-created', ({ roomId, room, isAdmin: admin }) => {
  isAdmin = admin;
  currentRoomId = roomId;
  enterRoom(room);
  if (room.videoUrl) loadVideo(room.videoUrl);
});

// ── Socket: Room Joined ──
socket.on('room-joined', ({ roomId, room, isAdmin: admin }) => {
  isAdmin = admin;
  currentRoomId = roomId;
  enterRoom(room);
  if (room.videoUrl) loadVideo(room.videoUrl);
});

socket.on('error-msg', ({ message }) => {
  if ($modalCreate.classList.contains('active')) showError('create-error', message);
  else showError('join-error', message);
});

// ── Enter Room UI ──
function enterRoom(room) {
  closeModals();
  $landing.style.display = 'none';
  $room.style.display = 'block';

  document.getElementById('room-code-text').textContent = room.id;
  const badge = document.getElementById('role-badge');
  if (isAdmin) {
    badge.textContent = '👑 ADMIN';
    badge.className = 'room-badge badge-admin';
  } else {
    badge.textContent = '👁 VIEWER';
    badge.className = 'room-badge badge-viewer';
    document.getElementById('url-bar').style.display = 'none';
  }
  updateMembers(room.members);
  addSystemMessage(`You joined the party!`);
}

// ── Copy room code ──
document.getElementById('room-code').onclick = () => {
  navigator.clipboard.writeText(document.getElementById('room-code-text').textContent);
  showToast('Room code copied!');
};

// ── Members ──
function updateMembers(members) {
  document.getElementById('member-count').textContent = members.length;
  const list = document.getElementById('members-list');
  list.innerHTML = members.map(m => `
    <div class="member-item">
      <div class="member-avatar">${m.username[0].toUpperCase()}</div>
      <span>${m.username} ${m.isAdmin ? '👑' : ''}</span>
    </div>
  `).join('');
}

document.getElementById('members-toggle').onclick = () => {
  document.getElementById('members-panel').classList.toggle('active');
};

socket.on('member-joined', ({ username, members }) => {
  updateMembers(members);
  addSystemMessage(`${username} joined the party 🎉`);
});
socket.on('member-left', ({ username, members }) => {
  updateMembers(members);
  addSystemMessage(`${username} left the party`);
});
socket.on('room-closed', ({ message }) => {
  alert(message);
  location.reload();
});

// ── Video Loading ──
document.getElementById('btn-load-video').onclick = () => {
  const url = document.getElementById('video-url-input').value.trim();
  if (!url) return;
  loadVideo(url);
  if (isAdmin) socket.emit('change-video', { videoUrl: url });
};

socket.on('video-changed', ({ videoUrl }) => {
  loadVideo(videoUrl);
});

// Check if URL points to a direct video file
function isDirectVideo(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|ogg|m3u8|mkv|avi|mov)(\?.*)?$/.test(pathname);
  } catch { return false; }
}

// Try to convert streaming site URLs into their embed equivalents
function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');

    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&enablejsapi=1`;

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;

    // Dailymotion
    const dmMatch = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
    if (dmMatch) return `https://www.dailymotion.com/embed/video/${dmMatch[1]}`;

    // Cineby — convert /movie/ID or /tv/ID to embed format
    if (host.includes('cineby')) {
      if (u.pathname.includes('/embed')) return url;
      const match = u.pathname.match(/\/(movie|tv)(\/.*)/);
      if (match) return `${u.origin}/embed/${match[1]}${match[2]}`;
      return url;
    }

    // Vidsrc patterns
    if (host.includes('vidsrc')) {
      if (u.pathname.includes('/embed')) return url;
      const match = u.pathname.match(/\/(movie|tv)(\/.*)/);
      if (match) return `${u.origin}/embed/${match[1]}${match[2]}`;
      return url;
    }

    // 2embed / multiembed
    if (host.includes('2embed') || host.includes('multiembed')) {
      return url;
    }

    // Already an embed URL? Use as-is
    if (u.pathname.includes('/embed')) return url;

    // Default: return original URL
    return url;
  } catch { return url; }
}

let currentLoadMode = 'direct'; // 'direct' or 'proxy'

function loadVideo(url, useProxy = false) {
  const container = document.getElementById('video-container');
  const placeholder = document.getElementById('video-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  // Remove old media
  if (videoElement) { videoElement.remove(); videoElement = null; }
  container.querySelectorAll('iframe, .load-error').forEach(el => el.remove());

  // ── CASE 1: Direct video file ──
  if (isDirectVideo(url)) {
    const vid = document.createElement('video');
    vid.src = url;
    vid.controls = true;
    vid.autoplay = false;
    vid.style.maxWidth = '100%';
    vid.style.maxHeight = '100%';
    container.appendChild(vid);
    videoElement = vid;
    attachVideoSync(vid);
    document.getElementById('video-url-input').value = url;
    return;
  }

  // ── CASE 2: Streaming site / webpage → iframe embed ──
  const embedUrl = toEmbedUrl(url);
  const iframeSrc = useProxy
    ? `/proxy?url=${encodeURIComponent(embedUrl)}`
    : embedUrl;

  currentLoadMode = useProxy ? 'proxy' : 'direct';

  const iframe = document.createElement('iframe');
  iframe.src = iframeSrc;
  iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write';
  iframe.allowFullscreen = true;
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('webkitallowfullscreen', '');
  iframe.setAttribute('mozallowfullscreen', '');
  iframe.referrerPolicy = 'no-referrer';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox');
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.background = '#0c0c0b';

  // Error / timeout detection
  let loaded = false;
  iframe.onload = () => { loaded = true; };

  // After 8 seconds, if not loaded and not already using proxy, show retry option
  setTimeout(() => {
    if (!loaded && !useProxy) {
      showRetryOption(container, url);
    }
  }, 8000);

  container.appendChild(iframe);
  videoElement = null;

  document.getElementById('video-url-input').value = url;
  showToast(useProxy ? '🔄 Loading via proxy...' : '🎬 Loading stream...');
}

function showRetryOption(container, url) {
  // Check if iframe actually has content - if body is blank, show retry
  const existing = container.querySelector('.load-error');
  if (existing) return;

  const div = document.createElement('div');
  div.className = 'load-error';
  div.style.cssText = `
    position: absolute; bottom: 60px; left: 50%; transform: translateX(-50%);
    background: rgba(34,34,32,0.95); backdrop-filter: blur(8px);
    border: 1px solid rgba(244,230,200,0.1); border-radius: 12px;
    padding: 14px 20px; z-index: 20; text-align: center;
    font-size: .85rem; color: #f0e8da; max-width: 90%;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  `;
  div.innerHTML = `
    <div style="margin-bottom: 8px; color: #c4a882;">Stream not loading? Some sites block direct embeds.</div>
    <button onclick="loadVideo('${url.replace(/'/g, "\\'")}', true)" style="
      padding: 8px 18px; border: none; border-radius: 8px;
      background: linear-gradient(145deg, #d4a853, #c49340);
      color: #111110; font-weight: 700; font-size: .82rem;
      cursor: pointer; font-family: inherit; margin-right: 8px;
    ">🔄 Try via Proxy</button>
    <button onclick="this.parentElement.remove()" style="
      padding: 8px 14px; border: 1px solid rgba(244,230,200,0.1);
      border-radius: 8px; background: transparent; color: #c4a882;
      font-size: .82rem; cursor: pointer; font-family: inherit;
    ">Dismiss</button>
  `;
  container.appendChild(div);
}

// Attach play/pause/seek sync events to a native HTML5 video element
function attachVideoSync(vid) {
  if (isAdmin) {
    vid.addEventListener('play', () => {
      if (ignoreEvents) return;
      socket.emit('video-play', { currentTime: vid.currentTime });
    });
    vid.addEventListener('pause', () => {
      if (ignoreEvents) return;
      socket.emit('video-pause', { currentTime: vid.currentTime });
    });
    vid.addEventListener('seeked', () => {
      if (ignoreEvents) return;
      socket.emit('video-seek', { currentTime: vid.currentTime });
    });
  }
}

// ── Video Sync (for non-admin) ──
socket.on('sync-video', (state) => {
  if (!videoElement || isAdmin) return;

  ignoreEvents = true;

  const timeDiff = Math.abs(videoElement.currentTime - state.currentTime);
  if (timeDiff > 1.5) {
    videoElement.currentTime = state.currentTime;
  }

  if (state.playing && videoElement.paused) {
    videoElement.play().catch(() => {});
  } else if (!state.playing && !videoElement.paused) {
    videoElement.pause();
  }

  setTimeout(() => { ignoreEvents = false; }, 200);
});

// Periodic sync for non-admin (every 5s)
setInterval(() => {
  if (!isAdmin && currentRoomId && videoElement) {
    socket.emit('request-sync');
  }
}, 5000);

// ── Chat ──
const $chatMessages = document.getElementById('chat-messages');
const $chatInput = document.getElementById('chat-input');

document.getElementById('btn-send-chat').onclick = sendChat;
$chatInput.onkeydown = e => { if (e.key === 'Enter') sendChat(); };

function sendChat() {
  const msg = $chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat-message', { message: msg });
  $chatInput.value = '';
}

socket.on('chat-message', ({ username, message, isAdmin: admin, timestamp }) => {
  const isSelf = username === (document.getElementById('create-name').value.trim() || document.getElementById('join-name').value.trim());
  const div = document.createElement('div');
  div.className = `chat-msg${isSelf ? ' self' : ''}`;
  div.innerHTML = `
    <div class="msg-user">
      ${username} ${admin ? '<span class="admin-tag">ADMIN</span>' : ''}
    </div>
    <div class="msg-body">${escapeHtml(message)}</div>
  `;
  $chatMessages.appendChild(div);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
});

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  $chatMessages.appendChild(div);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

// ── Chat Toggle ──
const $chatPanel = document.getElementById('chat-panel');
document.getElementById('btn-toggle-chat').onclick = function() {
  $chatPanel.classList.toggle('hidden');
  this.classList.toggle('active');
};

// ── Leave Room ──
document.getElementById('btn-leave').onclick = () => {
  if (confirm('Leave the party?')) location.reload();
};

// ── Helpers ──
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 4000);
}

function showToast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
