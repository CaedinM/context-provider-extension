const input = document.getElementById("api-key-input");
const saveBtn = document.getElementById("save-btn");
const status = document.getElementById("status");
const toggleBtn = document.getElementById("toggle-visibility");

chrome.storage.local.get(["claudeApiKey"], (result) => {
  if (result.claudeApiKey) {
    input.value = result.claudeApiKey;
    setStatus("API key saved", "success");
  }
});

toggleBtn.addEventListener("click", () => {
  if (input.type === "password") {
    input.type = "text";
    toggleBtn.textContent = "Hide";
  } else {
    input.type = "password";
    toggleBtn.textContent = "Show";
  }
});

saveBtn.addEventListener("click", () => {
  const key = input.value.trim();
  if (!key) {
    setStatus("Please enter an API key", "error");
    return;
  }
  if (!key.startsWith("sk-ant-")) {
    setStatus("Key should start with sk-ant-", "error");
    return;
  }
  chrome.storage.local.set({ claudeApiKey: key }, () => {
    setStatus("Saved!", "success");
  });
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveBtn.click();
});

function setStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  if (type === "success") {
    setTimeout(() => {
      status.textContent = "";
      status.className = "status";
    }, 3000);
  }
}
