const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Interroge `check.url` jusqu'à ce que le corps contienne les 7 premiers caractères de `sha`. */
export async function waitDeploy({
  sha,
  check,
  timeoutSec = 900,
  intervalSec = 15,
  fetchImpl = fetch,
  sleep = defaultSleep,
}) {
  const short = sha.slice(0, 7);
  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    try {
      const res = await fetchImpl(check.url);
      if ((await res.text()).includes(short)) return 'ready';
    } catch {
      // erreur réseau : pas prêt pour l'instant
    }
    if (Date.now() + intervalSec * 1000 >= deadline) return 'timeout';
    await sleep(intervalSec * 1000);
  }
}
