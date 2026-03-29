import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import TlcModal from './microapps/tlc/TlcModal';
import ReactionsModal from './microapps/reactions/ReactionsModal';
import * as $3Dmol from '3dmol';

/**
 * NCI Cactus `get3d` SDF often drops or replaces bracketed alkali atoms (e.g. [K], [Li]).
 * In those cases we keep the Ketcher molfile so 3Dmol shows the same composition as 2D.
 */
function smilesContainsAlkaliMetal(smiles) {
  if (!smiles) return false;
  return /\[(?:Li|Na|K|Rb|Cs|Fr)[^\]]*\]/i.test(smiles);
}

function isAlkaliElementSymbol(sym) {
  const s = String(sym || '').replace(/[^A-Za-z]/g, '');
  return /^(Li|Na|K|Rb|Cs|Fr)$/i.test(s);
}

function getMolfileHeavyAtomCount(block) {
  const lines = String(block || '').split(/\r?\n/);
  if (lines.length < 4) return 0;
  const parts = lines[3].trim().split(/\s+/);
  const natoms = parseInt(parts[0], 10);
  if (Number.isNaN(natoms) || natoms <= 0) return 0;
  let heavy = 0;
  for (let i = 0; i < natoms && 4 + i < lines.length; i++) {
    const ap = lines[4 + i].trim().split(/\s+/);
    const raw = (ap[3] || '').trim();
    if (!raw) continue;
    if (/^H$/i.test(raw) || /^D$/i.test(raw) || /^T$/i.test(raw)) continue;
    heavy++;
  }
  return heavy;
}

function getSdfFirstRecordBlock(sdf) {
  const t = String(sdf || '').split(/\$+\$/)[0];
  return t.trim();
}

