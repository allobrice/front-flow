import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { git } from './git.mjs';
import { loadConfig } from './config.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

const DEFAULT_MAPPING = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'defaults', 'mapping.json');

export const defaultClaudeHome = () => process.env.FF_CLAUDE_HOME ?? join(homedir(), '.claude');

const readText = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

const statTarget = (file) => {
  try {
    return statSync(file); // suit les liens symboliques ; lien cassé → null
  } catch {
    return null;
  }
};

const entries = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/** Agents (`agents/*.md`) et skills (`skills/<nom>/SKILL.md`) d'une racine. */
function scanRoot(root, source, prefix) {
  const items = [];
  const add = (file, kind, fallbackName) => {
    const text = readText(file);
    if (text === null) return;
    const fm = parseFrontmatter(text);
    const name = typeof fm.name === 'string' && fm.name ? fm.name : fallbackName;
    items.push({
      item: { id: prefix ? `${prefix}:${name}` : name, kind, source },
      disabled: fm['disable-model-invocation'] === true,
    });
  };
  for (const e of entries(join(root, 'agents'))) {
    if (e.name.endsWith('.md') && statTarget(join(root, 'agents', e.name))?.isFile()) add(join(root, 'agents', e.name), 'agent', basename(e.name, '.md'));
  }
  for (const e of entries(join(root, 'skills'))) {
    if (statTarget(join(root, 'skills', e.name))?.isDirectory()) add(join(root, 'skills', e.name, 'SKILL.md'), 'skill', e.name);
  }
  return items;
}

/** Dernière installation (lastUpdated max, sinon dernier élément) existante de chaque plugin. */
function pluginRoots(claudeHome) {
  const text = readText(join(claudeHome, 'plugins', 'installed_plugins.json'));
  if (text === null) return [];
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const roots = [];
  for (const [key, installs] of Object.entries(data?.plugins ?? {})) {
    const valid = (Array.isArray(installs) ? installs : []).filter((i) => i?.installPath && existsSync(i.installPath));
    if (!valid.length) continue;
    const dated = valid.filter((i) => i.lastUpdated);
    const pick = dated.length
      ? dated.reduce((a, b) => (Date.parse(b.lastUpdated) > Date.parse(a.lastUpdated) ? b : a))
      : valid.at(-1);
    roots.push({ root: pick.installPath, plugin: key.split('@')[0] });
  }
  return roots;
}

function effectiveMapping(cwd, inRepo) {
  const mapping = JSON.parse(readFileSync(DEFAULT_MAPPING, 'utf8'));
  // Hors dépôt git : mapping par défaut seul. Dans un dépôt, une config invalide remonte.
  if (inRepo) Object.assign(mapping, loadConfig(cwd).config.mapping ?? {});
  return mapping;
}

/**
 * `available` est limité aux ids du mapping effectif et à leurs replis, sauf avec `all` (liste
 * complète). `unusable` et `missing` ne dépendent pas de `all`.
 */
export function inventory(cwd, { claudeHome = defaultClaudeHome(), all = false } = {}) {
  const found = [...scanRoot(claudeHome, 'user', null)];
  let top = null;
  try {
    top = git(cwd, 'rev-parse', '--show-toplevel');
  } catch {
    // hors dépôt git : sources repo ignorées
  }
  if (top) found.push(...scanRoot(join(top, '.claude'), 'repo', null));
  for (const { root, plugin } of pluginRoots(claudeHome)) found.push(...scanRoot(root, 'plugin', plugin));

  const byId = (a, b) => a.id.localeCompare(b.id);
  const available = found.filter((f) => !f.disabled).map((f) => f.item).sort(byId);
  const unusable = found.filter((f) => f.disabled).map((f) => f.item).sort(byId);

  // Un repli sans préfixe (« code-review ») désigne aussi un item de plugin « <plugin>:code-review ».
  const matchesFallback = (item, id) => item.id === id || (!id.includes(':') && item.source === 'plugin' && item.id.endsWith(`:${id}`));
  const has = (id) => available.some((i) => i.id === id);
  const hasFallback = (id) => available.some((i) => matchesFallback(i, id));
  const effective = effectiveMapping(cwd, top !== null);
  const mapping = Object.values(effective).flat();
  const missing = [];
  for (const [phase, list] of Object.entries(effective)) {
    for (const { id, fallback = null } of list) {
      if (has(id)) continue;
      missing.push({ id, phase, fallback, fallbackAvailable: fallback !== null && hasFallback(fallback) });
    }
  }
  const relevant = (item) => mapping.some(({ id, fallback = null }) => item.id === id || (fallback !== null && matchesFallback(item, fallback)));
  return { available: all ? available : available.filter(relevant), unusable, missing };
}
