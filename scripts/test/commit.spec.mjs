import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
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
