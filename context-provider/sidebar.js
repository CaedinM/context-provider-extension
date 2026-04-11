const state = {
  chatHistory: [],
  pageText: ""
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
    console.log("sidebar recieved pageText, length:", data.pageText.length); // DEBUGGING LOG
    showReady(data);
    if (data.pageText) state.pageText = data.pageText;
  }

  if (type === "ANALYSIS_ERROR") {
    showError(error);
  }

  if (type === "CHAT_RESPONSE") {
    removeTyping();
    if (success) {
      appendMessage("assistant", text);
      state.chatHistory.push({ role: "assistant", content: text });
    } else {
      appendMessage("assistant", "Sorry, something went wrong. Please try again.");
    }
  }
});

window.parent.postMessage({ type: "SIDEBAR_READY" }, "*");
