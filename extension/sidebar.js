const state = {
  chatHistory: [],
  pageText: "",
  pageTitle: "",
  pageUrl: "",
  tldr: "",
  inSavedView: false,
  level: "basic",
  isReady: false,
  selectedProjectId: null,
  projects: []
};

const EXTENSION_ORIGIN = window.location.origin;
const trustedParentOrigin = document.referrer
  ? new URL(document.referrer).origin
  : null;

const $ = (id) => document.getElementById(id);

function show(id) { $(id).classList.remove("hidden"); }
function hide(id) { $(id).classList.add("hidden"); }

function setLevel(level) {
  state.level = level;
  chrome.storage.local.set({ knowledgeLevel: level });
  document.querySelectorAll(".level-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.level === level);
  });
}

chrome.storage.local.get(["knowledgeLevel", "savedProjects"], (result) => {
  setLevel(result.knowledgeLevel || "basic");
  state.projects = result.savedProjects || [];
  renderProjectSelect();
  window.parent.postMessage({ type: "SIDEBAR_READY", level: state.level }, "*");
});

document.querySelectorAll(".level-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const level = btn.dataset.level;
    if (level === state.level) return;
    setLevel(level);
    if (state.isReady) {
      state.chatHistory = [];
      $("chat-messages").innerHTML = "";
      $("chat-label").style.display = "none";
      showLoading();
      window.parent.postMessage({ type: "REANALYZE", level }, "*");
    }
  });
});

// --- Project bar ---

function renderProjectSelect() {
  const select = $("project-select");
  const current = state.selectedProjectId;
  select.innerHTML = '<option value="">No project</option>';
  state.projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  select.value = current || "";
}

$("project-select").addEventListener("change", () => {
  state.selectedProjectId = $("project-select").value || null;
});

$("new-project-btn").addEventListener("click", () => {
  hide("project-row");
  show("project-create-row");
  $("project-name-input").focus();
});

function confirmCreateProject() {
  const name = $("project-name-input").value.trim();
  if (!name) { cancelCreateProject(); return; }
  const project = { id: Date.now(), name, createdAt: new Date().toISOString() };
  state.projects.push(project);
  chrome.storage.local.set({ savedProjects: state.projects }, () => {
    state.selectedProjectId = String(project.id);
    renderProjectSelect();
    cancelCreateProject();
  });
}

function cancelCreateProject() {
  $("project-name-input").value = "";
  hide("project-create-row");
  show("project-row");
}

$("project-confirm-btn").addEventListener("click", confirmCreateProject);
$("project-cancel-btn").addEventListener("click", cancelCreateProject);
$("project-name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmCreateProject();
  if (e.key === "Escape") cancelCreateProject();
});

// --- State transitions ---

function showLoading() {
  show("state-loading");
  hide("state-error");
  hide("state-ready");
  hide("project-bar");
  state.isReady = false;
}

function showError(message) {
  hide("state-loading");
  hide("state-ready");
  hide("project-bar");
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
  show("project-bar");
  state.isReady = true;

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
  hide("level-bar");
  hide("project-bar");
  show("view-saved");
  $("saved-btn").title = "Back";
  $("saved-btn").innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12 19 5 12 12 5"></polyline>
    </svg>`;
  chrome.storage.local.get(["savedProjects"], (result) => {
    state.projects = result.savedProjects || [];
    window.parent.postMessage({ type: "LOAD_SAVED" }, "*");
  });
}

function exitSavedView() {
  state.inSavedView = false;
  hide("view-saved");
  show("body");
  show("input-bar");
  show("reanalyze-btn");
  show("level-bar");
  if (state.isReady) show("project-bar");
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

// --- Saved view rendering ---

function renderSavedItems(items) {
  const list = $("saved-list");
  list.innerHTML = "";

  if (!items || items.length === 0) {
    show("saved-empty");
    return;
  }

  hide("saved-empty");

  const projectMap = {};
  state.projects.forEach(p => { projectMap[String(p.id)] = p.name; });

  // Group items by projectId; orphaned project IDs collapse into uncategorized
  const groups = {};
  items.forEach(item => {
    let key = item.projectId ? String(item.projectId) : "__none__";
    if (key !== "__none__" && !projectMap[key]) key = "__none__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  // Projects in list order, then uncategorized last
  const orderedKeys = [
    ...state.projects.map(p => String(p.id)).filter(id => groups[id]),
    ...(groups["__none__"] ? ["__none__"] : [])
  ];

  orderedKeys.forEach(key => {
    const groupItems = groups[key];

    const header = document.createElement("div");
    header.className = "saved-section-header";
    header.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"></path>
      </svg>
      ${key === "__none__" ? "Uncategorized" : projectMap[key]}
    `;
    list.appendChild(header);

    groupItems.forEach(item => {
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

      // Move select: only render if there's somewhere useful to move to
      const moveSelect = document.createElement("select");
      moveSelect.className = "move-select";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Move to…";
      moveSelect.appendChild(placeholder);

      if (item.projectId) {
        const noneOpt = document.createElement("option");
        noneOpt.value = "__none__";
        noneOpt.textContent = "No project";
        moveSelect.appendChild(noneOpt);
      }

      state.projects.forEach(p => {
        if (String(p.id) === String(item.projectId)) return;
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        moveSelect.appendChild(opt);
      });

      if (moveSelect.children.length > 1) {
        moveSelect.addEventListener("change", () => {
          if (!moveSelect.value) return;
          const projectId = moveSelect.value === "__none__" ? null : Number(moveSelect.value);
          window.parent.postMessage({ type: "MOVE_ITEM", id: item.id, projectId }, "*");
          moveSelect.value = "";
        });
        footer.appendChild(moveSelect);
      }

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
  });
}

// --- Chat ---

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

  $("chat-input").value = "";
  $("followups-list").innerHTML = "";

  appendMessage("user", message);
  showTyping();

  state.chatHistory.push({ role: "user", content: message });

  window.parent.postMessage({
    type: "CHAT_MESSAGE",
    userMessage: message,
    history: state.chatHistory.slice(0, -1),
    pageText: state.pageText,
    level: state.level
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
    tldr: state.tldr,
    projectId: state.selectedProjectId ? Number(state.selectedProjectId) : null
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

// --- Message listener ---

window.addEventListener("message", (event) => {
  if (trustedParentOrigin && event.origin !== trustedParentOrigin) return;
  const { type, data, error, text } = event.data;

  if (type === "ANALYSIS_RESULT") {
    showReady(data);
    if (data.pageText) state.pageText = data.pageText;
  }

  if (type === "SAVED_ITEMS") {
    renderSavedItems(data);
    if (state.pageUrl && data && !data.some(item => item.url === state.pageUrl)) {
      $("save-btn").classList.remove("saved");
    }
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
