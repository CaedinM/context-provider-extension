import 'dotenv/config';
import express from 'express';
import { Readable } from 'stream';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== process.env.AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function getLevelInstructions(level) {
  if (level === 'noob') return 'The user has no prior knowledge of this topic. Use simple everyday language, avoid all jargon, and explain concepts as if talking to a curious beginner who has never encountered this subject before.';
  if (level === 'expert') return 'The user is an expert in this field. Be precise and technical. Skip all background explanations and focus on nuance, implications, and depth.';
  return "The user has basic familiarity with the subject but may not know specialized nuances or jargon. Clarify terminology when it matters but don't over-explain fundamentals.";
}

function anthropicHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': process.env.CLAUDE_API_KEY,
    'anthropic-version': '2023-06-01'
  };
}

app.post('/analyze', requireAuth, async (req, res) => {
  const { text, title, level } = req.body;
  const levelNote = getLevelInstructions(level);
  const systemPrompt = `You are a context assistant. The user is reading a webpage and needs help understanding it.
Analyze the provided page text and return a JSON object with EXACTLY this structure (no markdown, no fences, pure JSON):
{
  "tldr": "2-3 sentence summary of what this page is about",
  "followups": ["Question 1?", "Question 2?", "Question 3?"]
}
- tldr: ${levelNote} Summarize the core topic in 2-3 sentences.
- followups: 3 natural questions someone at this level of understanding might want answered`;

  try {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: anthropicHeaders(),
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Page title: ${title}\n\nPage content:\n${text.slice(0, 6000)}` }]
      })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || `API error ${r.status}` });
    }

    const data = await r.json();
    const raw = data.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/chat', requireAuth, async (req, res) => {
  const { userMessage, history, pageText, level } = req.body;
  const isFirstMessage = history.length === 0;
  const levelNote = getLevelInstructions(level);
  const systemPrompt = `You are a helpful context assistant. ${levelNote}
Answer concisely and clearly in 2-4 sentences where possible. Use bullet points only when listing multiple distinct items. Avoid unnecessary preamble.${
    isFirstMessage ? `\n\nThe user is reading this article:\n${pageText.slice(0, 3000)}` : ''
  }`;

  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const r = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: anthropicHeaders(),
      body: JSON.stringify({ model: MODEL, max_tokens: 512, system: systemPrompt, messages, stream: true })
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ type: 'error', error: err?.error?.message || `API error ${r.status}` })}\n\n`);
      return res.end();
    }

    Readable.fromWeb(r.body).pipe(res);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Context Provider backend running on port ${port}`));
