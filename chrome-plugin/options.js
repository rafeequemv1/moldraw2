import { loadSettings, saveSettings } from './shared.js';

const appId = document.getElementById('appId');
const appKey = document.getElementById('appKey');
const autoOpen = document.getElementById('autoOpen');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('status');

function selectedTarget() {
  return document.querySelector('input[name="target"]:checked')?.value || 'production';
}

async function fill() {
  const settings = await loadSettings();
  appId.value = settings.mathpixAppId;
  appKey.value = settings.mathpixAppKey;
  autoOpen.checked = settings.autoOpen;
  const radio = document.querySelector(`input[name="target"][value="${settings.openTarget}"]`);
  if (radio) radio.checked = true;
}

saveBtn.addEventListener('click', async () => {
  await saveSettings({
    mathpixAppId: appId.value,
    mathpixAppKey: appKey.value,
    openTarget: selectedTarget(),
    autoOpen: autoOpen.checked,
  });
  statusEl.textContent = 'Saved.';
});

fill();
