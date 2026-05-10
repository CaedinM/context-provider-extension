function isPdfUrl(url) {
  if (!url || !url.startsWith("http")) return false;
  if (/\.pdf([?#].*)?$/i.test(url)) return true;
  if (/\/pdf\/[^?#/][^?#]*$/.test(url)) return true;
  return false;
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !isPdfUrl(tab.url)) return;
  document.getElementById("pdf-banner").style.display = "block";
  document.getElementById("pdf-divider").style.display = "block";
  document.getElementById("open-pdf-btn").addEventListener("click", () => {
    const viewerUrl = chrome.runtime.getURL("pdf-viewer.html") + "?url=" + encodeURIComponent(tab.url);
    chrome.tabs.update(tab.id, { url: viewerUrl });
    window.close();
  });
});

