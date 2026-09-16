import {
  convertImageWithMathpix,
  cropVisibleTab,
  editorUrlsFor,
  hasMathpixKeys,
  isRestrictedUrl,
  loadSettings,
  makeThumbnail,
} from './shared.js';

const RESULT_KEY = 'lastResult';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setResult(result) {
  await chrome.storage.local.set({ [RESULT_KEY]: { ...result, updatedAt: Date.now() } });
}

async function setBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color: color || '#0f766e' });
  await chrome.action.setBadgeText({ text: text || '' });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function startCapture(tab) {
  if (!tab?.id) {
    await setResult({ status: 'error', message: 'No active tab to capture.' });
    await setBadge('!', '#b91c1c');
    return;
  }

  if (isRestrictedUrl(tab.url)) {
    await setResult({
      status: 'error',
      message: 'This page cannot be captured. Open a normal website and try again.',
    });
    await setBadge('!', '#b91c1c');
    return;
  }

  const settings = await loadSettings();
  if (!hasMathpixKeys(settings)) {
    await setResult({
      status: 'error',
      message: 'Add your Mathpix app_id and app_key in Settings first.',
    });
    await setBadge('!', '#b91c1c');
    chrome.runtime.openOptionsPage();
    return;
  }

  await setBadge('', '#0f766e');
  await setResult({ status: 'selecting', message: 'Drag to select a molecule.' });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['overlay.js'],
    });
  } catch (error) {
    await setResult({
      status: 'error',
      message: error?.message || 'Could not start the screenshot overlay on this page.',
    });
    await setBadge('!', '#b91c1c');
  }
}

async function finishCapture(message, sender) {
  const tab = sender.tab;
  if (!tab?.id) return;

  if (message.cancelled) {
    await setResult({ status: 'cancelled', message: 'Capture cancelled.' });
    await setBadge('', '#0f766e');
    return;
  }

  const rect = message.rect;
  const viewport = message.viewport;
  if (!rect || rect.w < 4 || rect.h < 4) {
    await setResult({ status: 'error', message: 'Selection was too small.' });
    await setBadge('!', '#b91c1c');
    return;
  }

  await setResult({ status: 'converting', message: 'Converting with Mathpix…' });
  await setBadge('…', '#0f766e');

  try {
    await chrome.tabs.update(tab.id, { active: true });
    await delay(80);
    const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const cropped = await cropVisibleTab(screenshot, rect, viewport);
    const settings = await loadSettings();
    if (!hasMathpixKeys(settings)) {
      throw new Error('Add your Mathpix app_id and app_key in Settings first.');
    }

    const parsed = await convertImageWithMathpix(cropped, settings);
    const preview = await makeThumbnail(cropped);
    const smiles = parsed.smiles;
    await setResult({
      status: 'ok',
      message: parsed.smilesList.length > 1
        ? `Found ${parsed.smilesList.length} structures.`
        : 'Converted to an editable structure.',
      smiles,
      preview,
      confidence: parsed.confidence,
    });
    await setBadge('✓', '#0f766e');

    if (settings.autoOpen !== false) {
      await openInMolDraw(smiles, settings.openTarget);
    }
  } catch (error) {
    await setResult({
      status: 'error',
      message: error?.message || 'Conversion failed.',
    });
    await setBadge('!', '#b91c1c');
  }
}

async function openInMolDraw(smiles, target) {
  const urls = editorUrlsFor(smiles, target);
  for (const url of urls) {
    await chrome.tabs.create({ url, active: true });
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'START_CAPTURE') {
    (async () => {
      const tab = message.tabId
        ? { id: message.tabId, windowId: message.windowId, url: message.url }
        : await activeTab();
      await startCapture(tab);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'REGION_SELECTED') {
    finishCapture(message, sender);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'OPEN_IN_MOLDRAW') {
    (async () => {
      const settings = await loadSettings();
      await openInMolDraw(message.smiles, settings.openTarget);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'CLEAR_BADGE') {
    setBadge('', '#0f766e');
    sendResponse({ ok: true });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-molecule') return;
  const tab = await activeTab();
  await startCapture(tab);
});
