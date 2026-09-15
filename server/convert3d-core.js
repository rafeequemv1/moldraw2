const { execFile } = require('child_process');

const MAX_SMILES_LENGTH = 2000;
const MAX_MOLFILE_LENGTH = 250000;
const MAX_CACTUS_URL_LENGTH = 7500;
const IS_VERCEL = Boolean(process.env.VERCEL);
// Vercel Hobby kills functions at 10s with no app logs. Keep a hard budget under that.
const FETCH_TIMEOUT_MS = IS_VERCEL ? 3500 : 20000;
const GENERATION_BUDGET_MS = IS_VERCEL ? 8000 : 40000;

const remainingMs = (deadline) => Math.max(0, deadline - Date.now());

const shouldAttemptLocalChemEngines = () => {
  const flag = String(process.env.MOLDRAW_ENABLE_LOCAL_3D || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || !process.env.VERCEL;
};

const fetchText = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
  const budget = Math.max(200, Math.min(timeoutMs, FETCH_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budget);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      error: error?.name === 'AbortError' ? 'TIMEOUT' : (error?.name || 'FETCH_FAILED'),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const firstValidStructure = (promises) => new Promise((resolve) => {
  const list = Array.isArray(promises) ? promises : [];
  if (!list.length) {
    resolve(null);
    return;
  }
  let pending = list.length;
  let settled = false;
  list.forEach((promise) => {
    Promise.resolve(promise).then((result) => {
      if (!settled && (result?.sdf || result?.pdb)) {
        settled = true;
        resolve(result);
        return;
      }
      pending -= 1;
      if (!settled && pending === 0) resolve(null);
    }).catch(() => {
      pending -= 1;
      if (!settled && pending === 0) resolve(null);
    });
  });
});

const getSdf3DStats = (text) => {
  if (typeof text !== 'string' || !/M\s+END/i.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const countsIndex = lines.findIndex((line) => /^\s*\d+\s+\d+.*V[23]000/.test(line));
  if (countsIndex < 0) return null;
  const atomCount = Number.parseInt(lines[countsIndex].trim().split(/\s+/)[0], 10);
  if (!Number.isFinite(atomCount) || atomCount <= 0) return null;

  const zValues = [];
  for (let i = 0; i < atomCount; i += 1) {
    const parts = String(lines[countsIndex + 1 + i] || '').trim().split(/\s+/);
    const z = Number.parseFloat(parts[2]);
    if (Number.isFinite(z)) zValues.push(z);
  }
  if (!zValues.length) return null;

  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  return {
    atomCount,
    headerSays3D: /3D/i.test(lines[1] || ''),
    zDepth: maxZ - minZ,
  };
};

const isValid3DSdf = (text) => {
  const stats = getSdf3DStats(text);
  return Boolean(stats && (stats.headerSays3D || stats.zDepth > 0.01));
};

const getPdb3DStats = (text) => {
  if (typeof text !== 'string') return null;
  const atomLines = text.split(/\r?\n/).filter((line) => /^(ATOM|HETATM)\s/.test(line));
  if (!atomLines.length) return null;

  const zValues = atomLines
    .map((line) => Number.parseFloat(line.slice(46, 54)))
    .filter((value) => Number.isFinite(value));
  if (!zValues.length) return null;

  const minZ = Math.min(...zValues);
  const maxZ = Math.max(...zValues);
  return {
    atomCount: atomLines.length,
    zDepth: maxZ - minZ,
  };
};

const isValid3DPdb = (text) => {
  const stats = getPdb3DStats(text);
  return Boolean(stats && stats.zDepth > 0.01);
};

const isHtmlErrorPage = (text) => /<!DOCTYPE html|<html/i.test(String(text || '').slice(0, 200));

const runCommand = (command, args, input, timeoutMs = 35000) => new Promise((resolve) => {
  const child = execFile(command, args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
    windowsHide: true,
  }, (error, stdout, stderr) => {
    if (error) {
      resolve({
        ok: false,
        error: error.code || error.name || 'COMMAND_FAILED',
        stderr: String(stderr || '').slice(0, 300),
      });
      return;
    }
    resolve({ ok: true, stdout: String(stdout || '') });
  });

  child.stdin?.end(input || '');
});

const rdkitPythonScript = String.raw`
import json, sys
payload = json.loads(sys.stdin.read() or "{}")
smiles = (payload.get("smiles") or "").strip()
molblock = (payload.get("molfile") or "").strip()

from rdkit import Chem
from rdkit.Chem import AllChem

mol = Chem.MolFromMolBlock(molblock, sanitize=True, removeHs=False) if molblock else None
if mol is None and smiles:
    mol = Chem.MolFromSmiles(smiles)
if mol is None:
    raise SystemExit("could not parse molecule")

mol = Chem.AddHs(mol)
params = AllChem.ETKDGv3()
params.randomSeed = 0xC0FFEE
params.useSmallRingTorsions = True
params.useMacrocycleTorsions = True
params.pruneRmsThresh = 0.25
num_confs = 16 if mol.GetNumAtoms() <= 80 else 8
conf_ids = list(AllChem.EmbedMultipleConfs(mol, numConfs=num_confs, params=params))
if not conf_ids:
    raise SystemExit("embedding failed")

best_conf = conf_ids[0]
best_energy = None
source = "rdkit-etkdg"
props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94")
if props is not None:
    source = "rdkit-etkdg-mmff94"
    for cid in conf_ids:
        try:
            ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=cid)
            ff.Minimize(maxIts=500)
            energy = float(ff.CalcEnergy())
            if best_energy is None or energy < best_energy:
                best_energy = energy
                best_conf = cid
        except Exception:
            pass
else:
    source = "rdkit-etkdg-uff"
    for cid in conf_ids:
        try:
            ff = AllChem.UFFGetMoleculeForceField(mol, confId=cid)
            ff.Minimize(maxIts=500)
            energy = float(ff.CalcEnergy())
            if best_energy is None or energy < best_energy:
                best_energy = energy
                best_conf = cid
        except Exception:
            pass

mol.SetProp("_Name", "MolDraw 3D estimate")
mol.SetProp("MolDraw3DSource", source)
writer = Chem.SDWriter(sys.stdout)
writer.write(mol, confId=best_conf)
writer.flush()
`;

const tryRdkit = async (smiles, molfile) => {
  const payload = JSON.stringify({ smiles, molfile });
  const pythonCommands = process.platform === 'win32'
    ? [['python', ['-c', rdkitPythonScript]], ['py', ['-3', '-c', rdkitPythonScript]]]
    : [['python3', ['-c', rdkitPythonScript]], ['python', ['-c', rdkitPythonScript]]];

  for (const [command, args] of pythonCommands) {
    const result = await runCommand(command, args, payload, 45000);
    if (result.ok && isValid3DSdf(result.stdout)) {
      return { sdf: result.stdout, source: 'rdkit-etkdg', stats: getSdf3DStats(result.stdout) };
    }
  }
  return null;
};

const tryOpenBabel = async (smiles, molfile) => {
  const attempts = [];
  if (molfile) {
    attempts.push({
      input: molfile,
      args: ['-imol', '-osdf', '--gen3d', '--ff', 'MMFF94'],
      source: 'openbabel-mol-mmff94',
    });
  }
  if (smiles) {
    attempts.push({
      input: `${smiles}\tMolDraw\n`,
      args: ['-ismi', '-osdf', '--gen3d', '--ff', 'MMFF94'],
      source: 'openbabel-smiles-mmff94',
    });
  }

  const commands = process.platform === 'win32' ? ['obabel.exe', 'obabel'] : ['obabel'];
  for (const attempt of attempts) {
    for (const command of commands) {
      const result = await runCommand(command, attempt.args, attempt.input, 45000);
      if (result.ok && isValid3DSdf(result.stdout)) {
        return { sdf: result.stdout, source: attempt.source, stats: getSdf3DStats(result.stdout) };
      }
    }
  }
  return null;
};

const uniqueSmilesCandidates = (smiles) => {
  const clean = String(smiles || '').trim();
  if (!clean) return [];
  const candidates = [clean];
  clean.split('.').map((part) => part.trim()).filter(Boolean).forEach((part) => {
    candidates.push(part);
  });
  return [...new Set(candidates)];
};

const tryCactusStructure = async (structure, format = 'sdf', timeoutMs = FETCH_TIMEOUT_MS) => {
  const encoded = encodeURIComponent(structure);
  if (!encoded || encoded.length > MAX_CACTUS_URL_LENGTH) return { error: 'URL_TOO_LONG' };

  const get3d = format === 'sdf' || format === 'pdb' ? '&get3d=true' : '';
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encoded}/file?format=${format}${get3d}`;

  const result = await fetchText(url, {}, timeoutMs);
  if (result.error) return { error: result.error };
  if (!result.ok || isHtmlErrorPage(result.text)) {
    return { error: `HTTP_${result.status || 'ERR'}` };
  }
  if (format === 'sdf' && isValid3DSdf(result.text)) {
    return {
      sdf: result.text,
      source: 'nci-cactus',
      stats: getSdf3DStats(result.text),
    };
  }
  if (format === 'pdb' && isValid3DPdb(result.text)) {
    return {
      pdb: result.text,
      source: 'nci-cactus-pdb',
      stats: getPdb3DStats(result.text),
    };
  }
  return { error: 'INVALID_3D' };
};

const tryPubChem3D = async (smiles, timeoutMs = FETCH_TIMEOUT_MS) => {
  const encoded = encodeURIComponent(smiles);
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/SDF?record_type=3d`;
  const result = await fetchText(url, {}, timeoutMs);
  if (result.error) return { error: `pubchem-3d:${result.error}` };
  if (result.ok && isValid3DSdf(result.text)) {
    return {
      sdf: result.text,
      source: 'pubchem-3d',
      stats: getSdf3DStats(result.text),
    };
  }
  return { error: `pubchem-3d:${result.status || 'ERR'}` };
};

const buildSuccessBody = (result, tier, tried) => ({
  status: 200,
  body: {
    sdf: result.sdf || null,
    pdb: result.pdb || null,
    format: result.sdf ? 'sdf' : (result.pdb ? 'pdb' : null),
    source: result.source,
    stats: result.stats || null,
    tier,
    tried,
  },
});

const generate3DStructure = async ({ smiles, molfile }) => {
  const startedAt = Date.now();
  const deadline = startedAt + GENERATION_BUDGET_MS;
  const cleanSmiles = String(smiles || '').trim();
  const cleanMolfile = String(molfile || '').trim();
  if (!cleanSmiles && !cleanMolfile) {
    return { status: 400, body: { error: 'Missing SMILES or molfile', code: 'MISSING_STRUCTURE' } };
  }
  if (cleanSmiles.length > MAX_SMILES_LENGTH) {
    return { status: 400, body: { error: 'SMILES is too long', code: 'SMILES_TOO_LONG' } };
  }
  if (cleanMolfile.length > MAX_MOLFILE_LENGTH) {
    return { status: 400, body: { error: 'Molfile is too large', code: 'MOLFILE_TOO_LARGE' } };
  }

  const tried = [];
  const candidates = uniqueSmilesCandidates(cleanSmiles);
  const primary = candidates[0] || '';

  try {
  if (primary) {
    const slice = remainingMs(deadline);
    const cactusSdf = tryCactusStructure(primary, 'sdf', slice).then((result) => {
      if (result?.error) tried.push(`nci-cactus:${primary}:sdf:${result.error}`);
      return result;
    });
    const pubchem = tryPubChem3D(primary, slice).then((result) => {
      if (result?.error) tried.push(result.error);
      return result;
    });
    const raced = await firstValidStructure([cactusSdf, pubchem]);
    if (raced?.sdf || raced?.pdb) {
      console.log('[convert-3d] success', { source: raced.source, ms: Date.now() - startedAt });
      return buildSuccessBody(raced, 'public', tried);
    }

    if (remainingMs(deadline) > 1200) {
      const pdbResult = await tryCactusStructure(primary, 'pdb', remainingMs(deadline));
      if (pdbResult?.pdb) {
        console.log('[convert-3d] success', { source: pdbResult.source, ms: Date.now() - startedAt });
        return buildSuccessBody(pdbResult, 'public', tried);
      }
      if (pdbResult?.error) tried.push(`nci-cactus:${primary}:pdb:${pdbResult.error}`);
    }
  }

  // Salt/fragment fallback is too slow for serverless; only try locally.
  if (!IS_VERCEL && candidates.length > 1) {
    for (const candidate of candidates.slice(1)) {
      if (remainingMs(deadline) < 1500) break;
      const result = await tryCactusStructure(candidate, 'sdf', remainingMs(deadline));
      if (result?.sdf) return buildSuccessBody(result, 'public', tried);
      if (result?.error) tried.push(`nci-cactus:${candidate}:sdf:${result.error}`);
    }
  }

  if (shouldAttemptLocalChemEngines() && remainingMs(deadline) > 2000) {
    const rdkitResult = await tryRdkit(cleanSmiles, cleanMolfile);
    if (rdkitResult?.sdf) {
      return buildSuccessBody(rdkitResult, 'local', tried);
    }
    tried.push('rdkit:unavailable-or-failed');

    if (remainingMs(deadline) > 2000) {
      const openBabelResult = await tryOpenBabel(cleanSmiles, cleanMolfile);
      if (openBabelResult?.sdf) {
        return buildSuccessBody(openBabelResult, 'local', tried);
      }
      tried.push('openbabel:unavailable-or-failed');
    }
  } else if (IS_VERCEL) {
    tried.push('local-engines:disabled-by-policy');
  }

  const elapsed = Date.now() - startedAt;
  const timedOut = remainingMs(deadline) < 250;
  const code = timedOut ? 'UPSTREAM_TIMEOUT' : 'NO_3D_CONFORMER';
  console.warn('[convert-3d] no_conformer', { code, elapsed, tried });
  return {
    status: 200,
    body: {
      sdf: null,
      pdb: null,
      format: null,
      source: 'frontend-estimate',
      error: timedOut
        ? '3D providers timed out before a conformer could be generated.'
        : 'No 3D conformer could be generated for this structure.',
      code,
      tried,
    },
  };
  } catch (error) {
    console.error('[convert-3d] failed', error?.message || error);
    return {
      status: 500,
      body: {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
    };
  }
};

module.exports = {
  generate3DStructure,
  getSdf3DStats,
  isValid3DSdf,
  isValid3DPdb,
};
