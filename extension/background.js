importScripts("config.js");

async function callBackend(endpoint, body) {
  const res = await fetch(`${self.BACKEND_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${self.AUTH_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_PAGE") {
    const { text, title, level } = message;
    callBackend("/analyze", { text, title, level })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "SAVE_TLDR") {
    const { title, url, tldr, projectId } = message;
    chrome.storage.local.get(["savedItems"], (result) => {
      const items = result.savedItems || [];
      items.unshift({ id: Date.now(), title, url, tldr, savedAt: new Date().toISOString(), projectId: projectId || null });
      chrome.storage.local.set({ savedItems: items }, () => sendResponse({ success: true }));
    });
    return true;
  }

  if (message.type === "MOVE_ITEM") {
    const { id, projectId } = message;
    chrome.storage.local.get(["savedItems"], (result) => {
      const items = (result.savedItems || []).map(item =>
        item.id === id ? { ...item, projectId: projectId || null } : item
      );
      chrome.storage.local.set({ savedItems: items }, () => sendResponse({ items }));
    });
    return true;
  }

  if (message.type === "LOAD_SAVED") {
    chrome.storage.local.get(["savedItems"], (result) => {
      sendResponse({ items: result.savedItems || [] });
    });
    return true;
  }

  if (message.type === "DELETE_SAVED") {
    const { id } = message;
    chrome.storage.local.get(["savedItems"], (result) => {
      const items = (result.savedItems || []).filter(item => item.id !== id);
      chrome.storage.local.set({ savedItems: items }, () => sendResponse({ items }));
    });
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "chat") return;

  port.onMessage.addListener(async ({ userMessage, pageText, history, level }) => {
    try {
      const response = await callBackend("/chat", { userMessage, history, pageText, level });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const json = JSON.parse(payload);
            if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
              port.postMessage({ type: "CHUNK", text: json.delta.text });
            }
          } catch {}
        }
      }

      port.postMessage({ type: "DONE" });
    } catch (err) {
      port.postMessage({ type: "ERROR", error: err.message });
    }
  });
});
