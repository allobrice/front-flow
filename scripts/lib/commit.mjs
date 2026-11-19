import { execFileSync } from 'node:child_process';
import { loadConfig } from './config.mjs';
import { git } from './git.mjs';

const TOKENS = /(\{(?:emoji|files|desc|KEY|key)\})/;
const KEY_TOKEN = /\{(?:KEY|key)\}/;
const KEY_RE = /^[A-Za-z]{2,}-\d+$/;

/** Remplace les jetons en une seule passe : une valeur n'est jamais réexpansée. */
function fill(arg, values) {
  return arg
    .split(TOKENS)
    .map((part, i) => (i % 2 ? values[part.slice(1, -1)] : part)) // indices impairs = jetons capturés
    .join('');
}

/**
 * Commit via le gabarit `config.commit` (argv, sans shell, sans `git add`) ; renvoie le SHA court.
 * Jetons : `{emoji}`, `{files}`, `{desc}`, `{KEY}` (clé en majuscules), `{key}` (minuscules).
 * Un gabarit qui utilise `{KEY}`/`{key}` exige `key` : jamais de remplacement par une chaîne vide.
 */
export function runCommit(cwd, { emoji, files, desc, key = null }) {
  const { config } = loadConfig(cwd);
  if (config.commit.some((a) => KEY_TOKEN.test(a))) {
    if (!key) throw new Error('Le gabarit « commit » utilise {KEY} ou {key} : passer --key <KEY> (clé du ticket).');
    if (!KEY_RE.test(key)) throw new Error(`Clé de ticket « ${key} » invalide (attendu : WEBFRONT-123).`);
  }
  const values = { emoji, files, desc, KEY: key?.toUpperCase(), key: key?.toLowerCase() };
  const argv = config.commit.map((a) => fill(a, values));
  try {
    execFileSync(argv[0], argv.slice(1), { cwd, stdio: 'pipe' });
  } catch (e) {
    const detail = `${e.stderr ?? ''}${e.stdout ?? ''}`.toString().trim() || e.message;
    throw new Error(`Commit impossible : ${detail}`);
  }
  return git(cwd, 'rev-parse', '--short', 'HEAD');
}
