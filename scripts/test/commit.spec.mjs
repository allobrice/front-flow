import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeRepo, runFF } from './helpers.mjs';
import { runCommit } from './../lib/commit.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' });
const DESC = 'corrige "x" $(touch pwned) `id` — été';

test('commit : description hostile passée telle quelle, aucune exécution', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, 'X.vue'), 'a');
  git(repo, 'add', 'X.vue');
  const r = runFF(repo, 'commit', '--emoji', '✨', '--files', 'X.vue', '--desc', DESC);
  assert.equal(r.code, 0, r.stderr);
  const { sha } = JSON.parse(r.stdout);
  assert.equal(sha, git(repo, 'rev-parse', '--short', 'HEAD').trim());
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), `✨ ${DESC}`);
  assert.equal(existsSync(join(repo, 'pwned')), false);
});

test('commit : index vide → exit 1, erreur de git relayée', () => {
  const repo = makeRepo();
  const r = runFF(repo, 'commit', '--emoji', '✨', '--files', 'X.vue', '--desc', 'rien');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Commit impossible/);
  assert.match(r.stderr, /nothing to commit|rien à valider|no changes/i);
});

test('runCommit : une valeur contenant {desc} n\'est pas réexpansée', () => {
  const repo = makeRepo();
  writeFileSync(join(repo, 'X.vue'), 'a');
  git(repo, 'add', 'X.vue');
  runCommit(repo, { emoji: '{desc}', files: 'X.vue', desc: 'vrai' });
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), '{desc} vrai');
});

/** Dépôt avec un gabarit de commit qui écrit `<template>` dans le message (git commit -m). */
function repoWithTemplate(message) {
  const repo = makeRepo();
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'front-flow.json'), JSON.stringify({ commit: ['git', 'commit', '-m', message] }));
  writeFileSync(join(repo, 'X.vue'), 'a');
  git(repo, 'add', 'X.vue');
  return repo;
}
const subject = (repo) => git(repo, 'log', '-1', '--format=%s').trim();

test('commit : {KEY} en majuscules et {key} en minuscules, depuis --key en minuscules', () => {
  const repo = repoWithTemplate('{emoji}({KEY}): {desc} [{key}]');
  const r = runFF(repo, 'commit', '--emoji', '🐛', '--files', 'X', '--desc', 'titre', '--key', 'webfront-1404');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(subject(repo), '🐛(WEBFRONT-1404): titre [webfront-1404]');
});

test('commit : gabarit avec {KEY} sans --key → exit 1, message clair, aucun commit', () => {
  const repo = repoWithTemplate('{emoji}({KEY}): {desc}');
  const r = runFF(repo, 'commit', '--emoji', '🐛', '--files', 'X', '--desc', 'titre');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /utilise \{KEY\} ou \{key\} : passer --key <KEY>/);
  assert.equal(subject(repo), 'init');
});

test('commit : clé invalide → exit 1', () => {
  const repo = repoWithTemplate('({KEY}) {desc}');
  const r = runFF(repo, 'commit', '--emoji', 'x', '--files', 'X', '--desc', 'd', '--key', 'pas une clé');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Clé de ticket « pas une clé » invalide/);
});

test('commit : gabarit sans jeton de clé → --key facultatif et ignoré', () => {
  const repo = repoWithTemplate('{emoji} {desc}');
  const r = runFF(repo, 'commit', '--emoji', '✨', '--files', 'X', '--desc', 'd', '--key', 'WEBFRONT-1');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(subject(repo), '✨ d');
});

test('runCommit : accents et guillemets conservés, valeurs contenant {KEY} non réexpansées', () => {
  const repo = repoWithTemplate('{emoji}({KEY}): {desc}');
  runCommit(repo, { emoji: '{key}', files: 'X', desc: 'Onglet « page introuvable » "corrigé" {KEY} — été', key: 'WEBFRONT-1404' });
  assert.equal(subject(repo), '{key}(WEBFRONT-1404): Onglet « page introuvable » "corrigé" {KEY} — été');
});
