const socket = io();

// Page elements
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const loginError = document.getElementById('login-error');
const userList = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const noChatSelected = document.getElementById('no-chat-selected');
const activeChat = document.getElementById('active-chat');
const chatWithName = document.getElementById('chat-with-name');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const linkCopied = document.getElementById('link-copied');
const chatHeader = document.getElementById('chat-header');
const typingIndicator = document.getElementById('typing-indicator');
const typingName = document.getElementById('typing-name');

let myUsername = '';
let chattingWith = '';
let unreadCounts = {}; // { username: count }
let typingTimeout = null;
let isTyping = false;

const REACTION_EMOJIS = ['\u2764\ufe0f', '\ud83d\ude02', '\ud83d\udc4d', '\ud83d\ude2e', '\ud83d\ude22', '\ud83d\ude4f'];

// ===== Join =====
function join() {
  const name = usernameInput.value.trim();
  if (!name) return;
  socket.emit('join', name);
}

joinBtn.addEventListener('click', join);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') join();
});

// Server confirms we joined
socket.on('joined', (username) => {
  myUsername = username;
  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  // Check if we were invited to chat with someone via URL
  const params = new URLSearchParams(window.location.search);
  const chatWith = params.get('chat');
  if (chatWith && chatWith !== myUsername) {
    openChat(chatWith);
  }
});

// Username already taken
socket.on('username-taken', () => {
  loginError.textContent = 'That name is taken. Try another one!';
});

// ===== User List =====
socket.on('user-list', (users) => {
  userList.innerHTML = '';
  const otherUsers = users.filter((u) => u !== myUsername);
  userCount.textContent = otherUsers.length;

  if (otherUsers.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No one else is online yet...';
    li.style.color = '#aaa';
    li.style.cursor = 'default';
    userList.appendChild(li);
    return;
  }

  otherUsers.forEach((user) => {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'online-dot';
    li.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = user;
    li.appendChild(nameSpan);

    // Show unread badge if there are unread messages
    if (unreadCounts[user] && unreadCounts[user] > 0) {
      const badge = document.createElement('span');
      badge.className = 'unread-badge';
      badge.textContent = unreadCounts[user];
      li.appendChild(badge);
    }

    if (user === chattingWith) {
      li.classList.add('active');
    }

    li.addEventListener('click', () => openChat(user));
    userList.appendChild(li);
  });
});

// ===== Open a Chat =====
function openChat(user) {
  chattingWith = user;
  chatWithName.textContent = user;
  noChatSelected.classList.add('hidden');
  activeChat.classList.remove('hidden');
  messagesDiv.innerHTML = '';
  typingIndicator.classList.add('hidden');
  messageInput.focus();

  // Clear unread count for this user
  unreadCounts[user] = 0;

  // Mark active in sidebar
  document.querySelectorAll('#user-list li').forEach((li) => {
    const nameSpan = li.querySelector('span:nth-child(2)');
    if (nameSpan && nameSpan.textContent === user) {
      li.classList.add('active');
      const badge = li.querySelector('.unread-badge');
      if (badge) badge.remove();
    } else {
      li.classList.remove('active');
    }
  });

  // On mobile, show the chat
  chatScreen.classList.add('chatting');

  // Load chat history
  socket.emit('get-history', user);
}

// ===== Chat History =====
socket.on('chat-history', ({ user, messages }) => {
  if (user !== chattingWith) return;
  messagesDiv.innerHTML = '';
  messages.forEach((msg) => addMessageBubble(msg));
  scrollToBottom();
});

// ===== Send a Message =====
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !chattingWith) return;

  socket.emit('private-message', { to: chattingWith, message: text });
  messageInput.value = '';
  messageInput.focus();

  // Stop typing indicator
  if (isTyping) {
    isTyping = false;
    socket.emit('typing', { to: chattingWith, isTyping: false });
  }
  clearTimeout(typingTimeout);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// ===== Typing Indicator =====
messageInput.addEventListener('input', () => {
  if (!chattingWith) return;

  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { to: chattingWith, isTyping: true });
  }

  // Reset the timeout — stop "typing" after 2 seconds of no input
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    socket.emit('typing', { to: chattingWith, isTyping: false });
  }, 2000);
});

