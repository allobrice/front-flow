import { git, currentBranch } from './git.mjs';

// Versions de release : lettres, chiffres, point, tiret, underscore. Tout autre caractère → repli.
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Branche de base : `release/<fixVersion>` si elle existe sur origin, sinon `start` (défaut : branche courante).
 * Un `ls-remote` en échec (pas d'origin, réseau) ou une version invalide retombe sur `start`.
 */
export function detectBase(cwd, { fixVersion, start } = {}) {
  const fallback = start ?? currentBranch(cwd);
  if (!fixVersion || !VERSION_RE.test(fixVersion)) return fallback;
  const ref = `release/${fixVersion}`;
  try {
    const found = git(cwd, 'ls-remote', '--heads', 'origin', ref)
      .split('\n')
      .some((line) => line.split('\t')[1] === `refs/heads/${ref}`);
    return found ? ref : fallback;
  } catch {
    return fallback;
  }
}
