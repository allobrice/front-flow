import { execFileSync } from 'node:child_process';

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

/** `gh run list` du workflow sur la branche ; rend les runs (plus récents d'abord). */
function ghRuns(cwd, workflow, branch) {
  const out = execFileSync(
    'gh',
    ['run', 'list', '--workflow', workflow, '--branch', branch, '--limit', '20', '--json', 'headSha,status,conclusion,url'],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out);
}

/**
 * Suit le run GitHub Actions `workflow` déclenché par le push de `sha` sur `branch`.
 * Rend `{ status, url }` : `ready` (run réussi), `failed` (run terminé en échec), `not-triggered`
 * (aucun run pour ce SHA après `graceSec` : push filtré par le workflow, ex. docs seules) ou
 * `timeout`. Une erreur de `gh` compte comme « pas encore de run ».
 */
export async function waitWorkflow({
  cwd,
  sha,
  workflow,
  branch,
  timeoutSec = 900,
  intervalSec = 15,
  graceSec = 120,
  listRuns = ghRuns,
  sleep = defaultSleep,
}) {
  const start = Date.now();
  const deadline = start + timeoutSec * 1000;
  for (;;) {
    let run;
    try {
      run = listRuns(cwd, workflow, branch).find((r) => r.headSha === sha);
    } catch {
      run = undefined;
    }
    if (run?.status === 'completed') return { status: run.conclusion === 'success' ? 'ready' : 'failed', url: run.url, conclusion: run.conclusion };
    if (!run && Date.now() - start >= graceSec * 1000) return { status: 'not-triggered', url: null };
    if (Date.now() + intervalSec * 1000 >= deadline) return { status: 'timeout', url: run?.url ?? null };
    await sleep(intervalSec * 1000);
  }
}
