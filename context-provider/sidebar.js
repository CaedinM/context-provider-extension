const state = {
  chatHistory: [],
  pageText: "",
  pageTitle: "",
  pageUrl: "",
  tldr: "",
  inSavedView: false
};

const EXTENSION_ORIGIN = window.location.origin;
const trustedParentOrigin = document.referrer
  ? new URL(document.referrer).origin
  : null;

const $ = (id) => document.getElementById(id);

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

function showLoading() {
  show("state-loading");
  hide("state-error");
  hide("state-ready");
}

function showError(message) {
  hide("state-loading");
  hide("state-ready");
  show("state-error");
  $("error-message").textContent =
    message === "NO_API_KEY"
      ? "No API key set. Click the extension icon in your toolbar to add your Claude API key."
      : message || "Something went wrong. Please try again.";
}

function showReady(data) {
  hide("state-loading");
  hide("state-error");
  show("state-ready");

  $("tldr-text").textContent = data.tldr;
  state.tldr = data.tldr;
  state.pageTitle = data.title || "";
  state.pageUrl = data.url || "";
  $("save-btn").classList.remove("saved");

  const followupsList = $("followups-list");
  followupsList.innerHTML = "";
  (data.followups || []).forEach((q) => {
    const btn = document.createElement("button");
    btn.className = "followup-btn";
    btn.textContent = q;
    btn.addEventListener("click", () => sendMessage(q));
    followupsList.appendChild(btn);
  });
}

function enterSavedView() {
  state.inSavedView = true;
  hide("body");
  hide("input-bar");
  hide("reanalyze-btn");
  show("view-saved");
  $("saved-btn").title = "Back";
  $("saved-btn").innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>`;
  window.parent.postMessage({ type: "LOAD_SAVED" }, "*");
}

function exitSavedView() {
  state.inSavedView = false;
  hide("view-saved");
  show("body");
  show("input-bar");
  show("reanalyze-btn");
  $("saved-btn").title = "Saved items";
  $("saved-btn").innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>`;
}

function renderSavedItems(items) {
  const list = $("saved-list");
  list.innerHTML = "";

  if (!items || items.length === 0) {
    show("saved-empty");
    return;
  }

  hide("saved-empty");

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "saved-item";

    let domain = item.url;
    try { domain = new URL(item.url).hostname; } catch {}
    const date = new Date(item.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const titleEl = document.createElement("a");
    titleEl.className = "saved-item-title";
    titleEl.href = item.url;
    titleEl.target = "_blank";
    titleEl.rel = "noopener noreferrer";
    titleEl.textContent = item.title;

    const metaEl = document.createElement("div");
    metaEl.className = "saved-item-meta";
    metaEl.textContent = `${domain} · ${date}`;

    const tldrEl = document.createElement("div");
    tldrEl.className = "saved-item-tldr";
    tldrEl.textContent = item.tldr;

    const footer = document.createElement("div");
    footer.className = "saved-item-footer";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Remove";
    deleteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>`;
    deleteBtn.addEventListener("click", () => {
      window.parent.postMessage({ type: "DELETE_SAVED", id: item.id }, "*");
    });

    footer.appendChild(deleteBtn);
    card.append(titleEl, metaEl, tldrEl, footer);
    list.appendChild(card);
  });
}

function appendMessage(role, text) {
  const chatLabel = $("chat-label");
  chatLabel.style.display = "block";

  const messages = $("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;

  if (role === "assistant") {
    bubble.innerHTML = marked.parse(text);
  } else {
    bubble.textContent = text;
  }
  
  messages.appendChild(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  return bubble;
}

function showTyping() {
  const chatLabel = $("chat-label");
  chatLabel.style.display = "block";

  const messages = $("chat-messages");
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble assistant typing";
  bubble.id = "typing-indicator";
  bubble.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
  messages.appendChild(bubble);
  bubble.scrollIntoView({ behavior: "smooth", block: "end" });
}

function removeTyping() {
  const indicator = $("typing-indicator");
  if (indicator) indicator.remove();
}

function sendMessage(text) {
  const message = text.trim();
  if (!message) return;
  console.log("pageText length:", state.pageText.length); // DEBUGGING LOG

  $("chat-input").value = "";
  $("followups-list").innerHTML = "";

  appendMessage("user", message);
  showTyping();

  state.chatHistory.push({ role: "user", content: message });

  window.parent.postMessage({
    type: "CHAT_MESSAGE",
    userMessage: message,
    history: state.chatHistory.slice(0, -1),
    pageText: state.pageText
  }, "*");
}

$("send-btn").addEventListener("click", () => {
  sendMessage($("chat-input").value);
});

$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage($("chat-input").value);
  }
});

$("save-btn").addEventListener("click", () => {
  if ($("save-btn").classList.contains("saved")) return;
  window.parent.postMessage({
    type: "SAVE_TLDR",
    title: state.pageTitle,
    url: state.pageUrl,
    tldr: state.tldr
  }, "*");
  $("save-btn").classList.add("saved");
});

$("saved-btn").addEventListener("click", () => {
  if (state.inSavedView) {
    exitSavedView();
  } else {
    enterSavedView();
  }
});

$("close-btn").addEventListener("click", () => {
  window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
});

$("reanalyze-btn").addEventListener("click", () => {
  state.chatHistory = [];
  $("chat-messages").innerHTML = "";
  $("chat-label").style.display = "none";
  showLoading();
  window.parent.postMessage({ type: "REANALYZE" }, "*");
});

$("retry-btn").addEventListener("click", () => {
  showLoading();
  window.parent.postMessage({ type: "REANALYZE" }, "*");
});

window.addEventListener("message", (event) => {
  if (trustedParentOrigin && event.origin !== trustedParentOrigin) return;
  const { type, data, error, text, success } = event.data;

  if (type === "ANALYSIS_RESULT") {
    showReady(data);
    if (data.pageText) state.pageText = data.pageText;
  }

  if (type === "SAVED_ITEMS") {
    renderSavedItems(data);
  }

  if (type === "ANALYSIS_ERROR") {
    showError(error);
  }

  if (type === "CHUNK") {
    let bubble = $("streaming-bubble");
    if (!bubble) {
      removeTyping();
      bubble = appendMessage("assistant", "");
      bubble.id = "streaming-bubble";
      state.chatHistory.push({ role: "assistant", content: "" });
    }
    const last = state.chatHistory[state.chatHistory.length - 1];
    last.content += text;
    bubble.innerHTML = marked.parse(last.content);
    bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  if (type === "DONE") {
    const bubble = $("streaming-bubble");
    if (bubble) bubble.removeAttribute("id");
  }

  if (type === "ERROR") {
    removeTyping();
    const bubble = $("streaming-bubble");
    if (bubble) bubble.removeAttribute("id");
    appendMessage("assistant", "Sorry, something went wrong. Please try again.");
  }
});

window.parent.postMessage({ type: "SIDEBAR_READY" }, "*");
