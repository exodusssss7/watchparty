const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to bypass X-Frame-Options / CSP blocking
app.get('/proxy', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const proxyReq = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': parsedUrl.origin,
        'Origin': parsedUrl.origin
      }
    }, (proxyRes) => {
      // Strip frame-blocking headers
      const headers = { ...proxyRes.headers };
      delete headers['x-frame-options'];
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];

      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && headers.location) {
        return res.redirect(`/proxy?url=${encodeURIComponent(headers.location)}`);
      }

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      res.status(502).send('Proxy error');
    });

    proxyReq.setTimeout(10000, () => {
      proxyReq.destroy();
      res.status(504).send('Proxy timeout');
    });
  } catch (err) {
    res.status(400).send('Invalid URL');
  }
});

// In-memory room storage
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Create a new room
  socket.on('create-room', ({ username, videoUrl }) => {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room = {
      id: roomId,
      adminId: socket.id,
      adminName: username,
      videoUrl: videoUrl,
      members: [{ id: socket.id, username, isAdmin: true }],
      videoState: { playing: false, currentTime: 0, lastUpdate: Date.now() },
      subCues: []
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    socket.emit('room-created', {
      roomId,
      room: sanitizeRoom(room),
      isAdmin: true
    });

    console.log(`🎬 Room ${roomId} created by ${username}`);
  });

  // Join existing room
  socket.on('join-room', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error-msg', { message: 'Room not found. Check your code and try again.' });
      return;
    }

    // Check for duplicate username
    const nameTaken = room.members.some(m => m.username.toLowerCase() === username.toLowerCase());
    if (nameTaken) {
      socket.emit('error-msg', { message: 'Username already taken in this room.' });
      return;
    }

    room.members.push({ id: socket.id, username, isAdmin: false });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    // Send room info to the joiner
    socket.emit('room-joined', {
      roomId,
      room: sanitizeRoom(room),
      isAdmin: false
    });

    // Notify everyone in the room
    io.to(roomId).emit('member-joined', {
      username,
      members: room.members.map(m => ({ username: m.username, isAdmin: m.isAdmin }))
    });

    // Send current video state so joiner syncs
    socket.emit('sync-video', room.videoState);
    socket.emit('sync-subtitles', { subCues: room.subCues });

    console.log(`👤 ${username} joined room ${roomId}`);
  });

  // Admin: video URL changed
  socket.on('change-video', ({ videoUrl }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;

    room.videoUrl = videoUrl;
    room.videoState = { playing: false, currentTime: 0, lastUpdate: Date.now() };

    io.to(socket.roomId).emit('video-changed', { videoUrl });
    io.to(socket.roomId).emit('sync-video', room.videoState);
  });

  // Admin: play/pause
  socket.on('video-play', ({ currentTime }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;

    room.videoState = { playing: true, currentTime, lastUpdate: Date.now() };
    socket.to(socket.roomId).emit('sync-video', room.videoState);
  });

  socket.on('video-pause', ({ currentTime }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;

    room.videoState = { playing: false, currentTime, lastUpdate: Date.now() };
    socket.to(socket.roomId).emit('sync-video', room.videoState);
  });

  // Admin: seek
  socket.on('video-seek', ({ currentTime }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;

    room.videoState.currentTime = currentTime;
    room.videoState.lastUpdate = Date.now();
    socket.to(socket.roomId).emit('sync-video', room.videoState);
  });

  // Admin: action popup
  socket.on('admin-action', ({ message }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;
    socket.to(socket.roomId).emit('admin-action-popup', { message });
  });

  // Admin: subtitles
  socket.on('change-subtitles', ({ subCues }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.adminId !== socket.id) return;
    room.subCues = subCues;
    io.to(socket.roomId).emit('sync-subtitles', { subCues });
  });

  // Chat message
  socket.on('chat-message', ({ message }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const member = room.members.find(m => m.id === socket.id);
    if (!member) return;

    io.to(socket.roomId).emit('chat-message', {
      username: member.username,
      message,
      isAdmin: member.isAdmin,
      timestamp: Date.now()
    });
  });

  // Periodic sync request from non-admin
  socket.on('request-sync', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    socket.emit('sync-video', room.videoState);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    room.members = room.members.filter(m => m.id !== socket.id);

    if (room.adminId === socket.id) {
      // Admin left — destroy room
      io.to(socket.roomId).emit('room-closed', {
        message: 'The admin has left. The party is over!'
      });
      rooms.delete(socket.roomId);
      console.log(`💀 Room ${socket.roomId} destroyed (admin left)`);
    } else {
      io.to(socket.roomId).emit('member-left', {
        username: socket.username,
        members: room.members.map(m => ({ username: m.username, isAdmin: m.isAdmin }))
      });
      console.log(`👋 ${socket.username} left room ${socket.roomId}`);
    }
  });
});

function sanitizeRoom(room) {
  return {
    id: room.id,
    adminName: room.adminName,
    videoUrl: room.videoUrl,
    members: room.members.map(m => ({ username: m.username, isAdmin: m.isAdmin }))
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎬 WatchParty server running at http://localhost:${PORT}\n`);
});
