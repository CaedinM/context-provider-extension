(() => {
  const pdfUrl = new URL(location.href).searchParams.get("url");
  if (!pdfUrl) {
    showError("No PDF URL provided.");
    return;
  }

  const EXTENSION_ORIGIN = new URL(chrome.runtime.getURL("")).origin;
  const sidebarFrame = document.getElementById("sidebar-frame");
  const reopenFab = document.getElementById("reopen-fab");
  const loadingOverlay = document.getElementById("loading-overlay");

  let sidebarOpen = true;
  let pageAnalysis = null;
  let isAnalyzing = false;
  let extractedText = null;
  let sidebarReady = false;

  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");

  function showError(msg) {
    loadingOverlay.classList.add("hidden");
    const overlay = document.getElementById("error-overlay");
    overlay.classList.add("visible");
    document.getElementById("error-msg").textContent = msg;
  }

  async function loadPdf(url) {
    const panel = document.getElementById("pdf-panel");
    try {
      const fetchResp = await fetch(url);
      if (!fetchResp.ok) throw new Error(`HTTP ${fetchResp.status}`);
      const arrayBuffer = await fetchResp.arrayBuffer();

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const textParts = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        panel.appendChild(canvas);

        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

        const content = await page.getTextContent();
        textParts.push(content.items.map((item) => item.str).join(" "));
      }

      loadingOverlay.classList.add("hidden");
      return textParts.join("\n\n").replace(/\s+/g, " ").trim();
    } catch (err) {
      showError(`Could not load PDF: ${err.message}`);
      return null;
    }
  }

  function postToSidebar(msg) {
    if (sidebarOpen && sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage(msg, EXTENSION_ORIGIN);
    }
  }

  function analyzePage() {
    if (isAnalyzing || !extractedText) return;
    if (extractedText.trim().length < 50) {
      postToSidebar({
        type: "ANALYSIS_ERROR",
        error: "No readable text found in this PDF. It may be a scanned document without a text layer."
      });
      return;
    }
    isAnalyzing = true;

    const titleFromUrl = decodeURIComponent(pdfUrl.split("/").pop().replace(/\.pdf([?#].*)?$/i, "")).replace(/[-_]/g, " ") || "PDF Document";

    chrome.runtime.sendMessage(
      { type: "ANALYZE_PAGE", text: extractedText, title: titleFromUrl },
      (response) => {
        isAnalyzing = false;
        if (response && response.success) {
          pageAnalysis = response.data;
          pageAnalysis.pageText = extractedText;
          pageAnalysis.title = titleFromUrl;
          pageAnalysis.url = pdfUrl;
          postToSidebar({ type: "ANALYSIS_RESULT", data: pageAnalysis });
        } else {
          postToSidebar({ type: "ANALYSIS_ERROR", error: response?.error || "Unknown error" });
        }
      }
    );
  }

  function openSidebar() {
    sidebarOpen = true;
    sidebarFrame.classList.remove("collapsed");
    reopenFab.classList.remove("visible");
    if (pageAnalysis) {
      postToSidebar({ type: "ANALYSIS_RESULT", data: pageAnalysis });
    }
  }

  function closeSidebar() {
    sidebarOpen = false;
    sidebarFrame.classList.add("collapsed");
    reopenFab.classList.add("visible");
  }

  reopenFab.addEventListener("click", openSidebar);

  window.addEventListener("message", (event) => {
    if (event.origin !== EXTENSION_ORIGIN) return;
    const { type } = event.data;

    if (type === "SIDEBAR_READY") {
      sidebarReady = true;
      if (pageAnalysis) {
        postToSidebar({ type: "ANALYSIS_RESULT", data: pageAnalysis });
      } else if (extractedText !== null) {
        analyzePage();
      }
    }

    if (type === "CHAT_MESSAGE") {
      const { userMessage, history, pageText, level } = event.data;
      const port = chrome.runtime.connect({ name: "chat" });
      port.onMessage.addListener((msg) => {
        postToSidebar(msg);
        if (msg.type === "DONE" || msg.type === "ERROR") port.disconnect();
      });
      port.postMessage({ userMessage, history, pageText: pageText || extractedText, level });
    }

    if (type === "REANALYZE") {
      pageAnalysis = null;
      analyzePage();
    }

    if (type === "CLOSE_SIDEBAR") {
      closeSidebar();
    }

    if (type === "SAVE_TLDR") {
      const { title, url, tldr, projectId } = event.data;
      chrome.runtime.sendMessage({ type: "SAVE_TLDR", title, url, tldr, projectId });
    }

    if (type === "LOAD_SAVED") {
      chrome.runtime.sendMessage({ type: "LOAD_SAVED" }, (response) => {
        postToSidebar({ type: "SAVED_ITEMS", data: response.items });
      });
    }

    if (type === "DELETE_SAVED") {
      chrome.runtime.sendMessage({ type: "DELETE_SAVED", id: event.data.id }, (response) => {
        postToSidebar({ type: "SAVED_ITEMS", data: response.items });
      });
    }

    if (type === "MOVE_ITEM") {
      chrome.runtime.sendMessage({ type: "MOVE_ITEM", id: event.data.id, projectId: event.data.projectId }, (response) => {
        postToSidebar({ type: "SAVED_ITEMS", data: response.items });
      });
    }
  });

  (async () => {
    const titleFromUrl = decodeURIComponent(pdfUrl.split("/").pop().replace(/\.pdf([?#].*)?$/i, "")).replace(/[-_]/g, " ") || "PDF Document";
    document.title = `${titleFromUrl} — Context Provider`;

    extractedText = await loadPdf(pdfUrl);
    if (extractedText !== null && sidebarReady && !pageAnalysis) {
      analyzePage();
    }
  })();
})();