/** PubChem conformer (often keeps metals + H better than raw Ketcher 2D mol in 3Dmol). */
async function convertSmilesTo3DPubChem(smiles) {
  if (!smiles || !String(smiles).trim()) return null;
  try {
    const enc = encodeURIComponent(smiles.trim());
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${enc}/record/SDF/?record_type=3d`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || !/M\s+END/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Ketcher molfiles are often planar (z≈0); alkali atoms sit on top of ring carbons in 3D.
 * Nudge alkali x,y away from the heavy-atom centroid and lift z slightly.
 */
function liftAlkaliInFlatMolfile(molfile) {
  const text = String(molfile || '');
  if (!text.trim() || /V3000/i.test(text)) return molfile;
  const lines = text.split(/\r?\n/);
  if (lines.length < 5) return molfile;

  const countParts = lines[3].trim().split(/\s+/);
  const natoms = parseInt(countParts[0], 10);
  if (Number.isNaN(natoms) || natoms <= 0) return molfile;

  const atoms = [];
  let maxAbsZ = 0;
  for (let i = 0; i < natoms && 4 + i < lines.length; i++) {
    const rawLine = lines[4 + i];
    const ap = rawLine.trim().split(/\s+/);
    if (ap.length < 4) return molfile;
    const x = parseFloat(ap[0]);
    const y = parseFloat(ap[1]);
    const z = parseFloat(ap[2]);
    const elem = ap[3];
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return molfile;
    maxAbsZ = Math.max(maxAbsZ, Math.abs(z));
    atoms.push({ i: 4 + i, x, y, z, elem, parts: [...ap] });
  }

  if (maxAbsZ > 0.08) return molfile;

  let sx = 0;
  let sy = 0;
  let nHeavy = 0;
  atoms.forEach((a) => {
    const raw = String(a.elem || '').trim();
    if (/^H$/i.test(raw) || /^D$/i.test(raw) || /^T$/i.test(raw)) return;
    sx += a.x;
    sy += a.y;
    nHeavy += 1;
  });
  if (nHeavy === 0) return molfile;
  const cx = sx / nHeavy;
  const cy = sy / nHeavy;

  atoms.forEach((a) => {
    if (!isAlkaliElementSymbol(a.elem)) return;
    let dx = a.x - cx;
    let dy = a.y - cy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 1;
      dy = 0;
      len = 1;
    }
    dx /= len;
    dy /= len;
    const push = 1.35;
    const lift = 0.85;
    a.parts[0] = (a.x + dx * push).toFixed(4);
    a.parts[1] = (a.y + dy * push).toFixed(4);
    a.parts[2] = (a.z + lift).toFixed(4);
    lines[a.i] = a.parts.join(' ');
  });

  return lines.join('\n');
}

function App() {
  const ketcherCanvasWrapRef = useRef(null);
  const viewer3DRef = useRef(null);
  const viewerInstanceRef = useRef(null);
  const viewerBgRef = useRef({ color: '#f8f9fa', alpha: 1 });
  const iframeRef = useRef(null);
  const proteinModelRef = useRef(null);
  const lastModelRef = useRef(null);
  const [is3DReady, setIs3DReady] = useState(false);
  const [isKetcherReady, setIsKetcherReady] = useState(false);
  const [showHydrogens, setShowHydrogens] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [renderStyle, setRenderStyle] = useState('ball-stick');
  const [currentMolecule, setCurrentMolecule] = useState(null);
  const lastMoleculeRef = useRef(null);
  const [moleculeName, setMoleculeName] = useState('');
  const [iupacName, setIupacName] = useState('');
  const [boilingPoint, setBoilingPoint] = useState(null);
  const [meltingPoint, setMeltingPoint] = useState(null);
  const [isNaming, setIsNaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [is3DPanelOpen, setIs3DPanelOpen] = useState(true);
  const [molDetailsOpen, setMolDetailsOpen] = useState(true);
  const [viewerMode, setViewerMode] = useState('molecule');
  const [isProtein, setIsProtein] = useState(false);
  const [proteinMeta, setProteinMeta] = useState(null);
  const [proteinPdbIdInput, setProteinPdbIdInput] = useState('');
  const [proteinStatus, setProteinStatus] = useState('');
  const proteinFileInputRef = useRef(null);
  const [proteinChainData, setProteinChainData] = useState({});
  const [proteinChainSettings, setProteinChainSettings] = useState({});
  const [selectedProteinChain, setSelectedProteinChain] = useState('');
  const [proteinSelectedRange, setProteinSelectedRange] = useState(null);
  const [proteinSegmentOverrides, setProteinSegmentOverrides] = useState([]);
  const [proteinSeqMenu, setProteinSeqMenu] = useState({ open: false, x: 0, y: 0 });
  const proteinSeqDragRef = useRef(null);
  const moleculeViewCacheRef = useRef(null);
  const proteinViewCacheRef = useRef(null);
  const [molecularMass, setMolecularMass] = useState(null);
  const [multiStructure, setMultiStructure] = useState(false);
  const [selected3DComponentIdx, setSelected3DComponentIdx] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    try { return localStorage.getItem('moldraw_gemini_key') || ''; } catch { return ''; }
  });
  const [aiModel, setAiModel] = useState(() => {
    try { return localStorage.getItem('moldraw_ai_model') || 'gemini-2.5-flash'; } catch { return 'gemini-2.5-flash'; }
  });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const lastSmilesForAIRef = useRef(null);
  const lastMolfileForAIRef = useRef(null);
  const manual3DRefreshRequestedRef = useRef(false);
  const force3DRefreshOnDeleteRef = useRef(false);
  const proteinCloseReloadRef = useRef(false);
  const previousAtomCountRef = useRef(0);
  const iupacRequestedRef = useRef(false);
  const copySmilesRequestedRef = useRef(false);
  const moleculeUpdateSeqRef = useRef(0);
  const lastRenderedSignatureRef = useRef('');
  const [smilesCopied, setSmilesCopied] = useState(false);
  const [metaSmilesCopied, setMetaSmilesCopied] = useState(false);
  const [metaIupacCopied, setMetaIupacCopied] = useState(false);
  const [currentSmiles, setCurrentSmiles] = useState('');
  const [nmrData, setNmrData] = useState(null);
  const [showNmrModal, setShowNmrModal] = useState(false);
  const [isNmrLoading, setIsNmrLoading] = useState(false);
  const [activeSpectrumType, setActiveSpectrumType] = useState('1H');
  const [showAiSetupModal, setShowAiSetupModal] = useState(false);
  const [showTlcModal, setShowTlcModal] = useState(false);
  const [showReactionsModal, setShowReactionsModal] = useState(false);
  const [reactionResults, setReactionResults] = useState([]);
  const [isReactionSearchLoading, setIsReactionSearchLoading] = useState(false);
  const [reactionSearchError, setReactionSearchError] = useState('');
  const [includeReactionIntermediates, setIncludeReactionIntermediates] = useState(true);
  const [includeCanvasReagentNames, setIncludeCanvasReagentNames] = useState(true);
  const [includeCanvasConditions, setIncludeCanvasConditions] = useState(true);
  const [appendReactionToCanvas, setAppendReactionToCanvas] = useState(true);
  const [reactionLoadingStepIdx, setReactionLoadingStepIdx] = useState(0);
  const [isMiewEngine, setIsMiewEngine] = useState(false);
  const [miewMode, setMiewMode] = useState('BS');
  const [miewColorer, setMiewColorer] = useState('EL');
  const [miewResolution] = useState('medium');
  const [miewAutoResolution] = useState(false);
  const [miewFog, setMiewFog] = useState(false);
  const [miewAxes] = useState(false);
  const [miewFps] = useState(false);
  const [miewPalette] = useState('JM');
  const [miewBgDark] = useState(false);
  const [miewFxaa] = useState(true);
  const [miewAo] = useState(false);
  const [miewShadow] = useState(false);
  const [miewClipPlane] = useState(false);
  const [miewOutline, setMiewOutline] = useState(true);
  const [exportTransparentBg, setExportTransparentBg] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [lonePairs, setLonePairs] = useState([]);
  const lastSmilesSelectionBaseRef = useRef('');
  const lonePairDragRef = useRef(null);
  const moreMenuRef = useRef(null);
  const downloadMenuRef = useRef(null);
  const host = window.location.hostname;
  const isLocalDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  const AI_CHAT_ENDPOINT = isLocalDevHost
    ? `http://${host === 'localhost' || host === '127.0.0.1' ? 'localhost' : host}:3001/api/gemini-chat`
    : '/api/gemini-chat';
  const AI_MODEL_OPTIONS = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (balanced)' },
    { value: 'gemini-3.0-flash', label: 'Gemini 3 Flash (fast)' },
    { value: 'gemini-3-pro', label: 'Gemini 3 Pro (high accuracy)' },
  ];
  const REACTION_LOADING_STEPS = [
    'Reading query',
    'Selecting reaction family',
    'Building reagent options',
    'Adding conditions and intermediates',
    'Finalizing preview list',
  ];

  const promptAiSetupModal = () => {
    setShowAiSetupModal(true);
    setIsChatOpen(true);
    setShowApiKeyInput(true);
  };

  // Close AI chat when Crisp opens; mutual exclusivity
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.$crisp && typeof window.$crisp.is === 'function') {
        clearInterval(interval);
        window.$crisp.push(['on', 'chat:opened', () => setIsChatOpen(false)]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onDocClick = (event) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('openTlc') === '1') {
        setShowTlcModal(true);
        q.delete('openTlc');
        const rest = q.toString();
        const next = `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash || ''}`;
        window.history.replaceState({}, '', next);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Initialize IndexedDB for caching
  useEffect(() => {
    const initDB = async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('MolDrawCache', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('appState')) {
            db.createObjectStore('appState', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('molecules')) {
            db.createObjectStore('molecules', { keyPath: 'id' });
          }
        };
      });
    };

    // Load cached state
    const loadCachedState = async () => {
      try {
        // Try localStorage first (faster)
        const cachedState = localStorage.getItem('moldraw_state');
        if (cachedState) {
          const state = JSON.parse(cachedState);
          if (state.renderStyle) setRenderStyle(state.renderStyle);
          if (state.showHydrogens !== undefined) setShowHydrogens(state.showHydrogens);
          if (state.is3DPanelOpen !== undefined) setIs3DPanelOpen(state.is3DPanelOpen);
          if (state.molDetailsOpen !== undefined) setMolDetailsOpen(state.molDetailsOpen);
        }

        // Initialize IndexedDB
        await initDB();
      } catch (error) {
        console.warn('Cache initialization failed:', error);
      }
    };

    loadCachedState();
  }, []);

  // Save state to cache
  useEffect(() => {
    const state = {
      renderStyle,
      showHydrogens,
      is3DPanelOpen,
      molDetailsOpen,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('moldraw_state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }, [renderStyle, showHydrogens, is3DPanelOpen, molDetailsOpen]);

  useEffect(() => {
    try { localStorage.setItem('moldraw_ai_model', aiModel); } catch {}
  }, [aiModel]);

  // Cache molecule data in IndexedDB
  const cacheMolecule = useCallback(async (molfile, smiles) => {
    try {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('MolDrawCache', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

      const transaction = db.transaction(['molecules'], 'readwrite');
      const store = transaction.objectStore('molecules');
      
      await store.put({
        id: 'current',
        molfile,
        smiles,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('Failed to cache molecule:', error);
    }
  }, []);

  // Initialize Miew viewer
  useEffect(() => {
    const initViewer = () => {
      try {
        if (viewer3DRef.current && !viewerInstanceRef.current && $3Dmol?.createViewer) {
          const viewer = $3Dmol.createViewer(viewer3DRef.current, {
            backgroundColor: 'white',
          });
          viewer.setBackgroundColor('white');
          viewer.render();
          setIsMiewEngine(false);
          viewerBgRef.current = { color: '#ffffff', alpha: 1 };
          viewerInstanceRef.current = viewer;
          setIs3DReady(true);
        }
      } catch (error) {
        console.error('Error initializing 3Dmol viewer:', error);
      }
    };

    initViewer();

    return () => {
      try {
        if (viewerInstanceRef.current && typeof viewerInstanceRef.current.clear === 'function') {
          viewerInstanceRef.current.clear();
        }
      } catch {}
      viewerInstanceRef.current = null;
    };
  }, []);

  const sanitizeSmilesText = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const lowered = text.toLowerCase();
    // Guard against accidentally receiving molfile/sdf payloads in the smiles field.
    if (
      text.includes('\n') ||
      text.includes('\r') ||
      lowered.includes('v2000') ||
      lowered.includes('v3000') ||
      lowered.includes('m  end') ||
      lowered.includes('$$$$')
    ) {
      return '';
    }
    const compact = text.replace(/\s+/g, '');
    // Basic SMILES token safety check.
    if (!/^(?=.*[A-Za-z])[A-Za-z0-9@+\-[\]()=#$\\/%.:*.,]+$/.test(compact)) {
      return '';
    }
    return compact;
  };

  // Flag to suppress the next 3D update coming from Ketcher polling
  const suppressNext3DUpdateRef = useRef(false);

  const searchMoleculeByName = async (moleculeName) => {
    if (!moleculeName || moleculeName.trim() === '') {
      setSearchError('Please enter a molecule name');
      return;
    }

    try {
      setIsSearching(true);
      setSearchError('');

      console.log('Searching for:', moleculeName);

      // PubChem API - get SMILES from compound name
      const encodedName = encodeURIComponent(moleculeName.trim());
      const apiUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodedName}/property/IsomericSMILES/JSON`;

      const response = await fetch(apiUrl);

      if (response.ok) {
        const data = await response.json();
        if (data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0]) {
          const smiles = data.PropertyTable.Properties[0].IsomericSMILES || data.PropertyTable.Properties[0].SMILES;

          console.log('Got SMILES:', smiles);
          console.log('Ketcher ready:', isKetcherReady);

          // Load SMILES into Ketcher (2D) and add to 3D without clearing
          if (iframeRef.current && isKetcherReady) {
            console.log('Sending set-molecule message to Ketcher');

            // Tell the Ketcher polling pipeline to ignore the very next molfile update
            suppressNext3DUpdateRef.current = true;

            iframeRef.current.contentWindow.postMessage({
              type: 'append-molecule',
              smiles: smiles
            }, '*');

            setSearchQuery('');
            setSearchError('');

            requestMoleculeUpdate();
          } else {
            setSearchError('Editor not ready. Please try again.');
          }
        } else {
          setSearchError(`"${moleculeName}" not found in PubChem`);
        }
      } else {
        setSearchError(`"${moleculeName}" not found in PubChem`);
      }

      setIsSearching(false);
    } catch (error) {
      console.error('Error searching molecule:', error);
      setSearchError('Search failed. Please try again.');
      setIsSearching(false);
    }
  };

  const clearMoleculeProps = () => {
    setMoleculeName('');
    setIupacName('');
    setBoilingPoint(null);
    setMeltingPoint(null);
    setCurrentSmiles('');
    setNmrData(null);
  };

  const parseProteinMetadata = useCallback((pdbText, label = '') => {
    const text = String(pdbText || '');
    const lines = text.split(/\r?\n/);
    const atomLines = lines.filter((line) => line.startsWith('ATOM') || line.startsWith('HETATM'));
    const chainSet = new Set();
    const massMap = {
      H: 1.008, C: 12.011, N: 14.007, O: 15.999, S: 32.06, P: 30.974,
      F: 18.998, CL: 35.45, BR: 79.904, I: 126.904, MG: 24.305, ZN: 65.38,
      CA: 40.078, NA: 22.99, K: 39.098, FE: 55.845, CU: 63.546, MN: 54.938
    };

    let mass = 0;
    atomLines.forEach((line) => {
      const chain = (line[21] || '').trim();
      if (chain) chainSet.add(chain);
      const elemRaw = (line.slice(76, 78).trim() || line.slice(12, 16).trim().replace(/[0-9]/g, '').slice(0, 2)).toUpperCase();
      if (massMap[elemRaw]) mass += massMap[elemRaw];
    });

    let method = '';
    const expdtaLine = lines.find((line) => line.startsWith('EXPDTA'));
    if (expdtaLine) method = expdtaLine.replace(/^EXPDTA\s+/, '').trim();

    let resolution = '';
    const resLine = lines.find((line) => /^REMARK\s+2\s+RESOLUTION\./.test(line));
    if (resLine) {
      const match = resLine.match(/RESOLUTION\.\s*([0-9.]+)/i);
      if (match) resolution = match[1];
    }

    const headerLine = lines.find((line) => line.startsWith('HEADER')) || '';
    const depositDate = headerLine.slice(50, 59).trim();

    return {
      name: label || 'Protein structure',
      method,
      chains: chainSet.size || '',
      resolution,
      atomCount: atomLines.length,
      mw: mass > 0 ? mass : null,
      depositDate: depositDate || ''
    };
  }, []);

  const parseProteinChains = useCallback((pdbText) => {
    const aaMap = {
      ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLU: 'E', GLN: 'Q', GLY: 'G',
      HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
      THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V', SEC: 'U', PYL: 'O'
    };
    const lines = String(pdbText || '').split(/\r?\n/);
    const seen = new Set();
    const chainMap = {};
    lines.forEach((line) => {
      if (!line.startsWith('ATOM')) return;
      const chain = (line[21] || 'A').trim() || 'A';
      const resi = parseInt(line.slice(22, 26).trim(), 10);
      const resn = line.slice(17, 20).trim().toUpperCase();
      if (!Number.isFinite(resi)) return;
      const key = `${chain}:${resi}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!chainMap[chain]) chainMap[chain] = [];
      chainMap[chain].push({ chain, resi, resn, aa: aaMap[resn] || 'X' });
    });
    Object.keys(chainMap).forEach((chain) => chainMap[chain].sort((a, b) => a.resi - b.resi));
    return chainMap;
  }, []);

  const getSmilesComponents = useCallback((smiles) => {
    return String(smiles || '')
      .split('.')
      .map((x) => x.trim())
      .filter(Boolean);
  }, []);

  const getMolfileAtomCount = (molfile) => {
    if (!molfile || !String(molfile).trim()) return 0;
    const text = String(molfile);

    // V3000 format: M  V30 COUNTS <atoms> <bonds> ...
    const v3000Match = text.match(/M\s+V30\s+COUNTS\s+(\d+)/);
    if (v3000Match) return parseInt(v3000Match[1], 10) || 0;

    // V2000 format: counts line is typically line 4
    const lines = text.split('\n');
    if (lines.length >= 4) {
      const countsLine = lines[3] || '';
      const parts = countsLine.trim().split(/\s+/);
      const atomCount = parseInt(parts[0], 10);
      if (!Number.isNaN(atomCount)) return atomCount;
    }

    return 0;
  };

  const getMolfileFingerprint = (molfile) => {
    const text = String(molfile || '');
    if (!text.trim()) return '';
    return text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  };

  // Get molecule name + physical properties from PubChem
  const getMoleculeName = async (smiles) => {
    if (!smiles || smiles.trim() === '') {
      clearMoleculeProps();
      return;
    }

    try {
      setIsNaming(true);
      const encodedSmiles = encodeURIComponent(smiles);

      // Fetch compound name + IUPAC name
      const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/property/IUPACName,Title/JSON`;
      const propsRes = await fetch(propsUrl);

      if (propsRes.ok) {
        const data = await propsRes.json();
        const props = data?.PropertyTable?.Properties?.[0];
        if (props) {
          setMoleculeName(props.Title || props.IUPACName || 'Unknown compound');
          setIupacName(props.IUPACName || '');

          const cid = props.CID;
          if (cid) {
            fetchPhysicalProperties(cid, smiles);
          } else {
            setBoilingPoint(null);
            setMeltingPoint(null);
          }

          // If PubChem didn't return an IUPAC name, try Gemini
          if (!props.IUPACName && geminiApiKey) {
            fetchIupacFromGemini(smiles);
          }
        } else {
          fallbackNameFromGemini(smiles);
        }
      } else {
        fallbackNameFromGemini(smiles);
      }

      setIsNaming(false);
    } catch (error) {
      console.error('Error getting molecule name:', error);
      setMoleculeName('Name lookup failed');
      setIsNaming(false);
    }
  };

  const fetchPhysicalProperties = async (cid, smiles) => {
    let bp = null;
    let mp = null;
    try {
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=Experimental+Properties`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const sections = json?.Record?.Section || [];
        const findByHeading = (arr, heading) => {
          for (const s of arr) {
            if (s.TOCHeading === heading) return s;
            if (s.Section) {
              const found = findByHeading(s.Section, heading);
              if (found) return found;
            }
          }
          return null;
        };

        const bpSection = findByHeading(sections, 'Boiling Point');
        if (bpSection?.Information?.[0]?.Value?.StringWithMarkup?.[0]?.String) {
          bp = bpSection.Information[0].Value.StringWithMarkup[0].String;
        } else if (bpSection?.Information?.[0]?.Value?.Number) {
          bp = `${bpSection.Information[0].Value.Number[0]} ${bpSection.Information[0].Value.Unit || ''}`.trim();
        }

        const mpSection = findByHeading(sections, 'Melting Point');
        if (mpSection?.Information?.[0]?.Value?.StringWithMarkup?.[0]?.String) {
          mp = mpSection.Information[0].Value.StringWithMarkup[0].String;
        } else if (mpSection?.Information?.[0]?.Value?.Number) {
          mp = `${mpSection.Information[0].Value.Number[0]} ${mpSection.Information[0].Value.Unit || ''}`.trim();
        }
      }
    } catch (err) {
      console.error('Error fetching physical properties:', err);
    }

    setBoilingPoint(bp);
    setMeltingPoint(mp);

    // If PubChem didn't have MP/BP, try Gemini prediction
    if ((!bp || !mp) && geminiApiKey && smiles) {
      fetchMpBpFromGemini(smiles, bp, mp);
    }
  };

  const fetchMpBpFromGemini = async (smiles, existingBp, existingMp) => {
    try {
      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Predict the melting point and boiling point of this molecule (SMILES: ${smiles}). Reply as JSON only: {"assistant_message":"...","canvas_action":"none","smiles":null,"mp":"melting point °C or null","bp":"boiling point °C or null"}. Use approximate values with ~ if needed. Include °C unit.`,
          smiles,
          apiKey: geminiApiKey,
          model: aiModel,
        }),
      });
      const data = await resp.json();
      let raw = data?.reply || '';
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      const obj = JSON.parse(raw);
      if (!existingMp && obj?.mp && obj.mp !== 'null') setMeltingPoint(obj.mp + ' (predicted)');
      if (!existingBp && obj?.bp && obj.bp !== 'null') setBoilingPoint(obj.bp + ' (predicted)');
    } catch { /* silent */ }
  };

  const parseApiJsonSafe = async (resp) => {
    try {
      return await resp.json();
    } catch {
      return {};
    }
  };

  const extractJsonFromReply = (text) => {
    let raw = String(text || '').trim();
    if (!raw) return null;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const sanitizeReactionSearchResults = (payload) => {
    const list = Array.isArray(payload?.reactions) ? payload.reactions : [];
    return list
      .map((item, idx) => {
        const reactionSmiles = String(item?.reactionSmiles || '').trim();
        const reactionLooksValid = reactionSmiles.includes('>>');
        const intermediateSteps = Array.isArray(item?.intermediateSteps)
          ? item.intermediateSteps
            .map((step, stepIdx) => {
              const stepReactionSmiles = String(step?.reactionSmiles || '').trim();
              return {
                id: String(step?.id || `${idx}-step-${stepIdx}`),
                title: String(step?.title || `Step ${stepIdx + 1}`),
                reactionSmiles: stepReactionSmiles.includes('>>') ? stepReactionSmiles : '',
                reagents: Array.isArray(step?.reagents) ? step.reagents.filter(Boolean) : [],
                conditions: String(step?.conditions || ''),
              };
            })
            .filter((step) => step.reactionSmiles)
          : [];
        return {
          id: String(item?.id || `rxn-${idx}`),
          name: String(item?.name || `Reaction ${idx + 1}`),
          summary: String(item?.summary || ''),
          reactionSmiles: reactionLooksValid ? reactionSmiles : '',
          reactants: Array.isArray(item?.reactants) ? item.reactants.filter(Boolean) : [],
          products: Array.isArray(item?.products) ? item.products.filter(Boolean) : [],
          reagents: Array.isArray(item?.reagents) ? item.reagents.filter(Boolean) : [],
          conditions: String(item?.conditions || ''),
          intermediateSteps,
        };
      })
      .filter((entry) => entry.name || entry.reactionSmiles);
  };

  const searchReactionsWithGemini = async (query) => {
    const cleaned = String(query || '').trim();
    if (!cleaned || isReactionSearchLoading) return;
    if (!geminiApiKey) {
      promptAiSetupModal();
      setReactionSearchError('Connect Gemini AI first to search reactions.');
      return;
    }

    setIsReactionSearchLoading(true);
    setReactionLoadingStepIdx(0);
    setReactionSearchError('');
    const progressTimer = setInterval(() => {
      setReactionLoadingStepIdx((prev) => Math.min(prev + 1, REACTION_LOADING_STEPS.length - 1));
    }, 1200);
    try {
      const prompt = `You are helping a chemist search for reactions.
Return ONLY JSON in this exact shape:
{
  "reactions": [
    {
      "id": "short-id",
      "name": "reaction name",
      "summary": "one sentence practical summary",
      "reactionSmiles": "reactant1.reactant2>>product1.product2",
      "reactants": ["SMILES", "SMILES"],
      "products": ["SMILES", "SMILES"],
      "reagents": ["reagent name", "catalyst name", "solvent"],
      "conditions": "temperature / time / atmosphere",
      "intermediateSteps": [
        {
          "title": "step title",
          "reactionSmiles": "reactant>>intermediate",
          "reagents": ["reagent name"],
          "conditions": "step condition"
        }
      ]
    }
  ]
}
Provide 4 relevant reactions for this query: "${cleaned}".
Rules:
- reactionSmiles must be valid reaction SMILES with ">>".
- Keep reagent/condition text concise and practical.
- Prefer real named organic reactions when possible.
- If intermediate steps are useful, include them in intermediateSteps.
- If intermediates are not needed, keep intermediateSteps as [].
- Intermediate-step mode requested by user: ${includeReactionIntermediates ? 'YES - provide steps when meaningful.' : 'NO - keep intermediateSteps empty.'}
- No markdown, no explanation, only JSON.`;

      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          smiles: lastSmilesForAIRef.current || null,
          molfile: lastMolfileForAIRef.current || null,
          apiKey: geminiApiKey,
          model: aiModel,
        }),
      });

      const data = await parseApiJsonSafe(resp);
      if (!resp.ok) {
        setReactionSearchError(formatAiErrorMessage(resp.status, data, 'chat'));
        return;
      }

      const parsed = extractJsonFromReply(data?.reply);
      const cleanedReactions = sanitizeReactionSearchResults(parsed);
      if (!cleanedReactions.length) {
        setReactionSearchError('No valid reactions were returned. Try a more specific reaction or reagent query.');
      }
      setReactionResults(cleanedReactions);
    } catch (error) {
      console.error('Reaction search error:', error);
      setReactionSearchError('Could not reach Gemini right now. Try again in a moment.');
    } finally {
      clearInterval(progressTimer);
      setIsReactionSearchLoading(false);
    }
  };

  const addReactionToCanvas = (reaction, selectedStep = null) => {
    if (!iframeRef.current || !isKetcherReady) return;
    const source = selectedStep || reaction;
    const reactionSmiles = String(source?.reactionSmiles || '').trim();
    if (!reactionSmiles || !reactionSmiles.includes('>>')) {
      alert('This reaction entry does not include a valid reaction SMILES.');
      return;
    }
    iframeRef.current.contentWindow.postMessage({
      type: 'set-reaction-scene',
      reactionSmiles,
      reactionName: source?.title || source?.name || reaction?.name || '',
      reagents: includeCanvasReagentNames && Array.isArray(source?.reagents) ? source.reagents : [],
      conditions: includeCanvasConditions ? (source?.conditions || '') : '',
      append: appendReactionToCanvas,
    }, '*');
  };

  const addAllIntermediateStepsToCanvas = (reaction) => {
    if (!iframeRef.current || !isKetcherReady || !reaction) return;
    const steps = Array.isArray(reaction?.intermediateSteps) ? reaction.intermediateSteps : [];
    const queue = [
      ...steps,
      {
        title: reaction?.name || 'Final reaction',
        reactionSmiles: reaction?.reactionSmiles || '',
        reagents: reaction?.reagents || [],
        conditions: reaction?.conditions || '',
      },
    ].filter((entry) => String(entry?.reactionSmiles || '').includes('>>'));

    if (!queue.length) {
      alert('No intermediate/final reactions available to add.');
      return;
    }

    queue.forEach((entry, idx) => {
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage({
          type: 'set-reaction-scene',
          reactionSmiles: entry.reactionSmiles,
          reactionName: entry.title || `Step ${idx + 1}`,
          reagents: includeCanvasReagentNames && Array.isArray(entry?.reagents) ? entry.reagents : [],
          conditions: includeCanvasConditions ? (entry?.conditions || '') : '',
          append: true,
        }, '*');
      }, idx * 280);
    });
  };

  const formatAiErrorMessage = (status, payload, context = 'chat') => {
    const code = payload?.code || '';
    const retryAfter = payload?.retryAfterSeconds;
    if (code === 'RATE_LIMITED' || status === 429) {
      const waitHint = Number.isFinite(Number(retryAfter)) ? ` Please wait about ${Math.max(1, Number(retryAfter))} seconds and try again.` : '';
      const modelHint = ' You can switch to Gemini 2.5 Flash in the model selector for better availability.';
      const keyHint = ' If this is the hosted app, your own API key often avoids shared quota throttling.';
      return `Gemini rate limit reached.${waitHint}${modelHint}${keyHint}`;
    }
    if (code === 'INVALID_KEY_OR_ACCESS' || status === 400 || status === 403) {
      return 'API key invalid or access denied. Re-check your Gemini API key and selected model permissions.';
    }
    if (code === 'MISSING_API_KEY') {
      return 'No Gemini API key found. Open AI settings and save your API key.';
    }
    const fallback = payload?.error || `Gemini API error (${status || 'unknown'})`;
    return context === 'spectrum'
      ? `Prediction failed: ${fallback}`
      : `Error: ${fallback}`;
  };

  // Predict spectrum using Gemini (1H, 13C, IR, UV-Vis)
  const sanitizeSpectrumPrediction = (spec, fallbackType) => {
    const resolvedType = spec?.type || fallbackType || '1H';
    const type = resolvedType === 'carbon' ? '13C' : resolvedType;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const multMap = { singlet: 's', doublet: 'd', triplet: 't', quartet: 'q', multiplet: 'm' };
    const allowedMultiplicities = new Set(['s', 'd', 't', 'q', 'm', 'dd', 'quint', 'sext']);

    const normalizePeak = (peak) => {
      const shiftRaw = toNum(peak?.shift);
      const intensityRaw = toNum(peak?.intensity);
      if (shiftRaw == null) return null;

      let shift = shiftRaw;
      let intensity = intensityRaw == null ? 0.6 : intensityRaw;
      if (type === '1H') {
        shift = clamp(shift, -1, 14);
        intensity = clamp(intensity, 0, 1);
        const multKey = String(peak?.multiplicity || 's').toLowerCase();
        const mappedMult = multMap[multKey] || multKey;
        return {
          shift: Number(shift.toFixed(3)),
          intensity: Number(intensity.toFixed(3)),
          label: String(peak?.label || ''),
          multiplicity: allowedMultiplicities.has(mappedMult) ? mappedMult : 's',
          coupling: toNum(peak?.coupling) == null ? null : Number(clamp(toNum(peak?.coupling), 0, 25).toFixed(2)),
          protons: toNum(peak?.protons) == null ? null : Number(clamp(toNum(peak?.protons), 0, 12).toFixed(1)),
        };
      }

      if (type === '13C') {
        shift = clamp(shift, 0, 230);
        intensity = clamp(intensity, 0, 1);
        return {
          shift: Number(shift.toFixed(3)),
          intensity: Number(intensity.toFixed(3)),
          label: String(peak?.label || ''),
          multiplicity: 's',
          protons: 0,
        };
      }

      if (type === 'IR') {
        shift = clamp(shift, 500, 4000);
        intensity = clamp(intensity, 0, 1);
        return {
          shift: Number(shift.toFixed(1)),
          intensity: Number(intensity.toFixed(3)),
          label: String(peak?.label || ''),
        };
      }

      // UV-Vis
      shift = clamp(shift, 190, 800);
      intensity = clamp(intensity, 0, 1);
      return {
        shift: Number(shift.toFixed(1)),
        intensity: Number(intensity.toFixed(3)),
        label: String(peak?.label || ''),
      };
    };

    const peaks = (Array.isArray(spec?.peaks) ? spec.peaks : [])
      .map(normalizePeak)
      .filter(Boolean);

    if (type === 'UV-Vis') peaks.sort((a, b) => a.shift - b.shift);
    else peaks.sort((a, b) => b.shift - a.shift);

    return {
      ...spec,
      type,
      peaks,
      title: spec?.title || `${type} Spectrum`,
      solvent: type === '1H' || type === '13C' ? (spec?.solvent || 'CDCl3') : spec?.solvent,
      frequency: type === '1H' ? (spec?.frequency || '400 MHz') : type === '13C' ? (spec?.frequency || '100 MHz') : spec?.frequency,
    };
  };

  const predictNMR = async (type = 'proton') => {
    const smiles = currentSmiles || lastSmilesForAIRef.current;
    if (!smiles) { alert('No molecule on canvas to predict a spectrum for.'); return; }
    if (!geminiApiKey) { promptAiSetupModal(); return; }

    const typeMap = {
      proton: '1H',
      carbon: '13C',
      ir: 'IR',
      uv: 'UV-Vis',
    };
    setActiveSpectrumType(typeMap[type] || '1H');
    setIsNmrLoading(true);
    setShowNmrModal(true);

    const isCarbon = type === 'carbon';
    const isIR = type === 'ir';
    const isUV = type === 'uv';
    const scientificGuardrails = `Use strict scientific spectroscopy rules and return only physically plausible signals.
- Do not invent impossible peaks.
- Keep shifts/intensities in realistic ranges.
- Prefer conservative assignments when uncertain.`;
    const prompt = isIR
      ? `Predict the IR spectrum of this molecule (SMILES: ${smiles}).
Return ONLY a JSON object:
{"assistant_message":"brief description","canvas_action":"none","smiles":null,"nmr":{"type":"IR","title":"IR Spectrum of <molecule name>","xLabel":"Wavenumber (cm-1)","yLabel":"Transmittance (%)","peaks":[{"shift":1715,"intensity":0.9,"label":"C=O stretch"},{"shift":3400,"intensity":0.7,"label":"O-H stretch"}]}}
Each peak: shift as wavenumber in cm-1 (500-4000), intensity 0-1 where 1 means strong band depth, label with assignment.
Include major functional-group bands only (realistic values), and avoid over-crowding with weak speculative bands.
${scientificGuardrails}`
      : isUV
      ? `Predict the UV-Visible absorption spectrum of this molecule (SMILES: ${smiles}).
Return ONLY a JSON object:
{"assistant_message":"brief description","canvas_action":"none","smiles":null,"nmr":{"type":"UV-Vis","title":"UV-Vis Spectrum of <molecule name>","xLabel":"Wavelength (nm)","yLabel":"Absorbance (a.u.)","peaks":[{"shift":210,"intensity":0.8,"label":"pi-pi*"},{"shift":280,"intensity":0.55,"label":"n-pi*"}]}}
Each peak: shift as wavelength in nm (190-800), intensity 0-1, label transition type.
Include realistic UV-vis bands and approximate intensities, with only chemically justified transitions.
${scientificGuardrails}`
      : isCarbon
      ? `Predict the 13C NMR spectrum of this molecule (SMILES: ${smiles}).
Return ONLY a JSON object:
{"assistant_message":"brief description","canvas_action":"none","smiles":null,"nmr":{"type":"13C","title":"13C NMR of <molecule name>","peaks":[{"shift":128.5,"intensity":0.8,"label":"C-2,C-6 (ArC)","multiplicity":"s","protons":0}],"solvent":"CDCl3","frequency":"100 MHz"}}
Each peak: shift (ppm number, 0-220 range), intensity (relative 0-1), label (assignment), multiplicity ("s" for singlet always in DEPT-less 13C). Include ALL non-equivalent carbons and avoid duplicate-equivalent assignments.
${scientificGuardrails}`
      : `Predict the 1H NMR spectrum of this molecule (SMILES: ${smiles}).
Return ONLY a JSON object:
{"assistant_message":"brief description","canvas_action":"none","smiles":null,"nmr":{"type":"1H","title":"1H NMR of <molecule name>","peaks":[{"shift":7.26,"intensity":1.0,"label":"ArH","multiplicity":"d","coupling":8.0,"protons":2}],"solvent":"CDCl3","frequency":"400 MHz"}}
Each peak: shift (ppm number), intensity (relative 0-1), label (assignment like CH3, ArH, OH), multiplicity (s=singlet, d=doublet, t=triplet, q=quartet, m=multiplet, dd=doublet of doublets), coupling (J in Hz, number or null), protons (number of H).
Include ALL expected peaks with correct splitting patterns and realistic J-coupling constants. Proton counts and multiplicities must be self-consistent.
${scientificGuardrails}`;

    try {
      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, smiles, apiKey: geminiApiKey, model: aiModel }),
      });
      const data = await parseApiJsonSafe(resp);
      if (!resp.ok) {
        throw new Error(formatAiErrorMessage(resp.status, data, 'spectrum'));
      }
      let raw = data?.reply || '';
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      const obj = JSON.parse(raw);
      if (obj?.nmr?.peaks?.length) {
        const inferredType = obj?.nmr?.type || (isIR ? 'IR' : isUV ? 'UV-Vis' : isCarbon ? '13C' : '1H');
        const sanitized = sanitizeSpectrumPrediction(obj.nmr, inferredType);
        if (!sanitized.peaks.length) throw new Error('No valid peaks after sanitization');
        setNmrData(sanitized);
        setActiveSpectrumType(sanitized.type);
      } else {
        setNmrData(null);
        alert('Could not predict spectrum for this molecule.');
      }
    } catch (err) {
      console.error('Spectrum prediction error:', err);
      setNmrData(null);
      alert(err?.message || 'Failed to predict spectrum. Check your API key and try again.');
    } finally {
      setIsNmrLoading(false);
    }
  };

  // Lorentzian line shape: L(x) = (0.5 * w) / ((x - x0)^2 + (0.5 * w)^2)
  const lorentzian = (x, x0, w) => (0.5 * w) / ((x - x0) * (x - x0) + 0.25 * w * w);

  // Generate sub-peaks from splitting pattern
  const splitPeak = (centerPpm, multiplicity, couplingHz, freqMHz) => {
    const J = couplingHz || 7.0;
    const jPpm = J / (freqMHz || 400);
    const mult = (multiplicity || 's').toLowerCase();

    // Pascal's triangle intensities
    const patterns = {
      's': [[0, 1]],
      'd': [[-0.5, 1], [0.5, 1]],
      't': [[-1, 1], [0, 2], [1, 1]],
      'q': [[-1.5, 1], [-0.5, 3], [0.5, 3], [1.5, 1]],
      'quint': [[-2, 1], [-1, 4], [0, 6], [1, 4], [2, 1]],
      'sext': [[-2.5, 1], [-1.5, 5], [-0.5, 10], [0.5, 10], [1.5, 5], [2.5, 1]],
      'dd': [[-0.75, 1], [-0.25, 1], [0.25, 1], [0.75, 1]],
      'm': [[-1.2, 0.6], [-0.7, 0.9], [-0.3, 1], [0, 1], [0.3, 1], [0.7, 0.9], [1.2, 0.6]],
    };

    const pat = patterns[mult] || patterns['s'];
    return pat.map(([offset, relInt]) => ({
      ppm: centerPpm + offset * jPpm,
      relInt,
    }));
  };

  const generateIrOrUvSvg = (spec) => {
    if (!spec?.peaks?.length) return '';
    const isIR = spec.type === 'IR';
    const W = 900;
    const H = 380;
    const PAD_L = 55;
    const PAD_R = 25;
    const PAD_T = 30;
    const PAD_B = 55;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;
    const baseY = PAD_T + plotH;

    const minX = isIR ? 500 : 190;
    const maxX = isIR ? 4000 : 800;
    const range = maxX - minX;

    const xToPx = (x) => {
      if (isIR) {
        // IR convention: high wavenumber on left
        return PAD_L + plotW * (1 - (x - minX) / range);
      }
      return PAD_L + plotW * ((x - minX) / range);
    };

    // Generate smooth curve from peaks
    const nSamples = 1600;
    const yValues = new Array(nSamples).fill(isIR ? 0.94 : 0.02);
    const sigma = isIR ? 32 : 18;
    for (let i = 0; i < nSamples; i += 1) {
      const xVal = isIR
        ? maxX - (i / (nSamples - 1)) * range
        : minX + (i / (nSamples - 1)) * range;
      for (const p of spec.peaks) {
        const center = Number(p.shift) || 0;
        const amp = Math.max(0, Math.min(1, Number(p.intensity) || 0));
        const g = Math.exp(-((xVal - center) ** 2) / (2 * sigma * sigma));
        if (isIR) {
          yValues[i] -= amp * 0.45 * g;
        } else {
          yValues[i] += amp * 0.92 * g;
        }
      }
      yValues[i] = Math.max(0.02, Math.min(0.98, yValues[i]));
    }

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff;font-family:'Inter','Helvetica',sans-serif">`;
    svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111">${spec.title || (isIR ? 'IR Spectrum' : 'UV-Vis Spectrum')}</text>`;
    svg += `<line x1="${PAD_L}" y1="${baseY}" x2="${PAD_L + plotW}" y2="${baseY}" stroke="#000" stroke-width="1.2"/>`;

    const tickStep = isIR ? 500 : 100;
    for (let t = minX; t <= maxX; t += tickStep) {
      const tx = xToPx(t);
      svg += `<line x1="${tx}" y1="${baseY}" x2="${tx}" y2="${baseY + 5}" stroke="#000" stroke-width="1"/>`;
      svg += `<text x="${tx}" y="${baseY + 17}" text-anchor="middle" font-size="10" fill="#333">${t}</text>`;
      svg += `<line x1="${tx}" y1="${PAD_T}" x2="${tx}" y2="${baseY}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    }

    svg += `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#444">${spec.xLabel || (isIR ? 'Wavenumber (cm-1)' : 'Wavelength (nm)')}</text>`;

    let pathD = '';
    for (let i = 0; i < nSamples; i += 1) {
      const x = PAD_L + (i / (nSamples - 1)) * plotW;
      const y = PAD_T + (1 - yValues[i]) * plotH;
      pathD += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
    }
    svg += `<path d="${pathD}" fill="none" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>`;

    // Peak labels
    for (const p of spec.peaks) {
      const center = Number(p.shift) || 0;
      const px = xToPx(center);
      svg += `<text x="${px}" y="${PAD_T + 12}" text-anchor="middle" font-size="8" fill="#444">${center.toFixed(0)}</text>`;
      if (p.label) {
        svg += `<text x="${px}" y="${PAD_T + 22}" text-anchor="middle" font-size="7.5" fill="#666">${String(p.label)}</text>`;
      }
    }

    svg += '</svg>';
    return svg;
  };

  const generateNmrSvg = (nmr) => {
    if (!nmr?.peaks?.length) return '';
    if (nmr.type === 'IR' || nmr.type === 'UV-Vis') {
      return generateIrOrUvSvg(nmr);
    }
    const isCarbon = nmr.type === '13C';
    const W = 900, H = 380, PAD_L = 55, PAD_R = 25, PAD_T = 30, PAD_B = 55;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    const shifts = nmr.peaks.map(p => p.shift);
    const minPpm = isCarbon
      ? Math.max(0, Math.floor(Math.min(...shifts) / 10) * 10 - 10)
      : Math.max(-0.5, Math.floor(Math.min(...shifts)) - 1);
    const maxPpm = isCarbon
      ? Math.ceil(Math.max(...shifts) / 10) * 10 + 10
      : Math.ceil(Math.max(...shifts)) + 1;
    const ppmRange = maxPpm - minPpm || 1;
    const freqMHz = parseInt(nmr.frequency) || (isCarbon ? 100 : 400);
    const lineW = isCarbon ? 0.02 : 0.012;

    const ppmToX = (ppm) => PAD_L + plotW * (1 - (ppm - minPpm) / ppmRange);

    // Build all sub-peaks with Lorentzian profiles
    const allSubPeaks = [];
    const maxIntensity = Math.max(...nmr.peaks.map(p => p.intensity || 1));
    nmr.peaks.forEach(peak => {
      const normI = (peak.intensity || 1) / maxIntensity;
      const subs = isCarbon
        ? [{ ppm: peak.shift, relInt: 1 }]
        : splitPeak(peak.shift, peak.multiplicity, peak.coupling, freqMHz);
      const maxSubInt = Math.max(...subs.map(s => s.relInt));
      subs.forEach(sub => {
        allSubPeaks.push({
          ppm: sub.ppm,
          amplitude: normI * (sub.relInt / maxSubInt),
          label: peak.label,
          parentShift: peak.shift,
        });
      });
    });

    // Sample the composite spectrum as a continuous path
    const nSamples = 2000;
    const yValues = new Array(nSamples).fill(0);
    for (let i = 0; i < nSamples; i++) {
      const ppm = maxPpm - (i / (nSamples - 1)) * ppmRange;
      allSubPeaks.forEach(sp => {
        yValues[i] += sp.amplitude * lorentzian(ppm, sp.ppm, lineW);
      });
    }
    const yMax = Math.max(...yValues) || 1;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="background:#fff;font-family:'Inter','Helvetica',sans-serif">`;

    // Title + disclaimer
    svg += `<text x="${W / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111">${nmr.title || (isCarbon ? '13C' : '1H') + ' NMR Spectrum'}${nmr.frequency ? ' (' + nmr.frequency + ')' : ''}</text>`;

    // Axes
    const baseY = PAD_T + plotH;
    svg += `<line x1="${PAD_L}" y1="${baseY}" x2="${PAD_L + plotW}" y2="${baseY}" stroke="#000" stroke-width="1.2"/>`;

    // X-axis ticks
    const tickStep = isCarbon ? 20 : 1;
    for (let p = Math.ceil(minPpm / tickStep) * tickStep; p <= Math.floor(maxPpm / tickStep) * tickStep; p += tickStep) {
      const x = ppmToX(p);
      svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 5}" stroke="#000" stroke-width="1"/>`;
      svg += `<text x="${x}" y="${baseY + 17}" text-anchor="middle" font-size="10" fill="#333">${p}</text>`;
      if (p !== minPpm) {
        svg += `<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${baseY}" stroke="#f0f0f0" stroke-width="0.5"/>`;
      }
    }
    // Minor ticks for 13C
    if (isCarbon) {
      for (let p = Math.ceil(minPpm / 10) * 10; p <= maxPpm; p += 10) {
        const x = ppmToX(p);
        svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 3}" stroke="#000" stroke-width="0.5"/>`;
      }
    }

    svg += `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#444">δ (ppm)</text>`;

    // Draw continuous spectrum path (black line)
    let pathD = '';
    for (let i = 0; i < nSamples; i++) {
      const x = PAD_L + (i / (nSamples - 1)) * plotW;
      const y = baseY - (yValues[i] / yMax) * (plotH - 18);
      pathD += (i === 0 ? 'M' : 'L') + `${x.toFixed(1)},${y.toFixed(1)}`;
    }
    svg += `<path d="${pathD}" fill="none" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>`;

    // Peak labels above each group
    const labeled = new Set();
    nmr.peaks.forEach(peak => {
      const key = peak.shift.toFixed(1);
      if (labeled.has(key)) return;
      labeled.add(key);
      const cx = ppmToX(peak.shift);
      // Find max y at this peak
      const idx = Math.round((1 - (peak.shift - minPpm) / ppmRange) * (nSamples - 1));
      const clampIdx = Math.max(0, Math.min(nSamples - 1, idx));
      const peakY = baseY - (yValues[clampIdx] / yMax) * (plotH - 18);
      const multLabel = peak.multiplicity ? ` (${peak.multiplicity}${peak.coupling ? ', J=' + peak.coupling + ' Hz' : ''})` : '';
      svg += `<text x="${cx}" y="${Math.max(PAD_T + 10, peakY - 14)}" text-anchor="middle" font-size="8" fill="#333">${(peak.shift).toFixed(2)}</text>`;
      svg += `<text x="${cx}" y="${Math.max(PAD_T + 20, peakY - 4)}" text-anchor="middle" font-size="7.5" fill="#555">${peak.label || ''}${multLabel}</text>`;
    });

    // Solvent label
    if (nmr.solvent) {
      svg += `<text x="${PAD_L + 4}" y="${PAD_T + 12}" font-size="9" fill="#888">${nmr.solvent}</text>`;
    }

    svg += '</svg>';
    return svg;
  };

  const downloadNmrSvg = () => {
    const svg = generateNmrSvg(nmrData);
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nmr_${(nmrData?.title || 'spectrum').replace(/[^a-zA-Z0-9]/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadNmrCsv = () => {
    if (!nmrData?.peaks?.length) return;
    const isC = nmrData.type === '13C';
    const isIR = nmrData.type === 'IR';
    const isUV = nmrData.type === 'UV-Vis';
    const header = isC
      ? 'Shift (ppm),Intensity,Assignment'
      : isIR
      ? 'Wavenumber (cm-1),Band depth (relative),Assignment'
      : isUV
      ? 'Wavelength (nm),Absorbance (relative),Assignment'
      : 'Shift (ppm),Intensity,Multiplicity,J (Hz),Protons,Assignment';
    const rows = nmrData.peaks
      .sort((a, b) => b.shift - a.shift)
      .map(p => isC
        ? `${p.shift.toFixed(2)},${(p.intensity || 0).toFixed(2)},"${p.label || ''}"`
        : isIR || isUV
        ? `${p.shift.toFixed(2)},${(p.intensity || 0).toFixed(2)},"${p.label || ''}"`
        : `${p.shift.toFixed(2)},${(p.intensity || 0).toFixed(2)},${p.multiplicity || 's'},${p.coupling || ''},${p.protons || ''},"${p.label || ''}"`
      );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nmr_${(nmrData?.title || 'data').replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Fetch only IUPAC name from Gemini (supplements PubChem data)
  const fetchIupacFromGemini = async (smiles) => {
    if (!geminiApiKey || !smiles) return;
    try {
      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Give me ONLY the IUPAC name of this SMILES: ${smiles}. Reply as JSON: {"assistant_message":"...","canvas_action":"none","smiles":null,"iupac":"IUPAC name here"}`,
          smiles,
          apiKey: geminiApiKey,
          model: aiModel,
        }),
      });
      const data = await resp.json();
      let raw = data?.reply || '';
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      const obj = JSON.parse(raw);
      if (obj?.iupac) setIupacName(obj.iupac);
    } catch { /* silent */ }
  };

  const fallbackNameFromGemini = async (smiles) => {
    if (!geminiApiKey || !smiles) {
      setMoleculeName('');
      setIupacName('');
      setBoilingPoint(null);
      setMeltingPoint(null);
      return;
    }
    try {
      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Give me the IUPAC name, common name, melting point, and boiling point of this SMILES: ${smiles}. Reply as JSON only: {"assistant_message":"...","canvas_action":"none","smiles":null,"iupac":"IUPAC name","common":"common name or null","mp":"melting point °C or null","bp":"boiling point °C or null"}`,
          smiles,
          apiKey: geminiApiKey,
          model: aiModel,
        }),
      });
      const data = await resp.json();
      let raw = data?.reply || '';
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) raw = fenceMatch[1].trim();
      const obj = JSON.parse(raw);
      const iupac = obj?.iupac || '';
      const common = obj?.common || '';
      setMoleculeName(common || iupac || 'AI-derived name');
      setIupacName(iupac);
      setMeltingPoint(obj?.mp && obj.mp !== 'null' ? obj.mp + ' (predicted)' : null);
      setBoilingPoint(obj?.bp && obj.bp !== 'null' ? obj.bp + ' (predicted)' : null);
    } catch {
      setMoleculeName('');
      setIupacName('');
      setBoilingPoint(null);
      setMeltingPoint(null);
    }
  };

  // Convert SMILES to 3D structure
  const convertSmilesTo3D = async (smiles) => {
    if (!smiles || smiles.trim() === '') {
      return null;
    }

    try {
      setIsConverting(true);

      const encodedSmiles = encodeURIComponent(smiles);
      const apiUrl = `https://cactus.nci.nih.gov/chemical/structure/${encodedSmiles}/file?format=sdf&get3d=true`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error('Failed to convert to 3D structure');
      }

      const sdf3D = await response.text();
      setIsConverting(false);

      return sdf3D;
    } catch (error) {
      console.error('Error converting to 3D:', error);
      setIsConverting(false);
      return null;
    }
  };

  const loadIntoMiew = useCallback(async (sourceText, fileType, smiles) => {
    const viewer = viewerInstanceRef.current;
    if (!viewer || !viewer.__isMiew || typeof viewer.load !== 'function') return false;
    const normalizedSmiles = (smiles || '').trim();
    try {
      if (typeof viewer.reset === 'function') viewer.reset();
      const attempts = [
        () => viewer.load(sourceText, { sourceType: 'immediate', fileType }),
      ];

      // Some Ketcher molfiles can be parsed by Miew only as SDF records.
      if (fileType === 'mol') {
        attempts.push(() => viewer.load(`${sourceText}\n$$$$\n`, { sourceType: 'immediate', fileType: 'sdf' }));
      }

      // Final fallback: let Miew load a canonical 3D SDF from PubChem by SMILES URL.
      if (normalizedSmiles) {
        const encodedSmiles = encodeURIComponent(normalizedSmiles);
        const pubchemSdfUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodedSmiles}/SDF?record_type=3d`;
        attempts.push(() => viewer.load(pubchemSdfUrl, { sourceType: 'url', fileType: 'sdf' }));
      }

      let loaded = false;
      for (const tryLoad of attempts) {
        try {
          await tryLoad();
          loaded = true;
          break;
        } catch {
          // Try next strategy.
        }
      }

      if (!loaded) return false;
      return true;
    } catch (error) {
      console.error(`Failed to load ${fileType} into Miew:`, error);
      return false;
    }
  }, []);

  const applyMiewDisplayMode = useCallback((modeId, viewerArg = null, colorerIdArg = null) => {
    const viewer = viewerArg || viewerInstanceRef.current;
    if (!viewer || !viewer.__isMiew || typeof viewer.rep !== 'function') return;
    const colorerId = colorerIdArg || miewColorer;
    const selectorExpr = showHydrogens ? 'all' : 'not elem H';
    try {
      const count = typeof viewer.repCount === 'function' ? Number(viewer.repCount()) : 0;
      const applyRep = (selectorValue) => {
        if (count > 0) {
          for (let i = 0; i < count; i += 1) {
            viewer.rep(i, { mode: modeId, colorer: colorerId, selector: selectorValue });
          }
        } else if (typeof viewer.repAdd === 'function') {
          viewer.repAdd({ mode: modeId, colorer: colorerId, selector: selectorValue, material: 'SF' });
        }
      };
      if (count > 0) {
        try {
          applyRep(selectorExpr);
        } catch {
          applyRep('all');
        }
      } else if (typeof viewer.repAdd === 'function') {
        try {
          applyRep(selectorExpr);
        } catch {
          applyRep('all');
        }
      }
      if (typeof viewer.rebuildAll === 'function') viewer.rebuildAll();
      else if (typeof viewer.rebuild === 'function') viewer.rebuild();
      else if (typeof viewer.setNeedRender === 'function') viewer.setNeedRender();
      setMiewMode(modeId);
      setMiewColorer(colorerId);
    } catch (error) {
      console.error('Failed to apply Miew mode:', modeId, error);
    }
  }, [miewColorer, showHydrogens]);

  const applyMiewViewerSettings = useCallback((viewerArg = null) => {
    const viewer = viewerArg || viewerInstanceRef.current;
    if (!viewer || !viewer.__isMiew || typeof viewer.set !== 'function') return;
    const bgColor = miewBgDark ? 0x202020 : 0xffffff;
    const fgFog = miewBgDark ? 0x202020 : 0xffffff;
    try {
      viewer.set('resolution', miewResolution);
      viewer.set('autoResolution', miewAutoResolution);
      viewer.set('fog', miewFog);
      viewer.set('axes', miewAxes);
      viewer.set('fps', miewFps);
      viewer.set('palette', miewPalette);
      viewer.set('bg.color', bgColor);
      viewer.set('fogColor', fgFog);
      viewer.set('fxaa', miewFxaa);
      viewer.set('ao', miewAo);
      viewer.set('shadow.on', miewShadow);
      viewer.set('draft.clipPlane', miewClipPlane);
      viewer.set('outline.on', miewOutline);
      if (typeof viewer.setNeedRender === 'function') viewer.setNeedRender();
    } catch (error) {
      console.error('Failed to apply Miew settings:', error);
    }
  }, [
    miewResolution,
    miewAutoResolution,
    miewFog,
    miewAxes,
    miewFps,
    miewPalette,
    miewBgDark,
    miewFxaa,
    miewAo,
    miewShadow,
    miewClipPlane,
    miewOutline,
  ]);

  // Apply render style to molecule (opts.showHydrogens overrides state for alkali/molfile fallback)
  const applyRenderStyle = useCallback((viewer, style, isProteinMode = false, opts = {}) => {
    if (!viewer) return;
    if (viewer.__isMiew) return;

    // Skip style application for proteins (handled separately)
    if (isProteinMode) {
      return;
    }

    const hydrogensVisible = opts.showHydrogens !== undefined ? opts.showHydrogens : showHydrogens;

    const vdwScale = {
      'H': 0.20, 'C': 0.28, 'N': 0.27, 'O': 0.26,
      'S': 0.32, 'P': 0.32, 'F': 0.25, 'Cl': 0.30,
      'Br': 0.34, 'I': 0.36,
      // Alkali / common metals (omitted from vdwScale = invisible after setStyle({}, {}))
      'Li': 0.42, 'Na': 0.48, 'K': 0.52, 'Rb': 0.54, 'Cs': 0.58, 'Fr': 0.58,
      'Mg': 0.40, 'Ca': 0.44, 'Sr': 0.46, 'Ba': 0.50, 'Al': 0.38,
      'Sn': 0.42, 'Pb': 0.44, 'Fe': 0.40, 'Cu': 0.38, 'Zn': 0.38,
      'B': 0.26, 'Si': 0.30, 'Se': 0.32,
    };

    // Clear existing styles
    viewer.setStyle({}, {});

    switch (style) {
      case 'ball-stick':
        // Elegant ball and stick with reflective materials
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !hydrogensVisible;
          viewer.setStyle({ elem: elem }, {
            stick: {
              radius: 0.12,
              colorscheme: 'Jmol',
              hidden: shouldHide
            },
            sphere: {
              scale: vdwScale[elem],
              colorscheme: 'Jmol',
              hidden: shouldHide
            }
          });
        });
        break;

      case 'stick':
        // Thin stick representation
        viewer.setStyle({}, {
          stick: {
            radius: 0.18,
            colorscheme: 'Jmol'
          }
        });
        if (!hydrogensVisible) {
          viewer.setStyle({ elem: 'H' }, { stick: { hidden: true } });
        }
        break;

      case 'sphere':
        // Space-filling spheres
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !hydrogensVisible;
          viewer.setStyle({ elem: elem }, {
            sphere: {
              scale: vdwScale[elem] * 1.8,
              colorscheme: 'Jmol',
              hidden: shouldHide
            }
          });
        });
        break;

      case 'line':
        // Simple line representation
        viewer.setStyle({}, {
          line: {
            linewidth: 2,
            colorscheme: 'Jmol'
          }
        });
        if (!hydrogensVisible) {
          viewer.setStyle({ elem: 'H' }, { line: { hidden: true } });
        }
        break;

      default:
        // Default ball-stick
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !hydrogensVisible;
          viewer.setStyle({ elem: elem }, {
            stick: { radius: 0.12, colorscheme: 'Jmol', hidden: shouldHide },
            sphere: { scale: vdwScale[elem], colorscheme: 'Jmol', hidden: shouldHide }
          });
        });
    }
  }, [showHydrogens]);

  const applyProteinStyle = useCallback((viewer, model, style) => {
    if (!viewer || !model || viewer.__isMiew) return;
    viewer.removeAllSurfaces();
    if (style === 'cartoon') {
      model.setStyle({}, { cartoon: { color: 'spectrum' } });
    } else if (style === 'stick') {
      model.setStyle({}, { stick: { radius: 0.15 } });
    } else if (style === 'sphere') {
      model.setStyle({}, { sphere: { scale: 0.6 } });
    } else if (style === 'surface') {
      model.setStyle({}, { cartoon: { hidden: true } });
      viewer.addSurface($3Dmol.SurfaceType.VDW, {
        opacity: 0.9,
        colorscheme: { prop: 'b', gradient: 'rwb' },
      });
    } else {
      model.setStyle({}, { line: {} });
    }
  }, []);

  const proteinStyleObject = useCallback((style, color) => {
    if (style === 'stick') return { stick: { color: color || '#2C7A7B', radius: 0.16 } };
    if (style === 'sphere') return { sphere: { color: color || '#2C7A7B', scale: 0.58 } };
    if (style === 'line') return { line: { color: color || '#2C7A7B', linewidth: 2 } };
    if (style === 'surface') return { cartoon: { color: color || '#2C7A7B', hidden: true } };
    const cartoonColor = !color || color === 'spectrum' ? 'spectrum' : color;
    return { cartoon: { color: cartoonColor } };
  }, []);

  const applyProteinChainStyles = useCallback((viewer) => {
    if (!viewer || viewer.__isMiew) return;
    const chains = Object.keys(proteinChainData || {});
    if (!chains.length) return;

    viewer.removeAllSurfaces();
    viewer.setStyle({}, {});

    chains.forEach((chain) => {
      const cfg = proteinChainSettings[chain] || {
        style: renderStyle === 'ball-stick' ? 'cartoon' : renderStyle,
        color: 'spectrum',
        hidden: false,
      };
      if (cfg.hidden) {
        viewer.setStyle({ chain }, { cartoon: { hidden: true }, stick: { hidden: true }, sphere: { hidden: true }, line: { hidden: true } });
        return;
      }
      const styleObj = proteinStyleObject(cfg.style, cfg.color);
      viewer.setStyle({ chain }, styleObj);
      if (cfg.style === 'surface') {
        viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.85, color: cfg.color || '#2C7A7B' }, { chain });
      }
    });

    proteinSegmentOverrides.forEach((seg) => {
      const residues = (proteinChainData[seg.chain] || [])
        .filter((r) => r.resi >= Math.min(seg.startResi, seg.endResi) && r.resi <= Math.max(seg.startResi, seg.endResi))
        .map((r) => r.resi);
      if (!residues.length) return;
      if (seg.hidden) {
        viewer.setStyle({ chain: seg.chain, resi: residues }, { cartoon: { hidden: true }, stick: { hidden: true }, sphere: { hidden: true }, line: { hidden: true } });
      } else {
        viewer.setStyle({ chain: seg.chain, resi: residues }, proteinStyleObject(seg.style, seg.color));
      }
    });

    if (proteinSelectedRange?.chain) {
      const residues = (proteinChainData[proteinSelectedRange.chain] || [])
        .filter((r) => r.resi >= Math.min(proteinSelectedRange.startResi, proteinSelectedRange.endResi) && r.resi <= Math.max(proteinSelectedRange.startResi, proteinSelectedRange.endResi))
        .map((r) => r.resi);
      if (residues.length) viewer.addStyle({ chain: proteinSelectedRange.chain, resi: residues }, { stick: { color: '#f59e0b', radius: 0.24 } });
    }

    viewer.render();
  }, [proteinChainData, proteinChainSettings, proteinSegmentOverrides, proteinSelectedRange, proteinStyleObject, renderStyle]);

  const loadProteinIntoViewer = useCallback((pdbText, label = 'Protein') => {
    const viewer = viewerInstanceRef.current;
    if (!viewer || viewer.__isMiew) return false;
    const cleanText = String(pdbText || '').trim();
    if (!cleanText) return false;

    try {
      viewer.clear();
      viewer.removeAllSurfaces();
      const model = viewer.addModel(cleanText, 'pdb');
      proteinModelRef.current = model;
      const parsedChains = parseProteinChains(cleanText);
      setProteinChainData(parsedChains);
      const nextSettings = {};
      Object.keys(parsedChains).forEach((chain) => {
        nextSettings[chain] = { style: 'cartoon', color: 'spectrum', hidden: false };
      });
      setProteinChainSettings(nextSettings);
      setSelectedProteinChain(Object.keys(parsedChains)[0] || '');
      setProteinSelectedRange(null);
      setProteinSegmentOverrides([]);
      setRenderStyle('cartoon');
      applyProteinStyle(viewer, model, 'cartoon');
      viewer.zoomTo();
      viewer.render();

      setViewerMode('protein');
      setIsProtein(true);
      setCurrentMolecule({ data: cleanText, format: 'pdb', has3D: true, smiles: '' });
      setProteinMeta(parseProteinMetadata(cleanText, label));
      setMolecularMass(null);
      setCurrentSmiles('');
      setMultiStructure(false);
      setProteinStatus(`Loaded ${label}.`);
      const parsedMeta = parseProteinMetadata(cleanText, label);
      proteinViewCacheRef.current = {
        pdbText: cleanText,
        proteinMeta: parsedMeta,
        label,
        status: `Loaded ${label}.`,
        proteinChainData: parsedChains,
        proteinChainSettings: nextSettings,
        selectedProteinChain: Object.keys(parsedChains)[0] || '',
      };
      return true;
    } catch (error) {
      console.error('Failed to load protein into viewer:', error);
      setProteinStatus('Failed to render this protein structure.');
      return false;
    }
  }, [applyProteinStyle, parseProteinMetadata, parseProteinChains, setRenderStyle]);

  const restoreMoleculeFromCache = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    const cached = moleculeViewCacheRef.current;
    if (!viewer || viewer.__isMiew || !cached?.currentMolecule?.data) return false;
    try {
      viewer.clear();
      viewer.removeAllSurfaces();
      const model = viewer.addModel(cached.currentMolecule.data, cached.currentMolecule.format || 'sdf');
      lastModelRef.current = model;
      const rsm = cached.currentSmiles || '';
      const alk = smilesContainsAlkaliMetal(rsm);
      const molFb = cached.currentMolecule && !cached.currentMolecule.has3D;
      applyRenderStyle(viewer, renderStyle, false, {
        showHydrogens: showHydrogens || (alk && molFb),
      });
      viewer.zoomTo();
      viewer.render();

      setCurrentMolecule(cached.currentMolecule);
      setMolecularMass(cached.molecularMass ?? null);
      setMoleculeName(cached.moleculeName || '');
      setIupacName(cached.iupacName || '');
      setBoilingPoint(cached.boilingPoint ?? null);
      setMeltingPoint(cached.meltingPoint ?? null);
      setCurrentSmiles(cached.currentSmiles || '');
      setMultiStructure(!!cached.multiStructure);
      if (Number.isInteger(cached.selected3DComponentIdx)) {
        setSelected3DComponentIdx(cached.selected3DComponentIdx);
      }
      return true;
    } catch (error) {
      console.error('Failed to restore molecule from cache:', error);
      return false;
    }
  }, [applyRenderStyle, renderStyle, showHydrogens]);

  const loadProteinByPdbId = useCallback(async () => {
    const pdbId = String(proteinPdbIdInput || '').trim().toUpperCase();
    if (!pdbId) {
      setProteinStatus('Enter a PDB ID first (example: 1CRN).');
      return;
    }
    setProteinStatus('Loading protein from RCSB...');
    try {
      const response = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
      if (!response.ok) throw new Error('Protein not found');
      const pdbText = await response.text();
      if (!String(pdbText || '').trim()) throw new Error('Empty PDB');
      loadProteinIntoViewer(pdbText, `PDB ID ${pdbId}`);
    } catch (error) {
      console.error('Failed to load PDB ID:', error);
      setProteinStatus('Could not load that PDB ID. Please check and try again.');
    }
  }, [proteinPdbIdInput, loadProteinIntoViewer]);

  const DEFAULT_PROTEIN_PDB = '1CRN';

  const loadDefaultProtein = useCallback(async () => {
    setProteinPdbIdInput(DEFAULT_PROTEIN_PDB);
    setProteinStatus('Loading default protein (1CRN)…');
    try {
      const response = await fetch(`https://files.rcsb.org/download/${DEFAULT_PROTEIN_PDB}.pdb`);
      if (!response.ok) throw new Error('Protein not found');
      const pdbText = await response.text();
      if (!String(pdbText || '').trim()) throw new Error('Empty PDB');
      loadProteinIntoViewer(pdbText, `PDB ID ${DEFAULT_PROTEIN_PDB}`);
    } catch (error) {
      console.error('Failed to load default protein:', error);
      setProteinStatus('Could not load default protein. Enter a PDB ID or upload a file.');
    }
  }, [loadProteinIntoViewer]);

  const clearProteinFromViewer = useCallback(() => {
    const viewer = viewerInstanceRef.current;
    if (isProtein && currentMolecule?.format === 'pdb' && currentMolecule?.data) {
      proteinViewCacheRef.current = {
        pdbText: currentMolecule.data,
        proteinMeta,
        status: proteinStatus || '',
      };
    }
    if (viewer && !viewer.__isMiew) {
      viewer.clear();
      viewer.removeAllSurfaces();
      viewer.render();
    }
    proteinModelRef.current = null;
    setProteinMeta(null);
    setProteinStatus('');
    setIsProtein(false);
    setViewerMode('molecule');
    setCurrentMolecule(null);
    clearMoleculeProps();
    setMolecularMass(null);
    if (!restoreMoleculeFromCache()) {
      setProteinStatus('Switched to molecule mode. Draw or search a molecule to view in 3D.');
    }
  }, [isProtein, currentMolecule, proteinMeta, proteinStatus, restoreMoleculeFromCache]);

  // Update 3D viewer with molecule
  const updateMolecule3D = useCallback(async (molfile, smiles) => {
    if (!viewerInstanceRef.current) return;
    
    // Don't update if we're in protein mode (protein should be cleared first)
    if (isProtein) {
      return;
    }

    try {
      const updateSeq = ++moleculeUpdateSeqRef.current;
      const normalizedMolfile = String(molfile || '').trim();
      const normalizedSmiles = String(smiles || '').trim();
      const smilesComponents = getSmilesComponents(normalizedSmiles);
      const hasMultipleComponents = smilesComponents.length > 1;
      const safeComponentIdx = hasMultipleComponents
        ? Math.min(selected3DComponentIdx, smilesComponents.length - 1)
        : 0;
      const renderSmiles = hasMultipleComponents
        ? smilesComponents[safeComponentIdx]
        : normalizedSmiles;
      const structureSignature = `${renderSmiles}||${normalizedMolfile}||${safeComponentIdx}`;
      const forceRefresh = manual3DRefreshRequestedRef.current || force3DRefreshOnDeleteRef.current;
      if (!forceRefresh && structureSignature === lastRenderedSignatureRef.current) {
        return;
      }

      const viewer = viewerInstanceRef.current;
      const isMiew = !!viewer.__isMiew;

      // Get molecule name from PubChem
      if (renderSmiles) {
        getMoleculeName(renderSmiles);
      }

      // 3D source: PubChem first for alkali (keeps Li + H better); else Cactus; else molfile + geometry fix
      const alkaliSmiles = !!(renderSmiles && smilesContainsAlkaliMetal(renderSmiles));
      let structure3D = null;
      if (renderSmiles && alkaliSmiles) {
        structure3D = await convertSmilesTo3DPubChem(renderSmiles);
        if (updateSeq !== moleculeUpdateSeqRef.current) return;
      }
      if (!structure3D && renderSmiles && !alkaliSmiles) {
        structure3D = await convertSmilesTo3D(renderSmiles);
        if (updateSeq !== moleculeUpdateSeqRef.current) return;
      }
      if (!structure3D && renderSmiles && alkaliSmiles) {
        const cactusSdf = await convertSmilesTo3D(renderSmiles);
        if (updateSeq !== moleculeUpdateSeqRef.current) return;
        const hm = getMolfileHeavyAtomCount(normalizedMolfile);
        const hs = cactusSdf ? getMolfileHeavyAtomCount(getSdfFirstRecordBlock(cactusSdf)) : 0;
        if (cactusSdf && hm > 0 && hs >= hm) {
          structure3D = cactusSdf;
        }
      }
      // Ignore stale async result if a newer update started.
      if (updateSeq !== moleculeUpdateSeqRef.current) return;

      let molFor3d = normalizedMolfile;
      if (!structure3D && alkaliSmiles && molFor3d) {
        molFor3d = liftAlkaliInFlatMolfile(molFor3d);
      }

      const usingMolfileFallback = !structure3D && !!String(molFor3d || '').trim();
      const effectiveShowHydrogens = showHydrogens || (alkaliSmiles && usingMolfileFallback);

      // Always prefer 3D structure for accurate bond lengths
      const structureData = structure3D || molFor3d;
      const format = structure3D ? 'sdf' : 'mol';

      if (structureData && String(structureData).trim() !== '') {
        let model = null;
        if (isMiew) {
          const miewFormat = structure3D ? 'sdf' : 'mol';
          const loaded = await loadIntoMiew(structure3D ? structureData : molFor3d, miewFormat, renderSmiles);
          if (updateSeq !== moleculeUpdateSeqRef.current) return;
          if (!loaded) throw new Error('Failed to load molecule in Miew');
          applyMiewViewerSettings(viewer);
          applyMiewDisplayMode(miewMode, viewer, miewColorer);
        } else {
          viewer.removeAllLabels();
          viewer.clear();
          model = viewer.addModel(structureData, format);
          lastModelRef.current = model;
        }

          // Store current molecule for export - prefer 3D structure for accurate bond lengths
          // If we have 3D structure, use it; otherwise use molfile
          setCurrentMolecule({ 
            data: structure3D || molFor3d, 
            format: structure3D ? 'sdf' : 'mol',
            has3D: !!structure3D,
            smiles: renderSmiles
          });

          // Cache molecule
          if (renderSmiles) {
            cacheMolecule(structureData, renderSmiles);
          }
          lastRenderedSignatureRef.current = structureSignature;

          // Apply selected render style (3Dmol only for now)
          applyRenderStyle(viewer, renderStyle, false, { showHydrogens: effectiveShowHydrogens });

          // Center and render
          if (!isMiew) {
            viewer.zoomTo();
            viewer.rotate(25, { x: 1, y: 1, z: 0 });
            viewer.render();
          }

          // Update molecular mass: prefer 3D model atoms, fall back to molfile parsing
          try {
            let mass = null;
            if (model && !isMiew) {
              const atoms = model.selectedAtoms({});
              mass = calculateMolecularMass(atoms, effectiveShowHydrogens);
            }
            if (!mass) mass = calculateMassFromMolfile(structureData);
            setMolecularMass(mass);
          } catch (err) {
            console.error('Error updating molecular mass after 3D update:', err);
            setMolecularMass(calculateMassFromMolfile(structureData));
          }
      } else {
        if (!isMiew) {
          viewer.removeAllLabels();
          viewer.clear();
          viewer.addLabel('Draw a structure → see in 3D', {
            position: { x: 0, y: 0, z: 0 },
            fontSize: 16,
            fontColor: '#999',
            backgroundColor: 'transparent'
          });
          viewer.render();
        } else if (typeof viewer.reset === 'function') {
          viewer.reset();
        }
        lastRenderedSignatureRef.current = structureSignature;
        setCurrentMolecule(null);
        clearMoleculeProps();
        setMolecularMass(null);
      }
    } catch (error) {
      console.error('Error updating 3D molecule:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderStyle, applyRenderStyle, cacheMolecule, loadIntoMiew, applyMiewViewerSettings, applyMiewDisplayMode, miewMode, miewColorer, getSmilesComponents, selected3DComponentIdx]);

  // Re-apply style when it changes
  useEffect(() => {
    if (viewerInstanceRef.current && currentMolecule) {
      if (viewerInstanceRef.current.__isMiew) return;
      if (isProtein) {
        applyProteinChainStyles(viewerInstanceRef.current);
      } else {
        const sm = currentMolecule.smiles || '';
        const alk = smilesContainsAlkaliMetal(sm);
        const molFb = !currentMolecule.has3D;
        applyRenderStyle(viewerInstanceRef.current, renderStyle, false, {
          showHydrogens: showHydrogens || (alk && molFb),
        });
      }
      viewerInstanceRef.current.render();
    }
  }, [renderStyle, showHydrogens, applyRenderStyle, applyProteinChainStyles, currentMolecule, isProtein]);

  useEffect(() => {
    if (isProtein) return;
    if (!currentMolecule || currentMolecule.format === 'pdb') return;
    moleculeViewCacheRef.current = {
      currentMolecule,
      molecularMass,
      moleculeName,
      iupacName,
      boilingPoint,
      meltingPoint,
      currentSmiles,
      multiStructure,
      selected3DComponentIdx,
    };
  }, [
    isProtein,
    currentMolecule,
    molecularMass,
    moleculeName,
    iupacName,
    boilingPoint,
    meltingPoint,
    currentSmiles,
    multiStructure,
    selected3DComponentIdx,
  ]);

  // Keep Miew settings live-synced from UI controls.
  useEffect(() => {
    applyMiewViewerSettings();
    applyMiewDisplayMode(miewMode, null, miewColorer);
  }, [applyMiewViewerSettings, applyMiewDisplayMode, miewMode, miewColorer]);

  // Request molecule update
  const requestMoleculeUpdate = useCallback(() => {
    if (iframeRef.current && isKetcherReady) {
      iframeRef.current.contentWindow.postMessage({ type: 'get-molfile' }, '*');
    }
  }, [isKetcherReady]);

  // Listen for Ketcher messages
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === 'ketcher-ready') {
        setIsKetcherReady(true);
        console.log('Ketcher 3.7.0 is ready');

        // Restore saved canvas from localStorage
        try {
          const saved = localStorage.getItem('moldraw_canvas');
          if (saved && iframeRef.current) {
            const parsed = JSON.parse(saved);
            if (parsed.molfile && parsed.molfile.trim()) {
              setTimeout(() => {
                iframeRef.current.contentWindow.postMessage({ type: 'set-molecule', smiles: parsed.molfile }, '*');
              }, 500);
            }
          }
        } catch {}
      } else if (event.data.type === 'editor-change') {
        const molfile = event.data.molfile;
        const smiles = sanitizeSmilesText(event.data.smiles);
        const normalizedSmiles = (smiles || '').trim();

        if (!normalizedSmiles) {
          setCurrentSmiles('');
          setMultiStructure(false);
          try { localStorage.removeItem('moldraw_canvas'); } catch {}
          if (molfile && getMolfileAtomCount(molfile) === 0) {
            clearMoleculeProps();
          }
        }

        if (normalizedSmiles !== '') {
          lastSmilesForAIRef.current = smiles;
          setCurrentSmiles(smiles);
          setMultiStructure(normalizedSmiles.includes('.'));
        }
        if (molfile) {
          lastMolfileForAIRef.current = molfile;
          lastMoleculeRef.current = getMolfileFingerprint(molfile);
        }

        if (!isProtein && molfile && !isReactionSearchLoading) {
          updateMolecule3D(molfile, smiles);
          manual3DRefreshRequestedRef.current = false;
          force3DRefreshOnDeleteRef.current = false;
        } else if (smiles && smiles.trim() !== '') {
          getMoleculeName(smiles);
        }
      } else if (event.data.type === 'molfile-response') {
        const newMolfile = event.data.molfile;
        const newMolfileFingerprint = getMolfileFingerprint(newMolfile);

        // Keep protein mode isolated from Ketcher polling responses.
        if (viewerMode === 'protein') {
          lastMoleculeRef.current = newMolfileFingerprint;
          return;
        }

        const newAtomCount = getMolfileAtomCount(newMolfile);

        // If atom count dropped, this is likely a deletion and should force 3D sync.
        if (newAtomCount < previousAtomCountRef.current) {
          force3DRefreshOnDeleteRef.current = true;
        }
        previousAtomCountRef.current = newAtomCount;

        // Auto-save canvas to localStorage (remove when empty)
        try {
          const atomCount = getMolfileAtomCount(newMolfile);
          if (atomCount > 0) {
            localStorage.setItem('moldraw_canvas', JSON.stringify({ molfile: newMolfile, ts: Date.now() }));
          } else {
            localStorage.removeItem('moldraw_canvas');
          }
        } catch {}

        if (suppressNext3DUpdateRef.current) {
          suppressNext3DUpdateRef.current = false;
          lastMoleculeRef.current = newMolfileFingerprint;
          return;
        }

        if (newMolfileFingerprint !== lastMoleculeRef.current) {
          lastMoleculeRef.current = newMolfileFingerprint;

          // If protein is currently loaded, clear it and update immediately (no debounce)
          if (isProtein) {
            setIsProtein(false);
            setViewerMode('molecule');
            setProteinMeta(null);
            setCurrentMolecule(null);
            clearMoleculeProps();
            if (viewerInstanceRef.current) {
              viewerInstanceRef.current.clear();
            }
          }

          // Debounce: Clear existing timeout and set new one
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
          }
          
          // Fast but stable sync avoids 3D flicker during drag/edit.
          const debounceTime = (proteinCloseReloadRef.current ? 0 : 90);
          proteinCloseReloadRef.current = false;
          
          debounceTimeoutRef.current = setTimeout(() => {
            if (isReactionSearchLoading) return;
            if (iframeRef.current && isKetcherReady) {
              iframeRef.current.contentWindow.postMessage({ type: 'get-smiles' }, '*');
            }
            window.tempMolfile = newMolfile;
          }, debounceTime);
        }
      } else if (event.data.type === 'smiles-response') {
        const molfile = window.tempMolfile;
        const smiles = sanitizeSmilesText(event.data.smiles);
        const normalizedSmiles = (smiles || '').trim();

        // If canvas is empty, clear related UI state and persisted canvas
        if (!normalizedSmiles) {
          setCurrentSmiles('');
          setMultiStructure(false);
          try { localStorage.removeItem('moldraw_canvas'); } catch {}
          if (molfile && getMolfileAtomCount(molfile) === 0) {
            clearMoleculeProps();
          }
        }

        // Track latest structure for AI assistant and display
        if (normalizedSmiles !== '') {
          lastSmilesForAIRef.current = smiles;
          setCurrentSmiles(smiles);
          // Detect multiple disconnected structures (dot-separated SMILES)
          const hasDot = normalizedSmiles.includes('.');
          setMultiStructure(hasDot);
        }
        if (molfile) {
          lastMolfileForAIRef.current = molfile;
        }

        // Copy SMILES to clipboard if requested
        if (copySmilesRequestedRef.current) {
          copySmilesRequestedRef.current = false;
          if (smiles && smiles.trim() !== '') {
            navigator.clipboard.writeText(smiles).then(() => {
              setSmilesCopied(true);
              setTimeout(() => setSmilesCopied(false), 1500);
            }).catch(() => {
              alert('Failed to copy SMILES to clipboard.');
            });
          }
        }

        // If the user clicked the IUPAC button, always look up properties
        if (iupacRequestedRef.current) {
          iupacRequestedRef.current = false;
          if (smiles && smiles.trim() !== '') {
            getMoleculeName(smiles);
          }
          if (molfile) {
            if (!isProtein) {
              updateMolecule3D(molfile, smiles);
            }
            delete window.tempMolfile;
          }
          return;
        }

        // Normal flow: molfile came from a prior get-molfile request
        if (molfile) {
          if (isReactionSearchLoading) {
            delete window.tempMolfile;
            return;
          }
          if (!isProtein) {
            updateMolecule3D(molfile, smiles);
            manual3DRefreshRequestedRef.current = false;
            force3DRefreshOnDeleteRef.current = false;
          }
          delete window.tempMolfile;
        } else if (smiles && smiles.trim() !== '') {
          getMoleculeName(smiles);
        }
      } else if (event.data.type === 'svg-response') {
        const svg = event.data.svg;
        // Download SVG
        try {
          const finalSvg = composeSvgWithLonePairs(svg);
          const blob = new Blob([finalSvg], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'molecule.svg';
          link.click();
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('Error downloading SVG:', error);
          alert('Failed to download SVG. Please try again.');
        }
      } else if (event.data.type === 'svg-error') {
        console.error('SVG export error:', event.data.error);
        alert('Failed to export SVG: ' + (event.data.error || 'Unknown error'));
      } else if (event.data.type === 'png-response') {
        // PNG data comes as array buffer or data URL
        try {
          const pngData = event.data.pngData;
          const blob = new Blob([pngData], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              drawLonePairsOnCanvas(ctx, canvas.width, canvas.height);
              canvas.toBlob((outBlob) => {
                if (!outBlob) return;
                const outUrl = URL.createObjectURL(outBlob);
                const link = document.createElement('a');
                link.href = outUrl;
                link.download = 'molecule.png';
                link.click();
                URL.revokeObjectURL(outUrl);
              }, 'image/png');
            } finally {
              URL.revokeObjectURL(url);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            alert('Failed to process PNG download.');
          };
          img.src = url;
        } catch (error) {
          console.error('Error downloading PNG:', error);
          alert('Failed to download PNG. Please try again.');
        }
      } else if (event.data.type === 'png-response-jpeg') {
        // Convert PNG to JPEG and download
        try {
          const pngData = event.data.pngData;
          const blob = new Blob([pngData], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          const img = new Image();

          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('Canvas context unavailable');
              // JPG has no alpha channel; prefill white to avoid black background.
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              drawLonePairsOnCanvas(ctx, canvas.width, canvas.height);
              canvas.toBlob((jpegBlob) => {
                if (!jpegBlob) {
                  throw new Error('Failed to create JPEG blob');
                }
                const jpegUrl = URL.createObjectURL(jpegBlob);
                const link = document.createElement('a');
                link.href = jpegUrl;
                link.download = 'molecule.jpg';
                link.click();
                URL.revokeObjectURL(jpegUrl);
              }, 'image/jpeg', 0.95);
            } catch (err) {
              console.error('Error converting PNG to JPEG:', err);
              alert('Failed to convert PNG to JPEG. Please try again.');
            } finally {
              URL.revokeObjectURL(url);
            }
          };

          img.onerror = (err) => {
            console.error('Image load error for JPEG conversion:', err);
            URL.revokeObjectURL(url);
            alert('Failed to process image for JPEG download.');
          };

          img.src = url;
        } catch (error) {
          console.error('Error downloading JPEG:', error);
          alert('Failed to download JPEG. Please try again.');
        }
      } else if (event.data.type === 'png-error') {
        console.error('PNG export error:', event.data.error);
        alert('Failed to export PNG: ' + (event.data.error || 'Unknown error'));
      } else if (event.data.type === 'png-error-jpeg') {
        console.error('PNG (for JPEG) export error:', event.data.error);
        alert('Failed to export JPEG: ' + (event.data.error || 'Unknown error'));
      } else if (event.data.type === 'molecule-set') {
        console.log('Molecule set in Ketcher:', event.data);
        if (event.data.success) {
        } else {
          setSearchError('Failed to load molecule into editor');
        }
      } else if (event.data.type === 'reaction-set') {
        if (event.data.success) {
          if (!event.data.annotationsApplied) {
            console.warn('Reaction loaded, but text annotations were not applied by Ketcher.');
          }
        } else {
          alert('Failed to load reaction into canvas.');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKetcherReady, updateMolecule3D, requestMoleculeUpdate, isProtein, isReactionSearchLoading, viewerMode]);

  // Debounce timeout ref for 3D updates
  const debounceTimeoutRef = useRef(null);

  // Continuous polling removed to avoid 3D refresh loops.

  // Toggle hydrogens
  const toggleHydrogens = () => {
    setShowHydrogens(!showHydrogens);
  };

  const handleRenderStyleChange = useCallback((newStyle) => {
    setRenderStyle(newStyle);
    if (viewerInstanceRef.current?.__isMiew) {
      const styleToMode = {
        'ball-stick': 'BS',
        stick: 'LC',
        sphere: 'VW',
        line: 'LN',
        cartoon: 'CA',
        surface: 'SE',
      };
      const modeId = styleToMode[newStyle] || 'BS';
      applyMiewDisplayMode(modeId, null, miewColorer);
      return;
    }
    const viewer = viewerInstanceRef.current;
    const pModel = proteinModelRef.current;
    if (isProtein && viewer && !viewer.__isMiew && pModel) {
      const mapped = newStyle === 'ball-stick' ? 'cartoon' : newStyle;
      setProteinChainSettings((prev) => {
        const keys = Object.keys(prev || {});
        if (!keys.length) {
          applyProteinStyle(viewer, pModel, mapped);
          viewer.render();
          return prev;
        }
        const next = { ...prev };
        keys.forEach((k) => {
          next[k] = { ...next[k], style: mapped };
        });
        return next;
      });
    }
  }, [applyMiewDisplayMode, miewColorer, isProtein, applyProteinStyle]);

  const onProteinSeqPointerDown = (chainId, resi, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const strip = e.currentTarget.closest('.viewer-protein-seq-strip');
    if (strip && typeof strip.setPointerCapture === 'function') {
      try {
        strip.setPointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }
    }
    proteinSeqDragRef.current = { chainId, startResi: resi, active: true, pointerId: e.pointerId };
    setProteinSelectedRange({ chain: chainId, startResi: resi, endResi: resi });
    setProteinSeqMenu({ open: false, x: 0, y: 0 });
  };

  const applyProteinRangeStyle = (style, color, hidden) => {
    if (!proteinSelectedRange?.chain) return;
    const segment = {
      chain: proteinSelectedRange.chain,
      startResi: Math.min(proteinSelectedRange.startResi, proteinSelectedRange.endResi),
      endResi: Math.max(proteinSelectedRange.startResi, proteinSelectedRange.endResi),
      style,
      color,
      hidden: !!hidden,
    };
    setProteinSegmentOverrides((prev) => {
      const next = prev.filter((x) => !(x.chain === segment.chain && x.startResi === segment.startResi && x.endResi === segment.endResi));
      next.push(segment);
      return next;
    });
  };

  useEffect(() => {
    const onSeqPointerMove = (e) => {
      const drag = proteinSeqDragRef.current;
      if (!drag?.active || e.pointerId !== drag.pointerId) return;
      const top = document.elementFromPoint(e.clientX, e.clientY);
      const cell = top && top.closest && top.closest('.viewer-protein-seq-res');
      if (!cell) return;
      const r = parseInt(cell.getAttribute('data-resi'), 10);
      const ch = cell.getAttribute('data-chain');
      if (ch !== drag.chainId || Number.isNaN(r)) return;
      setProteinSelectedRange({
        chain: drag.chainId,
        startResi: drag.startResi,
        endResi: r,
      });
    };
    const endSeqPointerDrag = (e) => {
      const drag = proteinSeqDragRef.current;
      if (!drag?.active || e.pointerId !== drag.pointerId) return;
      proteinSeqDragRef.current = null;
    };
    window.addEventListener('pointermove', onSeqPointerMove);
    window.addEventListener('pointerup', endSeqPointerDrag);
    window.addEventListener('pointercancel', endSeqPointerDrag);
    return () => {
      window.removeEventListener('pointermove', onSeqPointerMove);
      window.removeEventListener('pointerup', endSeqPointerDrag);
      window.removeEventListener('pointercancel', endSeqPointerDrag);
    };
  }, []);

  useEffect(() => {
    const onDocClick = () => {
      if (proteinSeqMenu.open) setProteinSeqMenu({ open: false, x: 0, y: 0 });
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [proteinSeqMenu.open]);

  const startMoveLonePair = (id, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const marker = lonePairs.find((lp) => lp.id === id);
    if (!marker) return;
    const el = e.currentTarget;
    if (typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }
    }
    lonePairDragRef.current = {
      type: 'move',
      id,
      pointerId: e.pointerId,
      captureEl: el,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: marker.x,
      startY: marker.y,
    };
  };

  const startRotateLonePair = (id, e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const marker = lonePairs.find((lp) => lp.id === id);
    const wrap = ketcherCanvasWrapRef.current;
    if (!marker || !wrap) return;
    const el = e.currentTarget;
    if (typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) { /* ignore */ }
    }
    const rect = wrap.getBoundingClientRect();
    const centerX = rect.left + marker.x;
    const centerY = rect.top + marker.y;
    lonePairDragRef.current = {
      type: 'rotate',
      id,
      pointerId: e.pointerId,
      captureEl: el,
      centerX,
      centerY,
      startRad: Math.atan2(e.clientY - centerY, e.clientX - centerX),
      startAngle: marker.angle,
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      const drag = lonePairDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wrap = ketcherCanvasWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();

      if (drag.type === 'move') {
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        const x = Math.max(10, Math.min(rect.width - 10, drag.startX + dx));
        const y = Math.max(10, Math.min(rect.height - 10, drag.startY + dy));
        setLonePairs((prev) => prev.map((lp) => (lp.id === drag.id ? { ...lp, x, y } : lp)));
      } else if (drag.type === 'rotate') {
        const curRad = Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX);
        const deltaDeg = ((curRad - drag.startRad) * 180) / Math.PI;
        setLonePairs((prev) =>
          prev.map((lp) => (lp.id === drag.id ? { ...lp, angle: drag.startAngle + deltaDeg } : lp))
        );
      }
    };

    const onUp = (e) => {
      const drag = lonePairDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (drag.captureEl && typeof drag.captureEl.releasePointerCapture === 'function') {
        try {
          drag.captureEl.releasePointerCapture(drag.pointerId);
        } catch (_) { /* ignore */ }
      }
      lonePairDragRef.current = null;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const getLonePairExportShapes = (targetW, targetH) => {
    const wrap = ketcherCanvasWrapRef.current;
    if (!wrap || !targetW || !targetH || !lonePairs.length) return [];
    const srcW = wrap.clientWidth || 1;
    const srcH = wrap.clientHeight || 1;
    const sx = targetW / srcW;
    const sy = targetH / srcH;
    return lonePairs.map((lp) => ({
      x: lp.x * sx,
      y: lp.y * sy,
      angle: lp.angle || 0,
      width: (lp.width || 54) * sx,
      height: (lp.height || 30) * sy,
    }));
  };

  const drawLonePairsOnCanvas = (ctx, targetW, targetH) => {
    const shapes = getLonePairExportShapes(targetW, targetH);
    if (!shapes.length) return;
    shapes.forEach((s) => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((s.angle * Math.PI) / 180);
      const dotR = Math.max(1.8, Math.min(s.width, s.height) * 0.1);
      const gap = s.width * 0.2;
      const leftX = -gap;
      const rightX = gap;
      const y = 0;
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(leftX, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rightX, y, dotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const composeSvgWithLonePairs = (svgText) => {
    if (!lonePairs.length) return svgText;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.documentElement;

      const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
      let targetW = parseFloat(svgEl.getAttribute('width'));
      let targetH = parseFloat(svgEl.getAttribute('height'));
      if ((!targetW || !targetH) && vb.length === 4) {
        targetW = vb[2];
        targetH = vb[3];
      }
      if (!targetW || !targetH) return svgText;

      const shapes = getLonePairExportShapes(targetW, targetH);
      if (!shapes.length) return svgText;

      const ns = 'http://www.w3.org/2000/svg';
      const g = doc.createElementNS(ns, 'g');
      g.setAttribute('id', 'lone-pair-overlay');
      shapes.forEach((s) => {
        const pairG = doc.createElementNS(ns, 'g');
        pairG.setAttribute('transform', `translate(${s.x} ${s.y}) rotate(${s.angle})`);
        const dotR = Math.max(1.8, Math.min(s.width, s.height) * 0.1);
        const gap = s.width * 0.2;

        const c1 = doc.createElementNS(ns, 'circle');
        c1.setAttribute('cx', String(-gap));
        c1.setAttribute('cy', '0');
        c1.setAttribute('r', String(dotR));
        c1.setAttribute('fill', '#111827');

        const c2 = doc.createElementNS(ns, 'circle');
        c2.setAttribute('cx', String(gap));
        c2.setAttribute('cy', '0');
        c2.setAttribute('r', String(dotR));
        c2.setAttribute('fill', '#111827');

        pairG.appendChild(c1);
        pairG.appendChild(c2);
        g.appendChild(pairG);
      });

      svgEl.appendChild(g);
      return new XMLSerializer().serializeToString(doc);
    } catch {
      return svgText;
    }
  };

  const runCanvasActionFromAI = (actionObj) => {
    if (!actionObj || !iframeRef.current || !isKetcherReady) return;
    const { canvas_action, smiles } = actionObj;

    if (canvas_action === 'clear') {
      iframeRef.current.contentWindow.postMessage({ type: 'clear-editor' }, '*');
    } else if (canvas_action === 'set_smiles' && smiles && smiles.trim() !== '') {
      iframeRef.current.contentWindow.postMessage({ type: 'set-molecule', smiles: smiles.trim() }, '*');
    } else if (canvas_action === 'append_smiles' && smiles && smiles.trim() !== '') {
      iframeRef.current.contentWindow.postMessage({ type: 'append-molecule', smiles: smiles.trim() }, '*');
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading) return;

    if (!geminiApiKey) {
      promptAiSetupModal();
      setChatMessages((msgs) => [...msgs, { role: 'assistant', text: 'Please enter your Gemini API key above to get started.' }]);
      return;
    }

    const userMsg = { role: 'user', text };
    setChatMessages((msgs) => [...msgs, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      // Build conversation history for context
      const history = chatMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        text: m.text,
      }));

      const resp = await fetch(AI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          smiles: lastSmilesForAIRef.current || null,
          molfile: lastMolfileForAIRef.current || null,
          apiKey: geminiApiKey,
          model: aiModel,
          history,
        }),
      });

      const data = await parseApiJsonSafe(resp);
      if (!resp.ok) {
        const friendly = formatAiErrorMessage(resp.status, data, 'chat');
        setChatMessages((msgs) => [...msgs, { role: 'assistant', text: friendly }]);
        return;
      }
      let replyText = data?.reply
        ? data.reply
        : data?.error
          ? `Error: ${data.error}`
          : 'No response.';

      // Try to parse structured JSON response from Gemini
      let actionObj = null;
      try {
        let raw = replyText;
        const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) raw = fenceMatch[1].trim();
        actionObj = JSON.parse(raw);
        if (!actionObj || typeof actionObj !== 'object') actionObj = null;
      } catch { actionObj = null; }

      if (actionObj && actionObj.assistant_message) {
        runCanvasActionFromAI(actionObj);
        replyText = actionObj.assistant_message;
      }

      setChatMessages((msgs) => [...msgs, { role: 'assistant', text: replyText }]);
    } catch (error) {
      console.error('AI chat error:', error);
      setChatMessages((msgs) => [
        ...msgs,
        { role: 'assistant', text: 'Could not reach the AI service. For local use, run "npm run ai-server". On deployed app, check Vercel function logs.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Export 3D model
  const exportTransparentPng = (sourceCanvas, fileName = 'molecule.png') => {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    if (!w || !h) return;
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const ctx = work.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(sourceCanvas, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const { data } = imageData;
    const p = (x, y) => (y * w + x) * 4;
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ];
    const targets = corners.map(([x, y]) => {
      const i = p(x, y);
      return [data[i], data[i + 1], data[i + 2]];
    });
    const nearColor = (i) => {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      return targets.some(([tr, tg, tb]) =>
        Math.abs(r - tr) <= 28 &&
        Math.abs(g - tg) <= 28 &&
        Math.abs(b - tb) <= 28
      );
    };

    // Remove all background-like pixels globally (including enclosed areas).
    for (let i = 0; i < data.length; i += 4) {
      if (nearColor(i)) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    work.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const exportModel = (format) => {
    if (!viewerInstanceRef.current || !currentMolecule) {
      alert('No molecule to export');
      return;
    }

    const viewer = viewerInstanceRef.current;
    const isMiew = !!viewer.__isMiew;
    let exportData = '';
    let filename = 'molecule';
    let mimeType = 'text/plain';

    switch (format) {
      case 'png': {
        if (isMiew) {
          const canvas = viewer3DRef.current?.querySelector('canvas');
          if (!canvas) {
            alert('3D canvas not ready yet.');
            return;
          }
          const capturePngFromMiew = () => {
            if (exportTransparentBg) {
              exportTransparentPng(canvas, 'molecule.png');
            } else {
              canvas.toBlob((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'molecule.png';
                link.click();
                URL.revokeObjectURL(url);
              }, 'image/png');
            }
            try {
              if (typeof viewer.set === 'function') {
                viewer.set('bg.transparent', false);
                viewer.set('bg.color', miewBgDark ? 0x202020 : 0xffffff);
                if (typeof viewer.setNeedRender === 'function') viewer.setNeedRender();
              }
            } catch {}
          };
          try {
            if (typeof viewer.set === 'function') {
              viewer.set('bg.transparent', exportTransparentBg);
              if (!exportTransparentBg) viewer.set('bg.color', 0xffffff);
              if (typeof viewer.setNeedRender === 'function') viewer.setNeedRender();
            }
          } catch {}
          requestAnimationFrame(() => requestAnimationFrame(capturePngFromMiew));
          return;
        }
        // Export as PNG with transparent background
        const { color: bgColor, alpha: bgAlpha } = viewerBgRef.current;
        viewer.setBackgroundColor(0xffffff, exportTransparentBg ? 0 : 1);
        viewer.render();
        const canvas = viewer.getCanvas();
        if (exportTransparentBg) {
          exportTransparentPng(canvas, 'molecule.png');
          viewer.setBackgroundColor(bgColor, bgAlpha);
          viewer.render();
        } else {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'molecule.png';
            link.click();
            URL.revokeObjectURL(url);
            // Restore original background
            viewer.setBackgroundColor(bgColor, bgAlpha);
            viewer.render();
          }, 'image/png');
        }
        return;
      }

      case 'jpeg': {
        if (isMiew) {
          const canvas = viewer3DRef.current?.querySelector('canvas');
          if (!canvas) {
            alert('3D canvas not ready yet.');
            return;
          }
          const bgCanvas = document.createElement('canvas');
          bgCanvas.width = canvas.width;
          bgCanvas.height = canvas.height;
          const ctx = bgCanvas.getContext('2d');
          if (!ctx) return;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
          ctx.drawImage(canvas, 0, 0);
          bgCanvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'molecule.jpg';
            link.click();
            URL.revokeObjectURL(url);
          }, 'image/jpeg', 0.95);
          return;
        }
        // Export as JPEG with white background
        const { color: bgColor, alpha: bgAlpha } = viewerBgRef.current;
        viewer.setBackgroundColor(0xffffff, 1);
        viewer.render();
        const canvas = viewer.getCanvas();
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = canvas.width;
        bgCanvas.height = canvas.height;
        const ctx = bgCanvas.getContext('2d');
        if (!ctx) {
          viewer.setBackgroundColor(bgColor, bgAlpha);
          viewer.render();
          return;
        }
        // Force compositing on white so transparent pixels never turn black in JPG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        ctx.drawImage(canvas, 0, 0);
        bgCanvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'molecule.jpg';
          link.click();
          URL.revokeObjectURL(url);
          // Restore original background
          viewer.setBackgroundColor(bgColor, bgAlpha);
          viewer.render();
        }, 'image/jpeg', 0.95);
        return;
      }

      case 'pdb':
        exportData = currentMolecule.data;
        filename = isProtein ? 'protein.pdb' : 'molecule.pdb';
        mimeType = 'chemical/x-pdb';
        break;

      case 'sdf':
        exportData = currentMolecule.data;
        filename = 'molecule.sdf';
        mimeType = 'chemical/x-mdl-sdfile';
        break;

      case 'xyz':
        exportData = convertToXYZ(currentMolecule.data);
        filename = 'molecule.xyz';
        mimeType = 'chemical/x-xyz';
        break;

      case 'obj':
        if (isMiew) {
          alert('OBJ export is not wired for Miew yet.');
          return;
        }
        exportData = convertToOBJ(viewer);
        filename = 'molecule.obj';
        mimeType = 'model/obj';
        break;

      case 'x3d':
        if (isMiew) {
          alert('X3D export is not wired for Miew yet.');
          return;
        }
        exportData = convertToX3D(viewer);
        filename = 'molecule.x3d';
        mimeType = 'model/x3d+xml';
        break;

      default:
        exportData = currentMolecule.data;
        filename = 'molecule.mol';
    }

    // Create download link
    const blob = new Blob([exportData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper: Convert to XYZ format
  const convertToXYZ = (sdfData) => {
    const lines = sdfData.split('\n');
    const atoms = [];
    let inAtomBlock = false;

    for (let line of lines) {
      if (line.trim().match(/^\s*\d+\s+\d+/)) {
        inAtomBlock = true;
        continue;
      }
      if (inAtomBlock && line.trim().length > 30) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          atoms.push({
            x: parseFloat(parts[0]),
            y: parseFloat(parts[1]),
            z: parseFloat(parts[2]),
            elem: parts[3]
          });
        }
      }
      if (line.includes('M  END')) break;
    }

    let xyz = `${atoms.length}\nMolecule exported from Ketcher\n`;
    atoms.forEach(atom => {
      xyz += `${atom.elem} ${atom.x} ${atom.y} ${atom.z}\n`;
    });
    return xyz;
  };

  // Helper: Convert to OBJ format with properties and geometry
  const convertToOBJ = (viewer) => {
    const model = viewer.getModel(0);
    if (!model) return '';

    // Get all atoms from the model
    let atoms = model.selectedAtoms({});

    // Filter hydrogens if hidden
    if (!showHydrogens) {
      atoms = atoms.filter(a => a.elem !== 'H');
    }

    const atomMap = new Map();
    atoms.forEach((atom, idx) => {
      atomMap.set(atom.index !== undefined ? atom.index : idx, atom);
    });

    let outputVertices = [];
    let outputNormals = [];
    let outputFaces = [];
    let vertexOffset = 1;

    // Helper to rotate a point by a matrix/quaternion logic
    const rotatePoint = (point, axis, angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const t = 1 - c;
      const x = point.x, y = point.y, z = point.z;
      const u = axis.x, v = axis.y, w = axis.z;

      const newX = (u * u * t + c) * x + (u * v * t - w * s) * y + (u * w * t + v * s) * z;
      const newY = (v * u * t + w * s) * x + (v * v * t + c) * y + (v * w * t - u * s) * z;
      const newZ = (w * u * t - v * s) * x + (w * v * t + u * s) * y + (w * w * t + c) * z;

      return { x: newX, y: newY, z: newZ };
    };

    // 1. Generate Sphere Mesh for Atoms
    const generateSphere = (cx, cy, cz, radius, atomElem) => {
      const latBands = 8;
      const longBands = 8;
      const startV = vertexOffset;

      for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let long = 0; long <= longBands; long++) {
          const phi = long * 2 * Math.PI / longBands;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          const x = cosPhi * sinTheta;
          const y = cosTheta;
          const z = sinPhi * sinTheta;

          outputVertices.push({
            x: cx + radius * x,
            y: cy + radius * y,
            z: cz + radius * z
          });
          outputNormals.push({ x, y, z });
        }
      }

      for (let lat = 0; lat < latBands; lat++) {
        for (let long = 0; long < longBands; long++) {
          const first = (lat * (longBands + 1)) + long + startV;
          const second = first + longBands + 1;
          outputFaces.push([first, second, first + 1]);
          outputFaces.push([second, second + 1, first + 1]);
        }
      }
      vertexOffset += outputVertices.length - (startV - 1);
    };

    // 2. Generate Cylinder Mesh for Bonds
    const generateCylinder = (start, end, radius) => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const height = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const bondVector = { x: dx, y: dy, z: dz };
      const yAxis = { x: 0, y: 1, z: 0 };

      const cross = {
        x: yAxis.y * bondVector.z - yAxis.z * bondVector.y,
        y: yAxis.z * bondVector.x - yAxis.x * bondVector.z,
        z: yAxis.x * bondVector.y - yAxis.y * bondVector.x
      };
      let crossLen = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);

      let angle = 0;
      let axis = { x: 1, y: 0, z: 0 };

      if (crossLen > 0.0001) {
        axis.x = cross.x / crossLen;
        axis.y = cross.y / crossLen;
        axis.z = cross.z / crossLen;
        const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
        angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      } else {
        const dot = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / height;
        if (dot < 0) {
          axis = { x: 1, y: 0, z: 0 };
          angle = Math.PI;
        }
      }

      const radialSegments = 6;
      const startV = vertexOffset;
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const midZ = (start.z + end.z) / 2;

      for (let i = 0; i <= radialSegments; i++) {
        const theta = i * 2 * Math.PI / radialSegments;
        const x = radius * Math.cos(theta);
        const z = radius * Math.sin(theta);
        const vTop = { x: x, y: height / 2, z: z };
        const vBot = { x: x, y: -height / 2, z: z };
        const rTop = rotatePoint(vTop, axis, angle);
        const rBot = rotatePoint(vBot, axis, angle);

        outputVertices.push({ x: rTop.x + midX, y: rTop.y + midY, z: rTop.z + midZ });
        outputVertices.push({ x: rBot.x + midX, y: rBot.y + midY, z: rBot.z + midZ });
      }

      for (let i = 0; i < radialSegments; i++) {
        const base = startV + i * 2;
        const top1 = base;
        const bot1 = base + 1;
        const top2 = base + 2;
        const bot2 = base + 3;

        outputFaces.push([top1, bot1, top2]);
        outputFaces.push([bot1, bot2, top2]);
      }
      vertexOffset += outputVertices.length - (startV - 1);
    };

    // GENERATE GEOMETRY
    atoms.forEach((atom) => {
      const radius = getAtomRadius(atom.elem);
      generateSphere(atom.x, atom.y, atom.z, radius, atom.elem);
    });

    const processedBonds = new Set();
    atoms.forEach((atom1) => {
      if (!atom1.bonds) return;
      atom1.bonds.forEach((neighborIndex, i) => {
        let atom2 = atomMap.get(neighborIndex);
        if (!atom2 && neighborIndex < atoms.length) atom2 = atoms[neighborIndex];
        if (!atom2) return;

        // If hydrogens are hidden, don't draw bonds to/from them
        if (!showHydrogens && (atom1.elem === 'H' || atom2.elem === 'H')) {
          return;
        }

        const idx1 = atom1.index !== undefined ? atom1.index : -1;
        const idx2 = atom2.index !== undefined ? atom2.index : -1;
        if (idx1 >= idx2) return;

        const bondKey = `${idx1}-${idx2}`;
        if (processedBonds.has(bondKey)) return;
        processedBonds.add(bondKey);

        let bondOrder = 1;
        if (atom1.bondOrder && atom1.bondOrder[i]) bondOrder = atom1.bondOrder[i];

        const dx = atom2.x - atom1.x;
        const dy = atom2.y - atom1.y;
        const dz = atom2.z - atom1.z;
        const bondLen = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const u = { x: dx / bondLen, y: dy / bondLen, z: dz / bondLen };
        let perp = { x: 0, y: 0, z: 0 };
        if (Math.abs(u.z) < 0.9) perp = { x: -u.y, y: u.x, z: 0 };
        else perp = { x: 0, y: -u.z, z: u.y };
        const pLen = Math.sqrt(perp.x * perp.x + perp.y * perp.y + perp.z * perp.z);
        perp.x /= pLen; perp.y /= pLen; perp.z /= pLen;

        if (bondOrder === 2) {
          const off = 0.1;
          const s1 = { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off };
          const e1 = { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off };
          const s2 = { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off };
          const e2 = { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off };
          generateCylinder(s1, e1, 0.04);
          generateCylinder(s2, e2, 0.04);
        } else if (bondOrder === 3) {
          const off = 0.12;
          const s1 = { x: atom1.x + perp.x * off, y: atom1.y + perp.y * off, z: atom1.z + perp.z * off };
          const e1 = { x: atom2.x + perp.x * off, y: atom2.y + perp.y * off, z: atom2.z + perp.z * off };
          const s2 = { x: atom1.x - perp.x * off, y: atom1.y - perp.y * off, z: atom1.z - perp.z * off };
          const e2 = { x: atom2.x - perp.x * off, y: atom2.y - perp.y * off, z: atom2.z - perp.z * off };
          generateCylinder(atom1, atom2, 0.04);
          generateCylinder(s1, e1, 0.04);
          generateCylinder(s2, e2, 0.04);
        } else {
          generateCylinder(atom1, atom2, 0.08);
        }
      });
    });

    let obj = '# MolDraw OBJ export\n';
    obj += `# Vertices: ${outputVertices.length}\n`;
    obj += `# Faces: ${outputFaces.length}\n\n`;

    outputVertices.forEach(v => {
      obj += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`;
    });

    obj += '\ng MoleculeMesh\n';
    outputFaces.forEach(f => {
      obj += `f ${f[0]} ${f[1]} ${f[2]}\n`;
    });

    return obj;
  };

  // Helper: Convert to X3D format with atoms and bonds
  const convertToX3D = (viewer) => {
    const model = viewer.getModel(0);
    if (!model) return '';

    // Get all atoms from the model
    // 3Dmol stores atoms in a flat array, we can iterate them
    let atoms = model.selectedAtoms({});

    // Filter hydrogens if hidden
    if (!showHydrogens) {
      atoms = atoms.filter(a => a.elem !== 'H');
    }

    // Create a map for easy lookup by index/serial
    const atomMap = new Map();
    atoms.forEach((atom, idx) => {
      // Use serial or index as key. 3Dmol atoms usually have 'index' property.
      atomMap.set(atom.index !== undefined ? atom.index : idx, atom);
    });

    let x3d = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    x3d += `<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.0//EN" "http://www.web3d.org/specifications/x3d-3.0.dtd">\n`;
    x3d += `<X3D profile="Immersive" version="3.0">\n`;
    x3d += `  <Scene>\n`;
    x3d += `    <!-- Molecular Structure: ${atoms.length} atoms -->\n`;
    x3d += `    <Background skyColor="1 1 1"/>\n`;

    // Add atoms as spheres with Jmol colors
    atoms.forEach((atom, index) => {
      // 3Dmol atoms often have color property (int), convert to RGB string if available, else usage lookup
      let colorStr = getAtomColorRGB(atom.elem);
      if (atom.color) {
        const r = ((atom.color >> 16) & 255) / 255;
        const g = ((atom.color >> 8) & 255) / 255;
        const b = (atom.color & 255) / 255;
        colorStr = `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
      }

      const radius = getAtomRadius(atom.elem);
      x3d += `    <!-- Atom ${index + 1}: ${atom.elem} at (${atom.x.toFixed(3)}, ${atom.y.toFixed(3)}, ${atom.z.toFixed(3)}) -->\n`;
      x3d += `    <Transform translation="${atom.x.toFixed(4)} ${atom.y.toFixed(4)} ${atom.z.toFixed(4)}">\n`;
      x3d += `      <Shape>\n`;
      x3d += `        <Sphere radius="${radius}"/>\n`;
      x3d += `        <Appearance>\n`;
      x3d += `          <Material diffuseColor="${colorStr}" specularColor="0.5 0.5 0.5" shininess="0.3" ambientIntensity="0.3"/>\n`;
      x3d += `        </Appearance>\n`;
      x3d += `      </Shape>\n`;
      x3d += `    </Transform>\n`;
    });

    // Process bonds (cylinders)
    // We iterate over atoms and their connections to avoid duplicates
    // Set to track processed bonds (smaller_index-larger_index)
    const processedBonds = new Set();

    atoms.forEach((atom1) => {
      if (!atom1.bonds) return;

      atom1.bonds.forEach((neighborIndex, i) => {
        // Avoid duplicates: only process if atom1 index < neighbor index
        // If neighborIndex is an actual index into atoms array:
        // Note: 3Dmol 'bonds' usually contains indices of other atoms in the atom list

        // Try to find the neighbor atom
        // In some versions of 3Dmol, bonds contains indices relative to the whole molecule/model list
        // We assume 'atoms' list corresponds to indices if filtered correctly, but better to look up by index property
        let atom2 = atomMap.get(neighborIndex);

        // If direct lookup fails (maybe localized selection), try to find by array index if matches
        if (!atom2 && neighborIndex < atoms.length) {
          atom2 = atoms[neighborIndex];
        }

        if (!atom2) return;

        // Enforce order to avoid double counting
        const idx1 = atom1.index !== undefined ? atom1.index : -1;
        const idx2 = atom2.index !== undefined ? atom2.index : -1;

        // If we have valid indices, use them for unique key. Else use object reference check?? simpler to just use ID behavior
        const id1 = idx1;
        const id2 = idx2;

        if (id1 >= id2) return; // Only process one direction

        const bondKey = `${id1}-${id2}`;
        if (processedBonds.has(bondKey)) return;
        processedBonds.add(bondKey);

        // Get bond order if available
        let bondOrder = 1;
        if (atom1.bondOrder && atom1.bondOrder[i]) {
          bondOrder = atom1.bondOrder[i];
        }

        // Draw Bond
        const dx = atom2.x - atom1.x;
        const dy = atom2.y - atom1.y;
        const dz = atom2.z - atom1.z;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Midpoint
        const midX = (atom1.x + atom2.x) / 2;
        const midY = (atom1.y + atom2.y) / 2;
        const midZ = (atom1.z + atom2.z) / 2;

        // Rotation
        const bondVector = { x: dx, y: dy, z: dz };
        const yAxis = { x: 0, y: 1, z: 0 };
        const rotAxis = {
          x: yAxis.y * bondVector.z - yAxis.z * bondVector.y,
          y: yAxis.z * bondVector.x - yAxis.x * bondVector.z,
          z: yAxis.x * bondVector.y - yAxis.y * bondVector.x
        };
        let rotAxisLen = Math.sqrt(rotAxis.x * rotAxis.x + rotAxis.y * rotAxis.y + rotAxis.z * rotAxis.z);
        let angle = 0;
        let axisStr = "0 1 0";

        if (rotAxisLen > 0.0001) {
          rotAxis.x /= rotAxisLen;
          rotAxis.y /= rotAxisLen;
          rotAxis.z /= rotAxisLen;
          const dotProduct = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / length;
          angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
          axisStr = `${rotAxis.x.toFixed(4)} ${rotAxis.y.toFixed(4)} ${rotAxis.z.toFixed(4)}`;
        } else {
          // Parallel or anti-parallel
          const dotProduct = (yAxis.x * bondVector.x + yAxis.y * bondVector.y + yAxis.z * bondVector.z) / length;
          if (dotProduct < 0) {
            // Antiparallel, rotate 180 deg around X
            axisStr = "1 0 0";
            angle = Math.PI;
          }
        }

        // Render based on bond order
        if (bondOrder === 2) {
          // Double bond: two parallel cylinders
          const offset = 0.1; // Offset from center
          // We need a vector perpendicular to bond vector to offset
          // We can use rotAxis if it's stable, or arbitrary perpendicular

          // Construct a transformation matrix for the bond to calculate offset in world space?
          // Simpler: Just put two cylinders in the local space of the transform (which aligns Y with bond)
          // In local space, bond is along Y. Offset along X is safe.

          x3d += `    <!-- Double Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          x3d += `      <Transform translation="${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `      <Transform translation="-${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `    </Transform>\n`;

        } else if (bondOrder === 3) {
          // Triple bond
          const offset = 0.12;
          x3d += `    <!-- Triple Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          // Center
          x3d += `      <Shape>\n`;
          x3d += `        <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `        <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `      </Shape>\n`;
          // Side 1
          x3d += `      <Transform translation="${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          // Side 2
          x3d += `      <Transform translation="-${offset} 0 0">\n`;
          x3d += `        <Shape>\n`;
          x3d += `          <Cylinder radius="0.04" height="${length.toFixed(4)}"/>\n`;
          x3d += `          <Appearance><Material diffuseColor="0.7 0.7 0.7"/></Appearance>\n`;
          x3d += `        </Shape>\n`;
          x3d += `      </Transform>\n`;
          x3d += `    </Transform>\n`;
        } else {
          // Single bond (default)
          x3d += `    <!-- Bond ${id1}-${id2} -->\n`;
          x3d += `    <Transform translation="${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}" rotation="${axisStr} ${angle.toFixed(4)}">\n`;
          x3d += `      <Shape>\n`;
          x3d += `        <Cylinder radius="0.08" height="${length.toFixed(4)}"/>\n`;
          x3d += `        <Appearance>\n`;
          x3d += `          <Material diffuseColor="0.7 0.7 0.7" specularColor="0.3 0.3 0.3" shininess="0.2"/>\n`;
          x3d += `        </Appearance>\n`;
          x3d += `      </Shape>\n`;
          x3d += `    </Transform>\n`;
        }
      });
    });

    x3d += `  </Scene>\n</X3D>`;
    return x3d;
  };

  // Get atom color in RGB string format
  const getAtomColorRGB = (elem) => {
    const colors = {
      'H': '1.0 1.0 1.0', 'C': '0.6 0.6 0.6', 'N': '0.2 0.2 1.0',
      'O': '1.0 0.05 0.05', 'S': '1.0 1.0 0.2', 'P': '1.0 0.5 0.0',
      'F': '0.7 1.0 1.0', 'Cl': '0.1 1.0 0.1', 'Br': '0.6 0.2 0.2'
    };
    return colors[elem] || '0.5 0.5 0.5';
  };

  // Get atom radius
  const getAtomRadius = (elem) => {
    const radii = {
      'H': 0.20, 'C': 0.28, 'N': 0.27, 'O': 0.26,
      'S': 0.32, 'P': 0.32, 'F': 0.25, 'Cl': 0.30
    };
    return radii[elem] || 0.25;
  };

  const ATOMIC_WEIGHTS = {
    H:1.008, He:4.003, Li:6.941, Be:9.012, B:10.81, C:12.011, N:14.007,
    O:15.999, F:18.998, Ne:20.180, Na:22.990, Mg:24.305, Al:26.982,
    Si:28.086, P:30.974, S:32.06, Cl:35.45, Ar:39.948, K:39.098,
    Ca:40.078, Sc:44.956, Ti:47.867, V:50.942, Cr:51.996, Mn:54.938,
    Fe:55.845, Co:58.933, Ni:58.693, Cu:63.546, Zn:65.38, Ga:69.723,
    Ge:72.63, As:74.922, Se:78.971, Br:79.904, Kr:83.798, Rb:85.468,
    Sr:87.62, Y:88.906, Zr:91.224, Nb:92.906, Mo:95.95, Ru:101.07,
    Rh:102.91, Pd:106.42, Ag:107.87, Cd:112.41, In:114.82, Sn:118.71,
    Sb:121.76, Te:127.60, I:126.90, Xe:131.29, Cs:132.91, Ba:137.33,
    La:138.91, Ce:140.12, Pr:140.91, Nd:144.24, Sm:150.36, Eu:151.96,
    Gd:157.25, Tb:158.93, Dy:162.50, Ho:164.93, Er:167.26, Tm:168.93,
    Yb:173.05, Lu:174.97, Hf:178.49, Ta:180.95, W:183.84, Re:186.21,
    Os:190.23, Ir:192.22, Pt:195.08, Au:196.97, Hg:200.59, Tl:204.38,
    Pb:207.2, Bi:208.98, U:238.03
  };

  const getAtomicWeight = (elem) => ATOMIC_WEIGHTS[elem] || 0;

  const calculateMolecularMass = (atoms, includeHydrogens) => {
    if (!atoms || !atoms.length) return null;
    let total = 0;
    atoms.forEach((atom) => {
      if (!atom || !atom.elem) return;
      if (!includeHydrogens && atom.elem === 'H') return;
      total += getAtomicWeight(atom.elem);
    });
    return total > 0 ? total : null;
  };

  const calculateMassFromMolfile = (molfile) => {
    if (!molfile) return null;
    try {
      const lines = molfile.split('\n');
      let countsIdx = -1;
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (lines[i].trim().match(/^\s*\d+\s+\d+/)) { countsIdx = i; break; }
      }
      if (countsIdx < 0) return null;
      const parts = lines[countsIdx].trim().split(/\s+/);
      const atomCount = parseInt(parts[0]) || 0;
      if (atomCount <= 0) return null;

      let total = 0;
      for (let i = countsIdx + 1; i < countsIdx + 1 + atomCount && i < lines.length; i++) {
        const cols = lines[i].trim().split(/\s+/);
        if (cols.length >= 4) {
          const elem = cols[3];
          const w = ATOMIC_WEIGHTS[elem];
          if (w) total += w;
        }
      }
      return total > 0 ? total : null;
    } catch { return null; }
  };

  // Recalculate molecular mass when hydrogens visibility or molecule changes
  useEffect(() => {
    try {
      let mass = null;
      if (lastModelRef.current) {
        const atoms = lastModelRef.current.selectedAtoms({});
        mass = calculateMolecularMass(atoms, showHydrogens);
      }
      if (!mass && currentMolecule && currentMolecule.data) {
        mass = calculateMassFromMolfile(currentMolecule.data);
      }
      setMolecularMass(mass);
    } catch (error) {
      console.error('Error recalculating molecular mass:', error);
      setMolecularMass(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHydrogens, currentMolecule]);

  useEffect(() => {
    const components = getSmilesComponents(currentSmiles);
    if (!components.length) {
      if (selected3DComponentIdx !== 0) setSelected3DComponentIdx(0);
      lastSmilesSelectionBaseRef.current = '';
      return;
    }
    const normalized = components.join('.');
    if (lastSmilesSelectionBaseRef.current !== normalized) {
      lastSmilesSelectionBaseRef.current = normalized;
      if (selected3DComponentIdx !== 0) setSelected3DComponentIdx(0);
      return;
    }
    if (selected3DComponentIdx >= components.length) {
      setSelected3DComponentIdx(0);
    }
  }, [currentSmiles, getSmilesComponents, selected3DComponentIdx]);

  useEffect(() => {
    if (!multiStructure) return;
    if (!isKetcherReady || !is3DReady || isReactionSearchLoading) return;
    requestMoleculeUpdate();
  }, [selected3DComponentIdx, multiStructure, isKetcherReady, is3DReady, isReactionSearchLoading, requestMoleculeUpdate]);

  const smilesComponentsFor3D = getSmilesComponents(currentSmiles);
  const hasMultipleSmilesComponents = smilesComponentsFor3D.length > 1;
  const proteinChainIds = Object.keys(proteinChainData || {});
  const selectedProteinResidues = selectedProteinChain ? (proteinChainData[selectedProteinChain] || []) : [];
  const showMolDetailsPanel = viewerMode === 'protein'
    ? Boolean(proteinMeta)
    : Boolean(moleculeName || molecularMass || proteinMeta || currentSmiles);

  return (
    <div className="App">
      <main className="split-container">
        {/* Left: Ketcher 2D Editor */}
        <section className="panel ketcher-panel" data-testid="ketcher-panel">
          {/* Brand Header */}
          <header className="brand-header">
            <div className="brand-top-row">
              <div className="brand-name">
                <img src="/logo.svg" alt="MolDraw" className="brand-logo" />
                <span className="brand-by-text">by <a href="https://scidart.com" target="_blank" rel="noopener noreferrer" className="brand-by-link">scidart.com</a></span>
              </div>

              {/* Molecule Search Bar - Now in header */}
              <div className="molecule-search-bar">
                <div className="search-container">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search molecule name (e.g., aspirin, caffeine)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        searchMoleculeByName(searchQuery);
                      }
                    }}
                    disabled={isSearching}
                  />
                  <button
                    className="search-btn"
                    onClick={() => searchMoleculeByName(searchQuery)}
                    disabled={isSearching || !searchQuery.trim()}
                    title="Search molecule by name"
                  >
                    {isSearching ? (
                      <div className="btn-spinner"></div>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                      </svg>
                    )}
                  </button>
                </div>
                {searchError && (
                  <div className="search-error">{searchError}</div>
                )}
              </div>
            </div>

            <nav className="header-links" aria-label="Primary navigation">
              <button
                className={`tb-btn${smilesCopied ? ' tb-copied' : ''}`}
                onClick={() => {
                  if (iframeRef.current && isKetcherReady) {
                    copySmilesRequestedRef.current = true;
                    iframeRef.current.contentWindow.postMessage({ type: 'get-smiles' }, '*');
                  }
                }}
                title="Copy SMILES to clipboard"
              >
                {smilesCopied ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                )}
                {smilesCopied ? 'Copied' : 'Copy SMILES'}
              </button>

              <button
                className="tb-btn"
                onClick={async () => {
                  if (!iframeRef.current || !isKetcherReady) return;
                  try {
                    const text = await navigator.clipboard.readText();
                    const smiles = (text || '').trim();
                    if (smiles) {
                      iframeRef.current.contentWindow.postMessage({ type: 'set-molecule', smiles }, '*');
                    } else {
                      alert('Clipboard is empty. Copy a SMILES string first.');
                    }
                  } catch {
                    const smiles = prompt('Paste or type a SMILES string:');
                    if (smiles && smiles.trim()) {
                      iframeRef.current.contentWindow.postMessage({ type: 'set-molecule', smiles: smiles.trim() }, '*');
                    }
                  }
                }}
                title="Paste SMILES from clipboard into editor"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                Paste SMILES
              </button>
              <div className="tb-sep" />
              <button
                className={`tb-btn ${showReactionsModal ? 'tb-btn-active' : ''}`}
                onClick={() => setShowReactionsModal(true)}
                title="Open reactions browser"
              >
                Reactions
              </button>
              <a
                className="tb-btn"
                href="/tools/index.html"
                target="_blank"
                rel="noopener noreferrer"
                title="Calculators, converters, and chemistry tools"
              >
                Tools
              </a>

              <div className="tb-menu-dropdown" ref={downloadMenuRef}>
                <button
                  type="button"
                  className="tb-btn"
                  disabled={!isKetcherReady}
                  onClick={() => setShowDownloadMenu((v) => !v)}
                  title="Download structure (SVG, PNG, or JPEG)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ marginLeft: 2, opacity: 0.75 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {showDownloadMenu && (
                  <div className="tb-menu-dropdown-list" role="menu" aria-label="Download format">
                    <button
                      type="button"
                      className="tb-menu-item"
                      role="menuitem"
                      onClick={() => {
                        if (iframeRef.current && isKetcherReady) {
                          iframeRef.current.contentWindow.postMessage({ type: 'get-svg' }, '*');
                        }
                        setShowDownloadMenu(false);
                      }}
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      className="tb-menu-item"
                      role="menuitem"
                      onClick={() => {
                        if (iframeRef.current && isKetcherReady) {
                          iframeRef.current.contentWindow.postMessage({ type: 'get-png' }, '*');
                        }
                        setShowDownloadMenu(false);
                      }}
                    >
                      PNG
                    </button>
                    <button
                      type="button"
                      className="tb-menu-item"
                      role="menuitem"
                      onClick={() => {
                        if (iframeRef.current && isKetcherReady) {
                          iframeRef.current.contentWindow.postMessage({ type: 'get-png-jpeg' }, '*');
                        }
                        setShowDownloadMenu(false);
                      }}
                    >
                      JPEG
                    </button>
                  </div>
                )}
              </div>

              <div className="tb-sep" />
              <div className="tb-menu-dropdown" ref={moreMenuRef}>
                <button className="tb-btn" onClick={() => setShowMoreMenu((v) => !v)} title="More options">More</button>
                {showMoreMenu && (
                  <div className="tb-menu-dropdown-list">
                  <a className="tb-menu-item" href="/course/index.html" target="_blank" rel="noopener noreferrer" title="Open Course">Course</a>
                  <a className="tb-menu-item" href="/pages/faq.html" target="_blank" rel="noopener noreferrer" title="Frequently asked questions">FAQ</a>
                  <a className="tb-menu-item" href="/pages/ai-help.html" target="_blank" rel="noopener noreferrer" title="How to use AI assistant">AI Setup</a>
                  <a className="tb-menu-item" href="/blog/index.html" target="_blank" rel="noopener noreferrer" title="Blog">Blog</a>
                  <a className="tb-menu-item" href="/pages/updates.html" target="_blank" rel="noopener noreferrer" title="Updates">Updates</a>
                  </div>
                )}
              </div>
              <a
                className="tb-btn tb-btn-windows-app"
                href="https://hi.switchy.io/sYek"
                target="_blank"
                rel="noopener noreferrer"
                title="Download MolDraw for Windows"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="tb-windows-logo">
                  <path
                    fill="currentColor"
                    d="M3 3h9v9H3V3zm9 0h9v9h-9V3zM3 12h9v9H3v-9zm9 0h9v9h-9v-9z"
                  />
                </svg>
                <span className="tb-btn-windows-text">Windows</span>
              </a>
            </nav>
          </header>


          <div className="ketcher-canvas-wrap" ref={ketcherCanvasWrapRef}>
            <iframe
              ref={iframeRef}
              src="/ketcher-bridge.html"
              title="Ketcher Molecule Editor"
              className="ketcher-iframe"
              data-testid="ketcher-iframe"
            />

            <div className="lp-overlay">
              {lonePairs.map((lp) => (
                <div
                  key={lp.id}
                  className="lp-marker"
                  style={{
                    left: lp.x,
                    top: lp.y,
                    width: lp.width || 54,
                    height: lp.height || 30,
                    transform: `translate(-50%, -50%) rotate(${lp.angle}deg)`,
                  }}
                  onPointerDown={(e) => startMoveLonePair(lp.id, e)}
                  onDoubleClick={() => setLonePairs((prev) => prev.filter((x) => x.id !== lp.id))}
                  title="Drag to move, rotate with handle, double-tap or double-click to delete"
                >
                  <div className="lp-bounds">
                    <span className="lp-dot lp-dot-left" />
                    <span className="lp-dot lp-dot-right" />
                  </div>
                  <button
                    type="button"
                    className="lp-rotate-handle"
                    onPointerDown={(e) => startRotateLonePair(lp.id, e)}
                    title="Rotate lone pair"
                  >
                    R
                  </button>
                  <button
                    type="button"
                    className="lp-delete-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLonePairs((prev) => prev.filter((x) => x.id !== lp.id));
                    }}
                    title="Delete lone pair"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* Right: 3D Viewer */}
        <section
          className={`panel viewer-panel ${!is3DPanelOpen ? 'minimized' : ''}${is3DPanelOpen && viewerMode === 'protein' ? ' viewer-panel--protein-ui' : ''}`}
          data-testid="viewer-panel"
        >
          {/* Toggle Button */}
          <button
            className="panel-toggle-btn"
            onClick={() => setIs3DPanelOpen(!is3DPanelOpen)}
            title={is3DPanelOpen ? "Minimize 3D panel" : "Open 3D panel"}
          >
            {is3DPanelOpen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            )}
          </button>

          {is3DPanelOpen && (
            <>
          <header className="viewer-panel-toolbar viewer-panel-toolbar--compact">
            <div className="viewer-toolbar-top-row">
            <div className="viewer-top-tabs" role="tablist" aria-label="3D viewer mode switch">
              <button
                type="button"
                className={`viewer-top-tab viewer-top-tab--mol ${viewerMode === 'molecule' ? 'active' : ''}`}
                role="tab"
                aria-selected={viewerMode === 'molecule'}
                title="Molecule 3D viewer"
                onClick={() => {
                  if (viewerMode === 'molecule') return;
                  clearProteinFromViewer();
                }}
              >
                Molecule
              </button>
              <button
                type="button"
                className={`viewer-top-tab viewer-top-tab--protein ${viewerMode === 'protein' ? 'active' : ''}`}
                role="tab"
                aria-selected={viewerMode === 'protein'}
                title="Protein viewer mode"
                onClick={() => {
                  if (viewerMode === 'protein') return;
                  if (!isProtein && currentMolecule && currentMolecule.format !== 'pdb') {
                    moleculeViewCacheRef.current = {
                      currentMolecule,
                      molecularMass,
                      moleculeName,
                      iupacName,
                      boilingPoint,
                      meltingPoint,
                      currentSmiles,
                      multiStructure,
                      selected3DComponentIdx,
                    };
                  }
                  setViewerMode('protein');
                  setIsProtein(true);
                  const cachedProtein = proteinViewCacheRef.current;
                  if (cachedProtein?.pdbText) {
                    loadProteinIntoViewer(cachedProtein.pdbText, cachedProtein.label || 'Cached Protein');
                    setProteinMeta(cachedProtein.proteinMeta || null);
                    setProteinStatus(cachedProtein.status || 'Loaded cached protein.');
                    setProteinChainData(cachedProtein.proteinChainData || {});
                    setProteinChainSettings(cachedProtein.proteinChainSettings || {});
                    setSelectedProteinChain(cachedProtein.selectedProteinChain || '');
                    return;
                  }
                  void loadDefaultProtein();
                }}
              >
                Protein
              </button>
            </div>
            <nav className="viewer-toolbar-extras" aria-label="Viewer resources">
              <a
                className="viewer-toolbar-extra"
                href="/course/index.html"
                target="_blank"
                rel="noopener noreferrer"
                title="MolDraw course"
              >
                Course
              </a>
              <a
                className="viewer-toolbar-extra"
                href="/pages/faq.html"
                target="_blank"
                rel="noopener noreferrer"
                title="Frequently asked questions"
              >
                FAQ
              </a>
              <button
                type="button"
                className="viewer-toolbar-extra"
                onClick={() => setShowAiSetupModal(true)}
                title="Gemini API key and AI assistant setup"
              >
                AI
              </button>
              <a
                className="viewer-toolbar-extra"
                href="/blog/index.html"
                target="_blank"
                rel="noopener noreferrer"
                title="MolDraw blog"
              >
                Blog
              </a>
            </nav>
            </div>
            {viewerMode === 'protein' && (
              <div className="viewer-protein-toolbar-row">
                <input
                  className="viewer-protein-input"
                  type="text"
                  value={proteinPdbIdInput}
                  onChange={(e) => setProteinPdbIdInput(e.target.value)}
                  placeholder="PDB ID"
                  title="PDB ID"
                />
                <button className="viewer-protein-btn" type="button" onClick={loadProteinByPdbId} title="Load by PDB ID">
                  Load
                </button>
                <button
                  className="viewer-protein-btn viewer-protein-btn-ghost"
                  type="button"
                  onClick={() => proteinFileInputRef.current?.click()}
                  title="Upload PDB file"
                >
                  Upload
                </button>
                <button
                  className="viewer-protein-btn viewer-protein-btn-ghost"
                  type="button"
                  onClick={() => {
                    setProteinStatus('Protein viewer cleared.');
                    if (viewerInstanceRef.current && !viewerInstanceRef.current.__isMiew) {
                      viewerInstanceRef.current.clear();
                      viewerInstanceRef.current.removeAllSurfaces();
                      viewerInstanceRef.current.render();
                    }
                    proteinModelRef.current = null;
                    setProteinMeta(null);
                    setProteinChainData({});
                    setProteinChainSettings({});
                    setSelectedProteinChain('');
                    setProteinSelectedRange(null);
                    setProteinSegmentOverrides([]);
                    setCurrentMolecule(null);
                  }}
                  title="Clear protein view"
                >
                  Clear
                </button>
                {proteinStatus ? (
                  <span className="viewer-protein-status-inline" title={proteinStatus}>
                    {proteinStatus}
                  </span>
                ) : null}
                <input
                  ref={proteinFileInputRef}
                  type="file"
                  accept=".pdb,.ent,text/plain"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      loadProteinIntoViewer(text, file.name);
                    } catch (error) {
                      console.error('Failed to read protein file:', error);
                      setProteinStatus('Could not read this file. Please upload a valid PDB file.');
                    } finally {
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            )}
            <div className="viewer-3d-style-toolbar-row">
              <span className="viewer-3d-style-label" id="viewer-3d-style-label">3D style</span>
              <select
                className="viewer-top-style-select"
                value={renderStyle}
                onChange={(e) => handleRenderStyleChange(e.target.value)}
                title="3D style"
                aria-labelledby="viewer-3d-style-label"
              >
                {isProtein ? (
                  <>
                    <option value="cartoon">Cartoon</option>
                    <option value="stick">Stick</option>
                    <option value="sphere">Space-Fill</option>
                    <option value="surface">Surface</option>
                    <option value="line">Line</option>
                  </>
                ) : (
                  <>
                    <option value="ball-stick">Ball & Stick</option>
                    <option value="stick">Stick</option>
                    <option value="sphere">Space-Fill</option>
                    <option value="line">Line</option>
                  </>
                )}
              </select>
            </div>
          </header>

          {viewerMode === 'protein' && proteinChainIds.length > 0 && (
            <div className="viewer-protein-seq-bar">
              <div className="viewer-protein-seq-controls">
                <select
                  className="viewer-protein-chain-select"
                  value={selectedProteinChain}
                  onChange={(e) => {
                    setSelectedProteinChain(e.target.value);
                    setProteinSelectedRange(null);
                  }}
                  title="Select chain"
                >
                  {proteinChainIds.map((chainId) => (
                    <option key={chainId} value={chainId}>Ch {chainId}</option>
                  ))}
                </select>
                <select
                  className="viewer-protein-chain-style"
                  value={proteinChainSettings[selectedProteinChain]?.style || 'cartoon'}
                  onChange={(e) => {
                    const value = e.target.value;
                    setProteinChainSettings((prev) => ({
                      ...prev,
                      [selectedProteinChain]: { ...(prev[selectedProteinChain] || {}), style: value }
                    }));
                  }}
                  title="Chain style"
                >
                  <option value="cartoon">Cartoon</option>
                  <option value="stick">Stick</option>
                  <option value="sphere">Sphere</option>
                  <option value="line">Line</option>
                  <option value="surface">Surface</option>
                </select>
                <span className="viewer-protein-chain-color-group">
                  <input
                    className="viewer-protein-chain-color"
                    type="color"
                    value={
                      typeof proteinChainSettings[selectedProteinChain]?.color === 'string'
                      && proteinChainSettings[selectedProteinChain].color.startsWith('#')
                        ? proteinChainSettings[selectedProteinChain].color
                        : '#2c7a7b'
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setProteinChainSettings((prev) => ({
                        ...prev,
                        [selectedProteinChain]: { ...(prev[selectedProteinChain] || {}), color: value }
                      }));
                    }}
                    title="Solid chain color (default view uses rainbow spectrum until you pick a color)"
                  />
                  <button
                    type="button"
                    className="viewer-protein-spectrum-btn"
                    onClick={() => {
                      setProteinChainSettings((prev) => ({
                        ...prev,
                        [selectedProteinChain]: { ...(prev[selectedProteinChain] || {}), color: 'spectrum' }
                      }));
                    }}
                    title="Rainbow (spectrum) coloring"
                  >
                    ⟡
                  </button>
                </span>
                <label className="viewer-protein-chain-hide">
                  <input
                    type="checkbox"
                    checked={!!proteinChainSettings[selectedProteinChain]?.hidden}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setProteinChainSettings((prev) => ({
                        ...prev,
                        [selectedProteinChain]: { ...(prev[selectedProteinChain] || {}), hidden: checked }
                      }));
                    }}
                  />
                  Hide
                </label>
              </div>
              <div
                className="viewer-protein-seq-strip"
                onContextMenu={(e) => {
                  if (!proteinSelectedRange?.chain) return;
                  e.preventDefault();
                  setProteinSeqMenu({ open: true, x: e.clientX, y: e.clientY });
                }}
              >
                {selectedProteinResidues.map((r) => {
                  const active = proteinSelectedRange?.chain === selectedProteinChain
                    && r.resi >= Math.min(proteinSelectedRange.startResi, proteinSelectedRange.endResi)
                    && r.resi <= Math.max(proteinSelectedRange.startResi, proteinSelectedRange.endResi);
                  return (
                    <span
                      key={`${selectedProteinChain}-${r.resi}`}
                      className={`viewer-protein-seq-res ${active ? 'sel' : ''}`}
                      data-resi={r.resi}
                      data-chain={selectedProteinChain}
                      onPointerDown={(e) => onProteinSeqPointerDown(selectedProteinChain, r.resi, e)}
                      title={`${selectedProteinChain}:${r.resi} ${r.resn}`}
                    >
                      {r.aa}
                    </span>
                  );
                })}
              </div>
              {proteinSeqMenu.open && (
                <div
                  className="viewer-protein-seq-menu"
                  style={{ left: proteinSeqMenu.x, top: proteinSeqMenu.y }}
                  onPointerLeave={() => setProteinSeqMenu({ open: false, x: 0, y: 0 })}
                >
                  <button type="button" onClick={() => { applyProteinRangeStyle('cartoon', '#f59e0b', false); setProteinSeqMenu({ open: false, x: 0, y: 0 }); }}>Segment Cartoon</button>
                  <button type="button" onClick={() => { applyProteinRangeStyle('stick', '#f59e0b', false); setProteinSeqMenu({ open: false, x: 0, y: 0 }); }}>Segment Stick</button>
                  <button type="button" onClick={() => { applyProteinRangeStyle('sphere', '#f59e0b', false); setProteinSeqMenu({ open: false, x: 0, y: 0 }); }}>Segment Sphere</button>
                  <button type="button" onClick={() => { applyProteinRangeStyle('line', '#f59e0b', false); setProteinSeqMenu({ open: false, x: 0, y: 0 }); }}>Segment Line</button>
                  <button type="button" onClick={() => { applyProteinRangeStyle('line', '#f59e0b', true); setProteinSeqMenu({ open: false, x: 0, y: 0 }); }}>Hide Segment</button>
                </div>
              )}
            </div>
          )}

              <div
                className={`viewer-3d-stack${viewerMode === 'protein' ? ' viewer-3d-stack--protein' : ''}`}
                style={{ position: 'relative', width: '100%', height: '100%' }}
              >
                {showMolDetailsPanel && molDetailsOpen && (
                  <div className={`mol-props-card${isProtein ? ' mol-props-card--protein' : ''}`}>
                    <div className="mol-props-card-header">
                      <span className="mol-props-card-title">{isProtein ? 'Structure details' : 'Molecule details'}</span>
                      <button
                        type="button"
                        className="mol-props-close-btn"
                        onClick={() => setMolDetailsOpen(false)}
                        title="Hide details"
                        aria-label="Hide molecule details"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                    {!isProtein && moleculeName && moleculeName !== 'Not found in PubChem' && (
                      <div className="mol-props-row mol-props-name">{moleculeName}</div>
                    )}
                    {isProtein && proteinMeta?.name && (
                      <div className="mol-props-row mol-props-name">{proteinMeta.name}</div>
                    )}
                    {isProtein && proteinMeta && (
                      <>
                        {proteinMeta.method && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">Method</span>
                            <span className="mol-props-value">{proteinMeta.method}</span>
                          </div>
                        )}
                        {proteinMeta.chains && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">Chains</span>
                            <span className="mol-props-value">{proteinMeta.chains}</span>
                          </div>
                        )}
                        {proteinMeta.resolution && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">Resolution</span>
                            <span className="mol-props-value">{proteinMeta.resolution} &#197;</span>
                          </div>
                        )}
                        {proteinMeta.atomCount && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">Atoms</span>
                            <span className="mol-props-value">{proteinMeta.atomCount.toLocaleString()}</span>
                          </div>
                        )}
                        {proteinMeta.mw && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">MW</span>
                            <span className="mol-props-value">{(proteinMeta.mw / 1000).toFixed(1)} kDa</span>
                          </div>
                        )}
                        {proteinMeta.depositDate && (
                          <div className="mol-props-row">
                            <span className="mol-props-label">Deposited</span>
                            <span className="mol-props-value">{proteinMeta.depositDate}</span>
                          </div>
                        )}
                      </>
                    )}
                    {!isProtein && currentSmiles && (
                      <div className="mol-props-row mol-props-multiline-row">
                        <span className="mol-props-label">IUPAC</span>
                        <span className="mol-props-value mol-props-iupac" title={iupacName || 'IUPAC name unavailable'}>
                          {iupacName || 'IUPAC name unavailable'}
                        </span>
                        <button
                          className={`mol-props-copy-btn${metaIupacCopied ? ' mol-props-copy-btn-copied' : ''}`}
                          onClick={() => {
                            if (!iupacName) return;
                            navigator.clipboard.writeText(iupacName).then(() => {
                              setMetaIupacCopied(true);
                              setTimeout(() => setMetaIupacCopied(false), 1200);
                            }).catch(() => {});
                          }}
                          title="Copy IUPAC name"
                          disabled={!iupacName}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          {metaIupacCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                    {!isProtein && currentSmiles && (
                      <div className="mol-props-row mol-props-multiline-row">
                        <span className="mol-props-label">SMILES</span>
                        <span className="mol-props-value mol-props-smiles" title={currentSmiles}>{currentSmiles}</span>
                        <button
                          className={`mol-props-copy-btn${metaSmilesCopied ? ' mol-props-copy-btn-copied' : ''}`}
                          onClick={() => {
                            navigator.clipboard.writeText(currentSmiles).then(() => {
                              setMetaSmilesCopied(true);
                              setTimeout(() => setMetaSmilesCopied(false), 1200);
                            }).catch(() => {});
                          }}
                          title="Copy SMILES"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          {metaSmilesCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                    {!isProtein && molecularMass && (
                      <div className="mol-props-row">
                        <span className="mol-props-label">Mass</span>
                        <span className="mol-props-value">{molecularMass.toFixed(2)} g/mol</span>
                      </div>
                    )}
                    {!isProtein && (meltingPoint || boilingPoint) && (
                      <>
                        <div className="mol-props-row">
                          <span className="mol-props-label">MP</span>
                          <span className="mol-props-value">{meltingPoint || '—'}</span>
                        </div>
                        <div className="mol-props-row">
                          <span className="mol-props-label">BP</span>
                          <span className="mol-props-value">{boilingPoint || '—'}</span>
                        </div>
                      </>
                    )}
                    {!isProtein && currentSmiles && geminiApiKey && (
                      <>
                        <div className="mol-props-model-row">
                          <span className="mol-props-label">AI model</span>
                          <select
                            className="mol-props-model-select"
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            title="Model for spectrum predictions"
                          >
                            {AI_MODEL_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="mol-props-nmr-row">
                          <button
                            className="mol-props-nmr-btn"
                            onClick={() => predictNMR('proton')}
                            disabled={isNmrLoading}
                            title="Predict 1H NMR spectrum (AI)"
                          >
                            {isNmrLoading ? '...' : '¹H NMR'}
                          </button>
                          <button
                            className="mol-props-nmr-btn mol-props-nmr-btn-c13"
                            onClick={() => predictNMR('carbon')}
                            disabled={isNmrLoading}
                            title="Predict 13C NMR spectrum (AI)"
                          >
                            {isNmrLoading ? '...' : '¹³C NMR'}
                          </button>
                          <button
                            className="mol-props-nmr-btn mol-props-nmr-btn-ir"
                            onClick={() => predictNMR('ir')}
                            disabled={isNmrLoading}
                            title="Predict IR spectrum (AI)"
                          >
                            {isNmrLoading ? '...' : 'IR'}
                          </button>
                          <button
                            className="mol-props-nmr-btn mol-props-nmr-btn-uv"
                            onClick={() => predictNMR('uv')}
                            disabled={isNmrLoading}
                            title="Predict UV-Vis spectrum (AI)"
                          >
                            {isNmrLoading ? '...' : 'UV-Vis'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {showMolDetailsPanel && !molDetailsOpen && (
                  <button
                    type="button"
                    className="mol-props-reopen-btn"
                    onClick={() => setMolDetailsOpen(true)}
                    title={isProtein ? 'Show structure details' : 'Show molecule details'}
                    aria-label={isProtein ? 'Show structure details' : 'Show molecule details'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                      <line x1="9" y1="9" x2="15" y2="9" />
                      <line x1="9" y1="12" x2="15" y2="12" />
                      <line x1="9" y1="15" x2="13" y2="15" />
                    </svg>
                  </button>
                )}

                <div
                  ref={viewer3DRef}
                  className="viewer-3d"
                  data-testid="viewer-3d"
                />

                {/* Multi-structure selector overlay */}
                {hasMultipleSmilesComponents && !isProtein && (
                  <div className="multi-struct-notice">
                    <span>Multiple structures on canvas</span>
                    <select
                      className="multi-struct-select"
                      value={selected3DComponentIdx}
                      onChange={(e) => setSelected3DComponentIdx(parseInt(e.target.value, 10) || 0)}
                      title="Select which structure to render in 3D"
                    >
                      {smilesComponentsFor3D.map((_, idx) => (
                        <option key={`component-${idx}`} value={idx}>
                          Molecule {idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* AI Chat Assistant */}
              <div className="ai-chat-widget">
                {isChatOpen && (
                  <div className="ai-chat-box">
                    <div className="ai-chat-header">
                      <div>
                        <div className="ai-chat-header-title">MolDraw AI</div>
                        <div className="ai-chat-header-sub">
                          {(AI_MODEL_OPTIONS.find((m) => m.value === aiModel)?.label || 'Gemini Flash')} · Draw, name &amp; explore
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <a
                          className="ai-chat-header-close"
                          href="/pages/ai-help.html"
                          target="_blank"
                          rel="noopener noreferrer"
                          title="How to use AI assistant"
                          style={{ fontSize: 12, textDecoration: 'none' }}
                        >
                          ?
                        </a>
                        <button
                          className="ai-chat-header-close"
                          onClick={() => setShowApiKeyInput(v => !v)}
                          title="API key settings"
                          style={{ fontSize: 14 }}
                        >
                          ⚙
                        </button>
                        <button
                          className="ai-chat-header-close"
                          onClick={() => setIsChatOpen(false)}
                          title="Close chat"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {showApiKeyInput && (
                      <div className="ai-key-row">
                        <select
                          className="ai-model-select"
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          title="Choose chat model"
                        >
                          {AI_MODEL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input
                          type="password"
                          className="ai-key-input"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="Paste Gemini API key..."
                          onBlur={() => {
                            try { localStorage.setItem('moldraw_gemini_key', geminiApiKey); } catch {}
                          }}
                        />
                        <button
                          className="ai-key-save"
                          onClick={() => {
                            try { localStorage.setItem('moldraw_gemini_key', geminiApiKey); } catch {}
                            setShowApiKeyInput(false);
                            if (geminiApiKey) {
                              setChatMessages((msgs) => [...msgs, { role: 'assistant', text: 'API key saved. You can now ask me anything!' }]);
                            }
                          }}
                        >
                          {geminiApiKey ? '✓ Save' : 'Save'}
                        </button>
                      </div>
                    )}

                    <div className="ai-chat-messages">
                      {chatMessages.length === 0 && (
                        <div className="ai-chat-message assistant">
                          <span>
                            {geminiApiKey
                              ? 'Try: "draw aspirin", "name this molecule", "show a Fischer esterification", or ask about properties.'
                              : <>Paste your Gemini API key via ⚙ above. <a href="/pages/ai-help.html" target="_blank" rel="noopener noreferrer" style={{ color: '#2C7A7B' }}>How to get a key →</a></>}
                          </span>
                        </div>
                      )}
                      {chatMessages.map((m, idx) => (
                        <div
                          key={idx}
                          className={`ai-chat-message ${m.role === 'user' ? 'user' : 'assistant'}`}
                        >
                          <span>{m.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ai-chat-input-row">
                      <textarea
                        className="ai-chat-input"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                        placeholder="draw caffeine, name this, add ethanol..."
                        rows={1}
                      />
                      <button
                        className="ai-chat-send-btn"
                        onClick={sendChatMessage}
                        disabled={isChatLoading || !chatInput.trim()}
                      >
                        {isChatLoading ? '...' : '→'}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  className="ai-chat-toggle"
                  onClick={() => {
                    setIsChatOpen((open) => {
                      const willOpen = !open;
                      // Close Crisp when opening AI chat
                      if (willOpen && window.$crisp) {
                        try { window.$crisp.push(['do', 'chat:close']); } catch {}
                      }
                      return willOpen;
                    });
                  }}
                  title="AI assistant"
                >
                  AI
                </button>
              </div>

              {/* Floating Controls */}
              <div className="floating-controls">
                {/* Hydrogen Toggle */}
                <button
                  className={`compact-btn ${showHydrogens ? 'active' : ''}`}
                  onClick={toggleHydrogens}
                  title="Toggle hydrogen atoms"
                  data-testid="toggle-hydrogen-btn"
                >
                  <span className="btn-icon">H</span>
                  {showHydrogens ? 'Hide' : 'Show'}
                </button>

                {/* Export Row */}
                {currentMolecule && (
                  <div className="export-row">
                    <button onClick={() => exportModel('png')} className="compact-export-btn" title="PNG (transparent)">PNG</button>
                    <button onClick={() => exportModel('jpeg')} className="compact-export-btn" title="JPEG with white background">JPG</button>
                    <button onClick={() => exportModel('sdf')} className="compact-export-btn" title="SDF format">SDF</button>
                    <button onClick={() => exportModel('xyz')} className="compact-export-btn" title="XYZ format">XYZ</button>
                    {!isMiewEngine && <button onClick={() => exportModel('x3d')} className="compact-export-btn" title="X3D with bonds">X3D</button>}
                    {!isMiewEngine && <button onClick={() => exportModel('obj')} className="compact-export-btn" title="OBJ for Blender">OBJ</button>}
                  </div>
                )}
                {currentMolecule && (
                  <div className="molecule-quick-toggles">
                    <button
                      className={`protein-quick-toggle ${exportTransparentBg ? 'on' : ''}`}
                      onClick={() => setExportTransparentBg((v) => !v)}
                      title="Toggle transparent background for PNG export"
                    >
                      Transparent PNG {exportTransparentBg ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}

                {isMiewEngine && currentMolecule && !isProtein && (
                  <div className="molecule-quick-toggles">
                    <button
                      className={`protein-quick-toggle ${miewFog ? 'on' : ''}`}
                      onClick={() => setMiewFog((v) => !v)}
                      title="Toggle fog in 3D viewer"
                    >
                      Fog {miewFog ? 'ON' : 'OFF'}
                    </button>
                    <button
                      className={`protein-quick-toggle ${miewOutline ? 'on' : ''}`}
                      onClick={() => setMiewOutline((v) => !v)}
                      title="Toggle outline in 3D viewer"
                    >
                      Outline {miewOutline ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}

                {isConverting && (
                  <div className="compact-status">
                    <div className="spinner"></div>
                    <span>Converting...</span>
                  </div>
                )}

                {isNaming && (
                  <div className="compact-status">
                    <div className="spinner"></div>
                    <span>Identifying...</span>
                  </div>
                )}
              </div>
            </>
          )}

          {!is3DReady && is3DPanelOpen && (
            <div className="loading-3d">Loading 3D Viewer...</div>
          )}
        </section>
      </main>

      {/* AI Setup Prompt Modal */}
      {showAiSetupModal && (
        <div className="ai-setup-modal-backdrop" onClick={() => setShowAiSetupModal(false)}>
          <div className="ai-setup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ai-setup-modal-title">Connect AI to use this feature</div>
            <div className="ai-setup-modal-text">
              Paste your Gemini API key in the AI assistant settings (gear icon) to enable chat, naming, and NMR prediction.
            </div>
            <div className="ai-setup-modal-actions">
              <a
                className="ai-setup-modal-link"
                href="/pages/ai-help.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                How to connect AI
              </a>
              <button
                className="ai-setup-modal-btn"
                onClick={() => {
                  setShowAiSetupModal(false);
                  setIsChatOpen(true);
                  setShowApiKeyInput(true);
                }}
              >
                Open AI settings
              </button>
              <button className="ai-setup-modal-close" onClick={() => setShowAiSetupModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showTlcModal && <TlcModal onClose={() => setShowTlcModal(false)} />}
      <ReactionsModal
        open={showReactionsModal}
        onClose={() => setShowReactionsModal(false)}
        onSearch={searchReactionsWithGemini}
        onAddReaction={addReactionToCanvas}
        onAddAllSteps={addAllIntermediateStepsToCanvas}
        isLoading={isReactionSearchLoading}
        loadingSteps={REACTION_LOADING_STEPS}
        activeLoadingStep={reactionLoadingStepIdx}
        error={reactionSearchError}
        reactions={reactionResults}
        includeReactionIntermediates={includeReactionIntermediates}
        onToggleReactionIntermediates={setIncludeReactionIntermediates}
        includeCanvasReagentNames={includeCanvasReagentNames}
        onToggleCanvasReagentNames={setIncludeCanvasReagentNames}
        includeCanvasConditions={includeCanvasConditions}
        onToggleCanvasConditions={setIncludeCanvasConditions}
        appendReactionToCanvas={appendReactionToCanvas}
        onToggleAppendReactionToCanvas={setAppendReactionToCanvas}
        hasGeminiApiKey={!!geminiApiKey}
        onOpenAiSetup={() => {
          setShowReactionsModal(false);
          promptAiSetupModal();
        }}
      />

      {/* NMR Spectrum Modal */}
      {showNmrModal && (
        <div className="nmr-modal-backdrop" onClick={() => setShowNmrModal(false)}>
          <div className="nmr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="nmr-modal-header">
              <span className="nmr-modal-title">{nmrData?.title || 'NMR Spectrum'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {nmrData && (
                  <>
                    <button className="nmr-modal-dl" onClick={downloadNmrCsv} title="Download peak data as CSV">CSV</button>
                    <button className="nmr-modal-dl" onClick={downloadNmrSvg} title="Download spectrum as SVG">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      SVG
                    </button>
                  </>
                )}
                <button className="nmr-modal-close" onClick={() => setShowNmrModal(false)}>×</button>
              </div>
            </div>
            <div className="nmr-disclaimer">
              AI-predicted spectrum — peak positions/intensities are approximate and depend on model assumptions. Accuracy may vary; verify experimentally.
            </div>
            <div className="nmr-modal-body">
              {isNmrLoading && (
                <div className="spectrum-loading-wrap">
                  <svg className="spectrum-loading-svg" viewBox="0 0 620 220" aria-hidden="true">
                    <line x1="30" y1="180" x2="590" y2="180" stroke="#111827" strokeWidth="1.2" />
                    <path
                      className="spectrum-loading-path"
                      d="M35 180 L70 176 L90 178 L130 172 L165 176 L190 145 L210 176 L240 172 L270 176 L300 110 L330 176 L360 160 L390 176 L420 126 L455 176 L485 170 L520 176 L560 168 L585 176"
                      fill="none"
                      stroke="#111827"
                      strokeWidth="2"
                    />
                  </svg>
                  <div className="nmr-loading">
                    Predicting {activeSpectrumType} spectrum with Gemini...
                  </div>
                </div>
              )}
              {!isNmrLoading && nmrData && (
                <div dangerouslySetInnerHTML={{ __html: generateNmrSvg(nmrData) }} />
              )}
              {!isNmrLoading && !nmrData && (
                <div className="nmr-loading">No NMR data available.</div>
              )}
            </div>
            {nmrData?.peaks && (
              <div className="nmr-peak-table">
                <table>
                  <thead>
                    <tr>
                      <th>{nmrData.type === 'IR' ? 'Wavenumber (cm-1)' : nmrData.type === 'UV-Vis' ? 'Wavelength (nm)' : 'δ (ppm)'}</th>
                      {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <th>Mult.</th>}
                      {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <th>J (Hz)</th>}
                      {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <th>H</th>}
                      <th>Intensity</th>
                      <th>Assignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nmrData.peaks.sort((a, b) => b.shift - a.shift).map((p, i) => (
                      <tr key={i}>
                        <td>{p.shift.toFixed(2)}</td>
                        {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <td>{p.multiplicity || 's'}</td>}
                        {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <td>{p.coupling || '—'}</td>}
                        {nmrData.type !== '13C' && nmrData.type !== 'IR' && nmrData.type !== 'UV-Vis' && <td>{p.protons || '—'}</td>}
                        <td>{(p.intensity || 0).toFixed(2)}</td>
                        <td>{p.label || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;