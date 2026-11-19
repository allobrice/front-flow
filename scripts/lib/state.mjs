import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { commonDir, currentBranch } from './git.mjs';

export const PHASES = ['context', 'plan', 'implement', 'pr', 'review', 'recette', 'done', 'abandoned'];

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const stateDir = (cwd) => join(commonDir(cwd), 'front-flow');

export function statePath(cwd, key) {
  if (!KEY_RE.test(key)) throw new Error(`Clé de feature invalide : « ${key} ».`);
  return join(stateDir(cwd), `${key}.json`);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(target, patch) {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isObject(v) && isObject(out[k]) ? merge(out[k], v) : v;
  }
  return out;
}

/** Lit l'état ; null si absent ; lève une Error mentionnant le chemin si le JSON est invalide. */
export function readState(cwd, key) {
  const path = statePath(cwd, key);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Fichier d'état illisible (${path}) : ${e.message}`);
  }
}

/** Fusionne `patch` dans l'état (profondeur), horodate et écrit de façon atomique. */
export function writeState(cwd, key, patch) {
  if (patch.phase !== undefined && !PHASES.includes(patch.phase)) {
    throw new Error(`phase invalide : « ${patch.phase} » (attendu : ${PHASES.join(', ')}).`);
  }
  const path = statePath(cwd, key);
  const next = { ...merge(readState(cwd, key) ?? { key }, patch), key, updated_at: new Date().toISOString() };
  mkdirSync(stateDir(cwd), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, path);
  return next;
}

/** États en cours (hors done/abandoned), le plus récent d'abord. Les fichiers illisibles sont ignorés. */
export function listStates(cwd) {
  const dir = stateDir(cwd);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let s;
    try {
      s = readState(cwd, f.slice(0, -'.json'.length));
    } catch {
      continue;
    }
    if (!s || s.phase === 'done' || s.phase === 'abandoned') continue;
    out.push({ key: s.key, phase: s.phase, branch: s.branch ?? null, worktree: s.worktree ?? null, updated_at: s.updated_at });
  }
  return out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

/** Clé de ticket déduite de la branche courante, ou null. */
export function currentKey(cwd) {
  return currentBranch(cwd).match(/[A-Z]{2,}-\d+/)?.[0] ?? null;
}
