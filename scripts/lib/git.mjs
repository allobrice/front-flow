import { execFileSync } from 'node:child_process';

/** Exécute git sans shell et renvoie la sortie sans espaces de bord. */
export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Dossier git commun (partagé entre checkout principal et worktrees), chemin absolu. */
export function commonDir(cwd) {
  return git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir');
}

/** Branche courante ('HEAD' si détachée). */
export function currentBranch(cwd) {
  return git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
}
