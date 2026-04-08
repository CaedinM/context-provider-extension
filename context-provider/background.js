const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["claudeApiKey"], (result) => {
      resolve(result.claudeApiKey || null);
    });
  });
}

async function callClaude(messages, systemPrompt, maxTokens = 1024, temperature = 1) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ANALYZE_PAGE") {
    const { text, title } = message;

    const systemPrompt = `You are a context assistant. The user is reading a webpage and needs help understanding it.
Analyze the provided page text and return a JSON object with EXACTLY this structure (no markdown, no fences, pure JSON):
{
  "tldr": "2-3 sentence plain English summary of what this page is about",
  "followups": ["Question 1?", "Question 2?", "Question 3?"]
}
- tldr: Summarize the core topic simply, as if explaining to a curious non-expert
- followups: 3 natural questions someone reading this page might want answered`;

    const userMessage = `Page title: ${title}\n\nPage content:\n${text.slice(0, 6000)}`;

    callClaude([{ role: "user", content: userMessage }], systemPrompt, 1024, 0)
      .then((raw) => {
        try {
          const cleaned = raw.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleaned);
          sendResponse({ success: true, data: parsed });
        } catch (e) {
          sendResponse({ success: false, error: "Failed to parse response" });
        }
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }

  if (message.type === "CHAT_MESSAGE") {
    const { userMessage, pageText, history } = message;

    const isFirstMessage = history.length === 0;
    const systemPrompt = `You are a helpful context assistant. Answer concisely and clearly in 2-4 sentences where possible.
    Use bullet points only when listing multiple distinct items. Avoid unnecessary preamble.
    Assume they are intelligent but may not be familiar with the jargon.${
      isFirstMessage
        ? `\n\nThe user is reading this article:\n${pageText.slice(0, 3000)}`
        : ""
    }`;

    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: userMessage }
    ];

    callClaude(messages, systemPrompt, 512)
      .then((text) => {
        sendResponse({ success: true, text });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });

    return true;
  }
});
