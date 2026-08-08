/* ============================================================
   FaddenAI — client logic (vanilla JS, no framework, no deps)
   ============================================================ */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /* ---------- DOM refs ---------- */
  const sidebar        = $('sidebar');
  const menuBtn        = $('menuBtn');
  const scrim          = $('scrim');
  const newChatBtn     = $('newChatBtn');
  const chatHistoryEl  = $('chatHistory');
  const exploreBtn     = $('exploreBtn');
  const settingsBtn    = $('settingsBtn');

  const themeToggle    = $('themeToggle');

  const exportBtn       = $('exportBtn');
  const exportMenu      = $('exportMenu');
  const exportMdBtn     = $('exportMdBtn');
  const exportTxtBtn    = $('exportTxtBtn');

  const chatWindow     = $('chatWindow');
  const messagesEl     = $('messages');
  const emptyState     = $('emptyState');

  const promptInput    = $('promptInput');
  const sendBtn        = $('sendBtn');
  const stopBtn        = $('stopBtn');
  const micBtn         = $('micBtn');
  const plusBtn        = $('plusBtn');
  const plusMenu       = $('plusMenu');
  const uploadImageBtn = $('uploadImageBtn');
  const webSearchBtn   = $('webSearchBtn');
  const webSearchToggle= $('webSearchToggle');
  const imageGenBtn    = $('imageGenBtn');
  const fileInput      = $('fileInput');
  const attachmentPreview = $('attachmentPreview');

  const settingsBackdrop = $('settingsBackdrop');
  const settingsCloseBtn = $('settingsCloseBtn');
  const settingsCancelBtn= $('settingsCancelBtn');
  const settingsSaveBtn  = $('settingsSaveBtn');
  const personaInput     = $('personaInput');
  const temperatureInput = $('temperatureInput');
  const temperatureValue = $('temperatureValue');
  const clearHistoryBtn  = $('clearHistoryBtn');

  const exploreBackdrop  = $('exploreBackdrop');
  const exploreCloseBtn  = $('exploreCloseBtn');

  const confirmBackdrop  = $('confirmBackdrop');
  const confirmCancelBtn = $('confirmCancelBtn');
  const confirmDeleteBtn = $('confirmDeleteBtn');

  const toastEl = $('toast');

  /* ---------- persistence keys ---------- */
  const STORAGE_KEY  = 'faddenai.chats.v1';
  const THEME_KEY    = 'faddenai.theme';
  const SETTINGS_KEY = 'faddenai.settings.v1';

  /* ---------- state ---------- */
  let state = {
    chats: {},
    activeChatId: null,
    webSearchOn: false,
    pendingImage: null,
    isStreaming: false,
    abortController: null,
    pendingDeleteChatId: null,
    settings: { persona: '', temperature: 0.8 },
  };

  let clearConfirmTimeout = null;
  let toastTimeout = null;

  /* ============================================================
     Persistence
     ============================================================ */
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
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) state.settings = { ...state.settings, ...JSON.parse(raw) };
    } catch (e) { console.warn('Could not load settings', e); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }
    catch (e) { console.warn('Could not save settings', e); }
  }

  /* ============================================================
     Toast
     ============================================================ */
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ============================================================
     Theme
     ============================================================ */
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

  /* ============================================================
     Sidebar / mobile drawer
     ============================================================ */
  menuBtn.addEventListener('click', () => {
    sidebar.classList.add('mobile-open');
    scrim.classList.add('show');
  });
  scrim.addEventListener('click', closeMobileSidebar);
  function closeMobileSidebar() {
    sidebar.classList.remove('mobile-open');
    scrim.classList.remove('show');
  }

  /* ============================================================
     Explore modal
     ============================================================ */
  exploreBtn.addEventListener('click', () => {
    exploreBackdrop.classList.add('open');
    closeMobileSidebar();
  });
  exploreCloseBtn.addEventListener('click', () => exploreBackdrop.classList.remove('open'));
  exploreBackdrop.addEventListener('click', (e) => {
    if (e.target === exploreBackdrop) exploreBackdrop.classList.remove('open');
  });
  document.querySelectorAll('.explore-card').forEach(card => {
    card.addEventListener('click', () => {
      promptInput.value = card.dataset.prompt;
      autoResize();
      updateSendState();
      exploreBackdrop.classList.remove('open');
      promptInput.focus();
    });
  });

  /* ============================================================
     Settings modal
     ============================================================ */
  function openSettings() {
    personaInput.value = state.settings.persona;
    temperatureInput.value = state.settings.temperature;
    temperatureValue.textContent = Number(state.settings.temperature).toFixed(1);
    resetClearHistoryButton();
    settingsBackdrop.classList.add('open');
    closeMobileSidebar();
  }
  function closeSettings() {
    settingsBackdrop.classList.remove('open');
    resetClearHistoryButton();
  }
  settingsBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsCancelBtn.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', (e) => {
    if (e.target === settingsBackdrop) closeSettings();
  });

  temperatureInput.addEventListener('input', () => {
    temperatureValue.textContent = Number(temperatureInput.value).toFixed(1);
  });

  settingsSaveBtn.addEventListener('click', () => {
    state.settings.persona = personaInput.value.trim();
    state.settings.temperature = Number(temperatureInput.value);
    saveSettings();
    closeSettings();
    showToast('Settings saved');
  });

  function resetClearHistoryButton() {
    clearTimeout(clearConfirmTimeout);
    clearHistoryBtn.textContent = 'Clear all history';
    clearHistoryBtn.classList.remove('confirming');
    clearHistoryBtn.dataset.confirming = 'false';
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (clearHistoryBtn.dataset.confirming === 'true') {
      state.chats = {};
      saveChats();
      state.activeChatId = null;
      createChat();
      renderChatHistory();
      renderMessages();
      resetClearHistoryButton();
      closeSettings();
      showToast('All history cleared');
    } else {
      clearHistoryBtn.textContent = 'Click again to confirm';
      clearHistoryBtn.classList.add('confirming');
      clearHistoryBtn.dataset.confirming = 'true';
      clearConfirmTimeout = setTimeout(resetClearHistoryButton, 4000);
    }
  });

  /* ============================================================
     Delete-chat confirm modal
     ============================================================ */
  function requestDeleteChat(chatId) {
    state.pendingDeleteChatId = chatId;
    confirmBackdrop.classList.add('open');
  }
  confirmCancelBtn.addEventListener('click', () => {
    state.pendingDeleteChatId = null;
    confirmBackdrop.classList.remove('open');
  });
  confirmBackdrop.addEventListener('click', (e) => {
    if (e.target === confirmBackdrop) {
      state.pendingDeleteChatId = null;
      confirmBackdrop.classList.remove('open');
    }
  });
  confirmDeleteBtn.addEventListener('click', () => {
    const id = state.pendingDeleteChatId;
    if (!id) return;
    delete state.chats[id];
    saveChats();
    if (state.activeChatId === id) {
      state.activeChatId = null;
      const remaining = Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt);
      if (remaining.length) state.activeChatId = remaining[0].id;
      else createChat();
    }
    state.pendingDeleteChatId = null;
    confirmBackdrop.classList.remove('open');
    renderChatHistory();
    renderMessages();
    showToast('Chat deleted');
  });

  /* ============================================================
     Chat list rendering + session management
     ============================================================ */
  function renderChatHistory() {
    chatHistoryEl.innerHTML = '';
    const chats = Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt);
    for (const chat of chats) {
      const item = document.createElement('button');
      item.className = 'chat-history-item' + (chat.id === state.activeChatId ? ' active' : '');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'chat-title';
      titleSpan.textContent = chat.title || 'New chat';
      item.appendChild(titleSpan);

      const delBtn = document.createElement('span');
      delBtn.className = 'chat-delete-btn';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        requestDeleteChat(chat.id);
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        state.activeChatId = chat.id;
        renderChatHistory();
        renderMessages();
        closeMobileSidebar();
      });
      chatHistoryEl.appendChild(item);
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
    if (!state.activeChatId || !state.chats[state.activeChatId]) return createChat();
    return state.chats[state.activeChatId];
  }

  function smartTitle(text) {
    if (!text) return 'Image chat';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= 42) return clean.charAt(0).toUpperCase() + clean.slice(1);
    const cut = clean.slice(0, 42);
    const lastSpace = cut.lastIndexOf(' ');
    const trimmed = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + '…';
  }

  newChatBtn.addEventListener('click', () => {
    createChat();
    closeMobileSidebar();
    promptInput.focus();
  });

  /* ============================================================
     Markdown-ish rendering (bold, italic, links, lists, quotes,
     inline code, fenced code blocks with header + copy button)
     ============================================================ */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatContent(raw) {
    if (!raw) return '';

    // 1. Pull out fenced code blocks first so nothing inside them gets mangled
    const codeBlocks = [];
    let text = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: (lang || 'text').toLowerCase(), code: code.replace(/\n$/, '') });
      return `\u0000CODEBLOCK${idx}\u0000`;
    });

    // 2. Escape remaining HTML
    text = escapeHtml(text);

    // 3. Inline formatting
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4. Block-level: paragraphs, lists, blockquotes
    const lines = text.split('\n');
    let html = '';
    let listBuffer = [];
    let listType = null;
    let quoteBuffer = [];
    let paraBuffer = [];

    const flushPara = () => {
      if (paraBuffer.length) { html += `<p>${paraBuffer.join('<br>')}</p>`; paraBuffer = []; }
    };
    const flushList = () => {
      if (listBuffer.length) {
        const tag = listType === 'ol' ? 'ol' : 'ul';
        html += `<${tag}>${listBuffer.map(li => `<li>${li}</li>`).join('')}</${tag}>`;
        listBuffer = []; listType = null;
      }
    };
    const flushQuote = () => {
      if (quoteBuffer.length) { html += `<blockquote>${quoteBuffer.join('<br>')}</blockquote>`; quoteBuffer = []; }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flushPara(); flushList(); flushQuote(); continue; }

      if (/^\u0000CODEBLOCK\d+\u0000$/.test(trimmed)) {
        flushPara(); flushList(); flushQuote();
        html += trimmed;
        continue;
      }
      const olMatch = trimmed.match(/^\d+\.\s+(.*)/);
      const ulMatch = trimmed.match(/^[-*]\s+(.*)/);
      const quoteMatch = trimmed.match(/^&gt;\s?(.*)/);

      if (olMatch) {
        flushPara(); flushQuote();
        if (listType !== 'ol') flushList();
        listType = 'ol'; listBuffer.push(olMatch[1]);
      } else if (ulMatch) {
        flushPara(); flushQuote();
        if (listType !== 'ul') flushList();
        listType = 'ul'; listBuffer.push(ulMatch[1]);
      } else if (quoteMatch) {
        flushPara(); flushList();
        quoteBuffer.push(quoteMatch[1]);
      } else {
        flushList(); flushQuote();
        paraBuffer.push(trimmed);
      }
    }
    flushPara(); flushList(); flushQuote();

    // 5. Reinsert code blocks with header bar + copy button
    html = html.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (_, idxStr) => {
      const block = codeBlocks[Number(idxStr)];
      const encoded = encodeURIComponent(block.code);
      return `<div class="code-block">
        <div class="code-block-header">
          <span>${escapeHtml(block.lang)}</span>
          <button class="copy-code-btn" data-code="${encoded}" type="button">
            <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.6"/></svg>
            <span>Copy code</span>
          </button>
        </div>
        <pre><code>${escapeHtml(block.code)}</code></pre>
      </div>`;
    });

    return html;
  }

  /* ============================================================
     Message rendering
     ============================================================ */
  let msgCounter = 0;
  function nextMsgId() { return 'm_' + (++msgCounter) + '_' + Date.now().toString(36); }

  function renderMessages() {
    const chat = getActiveChat();
    messagesEl.innerHTML = '';
    if (!chat.messages.length) {
      messagesEl.appendChild(emptyState);
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';
    for (const msg of chat.messages) {
      if (!msg.id) msg.id = nextMsgId();
      messagesEl.appendChild(buildMessageRow(msg));
    }
    scrollToBottom();
  }

  function buildMessageRow(msg) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + (msg.role === 'user' ? 'user' : 'ai');
    row.dataset.msgId = msg.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar ' + (msg.role === 'user' ? 'user' : 'ai');
    if (msg.role === 'user') avatar.textContent = 'F';

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
    const textNode = document.createElement('div');
    textNode.className = 'bubble-text';
    textNode.innerHTML = formatContent(msg.content);
    bubble.appendChild(textNode);

    const toolbar = document.createElement('div');
    toolbar.className = 'msg-toolbar';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'toolbar-btn copy-msg-btn';
    copyBtn.type = 'button';
    copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V5a2 2 0 012-2h10" stroke="currentColor" stroke-width="1.6"/></svg><span>Copy</span>';
    toolbar.appendChild(copyBtn);

    if (msg.role === 'assistant' && msg.content) {
      const regenBtn = document.createElement('button');
      regenBtn.className = 'toolbar-btn regen-msg-btn';
      regenBtn.type = 'button';
      regenBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Regenerate</span>';
      toolbar.appendChild(regenBtn);
    }

    col.appendChild(bubble);
    col.appendChild(toolbar);
    row.appendChild(avatar);
    row.appendChild(col);
    msg._bubbleTextEl = textNode;
    return row;
  }

  // event delegation: copy code, copy message, regenerate
  messagesEl.addEventListener('click', async (e) => {
    const copyCodeBtn = e.target.closest('.copy-code-btn');
    if (copyCodeBtn) {
      const code = decodeURIComponent(copyCodeBtn.dataset.code || '');
      await copyToClipboard(code);
      flashButton(copyCodeBtn, 'Copied!');
      return;
    }
    const copyMsgBtn = e.target.closest('.copy-msg-btn');
    if (copyMsgBtn) {
      const row = e.target.closest('.msg-row');
      const chat = getActiveChat();
      const msg = chat.messages.find(m => m.id === row.dataset.msgId);
      if (msg) {
        await copyToClipboard(msg.content || '');
        flashButton(copyMsgBtn, 'Copied!', true);
      }
      return;
    }
    const regenBtn = e.target.closest('.regen-msg-btn');
    if (regenBtn) {
      const row = e.target.closest('.msg-row');
      handleRegenerate(row.dataset.msgId);
      return;
    }
  });

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function flashButton(btn, label, keepIcon) {
    const span = btn.querySelector('span');
    const original = span ? span.textContent : null;
    if (span) span.textContent = label;
    btn.classList.add('copied');
    setTimeout(() => {
      if (span && original !== null) span.textContent = original;
      btn.classList.remove('copied');
    }, 1600);
  }

  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /* ============================================================
     Composer: auto-resize + enable send
     ============================================================ */
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

  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      promptInput.value = chip.dataset.prompt;
      autoResize();
      updateSendState();
      handleSend();
    });
  });

  /* ============================================================
     Plus menu (upload / web search / image gen)
     ============================================================ */
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
    if (!exportMenu.contains(e.target) && e.target !== exportBtn && !exportBtn.contains(e.target)) {
      exportMenu.classList.remove('open');
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
    remove.type = 'button';
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

  /* ============================================================
     Export chat
     ============================================================ */
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('open');
  });

  function buildExportText(chat, format) {
    const lines = [];
    const title = chat.title || 'FaddenAI conversation';
    if (format === 'md') {
      lines.push(`# ${title}`, '');
      for (const msg of chat.messages) {
        const who = msg.role === 'user' ? '**You**' : '**FaddenAI**';
        lines.push(`${who}:`, '', msg.content || '(image attached)', '');
      }
    } else {
      lines.push(title, '='.repeat(title.length), '');
      for (const msg of chat.messages) {
        const who = msg.role === 'user' ? 'You' : 'FaddenAI';
        lines.push(`${who}:`, msg.content || '(image attached)', '');
      }
    }
    return lines.join('\n');
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function slugify(text) {
    return (text || 'faddenai-chat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50) || 'faddenai-chat';
  }

  exportMdBtn.addEventListener('click', () => {
    const chat = getActiveChat();
    if (!chat.messages.length) { showToast('Nothing to export yet'); exportMenu.classList.remove('open'); return; }
    downloadFile(`${slugify(chat.title)}.md`, buildExportText(chat, 'md'), 'text/markdown');
    exportMenu.classList.remove('open');
    showToast('Chat exported as Markdown');
  });
  exportTxtBtn.addEventListener('click', () => {
    const chat = getActiveChat();
    if (!chat.messages.length) { showToast('Nothing to export yet'); exportMenu.classList.remove('open'); return; }
    downloadFile(`${slugify(chat.title)}.txt`, buildExportText(chat, 'txt'), 'text/plain');
    exportMenu.classList.remove('open');
    showToast('Chat exported as text');
  });

  /* ============================================================
     Voice input (Web Speech API)
     ============================================================ */
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
      if (isRecording) recognizer.stop();
      else { try { recognizer.start(); } catch (e) { /* already started */ } }
    });
  } else {
    micBtn.addEventListener('click', () => {
      showToast('Voice input is not supported in this browser');
    });
  }

  /* ============================================================
     Send / stream / stop / regenerate
     ============================================================ */
  function setStreamingUI(streaming) {
    state.isStreaming = streaming;
    sendBtn.hidden = streaming;
    stopBtn.hidden = !streaming;
    updateSendState();
  }

  async function handleSend() {
    const text = promptInput.value.trim();
    if (!text && !state.pendingImage) return;
    if (state.isStreaming) return;

    const chat = getActiveChat();
    if (!chat.title) chat.title = smartTitle(text);

    const userMsg = { role: 'user', content: text, id: nextMsgId() };
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

  stopBtn.addEventListener('click', () => {
    if (state.abortController) state.abortController.abort();
  });

  function handleRegenerate(assistantMsgId) {
    if (state.isStreaming) return;
    const chat = getActiveChat();
    const idx = chat.messages.findIndex(m => m.id === assistantMsgId);
    if (idx === -1) return;
    // Truncate this assistant message and anything after it, then re-stream
    chat.messages = chat.messages.slice(0, idx);
    saveChats();
    renderMessages();
    streamAssistantReply(chat);
  }

  async function streamAssistantReply(chat) {
    setStreamingUI(true);

    const aiMsg = { role: 'assistant', content: '', id: nextMsgId() };
    chat.messages.push(aiMsg);
    const row = buildMessageRow(aiMsg);
    const avatarEl = row.querySelector('.avatar.ai');
    avatarEl.classList.add('thinking');
    emptyState.style.display = 'none';
    messagesEl.appendChild(row);
    scrollToBottom();

    const textEl = aiMsg._bubbleTextEl;
    textEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    const apiMessages = chat.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content }));

    const lastUserMsg = [...chat.messages].reverse().find(m => m.role === 'user');

    const controller = new AbortController();
    state.abortController = controller;

    let full = '';
    let aborted = false;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          webSearch: state.webSearchOn,
          image: lastUserMsg?.image || null,
          persona: state.settings.persona,
          temperature: state.settings.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (firstChunk) { textEl.innerHTML = ''; firstChunk = false; }
        full += chunk;
        aiMsg.content = full;
        textEl.innerHTML = formatContent(full);
        scrollToBottom();
      }

      if (!full) {
        full = "I didn't get a response back — try that again?";
        aiMsg.content = full;
        textEl.innerHTML = formatContent(full);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        aborted = true;
        if (!full) {
          full = '_Generation stopped._';
          aiMsg.content = '';
        } else {
          aiMsg.content = full;
        }
        textEl.innerHTML = formatContent(full) + (full ? '<p style="opacity:.6;font-size:.85em;margin-top:4px;">Stopped by user</p>' : '');
      } else {
        console.error(err);
        full = 'Something went wrong reaching the model. Please try again.';
        aiMsg.content = '';
        textEl.innerHTML = formatContent(full);
      }
    } finally {
      avatarEl.classList.remove('thinking');
      state.abortController = null;
      setStreamingUI(false);
      chat.updatedAt = Date.now();
      saveChats();
      renderChatHistory();
      renderMessages(); // re-render so the toolbar (with Regenerate) attaches correctly
    }
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    initTheme();
    loadChats();
    loadSettings();
    if (Object.keys(state.chats).length === 0) {
      createChat();
    } else {
      state.activeChatId = Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    renderChatHistory();
    renderMessages();
    updateSendState();
    setStreamingUI(false);
  }

  init();
})();
