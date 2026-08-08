/* ============================================================
   FaddenAI — client logic (vanilla JS, no framework)
   ============================================================ */

(() => {
  'use strict';

  /* ---------- DOM refs ---------- */
  const $ = (id) => document.getElementById(id);

  const sidebar        = $('sidebar');
  const collapseBtn    = $('collapseBtn');
  const menuBtn        = $('menuBtn');
  const scrim          = $('scrim');
  const newChatBtn     = $('newChatBtn');
  const chatHistoryEl  = $('chatHistory');
  const exploreBtn     = $('exploreBtn');
  const settingsBtn    = $('settingsBtn');

  const themeToggle    = $('themeToggle');
  const modelPill      = $('modelPill');

  const chatWindow     = $('chatWindow');
  const messagesEl     = $('messages');
  const emptyState     = $('emptyState');

  const composer       = $('composer');
  const promptInput    = $('promptInput');
  const sendBtn        = $('sendBtn');
  const micBtn         = $('micBtn');
  const plusBtn        = $('plusBtn');
  const plusMenu       = $('plusMenu');
  const uploadImageBtn = $('uploadImageBtn');
  const webSearchBtn   = $('webSearchBtn');
  const webSearchToggle= $('webSearchToggle');
  const imageGenBtn    = $('imageGenBtn');
  const fileInput      = $('fileInput');
  const attachmentPreview = $('attachmentPreview');

  /* ---------- state ---------- */
  const STORAGE_KEY = 'faddenai.chats.v1';
  const THEME_KEY   = 'faddenai.theme';

  let state = {
    chats: {},        // id -> { id, title, messages: [{role, content, image?}] }
    activeChatId: null,
    webSearchOn: false,
    pendingImage: null,   // { dataUrl, name }
    isStreaming: false,
  };

  /* ---------- persistence ---------- */
  function loadChats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) state.chats = JSON.parse(raw);
    } catch (e) { console.warn('Could not load chat history', e); }
  }
  function saveChats() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.chats)); }
    catch (e) { console.warn('Could not save chat history', e); }
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferred = saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', preferred);
  }
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  });

  /* ---------- sidebar ---------- */
  collapseBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    scrim.classList.add('show');
  });
  scrim.addEventListener('click', closeMobileSidebar);
  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    scrim.classList.remove('show');
  }

  exploreBtn.addEventListener('click', () => {
    alert('Explore is a placeholder — hook this up to a prompt gallery or plugin directory.');
  });
  settingsBtn.addEventListener('click', () => {
    alert('Settings is a placeholder — wire this to your preferences panel.');
  });

  /* ---------- chat list rendering ---------- */
  function renderChatHistory() {
    chatHistoryEl.innerHTML = '';
    const chats = Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const chat of chats) {
      const btn = document.createElement('button');
      btn.className = 'chat-history-item' + (chat.id === state.activeChatId ? ' active' : '');
      btn.textContent = chat.title || 'New chat';
      btn.addEventListener('click', () => {
        state.activeChatId = chat.id;
        renderChatHistory();
        renderMessages();
        closeMobileSidebar();
      });
      chatHistoryEl.appendChild(btn);
    }
  }

  function createChat() {
    const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.chats[id] = { id, title: '', messages: [], updatedAt: Date.now() };
    state.activeChatId = id;
    saveChats();
    renderChatHistory();
    renderMessages();
    return state.chats[id];
  }

  function getActiveChat() {
    if (!state.activeChatId || !state.chats[state.activeChatId]) {
      return createChat();
    }
    return state.chats[state.activeChatId];
  }

  newChatBtn.addEventListener('click', () => {
    createChat();
    closeMobileSidebar();
    promptInput.focus();
  });

  /* ---------- message rendering ---------- */
  function renderMessages() {
    const chat = getActiveChat();
    messagesEl.innerHTML = '';
    if (!chat.messages.length) {
      messagesEl.appendChild(emptyState);
      emptyState.style.display = 'flex';
      return;
    }
    for (const msg of chat.messages) {
      messagesEl.appendChild(buildMessageRow(msg));
    }
    scrollToBottom();
  }

  function buildMessageRow(msg) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.role === 'user' ? 'user' : 'ai');

    const avatar = document.createElement('div');
    avatar.className = 'avatar ' + (msg.role === 'user' ? 'user' : 'ai');
    if (msg.role === 'user') {
      avatar.textContent = 'F';
    }

    const col = document.createElement('div');
    col.className = 'bubble-col';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (msg.image) {
      const img = document.createElement('img');
      img.src = msg.image;
      img.className = 'attach-thumb';
      img.alt = 'Attached image';
      bubble.appendChild(img);
    }
    if (msg.content) {
      const textNode = document.createElement('div');
      textNode.innerHTML = formatContent(msg.content);
      bubble.appendChild(textNode);
    }

    col.appendChild(bubble);
    row.appendChild(avatar);
    row.appendChild(col);
    msg._bubbleEl = bubble;
    return row;
  }

  // Minimal, safe markdown-ish formatting: escape HTML, then handle code fences/inline code/bold
  function formatContent(raw) {
    const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let text = escape(raw);

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return text || '';
  }

  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /* ---------- composer: auto-resize + enable send ---------- */
  function autoResize() {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
  }
  function updateSendState() {
    const hasText = promptInput.value.trim().length > 0;
    sendBtn.disabled = !hasText && !state.pendingImage;
  }
  promptInput.addEventListener('input', () => { autoResize(); updateSendState(); });
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  /* ---------- suggestion chips ---------- */
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      promptInput.value = chip.dataset.prompt;
      autoResize();
      updateSendState();
      handleSend();
    });
  });

  /* ---------- plus menu ---------- */
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !plusMenu.classList.contains('open');
    plusMenu.classList.toggle('open', willOpen);
    plusBtn.classList.toggle('active', willOpen);
    plusBtn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => {
    if (!plusMenu.contains(e.target) && e.target !== plusBtn) {
      plusMenu.classList.remove('open');
      plusBtn.classList.remove('active');
      plusBtn.setAttribute('aria-expanded', 'false');
    }
  });

  uploadImageBtn.addEventListener('click', () => {
    fileInput.click();
    plusMenu.classList.remove('open');
    plusBtn.classList.remove('active');
  });

  webSearchBtn.addEventListener('click', () => {
    state.webSearchOn = !state.webSearchOn;
    webSearchToggle.dataset.on = String(state.webSearchOn);
  });

  imageGenBtn.addEventListener('click', () => {
    plusMenu.classList.remove('open');
    plusBtn.classList.remove('active');
    promptInput.value = '/imagine ' + promptInput.value;
    autoResize();
    updateSendState();
    promptInput.focus();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.pendingImage = { dataUrl: reader.result, name: file.name };
      renderAttachmentPreview();
      updateSendState();
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  function renderAttachmentPreview() {
    attachmentPreview.innerHTML = '';
    if (!state.pendingImage) return;
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    const img = document.createElement('img');
    img.src = state.pendingImage.dataUrl;
    const remove = document.createElement('button');
    remove.className = 'remove-attach';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.pendingImage = null;
      renderAttachmentPreview();
      updateSendState();
    });
    chip.appendChild(img);
    chip.appendChild(remove);
    attachmentPreview.appendChild(chip);
  }

  /* ---------- voice input (Web Speech API) ---------- */
  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let isRecording = false;

  if (SpeechRecognitionCtor) {
    recognizer = new SpeechRecognitionCtor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = 'en-US';

    let baseText = '';

    recognizer.addEventListener('start', () => {
      isRecording = true;
      baseText = promptInput.value ? promptInput.value.trim() + ' ' : '';
      micBtn.classList.add('recording');
    });

    recognizer.addEventListener('result', (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      promptInput.value = (baseText + final + interim).trim();
      if (final) baseText = (baseText + final).trim() + ' ';
      autoResize();
      updateSendState();
    });

    recognizer.addEventListener('end', () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    });

    recognizer.addEventListener('error', () => {
      isRecording = false;
      micBtn.classList.remove('recording');
    });

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        recognizer.stop();
      } else {
        try { recognizer.start(); } catch (e) { /* already started */ }
      }
    });
  } else {
    micBtn.addEventListener('click', () => {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
    });
  }

  /* ---------- send flow ---------- */
  async function handleSend() {
    const text = promptInput.value.trim();
    if (!text && !state.pendingImage) return;
    if (state.isStreaming) return;

    const chat = getActiveChat();
    if (!chat.title) chat.title = text.slice(0, 40) || 'Image message';

    const userMsg = { role: 'user', content: text };
    if (state.pendingImage) userMsg.image = state.pendingImage.dataUrl;
    chat.messages.push(userMsg);
    chat.updatedAt = Date.now();

    promptInput.value = '';
    autoResize();
    state.pendingImage = null;
    renderAttachmentPreview();
    updateSendState();
    if (isRecording) recognizer.stop();

    saveChats();
    renderChatHistory();
    renderMessages();

    await streamAssistantReply(chat);
  }

  sendBtn.addEventListener('click', handleSend);

  async function streamAssistantReply(chat) {
    state.isStreaming = true;
    sendBtn.disabled = true;

    const aiMsg = { role: 'assistant', content: '' };
    chat.messages.push(aiMsg);
    const row = buildMessageRow(aiMsg);
    const avatarEl = row.querySelector('.avatar.ai');
    avatarEl.classList.add('thinking');
    emptyState.style.display = 'none';
    messagesEl.appendChild(row);
    scrollToBottom();

    const bubble = aiMsg._bubbleEl;
    bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    const apiMessages = chat.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1) // exclude the empty assistant placeholder
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          webSearch: state.webSearchOn,
          image: chat.messages[chat.messages.length - 2]?.image || null,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error('Request failed: ' + res.status);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (firstChunk) { bubble.innerHTML = ''; firstChunk = false; }
        full += chunk;
        aiMsg.content = full;
        bubble.innerHTML = formatContent(full);
        scrollToBottom();
      }

      if (!full) {
        bubble.innerHTML = formatContent("I didn't get a response back — try that again?");
      }
    } catch (err) {
      console.error(err);
      bubble.innerHTML = formatContent('Something went wrong reaching the model. Please try again.');
    } finally {
      avatarEl.classList.remove('thinking');
      state.isStreaming = false;
      updateSendState();
      chat.updatedAt = Date.now();
      saveChats();
      renderChatHistory();
    }
  }

  /* ---------- init ---------- */
  function init() {
    initTheme();
    loadChats();
    if (Object.keys(state.chats).length === 0) {
      createChat();
    } else {
      state.activeChatId = Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    renderChatHistory();
    renderMessages();
    updateSendState();
  }

  init();
})();
