chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "check-ai-image",
    title: "Check if AI-generated",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "check-ai-image") {
    const mediaUrl = info.srcUrl;

    chrome.storage.local.set({ targetMedia: mediaUrl, analysisStatus: "pending" }, () => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert("Image captured! Click the Honest AI Detector extension icon to see the analysis.")
      });
    });
  }
});