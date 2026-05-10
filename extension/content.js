(() => {
  if (window.__contextProviderInjected) return;
  window.__contextProviderInjected = true;
  if (!document.body) return;

  function pageIsPdf() {
    if (document.contentType === "application/pdf") return true;
    return /\.pdf([?#].*)?$/i.test(location.href) || /\/pdf\/[^?#/][^?#]*$/.test(location.href);
  }

  let sidebarOpen = false;
  let sidebarFrame = null;
  let fab = null;
  let pageAnalysisCache = {};
  let isAnalyzing = false;
  let currentLevel = "basic";

  const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;

  function extractPageText() {
    const article = document.querySelector("article, main, [role='main'], .article-body, .post-content, .entry-content");
    const source = article || document.body;
    const clone = source.cloneNode(true);
    clone.querySelectorAll("script, style, nav, header, footer, aside, .ad, .advertisement, [aria-hidden='true']").forEach(el => el.remove());
    return clone.innerText.replace(/\s+/g, " ").trim();
  }

  function createFab() {
    fab = document.createElement("div");
    fab.id = "__context-provider-fab";
    fab.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/>
      </svg>
    `;
    fab.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #4F46E5;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.5);
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      border: none;
    `;

    fab.addEventListener("mouseenter", () => {
      fab.style.transform = "scale(1.1)";
      fab.style.boxShadow = "0 6px 20px rgba(79, 70, 229, 0.6)";
    });
    fab.addEventListener("mouseleave", () => {
      fab.style.transform = "scale(1)";
      fab.style.boxShadow = "0 4px 14px rgba(79, 70, 229, 0.5)";
    });

    fab.addEventListener("click", () => {
      if (pageIsPdf()) {
        location.href = chrome.runtime.getURL("pdf-viewer.html") + "?url=" + encodeURIComponent(location.href);
      } else {
        toggleSidebar();
      }
    });
    document.body.appendChild(fab);
  }

  function setFabLoading(loading) {
    if (!fab) return;
    if (loading) {
      fab.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke="white" stroke-width="2.5" stroke-dasharray="31.4" stroke-dashoffset="10"/>
        </svg>
        <style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>
      `;
      fab.style.background = "#6366F1";
    } else {
      fab.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white"/>
        </svg>
      `;
      fab.style.background = sidebarOpen ? "#3730A3" : "#4F46E5";
    }
  }

  function createSidebar() {
    sidebarFrame = document.createElement("iframe");
    sidebarFrame.id = "__context-provider-sidebar";
    sidebarFrame.src = chrome.runtime.getURL("sidebar.html");
    sidebarFrame.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 340px;
      height: 100vh;
      border: none;
      z-index: 2147483645;
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    document.body.appendChild(sidebarFrame);

    window.addEventListener("message", (event) => {
      if (event.origin !== EXTENSION_ORIGIN) return;
      if (event.data.type === "SIDEBAR_READY") {
        if (event.data.level) currentLevel = event.data.level;
        if (pageAnalysisCache[currentLevel]) {
          sidebarFrame.contentWindow.postMessage({ type: "ANALYSIS_RESULT", data: pageAnalysisCache[currentLevel] }, EXTENSION_ORIGIN);
        } else {
          analyzePage();
        }
      }

      if (event.data.type === "CHAT_MESSAGE") {
        const { userMessage, history, pageText, level } = event.data;
        const port = chrome.runtime.connect({ name: "chat" });

        port.onMessage.addListener((msg) => {
          if (sidebarFrame) {
            sidebarFrame.contentWindow.postMessage(msg, EXTENSION_ORIGIN);
          }
          if (msg.type === "DONE" || msg.type === "ERROR") port.disconnect();
        });

        port.postMessage({ userMessage, history, pageText, level: level || currentLevel });
      }

      if (event.data.type === "REANALYZE") {
        if (event.data.level) {
          currentLevel = event.data.level;
        } else {
          delete pageAnalysisCache[currentLevel];
        }
        analyzePage();
      }

      if (event.data.type === "CLOSE_SIDEBAR") {
        closeSidebar();
      }

      if (event.data.type === "SAVE_TLDR") {
        const { title, url, tldr, projectId } = event.data;
        chrome.runtime.sendMessage({ type: "SAVE_TLDR", title, url, tldr, projectId });
      }

      if (event.data.type === "MOVE_ITEM") {
        const { id, projectId } = event.data;
        chrome.runtime.sendMessage({ type: "MOVE_ITEM", id, projectId }, (response) => {
          if (sidebarFrame) {
            sidebarFrame.contentWindow.postMessage({ type: "SAVED_ITEMS", data: response.items }, EXTENSION_ORIGIN);
          }
        });
      }

      if (event.data.type === "LOAD_SAVED") {
        chrome.runtime.sendMessage({ type: "LOAD_SAVED" }, (response) => {
          if (sidebarFrame) {
            sidebarFrame.contentWindow.postMessage({ type: "SAVED_ITEMS", data: response.items }, EXTENSION_ORIGIN);
          }
        });
      }

      if (event.data.type === "DELETE_SAVED") {
        const { id } = event.data;
        chrome.runtime.sendMessage({ type: "DELETE_SAVED", id }, (response) => {
          if (sidebarFrame) {
            sidebarFrame.contentWindow.postMessage({ type: "SAVED_ITEMS", data: response.items }, EXTENSION_ORIGIN);
          }
        });
      }
    });
  }

  function analyzePage() {
    if (isAnalyzing) return;

    if (pageAnalysisCache[currentLevel]) {
      if (sidebarFrame && sidebarOpen) {
        sidebarFrame.contentWindow.postMessage({ type: "ANALYSIS_RESULT", data: pageAnalysisCache[currentLevel] }, EXTENSION_ORIGIN);
      }
      return;
    }

    isAnalyzing = true;
    setFabLoading(true);

    const text = extractPageText();
    const title = document.title;

    chrome.runtime.sendMessage({ type: "ANALYZE_PAGE", text, title, level: currentLevel }, (response) => {
      isAnalyzing = false;
      setFabLoading(false);

      if (response && response.success) {
        const analysis = response.data;
        analysis.pageText = text;
        analysis.title = title;
        analysis.url = location.href;
        pageAnalysisCache[currentLevel] = analysis;
        if (sidebarFrame && sidebarOpen) {
          sidebarFrame.contentWindow.postMessage({ type: "ANALYSIS_RESULT", data: analysis }, EXTENSION_ORIGIN);
        }
      } else {
        const error = response?.error || "Unknown error";
        if (sidebarFrame && sidebarOpen) {
          sidebarFrame.contentWindow.postMessage({ type: "ANALYSIS_ERROR", error }, EXTENSION_ORIGIN);
        }
      }
    });
  }

  function openSidebar() {
    sidebarOpen = true;
    fab.style.background = "#3730A3";
    fab.style.right = "368px";

    if (!sidebarFrame) {
      createSidebar();
    }

    requestAnimationFrame(() => {
      sidebarFrame.style.transform = "translateX(0)";
    });

    if (pageAnalysisCache[currentLevel]) {
      setTimeout(() => {
        sidebarFrame.contentWindow.postMessage({ type: "ANALYSIS_RESULT", data: pageAnalysisCache[currentLevel] }, EXTENSION_ORIGIN);
      }, 400);
    }
  }

  function closeSidebar() {
    sidebarOpen = false;
    fab.style.background = "#4F46E5";
    fab.style.right = "28px";
    if (sidebarFrame) {
      sidebarFrame.style.transform = "translateX(100%)";
    }
  }

  function toggleSidebar() {
    if (sidebarOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  createFab();
})();
