const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the website files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Track online users: { socketId: username }
const onlineUsers = {};

// Track message history between pairs: { "user1:user2": [messages] }
const messageHistory = {};

// Helper: create a consistent key for a conversation between two users
function chatKey(user1, user2) {
  return [user1, user2].sort().join(':');
}

io.on('connection', (socket) => {
  console.log('Someone connected');

  // When a user picks a username
  socket.on('join', (username) => {
    // Check if username is already taken
    if (Object.values(onlineUsers).includes(username)) {
      socket.emit('username-taken');
      return;
    }

    onlineUsers[socket.id] = username;
    console.log(`${username} joined`);

    // Tell the new user they're in
    socket.emit('joined', username);

    // Tell everyone the updated user list
    io.emit('user-list', Object.values(onlineUsers));
  });

  // When a user sends a private message
  socket.on('private-message', ({ to, message }) => {
    const from = onlineUsers[socket.id];
    if (!from) return;

    // Find the recipient's socket
    const recipientSocketId = Object.keys(onlineUsers).find(
      (id) => onlineUsers[id] === to
    );

    const msgData = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      from,
      to,
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      reactions: {},
    };

    // Save to history
    const key = chatKey(from, to);
    if (!messageHistory[key]) messageHistory[key] = [];
    messageHistory[key].push(msgData);

    // Send to recipient (if they're online)
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('private-message', msgData);
    }

    // Send back to sender (so it appears in their chat too)
    socket.emit('private-message', msgData);
  });

  // When a user requests chat history with someone
  socket.on('get-history', (otherUser) => {
    const from = onlineUsers[socket.id];
    if (!from) return;

    const key = chatKey(from, otherUser);
    const history = messageHistory[key] || [];
    socket.emit('chat-history', { user: otherUser, messages: history });
  });

  // When a user reacts to a message
  socket.on('react', ({ messageId, chatWith, emoji }) => {
    const from = onlineUsers[socket.id];
    if (!from) return;

    const key = chatKey(from, chatWith);
    const history = messageHistory[key];
    if (!history) return;

    const msg = history.find((m) => m.id === messageId);
    if (!msg) return;

    // Toggle: if same user already reacted with same emoji, remove it
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(from);
    if (idx !== -1) {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(from);
    }

    // Send updated reactions to both users
    const reactionUpdate = { messageId, reactions: msg.reactions };
    socket.emit('reaction-update', reactionUpdate);
    const recipientSocketId = Object.keys(onlineUsers).find(
      (id) => onlineUsers[id] === chatWith
    );
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('reaction-update', reactionUpdate);
    }
  });

  // When a user is typing
  socket.on('typing', ({ to, isTyping }) => {
    const from = onlineUsers[socket.id];
    if (!from) return;

    const recipientSocketId = Object.keys(onlineUsers).find(
      (id) => onlineUsers[id] === to
    );
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing', { from, isTyping });
    }
  });

  // When someone disconnects
  socket.on('disconnect', () => {
    const username = onlineUsers[socket.id];
    if (username) {
      console.log(`${username} left`);
      delete onlineUsers[socket.id];
      io.emit('user-list', Object.values(onlineUsers));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
