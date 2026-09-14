import { MOLDRAW_PLUGIN_ENGINE_VERSION } from '@moldraw/plugin-sdk';

/** Minimal semver range check for `^major.minor.patch`. */
export function satisfiesEngineRange(range: string, hostVersion: string): boolean {
  const hostParts = parseVersion(hostVersion);
  if (!hostParts) return false;

  const trimmed = range.trim();
  if (trimmed.startsWith('^')) {
    const req = parseVersion(trimmed.slice(1));
    if (!req) return false;
    if (hostParts.major !== req.major) return false;
    if (hostParts.major > req.major) return true;
    if (hostParts.minor > req.minor) return true;
    if (hostParts.minor < req.minor) return false;
    return hostParts.patch >= req.patch;
  }

  if (trimmed.startsWith('>=')) {
    const req = parseVersion(trimmed.slice(2));
    if (!req) return false;
    return compareVersions(hostParts, req) >= 0;
  }

  const exact = parseVersion(trimmed);
  if (!exact) return false;
  return compareVersions(hostParts, exact) === 0;
}

function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareVersions(
  a: { major: number; minor: number; patch: number },
  b: { major: number; minor: number; patch: number },
): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function checkEngineCompatibility(
  pluginEngine: string,
  hostVersion = MOLDRAW_PLUGIN_ENGINE_VERSION,
): { ok: true } | { ok: false; reason: string } {
  if (satisfiesEngineRange(pluginEngine, hostVersion)) return { ok: true };
  return {
    ok: false,
    reason: `Engine mismatch: plugin requires ${pluginEngine}, host is ${hostVersion}`,
  };
}
