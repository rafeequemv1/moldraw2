const { execFile } = require('child_process');

const MAX_SMILES_LENGTH = 2000;
const MAX_MOLFILE_LENGTH = 250000;
const shouldAttemptLocalChemEngines = () => {
  const flag = String(process.env.MOLDRAW_ENABLE_LOCAL_3D || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || !process.env.VERCEL;
};

const fetchText = async (url, timeoutMs = 45000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
};

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
  // Some truly planar molecules are valid 3D conformers, but 2D service output
  // must not be treated as quantum-ready coordinates.
  return Boolean(stats && (stats.headerSays3D || stats.zDepth > 0.05));
};

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

const tryPublicSources = async (smiles) => {
  const encoded = encodeURIComponent(smiles);
  const sources = [
    {
      name: 'nci-cactus',
      url: `https://cactus.nci.nih.gov/chemical/structure/${encoded}/file?format=sdf&get3d=true`,
    },
  ];

  const errors = [];
  for (const source of sources) {
    try {
      const result = await fetchText(source.url);
      if (result.ok && isValid3DSdf(result.text)) {
        return {
          sdf: result.text,
          source: source.name,
          stats: getSdf3DStats(result.text),
          errors,
        };
      }
      errors.push(`${source.name}:${result.status}`);
    } catch (error) {
      errors.push(`${source.name}:${error?.name || 'error'}`);
    }
  }
  return { errors };
};

const generate3DStructure = async ({ smiles, molfile }) => {
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
  tried.push('local-engines:disabled-by-policy');
  tried.push('pubchem:disabled-by-policy');

  if (cleanSmiles) {
    const publicResult = await tryPublicSources(cleanSmiles);
    if (publicResult?.sdf) {
      return {
        status: 200,
        body: {
          sdf: publicResult.sdf,
          source: publicResult.source,
          stats: publicResult.stats,
          tier: 'public',
          tried,
        },
      };
    }
    tried.push(...(publicResult.errors || []));
  }

  return {
    status: 200,
    body: {
      sdf: null,
      source: 'frontend-estimate',
      error: 'No 3D conformer could be generated for this structure.',
      code: 'NO_3D_CONFORMER',
      tried,
    },
  };
};

module.exports = {
  generate3DStructure,
  getSdf3DStats,
  isValid3DSdf,
};
