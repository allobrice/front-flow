import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../lib/frontmatter.mjs';

const SKILLS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');
const REFS = join(SKILLS, 'ff-shared', 'references');
const CLI_COMMANDS = ['state', 'config', 'resolve-target', 'detect-base', 'inventory', 'commit', 'wait-deploy'];
const PHASE_SKILLS = ['ff-context', 'ff-plan', 'ff-implement', 'ff-pr', 'ff-review', 'ff-recette'];
const ASCII_ACCENTS = /\b(etat|creer|deja|recupere)\b/i;

const read = (file) => readFileSync(file, 'utf8');

/** Skills présentes (hors ff-shared) : les sous-skills de phase peuvent ne pas exister encore. */
const skillDirs = () =>
  existsSync(SKILLS)
    ? readdirSync(SKILLS, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'ff-shared' && existsSync(join(SKILLS, e.name, 'SKILL.md')))
        .map((e) => e.name)
    : [];

const refFiles = () => (existsSync(REFS) ? readdirSync(REFS).filter((f) => f.endsWith('.md')) : []);

/** Tous les textes contrôlés : SKILL.md et références partagées. */
const documents = () => [
  ...skillDirs().map((d) => ({ label: `skills/${d}/SKILL.md`, text: read(join(SKILLS, d, 'SKILL.md')) })),
  ...refFiles().map((f) => ({ label: `references/${f}`, text: read(join(REFS, f)) })),
];

test('orchestrateur, setup et références partagées présents', () => {
  for (const d of ['front-flow', 'setup']) assert.ok(existsSync(join(SKILLS, d, 'SKILL.md')), `skills/${d}/SKILL.md manquant`);
  for (const f of ['state.md', 'config.md', 'ct-read.md', 'gates.md']) assert.ok(existsSync(join(REFS, f)), `références/${f} manquant`);
});

test('frontmatter : name = dossier, description non vide ; ff-* non invocables', () => {
  for (const d of skillDirs()) {
    const fm = parseFrontmatter(read(join(SKILLS, d, 'SKILL.md')));
    assert.equal(fm.name, d, `${d} : name`);
    assert.ok(typeof fm.description === 'string' && fm.description.trim(), `${d} : description vide`);
    if (d.startsWith('ff-')) assert.equal(fm['user-invocable'], false, `${d} : user-invocable: false attendu`);
  }
});

test('longueur : ≤ 80 lignes, ≤ 150 pour l\'orchestrateur', () => {
  for (const d of skillDirs()) {
    const lines = read(join(SKILLS, d, 'SKILL.md')).trimEnd().split('\n').length;
    const max = d === 'front-flow' ? 150 : 80;
    assert.ok(lines <= max, `${d} : ${lines} lignes (max ${max})`);
  }
});

test('références citées existantes sous ff-shared/references', () => {
  for (const { label, text } of documents()) {
    for (const [, ref] of text.matchAll(/references\/([\w.-]+\.md)/g)) {
      assert.ok(existsSync(join(REFS, ref)), `${label} cite references/${ref}, introuvable`);
    }
  }
});

test('sous-commandes ff.mjs citées connues', () => {
  for (const { label, text } of documents()) {
    // Forme complète (`ff.mjs" <cmd>`) et abrégée des références (`ff <cmd>`).
    for (const [, cmd] of text.matchAll(/(?:ff\.mjs"?|`ff)\s+([a-z][a-z-]*)/g)) {
      assert.ok(CLI_COMMANDS.includes(cmd), `${label} : sous-commande ff.mjs « ${cmd} » inconnue`);
    }
  }
});

test('l\'orchestrateur route vers les six sous-skills de phase', () => {
  const text = read(join(SKILLS, 'front-flow', 'SKILL.md'));
  for (const s of PHASE_SKILLS) assert.ok(text.includes(`front-flow:${s}`), `front-flow:${s} non cité`);
});

test('pas de mots courants privés de leurs accents', () => {
  for (const { label, text } of documents()) {
    const m = text.match(ASCII_ACCENTS);
    assert.equal(m, null, `${label} : « ${m?.[0]} » sans accent`);
  }
});
