import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainRoot } from './git.mjs';

const DEFAULTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'defaults', 'config.json');
const KEY_RE = /[A-Z]{2,}-\d+/;

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Objets fusionnés récursivement ; tableaux et scalaires du second remplacent le premier. */
function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlain(v) && isPlain(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Fichier de config invalide ${file} : ${e.message}`);
  }
}

/**
 * Défauts + `<racine>/.claude/front-flow.json` fusionnés en profondeur. `<racine>` est le checkout
 * principal, même depuis un worktree (la config y est souvent ignorée par git, donc absente).
 */
export function loadConfig(cwd) {
  let root;
  try {
    root = mainRoot(cwd);
  } catch {
    throw new Error('Ce dossier n\'est pas dans un dépôt git : impossible de trouver .claude/front-flow.json.');
  }
  const defaults = readJson(DEFAULTS);
  const file = join(root, '.claude', 'front-flow.json');
  if (!existsSync(file)) return { config: defaults, configured: false, root };
  const repoCfg = readJson(file);
  if (!isPlain(repoCfg)) throw new Error(`Fichier de config invalide ${file} : un objet JSON est attendu.`);
  const config = deepMerge(defaults, repoCfg);
  const { commit } = config;
  if (!Array.isArray(commit) || !commit.length || !commit.every((a) => typeof a === 'string')) {
    throw new Error(`Fichier de config invalide ${file} : « commit » doit être un tableau non vide de chaînes.`);
  }
  if (typeof config.branch !== 'string' || !/\{(KEY|key)\}/.test(config.branch)) {
    throw new Error(`Fichier de config invalide ${file} : « branch » doit être une chaîne contenant {KEY} ou {key}.`);
  }
  const check = config.recetteReadyCheck;
  if (check !== null && !(isPlain(check) && (typeof check.url === 'string' || typeof check.workflow === 'string'))) {
    throw new Error(`Fichier de config invalide ${file} : « recetteReadyCheck » doit valoir null, { "url": … } ou { "workflow": … }.`);
  }
  return { config, configured: true, root };
}

/** Clé de ticket, URL Jira et/ou URL Notion à partir d'un argument libre. */
export function resolveTarget(arg) {
  const text = (arg ?? '').trim();
  let url = null;
  try {
    url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) url = null;
  } catch {
    // pas une URL
  }
  if (!url) {
    if (new RegExp(`^${KEY_RE.source}$`, 'i').test(text)) return { key: text.toUpperCase(), jiraUrl: null, notionUrl: null };
  } else {
    const host = url.hostname;
    if (host === 'notion.so' || host.endsWith('.notion.so') || host.endsWith('.notion.site')) {
      return { key: null, jiraUrl: null, notionUrl: text };
    }
    const key = url.searchParams.get('selectedIssue')?.match(KEY_RE)?.[0] ?? url.pathname.match(KEY_RE)?.[0];
    if (key) return { key, jiraUrl: text, notionUrl: null };
  }
  throw new Error(`Cible « ${text} » non reconnue : donne une clé de ticket (ex. WEBFRONT-123), une URL Jira ou une URL Notion.`);
}
