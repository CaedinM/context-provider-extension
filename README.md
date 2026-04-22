# Context Provider

A Chrome extension that gives you AI-powered context and chat for any article or webpage, powered by the Claude API.

## Running Locally

### 1. Get a Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/account/keys)
2. Sign in or create an Anthropic account
3. Click **Create Key**, give it a name, and copy the key (it starts with `sk-ant-api03-…`)

Write this key down somewhere safe for future use.

### 2. Clone the Repository

```bash
git clone https://github.com/CaedinM/context-provider-extension.git
cd context-provider-extension
```

No build step is required. The extension is plain JavaScript and loads directly from the `context-provider/` directory.

### 3. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `context-provider/` folder inside this repository
5. The **Context Provider** extension will appear in your extensions list

To pin it to your toolbar, click the puzzle-piece icon next to the address bar and pin Context Provider.

### 4. Add Your API Key

1. Click the Context Provider icon in your Chrome toolbar
2. Paste your Claude API key into the **Claude API Key** field
3. Click **Save API Key**

Your key is stored locally in your browser via `chrome.storage` and is never sent anywhere except directly to Anthropic's API.

### 5. Use the Extension

Navigate to any article or webpage, click the Context Provider icon, and open the sidebar to get AI-powered context and chat about the page content.

## Development

To make changes, edit the files inside `context-provider/` and then reload the extension:

1. Go to `chrome://extensions`
2. Find Context Provider and click the refresh icon

Changes to content scripts or the sidebar take effect immediately after reload. Changes to the background service worker may require you to click **Inspect views: service worker** to see updated logs.
