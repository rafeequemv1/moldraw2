/** NCBI PubChem PUG REST: stay under ~5 requests/second without an API key. */
const MIN_INTERVAL_MS = 350;

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

export function pubChemThrottle(): Promise<void> {
  chain = chain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestAt));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  return chain;
}

export async function withPubChemThrottle<T>(fn: () => Promise<T>): Promise<T> {
  await pubChemThrottle();
  return fn();
}
