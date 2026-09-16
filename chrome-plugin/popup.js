import { hasMathpixKeys, loadSettings } from './shared.js';

const captureBtn = document.getElementById('capture');
const openBtn = document.getElementById('open');
const settingsBtn = document.getElementById('settings');
const statusEl = document.getElementById('status');
const preview = document.getElementById('preview');
const smilesEl = document.getElementById('smiles');

let lastSmiles = '';

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.remove('error', 'ok');
  if (kind) statusEl.classList.add(kind);
}

function renderResult(result) {
  const status = result?.status || 'idle';
  const message = result?.message || 'Ready';
  lastSmiles = result?.smiles || '';

  if (status === 'ok' && lastSmiles) setStatus(message, 'ok');
  else if (status === 'error') setStatus(message, 'error');
  else setStatus(message || 'Ready');

  if (result?.preview) {
    preview.src = result.preview;
    preview.hidden = false;
  } else {
    preview.removeAttribute('src');
    preview.hidden = true;
  }

  if (lastSmiles) {
    smilesEl.textContent = lastSmiles;
    smilesEl.hidden = false;
    openBtn.hidden = false;
  } else {
    smilesEl.textContent = '';
    smilesEl.hidden = true;
    openBtn.hidden = true;
  }
}

async function refresh() {
  const settings = await loadSettings();
  const stored = await chrome.storage.local.get('lastResult');
  renderResult(stored.lastResult);

  if (!hasMathpixKeys(settings)) {
    captureBtn.disabled = true;
    setStatus('Add Mathpix keys in Settings to capture.', 'error');
    return;
  }

  captureBtn.disabled = false;
  if (!stored.lastResult) setStatus('Ready');
}

captureBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  captureBtn.disabled = true;
  setStatus('Select a region on the page…');
  await chrome.runtime.sendMessage({
    type: 'START_CAPTURE',
    tabId: tab?.id,
    windowId: tab?.windowId,
    url: tab?.url,
  });
  window.close();
});

openBtn.addEventListener('click', async () => {
  if (!lastSmiles) return;
  await chrome.runtime.sendMessage({ type: 'OPEN_IN_MOLDRAW', smiles: lastSmiles });
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lastResult) renderResult(changes.lastResult.newValue);
  if (area === 'sync') refresh();
});

chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' });
refresh();
