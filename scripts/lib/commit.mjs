import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.mjs';
import { git } from './git.mjs';

const PLACEHOLDER = /^\{(emoji|files|desc)\}$/;

/** Remplace `{emoji}`, `{files}`, `{desc}` en une seule passe : une valeur n'est jamais réexpansée. */
function fill(arg, values) {
  return arg
    .split(/(\{emoji\}|\{files\}|\{desc\})/)
    .map((part) => (PLACEHOLDER.test(part) ? values[part.slice(1, -1)] : part))
    .join('');
}

/** Commit via le gabarit `config.commit` (argv, sans shell, sans `git add`) ; renvoie le SHA court. */
export function runCommit(cwd, { emoji, files, desc }) {
  const { config } = loadConfig(cwd);
  const argv = config.commit.map((a) => fill(a, { emoji, files, desc }));
  try {
    execFileSync(argv[0], argv.slice(1), { cwd, stdio: 'pipe' });
  } catch (e) {
    const detail = `${e.stderr ?? ''}${e.stdout ?? ''}`.toString().trim() || e.message;
    throw new Error(`Commit impossible : ${detail}`);
  }
  return git(cwd, 'rev-parse', '--short', 'HEAD');
}
