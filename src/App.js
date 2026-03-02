import React, { useEffect, useRef, useState, useCallback } from 'react';
import './App.css';
import TlcModal from './microapps/tlc/TlcModal';
import CalculatorModal from './microapps/calculator/CalculatorModal';
import Miew from 'miew';
import 'miew/dist/miew.min.css';

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
  const [isProtein, setIsProtein] = useState(false);
  const [proteinMeta, setProteinMeta] = useState(null);
  const [molecularMass, setMolecularMass] = useState(null);
  const [multiStructure, setMultiStructure] = useState(false);
  const fileInputRef = useRef(null);
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
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [showViewerSettings, setShowViewerSettings] = useState(false);
  const [miewSettingsTab, setMiewSettingsTab] = useState('view');
  const [isMiewEngine, setIsMiewEngine] = useState(false);
  const [miewMode, setMiewMode] = useState('BS');
  const [miewColorer, setMiewColorer] = useState('EL');
  const [miewResolution, setMiewResolution] = useState('medium');
  const [miewAutoResolution, setMiewAutoResolution] = useState(false);
  const [miewFog, setMiewFog] = useState(false);
  const [miewAxes, setMiewAxes] = useState(false);
  const [miewFps, setMiewFps] = useState(false);
  const [miewPalette, setMiewPalette] = useState('JM');
  const [miewBgDark, setMiewBgDark] = useState(false);
  const [miewFxaa, setMiewFxaa] = useState(true);
  const [miewAo, setMiewAo] = useState(false);
  const [miewShadow, setMiewShadow] = useState(false);
  const [miewClipPlane, setMiewClipPlane] = useState(false);
  const [miewOutline, setMiewOutline] = useState(true);
  const [exportTransparentBg, setExportTransparentBg] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [lonePairs, setLonePairs] = useState([]);
  const lonePairDragRef = useRef(null);
  const moreMenuRef = useRef(null);
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
  const MIEW_MODE_OPTIONS = [
    { id: 'LN', label: 'Lines' },
    { id: 'LC', label: 'Licorice' },
    { id: 'BS', label: 'Balls' },
    { id: 'VW', label: 'VDW' },
    { id: 'TR', label: 'Trace' },
    { id: 'TU', label: 'Tube' },
    { id: 'CA', label: 'Cartoon' },
    { id: 'QS', label: 'Quick Surf' },
    { id: 'SA', label: 'SAS' },
    { id: 'SE', label: 'SES' },
    { id: 'CS', label: 'Contact Surf' },
    { id: 'TX', label: 'Text' },
  ];
  const MIEW_COLOR_OPTIONS = [
    { id: 'EL', label: 'Element' },
    { id: 'RT', label: 'Residue' },
    { id: 'SQ', label: 'Sequence' },
    { id: 'CH', label: 'Chain' },
    { id: 'SS', label: 'Structure' },
    { id: 'UN', label: 'Uniform' },
    { id: 'CO', label: 'Conditional' },
    { id: 'CF', label: 'Conformation' },
    { id: 'TM', label: 'Temperature' },
    { id: 'OC', label: 'Occupancy' },
    { id: 'HY', label: 'Hydrophobicity' },
    { id: 'MO', label: 'Molecule' },
    { id: 'CB', label: 'Carbon' },
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
      if (!showMoreMenu) return;
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showMoreMenu]);

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
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('moldraw_state', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  }, [renderStyle, showHydrogens, is3DPanelOpen]);

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
        if (viewer3DRef.current && !viewerInstanceRef.current) {
          const viewer = new Miew({
            container: viewer3DRef.current,
            settings: {
              axes: false,
              autoRotation: 0,
            },
          });
          if (viewer.init()) {
            viewer.run();
          }
          // Marker for Miew-specific code paths.
          viewer.__isMiew = true;
          setIsMiewEngine(true);
          viewerBgRef.current = { color: '#ffffff', alpha: 1 };
          viewerInstanceRef.current = viewer;
          setIs3DReady(true);
        }
      } catch (error) {
        console.error('Error initializing Miew viewer:', error);
      }
    };

    initViewer();

    return () => {
      try {
        if (viewerInstanceRef.current && viewerInstanceRef.current.__isMiew && typeof viewerInstanceRef.current.term === 'function') {
          viewerInstanceRef.current.term();
        }
      } catch {}
      viewerInstanceRef.current = null;
    };
  }, []);

  // Search molecule by name and load into Ketcher
  // Check if query is a PDB ID (4 characters, alphanumeric)
  const isPDBID = (query) => {
    const trimmed = query.trim().toUpperCase();
    return /^[A-Z0-9]{4}$/.test(trimmed);
  };

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

  const fetchPDBMetadata = async (pdbId) => {
    try {
      const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`);
      if (!res.ok) return null;
      const data = await res.json();
      const meta = {};
      if (data.struct?.title) meta.title = data.struct.title;
      if (data.rcsb_entry_info?.molecular_weight) meta.mw = data.rcsb_entry_info.molecular_weight;
      if (data.rcsb_entry_info?.deposited_atom_count) meta.atomCount = data.rcsb_entry_info.deposited_atom_count;
      if (data.rcsb_entry_info?.deposited_polymer_entity_instance_count) meta.chains = data.rcsb_entry_info.deposited_polymer_entity_instance_count;
      if (data.rcsb_entry_info?.resolution_combined?.[0]) meta.resolution = data.rcsb_entry_info.resolution_combined[0];
      if (data.rcsb_entry_info?.experimental_method) meta.method = data.rcsb_entry_info.experimental_method;
      if (data.rcsb_accession_info?.deposit_date) meta.depositDate = data.rcsb_accession_info.deposit_date?.split('T')[0];
      if (data.pdbx_vrpt_summary?.pdbresolution) meta.resolution = meta.resolution || data.pdbx_vrpt_summary.pdbresolution;
      meta.pdbId = pdbId;
      return meta;
    } catch { return null; }
  };

  // Fetch PDB structure by ID from RCSB PDB database
  const fetchPDBByID = async (pdbId) => {
    try {
      setIsSearching(true);
      setSearchError('');

      const upperPDBId = pdbId.trim().toUpperCase();
      const pdbUrl = `https://files.rcsb.org/download/${upperPDBId}.pdb`;

      console.log('Fetching PDB:', pdbUrl);

      const response = await fetch(pdbUrl);

      if (response.ok) {
        const pdbText = await response.text();

        if (!viewerInstanceRef.current) {
          alert('3D viewer not ready. Please wait a moment.');
          setIsSearching(false);
          return;
        }

        const viewer = viewerInstanceRef.current;
        const isMiew = !!viewer.__isMiew;
        let model = null;
        if (isMiew) {
          const loaded = await loadIntoMiew(pdbText, 'pdb');
          if (!loaded) throw new Error('Failed to load PDB in Miew');
          applyMiewViewerSettings(viewer);
          applyMiewDisplayMode(miewMode, viewer, miewColorer);
        } else {
          // Clear previous content (labels, models) before loading protein
          viewer.removeAllLabels();
          viewer.clear();
          model = viewer.addModel(pdbText, 'pdb');
          proteinModelRef.current = model;
          lastModelRef.current = model;
          if (model) {
            model.setStyle({}, { cartoon: { color: 'spectrum' } });
          }
        }

        setCurrentMolecule({
          data: pdbText,
          format: 'pdb',
          has3D: true,
          isProtein: true
        });

        setIsProtein(true);
        setRenderStyle('cartoon');
        setMoleculeName(upperPDBId);
        setSearchQuery('');

        // Fetch and set protein metadata from RCSB API
        fetchPDBMetadata(upperPDBId).then(meta => {
          if (meta) {
            setProteinMeta(meta);
            if (meta.title) setMoleculeName(upperPDBId + ' — ' + meta.title);
          }
        });

        // Center and zoom
        if (!isMiew) {
          viewer.zoomTo();
          viewer.rotate(25, { x: 1, y: 1, z: 0 });
          viewer.render();
        }

        // Update molecular mass for the newly imported protein
        if (model && !isMiew) {
          const atoms = model.selectedAtoms({});
          setMolecularMass(calculateMolecularMass(atoms, showHydrogens));
        } else {
          setMolecularMass(null);
        }

        setIsSearching(false);
      } else {
        setSearchError(`PDB ID "${upperPDBId}" not found in RCSB PDB database`);
        setIsSearching(false);
      }
    } catch (error) {
      console.error('Error fetching PDB:', error);
      setSearchError('Failed to fetch PDB structure. Please check the PDB ID and try again.');
      setIsSearching(false);
    }
  };

  // Flag to suppress the next 3D update coming from Ketcher polling
  const suppressNext3DUpdateRef = useRef(false);

  const searchMoleculeByName = async (moleculeName) => {
    if (!moleculeName || moleculeName.trim() === '') {
      setSearchError('Please enter a molecule name or PDB ID');
      return;
    }

    // Check if it's a PDB ID (4 characters, alphanumeric)
    if (isPDBID(moleculeName)) {
      await fetchPDBByID(moleculeName);
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

            // Also add this structure directly to the 3D scene without clearing
            try {
              if (viewerInstanceRef.current) {
                const viewer = viewerInstanceRef.current;
                const structure3D = await convertSmilesTo3D(smiles);
                const structureData = structure3D;
                const format = 'sdf';

                if (structureData) {
                  const lines = structureData.split('\n');
                  const countsLine = lines.find(line => line.trim().match(/^\s*\d+\s+\d+/));
                  if (countsLine) {
                    const parts = countsLine.trim().split(/\s+/);
                    const atomCount = parseInt(parts[0]) || 0;
                    if (atomCount > 0) {
                      const model = viewer.addModel(structureData, format);
                      lastModelRef.current = model;
                      applyRenderStyle(viewer, renderStyle, false);
                      viewer.zoomTo();
                      viewer.rotate(25, { x: 1, y: 1, z: 0 });
                      viewer.render();

                      // Update name and mass for the newly added molecule
                      getMoleculeName(smiles);
                      try {
                        if (model) {
                          const atoms = model.selectedAtoms({});
                          setMolecularMass(calculateMolecularMass(atoms, showHydrogens));
                        } else {
                          setMolecularMass(null);
                        }
                      } catch (err) {
                        console.error('Error updating molecular mass after PubChem add:', err);
                        setMolecularMass(null);
                      }
                    }
                  }
                }
              }
            } catch (err) {
              console.error('Error adding PubChem structure to 3D viewer:', err);
            }
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

  // Apply render style to molecule
  const applyRenderStyle = useCallback((viewer, style, isProteinMode = false) => {
    if (!viewer) return;
    if (viewer.__isMiew) return;

    // Skip style application for proteins (handled separately)
    if (isProteinMode) {
      return;
    }

    const vdwScale = {
      'H': 0.20, 'C': 0.28, 'N': 0.27, 'O': 0.26,
      'S': 0.32, 'P': 0.32, 'F': 0.25, 'Cl': 0.30,
      'Br': 0.34, 'I': 0.36
    };

    // Clear existing styles
    viewer.setStyle({}, {});

    switch (style) {
      case 'ball-stick':
        // Elegant ball and stick with reflective materials
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !showHydrogens;
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
        if (!showHydrogens) {
          viewer.setStyle({ elem: 'H' }, { stick: { hidden: true } });
        }
        break;

      case 'sphere':
        // Space-filling spheres
        Object.keys(vdwScale).forEach(elem => {
          const shouldHide = elem === 'H' && !showHydrogens;
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
        if (!showHydrogens) {
          viewer.setStyle({ elem: 'H' }, { line: { hidden: true } });
        }
        break;

      default:
        // Default ball-stick
        Object.keys(vdwScale).forEach(elem => {
          viewer.setStyle({ elem: elem }, {
            stick: { radius: 0.12, colorscheme: 'Jmol' },
            sphere: { scale: vdwScale[elem], colorscheme: 'Jmol' }
          });
        });
    }
  }, [showHydrogens]);

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
      const structureSignature = `${normalizedSmiles}||${normalizedMolfile}`;
      const forceRefresh = manual3DRefreshRequestedRef.current || force3DRefreshOnDeleteRef.current;
      if (!forceRefresh && structureSignature === lastRenderedSignatureRef.current) {
        return;
      }

      const viewer = viewerInstanceRef.current;
      const isMiew = !!viewer.__isMiew;

      // Get molecule name from PubChem
      if (smiles && smiles.trim() !== '') {
        getMoleculeName(smiles);
      }

      // Get 3D structure
      let structure3D = null;
      if (smiles && smiles.trim() !== '') {
        structure3D = await convertSmilesTo3D(smiles);
      }
      // Ignore stale async result if a newer update started.
      if (updateSeq !== moleculeUpdateSeqRef.current) return;

      // Always prefer 3D structure for accurate bond lengths
      const structureData = structure3D || molfile;
      const format = structure3D ? 'sdf' : 'mol';

      if (structureData && String(structureData).trim() !== '') {
        let model = null;
        if (isMiew) {
          const miewFormat = structure3D ? 'sdf' : 'mol';
          const loaded = await loadIntoMiew(structure3D ? structureData : molfile, miewFormat, smiles);
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
            data: structure3D || molfile, 
            format: structure3D ? 'sdf' : 'mol',
            has3D: !!structure3D 
          });

          // Cache molecule
          if (smiles) {
            cacheMolecule(structureData, smiles);
          }
          lastRenderedSignatureRef.current = structureSignature;

          // Apply selected render style (3Dmol only for now)
          applyRenderStyle(viewer, renderStyle, false);

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
              mass = calculateMolecularMass(atoms, showHydrogens);
            }
            if (!mass) mass = calculateMassFromMolfile(molfile);
            setMolecularMass(mass);
          } catch (err) {
            console.error('Error updating molecular mass after 3D update:', err);
            setMolecularMass(calculateMassFromMolfile(molfile));
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
  }, [renderStyle, applyRenderStyle, cacheMolecule, loadIntoMiew, applyMiewViewerSettings, applyMiewDisplayMode, miewMode, miewColorer]);

  // Re-apply style when it changes
  useEffect(() => {
    if (viewerInstanceRef.current && currentMolecule) {
      if (viewerInstanceRef.current.__isMiew) return;
      if (isProtein) {
        const viewer = viewerInstanceRef.current;
        const proteinModel = proteinModelRef.current;
        viewer.removeAllSurfaces();
        if (proteinModel) {
          if (renderStyle === 'cartoon') {
            proteinModel.setStyle({}, { cartoon: { color: 'spectrum' } });
          } else if (renderStyle === 'stick') {
            proteinModel.setStyle({}, { stick: { radius: 0.15 } });
          } else if (renderStyle === 'sphere') {
            proteinModel.setStyle({}, { sphere: { scale: 0.6 } });
          } else if (renderStyle === 'surface') {
            proteinModel.setStyle({}, { cartoon: { hidden: true } });
            viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
              opacity: 0.9,
              colorscheme: { prop: 'b', gradient: 'rwb' },
            });
          } else {
            proteinModel.setStyle({}, { line: {} });
          }
        }
      } else {
        applyRenderStyle(viewerInstanceRef.current, renderStyle, false);
      }
      viewerInstanceRef.current.render();
    }
  }, [renderStyle, showHydrogens, applyRenderStyle, currentMolecule, isProtein]);

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
      } else if (event.data.type === 'molfile-response') {
        const newMolfile = event.data.molfile;
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
          lastMoleculeRef.current = newMolfile;
          return;
        }

        if (newMolfile !== lastMoleculeRef.current) {
          lastMoleculeRef.current = newMolfile;

          // If protein is currently loaded, clear it and update immediately (no debounce)
          if (isProtein) {
            setIsProtein(false);
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
          // Trigger update after molecule is set
          setTimeout(() => {
            requestMoleculeUpdate();
          }, 500);
        } else {
          setSearchError('Failed to load molecule into editor');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isKetcherReady, updateMolecule3D, requestMoleculeUpdate, isProtein]);

  // Debounce timeout ref for 3D updates
  const debounceTimeoutRef = useRef(null);

  // Poll for changes continuously (3D updates are gated separately)
  useEffect(() => {
    if (isKetcherReady && is3DReady && !isProtein) {
      const interval = setInterval(() => {
        if (iframeRef.current && isKetcherReady && !isProtein) {
          iframeRef.current.contentWindow.postMessage({ type: 'get-molfile' }, '*');
        }
      }, 400);
      return () => {
        clearInterval(interval);
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [isKetcherReady, is3DReady, isProtein]);

  // Toggle hydrogens
  const toggleHydrogens = () => {
    setShowHydrogens(!showHydrogens);
  };

  // Close/hide currently loaded protein from 3D viewer
  const closeProtein = () => {
    if (viewerInstanceRef.current && viewerInstanceRef.current.__isMiew) {
      try {
        if (typeof viewerInstanceRef.current.reset === 'function') {
          viewerInstanceRef.current.reset();
        }
      } catch (error) {
        console.error('Error resetting Miew viewer:', error);
      }
    } else if (viewerInstanceRef.current && proteinModelRef.current) {
      try {
        const viewer = viewerInstanceRef.current;
        viewer.removeModel(proteinModelRef.current);
        viewer.render();
      } catch (error) {
        console.error('Error removing protein model:', error);
      }
    }
    proteinModelRef.current = null;
    setIsProtein(false);
    setProteinMeta(null);
    setCurrentMolecule(null);
    clearMoleculeProps();
    setMolecularMass(null);

    // Fast path: if a molecule exists in the 2D canvas, reload it immediately in 3D.
    proteinCloseReloadRef.current = true;
    manual3DRefreshRequestedRef.current = true;
    if (iframeRef.current && isKetcherReady) {
      iframeRef.current.contentWindow.postMessage({ type: 'get-molfile' }, '*');
    }
  };

  const startMoveLonePair = (id, e) => {
    e.preventDefault();
    const marker = lonePairs.find((lp) => lp.id === id);
    if (!marker) return;
    lonePairDragRef.current = {
      type: 'move',
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: marker.x,
      startY: marker.y,
    };
  };

  const startRotateLonePair = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    const marker = lonePairs.find((lp) => lp.id === id);
    const wrap = ketcherCanvasWrapRef.current;
    if (!marker || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const centerX = rect.left + marker.x;
    const centerY = rect.top + marker.y;
    lonePairDragRef.current = {
      type: 'rotate',
      id,
      centerX,
      centerY,
      startRad: Math.atan2(e.clientY - centerY, e.clientX - centerX),
      startAngle: marker.angle,
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      const drag = lonePairDragRef.current;
      if (!drag) return;
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

    const onUp = () => {
      lonePairDragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [lonePairs]);

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

  // Handle PDB file import
  const handlePDBImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's a PDB file
    if (!file.name.toLowerCase().endsWith('.pdb')) {
      alert('Please select a PDB file (.pdb)');
      return;
    }

    try {
      const pdbText = await file.text();
      
      if (!viewerInstanceRef.current) {
        alert('3D viewer not ready. Please wait a moment.');
        return;
      }

      const viewer = viewerInstanceRef.current;
      const isMiew = !!viewer.__isMiew;
      let model = null;
      if (isMiew) {
        const loaded = await loadIntoMiew(pdbText, 'pdb');
        if (!loaded) throw new Error('Failed to load PDB in Miew');
        applyMiewViewerSettings(viewer);
        applyMiewDisplayMode(miewMode, viewer, miewColorer);
      } else {
        // Clear previous content (labels, models) before loading protein
        viewer.removeAllLabels();
        viewer.clear();
        model = viewer.addModel(pdbText, 'pdb');
        proteinModelRef.current = model;
        lastModelRef.current = model;
        if (model) {
          model.setStyle({}, { cartoon: { color: 'spectrum' } });
        }
      }

      // Store PDB data
      setCurrentMolecule({
        data: pdbText,
        format: 'pdb',
        has3D: true,
        isProtein: true
      });
      
      setIsProtein(true);
      setRenderStyle('cartoon');
      const baseName = file.name.replace('.pdb', '').toUpperCase();
      setMoleculeName(baseName);

      // Try to parse PDB header for metadata
      const headerMeta = { pdbId: baseName };
      const titleMatch = pdbText.match(/^TITLE\s{5}(.+)/m);
      if (titleMatch) headerMeta.title = titleMatch[1].trim();
      const compndMatch = pdbText.match(/^COMPND\s{4}(.+)/m);
      if (compndMatch) headerMeta.compound = compndMatch[1].trim();
      setProteinMeta(headerMeta);
      if (headerMeta.title) setMoleculeName(baseName + ' — ' + headerMeta.title);

      // Center and zoom
      if (!isMiew) {
        viewer.zoomTo();
        viewer.rotate(25, { x: 1, y: 1, z: 0 });
        viewer.render();
      }

      // Update molecular mass for the newly imported protein
      if (model && !isMiew) {
        const atoms = model.selectedAtoms({});
        setMolecularMass(calculateMolecularMass(atoms, showHydrogens));
      } else {
        setMolecularMass(null);
      }
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error loading PDB file:', error);
      alert('Failed to load PDB file. Please check the file format.');
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
        canvas.toBlob((blob) => {
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

  return (
    <div className="App">
      <div className="split-container">
        {/* Left: Ketcher 2D Editor */}
        <div className="panel ketcher-panel" data-testid="ketcher-panel">
          {/* Brand Header */}
          <div className="brand-header">
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
                    placeholder="Search molecule or PDB ID (e.g., 1ABC)..."
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
                    title="Search molecule by name or PDB ID"
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

            <div className="header-links">
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
                className="tb-btn"
                onClick={() => setShowCalculatorModal(true)}
                title="Open chemistry calculators"
              >
                Calculator
              </button>
              <button
                className={`tb-btn ${showViewerSettings ? 'tb-btn-active' : ''}`}
                onClick={() => setShowViewerSettings((v) => !v)}
                title="Open 3D viewer settings"
              >
                3D Settings
              </button>
              <button
                className="tb-btn"
                onClick={() => setShowTlcModal(true)}
                title="Open TLC diagram builder"
              >
                TLC
              </button>

              <button className="tb-btn" onClick={() => { if (iframeRef.current && isKetcherReady) iframeRef.current.contentWindow.postMessage({ type: 'get-svg' }, '*'); }} title="Download SVG">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                SVG
              </button>
              <button className="tb-btn" onClick={() => { if (iframeRef.current && isKetcherReady) iframeRef.current.contentWindow.postMessage({ type: 'get-png' }, '*'); }} title="Download PNG">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                PNG
              </button>
              <button className="tb-btn" onClick={() => { if (iframeRef.current && isKetcherReady) iframeRef.current.contentWindow.postMessage({ type: 'get-png-jpeg' }, '*'); }} title="Download JPEG">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                JPG
              </button>
              <a className="tb-btn" href="/course/index.html" target="_blank" rel="noopener noreferrer" title="Open Course">
                Course
              </a>

              <div className="tb-sep" />
              <div className="tb-menu-dropdown" ref={moreMenuRef}>
                <button className="tb-btn" onClick={() => setShowMoreMenu((v) => !v)} title="More options">More</button>
                {showMoreMenu && (
                  <div className="tb-menu-dropdown-list">
                  <a className="tb-menu-item" href="/pages/ai-help.html" target="_blank" rel="noopener noreferrer" title="How to use AI assistant">AI Setup</a>
                  <a className="tb-menu-item" href="/tools/index.html" target="_blank" rel="noopener noreferrer" title="Tools">Tools</a>
                  <a className="tb-menu-item" href="/blog/index.html" target="_blank" rel="noopener noreferrer" title="Blog">Blog</a>
                  <a className="tb-menu-item" href="/pages/updates.html" target="_blank" rel="noopener noreferrer" title="Updates">Updates</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showViewerSettings && (
            <div className="miew-settings-panel miew-settings-panel-2d">
              <div className="miew-settings-header">
                <span>3D Settings</span>
                <button className="miew-settings-close" onClick={() => setShowViewerSettings(false)}>x</button>
              </div>

              <div className="miew-settings-tabs">
                <button className={`miew-settings-tab ${miewSettingsTab === 'view' ? 'active' : ''}`} onClick={() => setMiewSettingsTab('view')}>View</button>
                <button className={`miew-settings-tab ${miewSettingsTab === 'mode' ? 'active' : ''}`} onClick={() => setMiewSettingsTab('mode')}>Mode</button>
                <button className={`miew-settings-tab ${miewSettingsTab === 'color' ? 'active' : ''}`} onClick={() => setMiewSettingsTab('color')}>Color</button>
                <button className={`miew-settings-tab ${miewSettingsTab === 'export' ? 'active' : ''}`} onClick={() => setMiewSettingsTab('export')}>Export</button>
              </div>

              {miewSettingsTab === 'view' && (
                <div className="miew-settings-list compact">
                  <label className="miew-setting-row">
                    <span>Resolution</span>
                    <select
                      value={miewResolution}
                      onChange={(e) => setMiewResolution(e.target.value)}
                      className="miew-setting-select"
                    >
                      <option value="poor">Poor</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="ultra">Ultra</option>
                    </select>
                  </label>
                  <div className="miew-setting-row"><span>Resolution autodetection</span><button className={`miew-toggle-btn ${miewAutoResolution ? 'on' : ''}`} onClick={() => setMiewAutoResolution((v) => !v)}>{miewAutoResolution ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-row"><span>Fog</span><button className={`miew-toggle-btn ${miewFog ? 'on' : ''}`} onClick={() => setMiewFog((v) => !v)}>{miewFog ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-row"><span>Axes</span><button className={`miew-toggle-btn ${miewAxes ? 'on' : ''}`} onClick={() => setMiewAxes((v) => !v)}>{miewAxes ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-row"><span>FPS counter</span><button className={`miew-toggle-btn ${miewFps ? 'on' : ''}`} onClick={() => setMiewFps((v) => !v)}>{miewFps ? 'ON' : 'OFF'}</button></div>
                  <label className="miew-setting-row">
                    <span>Palette</span>
                    <select
                      value={miewPalette}
                      onChange={(e) => setMiewPalette(e.target.value)}
                      className="miew-setting-select"
                    >
                      <option value="JM">Jmol</option>
                      <option value="CP">CPK</option>
                      <option value="VM">VMD</option>
                    </select>
                  </label>
                  <div className="miew-setting-row"><span>Background color</span><button className={`miew-toggle-btn ${miewBgDark ? 'on dark' : ''}`} onClick={() => setMiewBgDark((v) => !v)}>{miewBgDark ? 'Dark' : 'Light'}</button></div>
                  <div className="miew-setting-row"><span>FXAA</span><button className={`miew-toggle-btn ${miewFxaa ? 'on' : ''}`} onClick={() => setMiewFxaa((v) => !v)}>{miewFxaa ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-note">Smooths jagged edges in the rendered image.</div>
                  <div className="miew-setting-row"><span>Ambient Occlusion</span><button className={`miew-toggle-btn ${miewAo ? 'on' : ''}`} onClick={() => setMiewAo((v) => !v)}>{miewAo ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-note">Adds soft contact shadows for depth.</div>
                  <div className="miew-setting-row"><span>Shadow Map</span><button className={`miew-toggle-btn ${miewShadow ? 'on' : ''}`} onClick={() => setMiewShadow((v) => !v)}>{miewShadow ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-note">Directional lighting shadows on structures.</div>
                  <div className="miew-setting-row"><span>Clip Plane</span><button className={`miew-toggle-btn ${miewClipPlane ? 'on' : ''}`} onClick={() => setMiewClipPlane((v) => !v)}>{miewClipPlane ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-note">Cuts through structures to inspect inside.</div>
                  <div className="miew-setting-row"><span>Outline</span><button className={`miew-toggle-btn ${miewOutline ? 'on' : ''}`} onClick={() => setMiewOutline((v) => !v)}>{miewOutline ? 'ON' : 'OFF'}</button></div>
                  <div className="miew-setting-note">Draws subtle edge contour for shape clarity.</div>
                </div>
              )}

              {miewSettingsTab === 'mode' && (
                <>
                  <div className="miew-settings-group-title">Display mode</div>
                  <div className="miew-settings-subtitle">Changes how atoms and bonds are rendered (balls, sticks, surface, cartoon).</div>
                  <div className="miew-mode-grid compact">
                    {MIEW_MODE_OPTIONS.map((mode) => (
                      <button
                        key={mode.id}
                        className={`miew-mode-btn ${miewMode === mode.id ? 'active' : ''}`}
                        onClick={() => applyMiewDisplayMode(mode.id, null, miewColorer)}
                        title={`Display mode: ${mode.label}`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {miewSettingsTab === 'color' && (
                <>
                  <div className="miew-settings-group-title">Display color</div>
                  <div className="miew-settings-subtitle">Changes coloring logic (element, residue, chain, hydrophobicity, etc.).</div>
                  <div className="miew-mode-grid compact">
                    {MIEW_COLOR_OPTIONS.map((colorer) => (
                      <button
                        key={colorer.id}
                        className={`miew-mode-btn ${miewColorer === colorer.id ? 'active' : ''}`}
                        onClick={() => applyMiewDisplayMode(miewMode, null, colorer.id)}
                        title={`Color mode: ${colorer.label}`}
                      >
                        {colorer.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {miewSettingsTab === 'export' && (
                <div className="miew-settings-list compact">
                  <div className="miew-setting-row">
                    <span>Transparent PNG</span>
                    <button className={`miew-toggle-btn ${exportTransparentBg ? 'on' : ''}`} onClick={() => setExportTransparentBg((v) => !v)}>{exportTransparentBg ? 'ON' : 'OFF'}</button>
                  </div>
                  {!currentMolecule && <div className="miew-settings-empty">Load a molecule to enable exports.</div>}
                  {currentMolecule && (
                    <div className="miew-export-grid">
                      <button onClick={() => exportModel('png')} className="compact-export-btn" title="PNG (transparent)">PNG</button>
                      <button onClick={() => exportModel('jpeg')} className="compact-export-btn" title="JPEG with white background">JPG</button>
                      <button onClick={() => exportModel('sdf')} className="compact-export-btn" title="SDF format">SDF</button>
                      <button onClick={() => exportModel('xyz')} className="compact-export-btn" title="XYZ format">XYZ</button>
                      <button onClick={() => exportModel('pdb')} className="compact-export-btn" title="PDB format">PDB</button>
                      {!isMiewEngine && <button onClick={() => exportModel('x3d')} className="compact-export-btn" title="X3D with bonds">X3D</button>}
                      {!isMiewEngine && <button onClick={() => exportModel('obj')} className="compact-export-btn" title="OBJ for Blender">OBJ</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                  onMouseDown={(e) => startMoveLonePair(lp.id, e)}
                  onDoubleClick={() => setLonePairs((prev) => prev.filter((x) => x.id !== lp.id))}
                  title="Drag to move, rotate with handle, double-click to delete"
                >
                  <div className="lp-bounds">
                    <span className="lp-dot lp-dot-left" />
                    <span className="lp-dot lp-dot-right" />
                  </div>
                  <button
                    className="lp-rotate-handle"
                    onMouseDown={(e) => startRotateLonePair(lp.id, e)}
                    title="Rotate lone pair"
                  >
                    R
                  </button>
                  <button
                    className="lp-delete-btn"
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

            <div className="canvas-lp-hint" title="How to add lone pair in Ketcher">
              Add lone pair: select atom, right click > Edit > Radical dropdown.
            </div>
          </div>
        </div>

        {/* Right: 3D Viewer */}
        <div className={`panel viewer-panel ${!is3DPanelOpen ? 'minimized' : ''}`} data-testid="viewer-panel">
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
          {/* Molecule / Protein Properties Card */}
          {(moleculeName || molecularMass || proteinMeta || currentSmiles) && (
            <div className="mol-props-card">
              {moleculeName && moleculeName !== 'Not found in PubChem' && (
                <div className="mol-props-row mol-props-name">{moleculeName}</div>
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

              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <div
                  ref={viewer3DRef}
                  className="viewer-3d"
                  data-testid="viewer-3d"
                />

                {/* Multi-structure notice overlay */}
                {multiStructure && !isProtein && (
                  <div className="multi-struct-notice">
                    Multi-structure canvas detected
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

              {/* PDB Import Button */}
              <div className="pdb-import-container">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdb"
                  onChange={handlePDBImport}
                  style={{ display: 'none' }}
                  id="pdb-file-input"
                />
                <button
                  className="pdb-import-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import PDB file (protein structure)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>PDB</span>
                </button>
                {isProtein && (
                  <button
                    className="pdb-close-protein-btn"
                    onClick={closeProtein}
                    title="Remove loaded protein"
                  >
                    Close
                  </button>
                )}
                {isProtein && isMiewEngine && (
                  <div className="protein-quick-toggles">
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
              </div>

              {/* Floating Controls */}
              <div className="floating-controls">
                {/* Style and Color Row */}
                <div className="control-row">
                  <select
                    value={renderStyle}
                    onChange={(e) => {
                      const newStyle = e.target.value;
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
                      // For proteins, apply appropriate style
                      if (isProtein && viewerInstanceRef.current && !viewerInstanceRef.current.__isMiew) {
                        const viewer = viewerInstanceRef.current;
                        viewer.removeAllSurfaces();
                        if (newStyle === 'cartoon') {
                          viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
                        } else if (newStyle === 'stick') {
                          viewer.setStyle({}, { stick: { radius: 0.15 } });
                        } else if (newStyle === 'sphere') {
                          viewer.setStyle({}, { sphere: { scale: 0.6 } });
                        } else if (newStyle === 'surface') {
                          viewer.setStyle({}, { cartoon: { hidden: true } });
                          viewer.addSurface(window.$3Dmol.SurfaceType.VDW, {
                            opacity: 0.9,
                            colorscheme: { prop: 'b', gradient: 'rwb' },
                          });
                        } else {
                          viewer.setStyle({}, { line: {} });
                        }
                        viewer.render();
                      }
                    }}
                    className="compact-select"
                    title="Rendering style"
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
                    <button onClick={() => exportModel('pdb')} className="compact-export-btn" title="PDB format">PDB</button>
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
        </div>
      </div>

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
      {showCalculatorModal && <CalculatorModal onClose={() => setShowCalculatorModal(false)} />}

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