/* =========================================================
   FaddenAI — client script
   - toggleTheme(): dark/light switch, persisted
   - view routing: nav buttons swap panels, no dead links
   - sendMessage(): calls our own /api/chat serverless route,
     which holds the OpenRouter key server-side. No key ever
     lives in this file, so GitHub's secret scanner has
     nothing to flag and the key never ships to the browser.
   ========================================================= */

(() => {
  "use strict";

  const root = document.documentElement;
  const THEME_KEY = "faddenai-theme";

  /* ---------------- Theme ---------------- */
  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = root.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
      return;
    }
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight ? "light" : "dark");
  }

  window.toggleTheme = toggleTheme;

  /* ---------------- Mobile drawer ---------------- */
  const menuToggle = document.getElementById("menuToggle");
  const drawer = document.getElementById("mobileDrawer");
  const scrim = document.getElementById("drawerScrim");

  function openDrawer() {
    drawer.classList.add("is-open");
    scrim.hidden = false;
    menuToggle.setAttribute("aria-expanded", "true");
  }
  function closeDrawer() {
    drawer.classList.remove("is-open");
    scrim.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }
  menuToggle?.addEventListener("click", () => {
    drawer.classList.contains("is-open") ? closeDrawer() : openDrawer();
  });
  scrim?.addEventListener("click", closeDrawer);

  /* ---------------- View routing (Chat / Explore / History / Settings) ---------------- */
  const allNavButtons = document.querySelectorAll(".navlink[data-view]");
  const panels = document.querySelectorAll(".view[data-view-panel]");

  function setActiveView(viewName) {
    panels.forEach((p) => p.classList.toggle("is-active", p.dataset.viewPanel === viewName));
    allNavButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.view === viewName));
    closeDrawer();
  }

  allNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });

  /* ---------------- New chat ---------------- */
  function startNewChat() {
    messagesEl.innerHTML = "";
    emptyState.style.display = "flex";
    setActiveView("chat");
    promptInput.value = "";
    autoResize();
    promptInput.focus();
  }
  document.getElementById("newChatBtn")?.addEventListener("click", startNewChat);
  document.getElementById("newChatBtnMobile")?.addEventListener("click", startNewChat);
  document.getElementById("settingsThemeBtn")?.addEventListener("click", toggleTheme);

  /* ---------------- Suggestion chips ---------------- */
  document.querySelectorAll(".chip[data-suggest]").forEach((chip) => {
    chip.addEventListener("click", () => {
      promptInput.value = chip.dataset.suggest;
      autoResize();
      composerForm.requestSubmit();
    });
  });

  /* ---------------- Chat ---------------- */
  const chatScroll = document.getElementById("chatScroll");
  const messagesEl = document.getElementById("messages");
  const emptyState = document.getElementById("emptyState");
  const composerForm = document.getElementById("composerForm");
  const promptInput = document.getElementById("promptInput");
  const sendBtn = document.getElementById("sendBtn");

  const MODEL = "openrouter/free";
  const history = []; // { role: 'user' | 'assistant', content: string }

  function autoResize() {
    promptInput.style.height = "auto";
    promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + "px";
  }
  promptInput?.addEventListener("input", autoResize);
  promptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composerForm.requestSubmit();
    }
  });

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Very small, safe markdown-lite: fenced code blocks + inline code + bold.
  function renderContent(text) {
    const escaped = escapeHtml(text);
    const withBlocks = escaped.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
    const withInline = withBlocks.replace(/`([^`]+)`/g, "<code>$1</code>");
    const withBold = withInline.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return withBold;
  }

  function addMessage(role, text) {
    emptyState.style.display = "none";

    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role === "user" ? "user" : "ai"}`;

    const avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    avatar.textContent = role === "user" ? "You" : "F";

    const body = document.createElement("div");
    body.className = "msg__body";

    const name = document.createElement("div");
    name.className = "msg__name";
    name.textContent = role === "user" ? "You" : "FaddenAI";

    const textEl = document.createElement("div");
    textEl.className = "msg__text";
    textEl.innerHTML = renderContent(text);

    body.append(name, textEl);
    wrap.append(avatar, body);
    messagesEl.appendChild(wrap);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return textEl;
  }

  function addTypingIndicator() {
    emptyState.style.display = "none";
    const wrap = document.createElement("div");
    wrap.className = "msg msg--ai";
    wrap.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    avatar.textContent = "F";

    const body = document.createElement("div");
    body.className = "msg__body";
    body.innerHTML = `<div class="msg__name">FaddenAI</div><div class="typing"><span></span><span></span><span></span></div>`;

    wrap.append(avatar, body);
    messagesEl.appendChild(wrap);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById("typingIndicator")?.remove();
  }

  async function callFaddenAPI(messages) {
    // This hits OUR serverless function (see /api/chat.js), which holds
    // the OpenRouter key in an environment variable on Vercel. The key
    // is never present in any file that gets committed to the repo.
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Server responded ${res.status}: ${errBody || "no details"}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error("No reply returned by the model.");
    return reply;
  }

  async function sendMessage(rawText) {
    const text = (rawText ?? promptInput.value).trim();
    if (!text) return;

    addMessage("user", text);
    history.push({ role: "user", content: text });

    promptInput.value = "";
    autoResize();
    sendBtn.disabled = true;
    addTypingIndicator();

    try {
      const reply = await callFaddenAPI(history);
      removeTypingIndicator();
      addMessage("assistant", reply);
      history.push({ role: "assistant", content: reply });
    } catch (err) {
      removeTypingIndicator();
      const el = addMessage("assistant", `Something went wrong talking to the model: ${err.message}`);
      el.closest(".msg").classList.add("msg--error");
      console.error("FaddenAI chat error:", err);
    } finally {
      sendBtn.disabled = false;
      promptInput.focus();
    }
  }

  window.sendMessage = sendMessage;

  composerForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });

  /* ---------------- Init ---------------- */
  initTheme();
  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
})();
