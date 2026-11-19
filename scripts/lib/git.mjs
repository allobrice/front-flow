import { execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

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

/**
 * Racine du checkout principal, identique depuis un worktree : parent du dossier git commun
 * quand il s'appelle `.git`, sinon première entrée de `git worktree list --porcelain`.
 */
export function mainRoot(cwd) {
  const common = commonDir(cwd);
  if (basename(common) === '.git') return dirname(common);
  const first = git(cwd, 'worktree', 'list', '--porcelain').split('\n').find((l) => l.startsWith('worktree '));
  return first ? first.slice('worktree '.length) : dirname(common);
}