socket.on('typing', ({ from, isTyping: typing }) => {
  if (from !== chattingWith) return;

  if (typing) {
    typingName.textContent = from;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

// ===== Receive a Message =====
socket.on('private-message', (msg) => {
  const isFromCurrentChat =
    (msg.from === chattingWith && msg.to === myUsername) ||
    (msg.from === myUsername && msg.to === chattingWith);

  if (isFromCurrentChat) {
    addMessageBubble(msg);
    scrollToBottom();

    // Hide typing indicator when we get their message
    if (msg.from === chattingWith) {
      typingIndicator.classList.add('hidden');
    }
  } else if (msg.from !== myUsername) {
    // Message from someone we're not chatting with — track as unread
    unreadCounts[msg.from] = (unreadCounts[msg.from] || 0) + 1;
    updateUnreadBadge(msg.from);
  }
});

// ===== Message Bubble =====
function addMessageBubble(msg) {
  const isSent = msg.from === myUsername;

  // Wrapper holds the message + reactions
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper ' + (isSent ? 'sent' : 'received');
  wrapper.dataset.msgId = msg.id;

  // The actual message bubble
  const bubble = document.createElement('div');
  bubble.className = 'message';

  const text = document.createElement('span');
  text.textContent = msg.message;
  bubble.appendChild(text);

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = msg.time;
  bubble.appendChild(time);

  wrapper.appendChild(bubble);

  // React button (smiley face that appears on hover)
  const reactBtn = document.createElement('button');
  reactBtn.className = 'react-btn';
  reactBtn.textContent = '\u263a';
  reactBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEmojiPicker(wrapper, msg.id);
  });
  wrapper.appendChild(reactBtn);

  // Reactions bar (if any reactions exist already from history)
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    wrapper.appendChild(buildReactionsBar(msg.id, msg.reactions));
  }

  messagesDiv.appendChild(wrapper);
}

// ===== Emoji Picker =====
function toggleEmojiPicker(wrapper, messageId) {
  // Close any open picker
  const existing = document.querySelector('.emoji-picker');
  if (existing) {
    existing.remove();
    if (existing.parentElement === wrapper) return; // was toggling same one
  }

  const picker = document.createElement('div');
  picker.className = 'emoji-picker';

  REACTION_EMOJIS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('react', { messageId, chatWith: chattingWith, emoji });
      picker.remove();
    });
    picker.appendChild(btn);
  });

  wrapper.appendChild(picker);

  // Close picker when clicking elsewhere
  const close = (e) => {
    if (!picker.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

// ===== Reactions Bar =====
function buildReactionsBar(messageId, reactions) {
  const bar = document.createElement('div');
  bar.className = 'reactions-bar';

  Object.entries(reactions).forEach(([emoji, users]) => {
    if (users.length === 0) return;

    const chip = document.createElement('button');
    chip.className = 'reaction-chip';
    if (users.includes(myUsername)) chip.classList.add('mine');

    chip.innerHTML = emoji + (users.length > 1 ? ' <span class="count">' + users.length + '</span>' : '');
    chip.title = users.join(', ');
    chip.addEventListener('click', () => {
      socket.emit('react', { messageId, chatWith: chattingWith, emoji });
    });
    bar.appendChild(chip);
  });

  return bar;
}

// ===== Reaction Updates =====
socket.on('reaction-update', ({ messageId, reactions }) => {
  const wrapper = document.querySelector(`.message-wrapper[data-msg-id="${messageId}"]`);
  if (!wrapper) return;

  // Remove old reactions bar
  const oldBar = wrapper.querySelector('.reactions-bar');
  if (oldBar) oldBar.remove();

  // Add updated reactions bar
  if (Object.keys(reactions).length > 0) {
    wrapper.appendChild(buildReactionsBar(messageId, reactions));
  }
});

function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ===== Unread Badge =====
function updateUnreadBadge(user) {
  const items = document.querySelectorAll('#user-list li');
  items.forEach((li) => {
    const nameSpan = li.querySelector('span:nth-child(2)');
    if (nameSpan && nameSpan.textContent === user) {
      const existing = li.querySelector('.unread-badge');
      if (existing) existing.remove();

      if (unreadCounts[user] > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unreadCounts[user];
        li.appendChild(badge);
      }
    }
  });
}

// ===== Copy Invite Link =====
copyLinkBtn.addEventListener('click', () => {
  const link = window.location.origin + '/?chat=' + encodeURIComponent(myUsername);
  navigator.clipboard.writeText(link).then(() => {
    linkCopied.classList.remove('hidden');
    setTimeout(() => linkCopied.classList.add('hidden'), 2000);
  });
});

// ===== Mobile: Back Button =====
chatHeader.addEventListener('click', () => {
  if (window.innerWidth <= 600) {
    chatScreen.classList.remove('chatting');
    chattingWith = '';
  }
});
