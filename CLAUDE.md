# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome browser extension (Manifest V3) that injects an AI-powered sidebar into any webpage. Users get a TL;DR summary and can chat with Claude about the page content. The extension calls the Claude API directly from the browser using the `anthropic-dangerous-direct-browser-access: true` header.

## Development Workflow

**No build step.** Edit files directly in `context-provider/`, then reload the extension:

1. Go to `chrome://extensions`
2. Find "Context Provider" and click the refresh icon
3. Debug the service worker via "Inspect views: service worker"

The extension loads unpacked from the `context-provider/` directory.

## Architecture

### Message Passing Flow

```
content.js (page) → chrome.runtime.sendMessage → background.js → Claude API
content.js ↔ sidebar.html (iframe) via window.postMessage
```

- **Initial page analysis**: `content.js` sends `ANALYZE_PAGE` message to `background.js`, which returns `{tldr, followups}` JSON.
- **Streaming chat**: `content.js` opens a `chrome.runtime.connect()` port to `background.js`; SSE chunks are forwarded through to the sidebar.
- **Cross-frame messaging**: `content.js` bridges messages between the page and the sidebar iframe using `window.postMessage`. All incoming `postMessage` events are origin-validated before processing.

### Component Responsibilities

- **`background.js`**: All Claude API calls, `chrome.storage.local` reads/writes (API key and saved items). Two message handlers: `ANALYZE_PAGE` (one-shot) and port-based streaming chat with conversation history.
- **`content.js`**: FAB button injection, page text extraction (prefers `<article>`/`<main>`/`[role="main"]`, strips scripts/nav/ads), sidebar iframe lifecycle, message bridging.
- **`sidebar.js`**: All UI state (loading → error → ready), chat history array, TL;DR display, saved bookmarks view, markdown rendering via `marked.min.js`.
- **`options.js`**: API key input with `sk-ant-` prefix validation, stored via `chrome.storage.local`.

### API Details

- Model: `claude-sonnet-4-20250514`
- Max tokens: 1024 for page analysis, 512 for chat
- Page text sent to API is capped at 6000 chars (analysis) / 3000 chars (chat context)
- Streaming uses SSE parsing in `background.js` with chunks forwarded over the chrome port

### Styling

Custom CSS with no framework. Color system uses CSS variables (`--primary`, `--primary-dark`, etc.) built on an Indigo palette (#4F46E5, #3730A3). Fonts: DM Sans (body) + DM Mono (labels). Animations: `fadeUp`, `spin`, `typingBounce`.
