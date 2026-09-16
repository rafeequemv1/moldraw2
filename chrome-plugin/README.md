# MolDraw Chrome plugin

Capture a molecule while browsing, convert the screenshot with [Mathpix](https://mathpix.com/) chemistry OCR, and open the structure in MolDraw.

This folder is an unpacked **Manifest V3** extension. It does not ship Mathpix keys.

## Load unpacked

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Choose this folder: `chrome-plugin`

## Mathpix keys

1. Create an OCR API app in your [Mathpix account](https://accounts.mathpix.com/) and copy `app_id` and `app_key`
2. Click the MolDraw extension icon → **Settings**, or right-click the icon → **Options**
3. Paste the keys and click **Save**

Keys are stored in `chrome.storage.sync` on your Chrome profile. They are never hardcoded in this repo.

## Usage

1. Open any page that shows a molecule
2. Click the extension → **Capture molecule** (or `Alt+Shift+M`)
3. Drag a rectangle around the structure
4. Mathpix converts the crop to SMILES
5. MolDraw opens automatically (`https://moldraw.com/?smiles=…`), and **Open in MolDraw** stays available in the popup

Local editor: in Settings, choose `http://127.0.0.1:5173` (Vite dev server) or **Both**.

Reaction SMILES (`>>`) open as `/?reaction=` instead of `/?smiles=`.

## How capture works

1. A page overlay (snipping-tool style) lets you select a region
2. The overlay is removed, then `chrome.tabs.captureVisibleTab` snapshots the viewport
3. The crop is sent to Mathpix from the extension service worker
4. Parsed SMILES are opened in MolDraw

Restricted pages (`chrome://`, the Chrome Web Store) cannot be captured.

## Mathpix endpoint

```
POST https://api.mathpix.com/v3/text
```

Headers: `app_id`, `app_key`, `Content-Type: application/json`

Body:

```json
{
  "src": "data:image/png;base64,…",
  "include_smiles": true,
  "include_inchi": true,
  "formats": ["text"]
}
```

Chemistry diagrams come back as Mathpix Markdown `<smiles>…</smiles>` (optional `inchi` attribute). MolDraw prefers SMILES; Mathpix does not return a molfile from this endpoint.

## Open in MolDraw URL

```
https://moldraw.com/?smiles=<urlencoded SMILES>
http://127.0.0.1:5173/?smiles=<urlencoded SMILES>
https://moldraw.com/?reaction=<urlencoded reaction SMILES>
```

These match the query parameters the editor already hydrates on load.
