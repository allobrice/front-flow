import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { makeRepo, runFF } from './helpers.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

test('set puis get', () => {
  const repo = makeRepo();
  assert.equal(runFF(repo, 'state', 'set', 'WEBFRONT-1', 'phase=plan', 'ct.verdict=engagé').code, 0);
  const r = runFF(repo, 'state', 'get', 'WEBFRONT-1');
  assert.equal(r.code, 0);
  const s = JSON.parse(r.stdout);
  assert.equal(s.key, 'WEBFRONT-1');
  assert.equal(s.phase, 'plan');
  assert.deepEqual(s.ct, { verdict: 'engagé' });
  assert.ok(s.updated_at);
});

test('set parse le JSON quand possible et fusionne en profondeur', () => {
  const repo = makeRepo();
  runFF(repo, 'state', 'set', 'WEBFRONT-1', 'ct.verdict=engagé', 'flags=["a","b"]');
  runFF(repo, 'state', 'set', 'WEBFRONT-1', 'ct.source=notion');
  const s = JSON.parse(runFF(repo, 'state', 'get', 'WEBFRONT-1').stdout);
  assert.deepEqual(s.ct, { verdict: 'engagé', source: 'notion' });
  assert.deepEqual(s.flags, ['a', 'b']);
});

test('get absent', () => {
  const r = runFF(makeRepo(), 'state', 'get', 'WEBFRONT-9');
  assert.equal(r.code, 2);
});

test('phase invalide', () => {
  const r = runFF(makeRepo(), 'state', 'set', 'WEBFRONT-1', 'phase=foo');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /phase/);
});

test('JSON corrompu', () => {
  const repo = makeRepo();
  const path = runFF(repo, 'state', 'path', 'WEBFRONT-1').stdout.trim();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '{');
  const r = runFF(repo, 'state', 'get', 'WEBFRONT-1');
  assert.equal(r.code, 1);
  assert.ok(r.stderr.includes(path));
  assert.equal(readFileSync(path, 'utf8'), '{');
  assert.equal(runFF(repo, 'state', 'set', 'WEBFRONT-1', 'phase=plan').code, 1);
  assert.equal(readFileSync(path, 'utf8'), '{');
});

test('worktree partagé', () => {
  const repo = makeRepo();
  const wt = join(repo, '..', `wt-${Date.now()}`);
  git(repo, 'worktree', 'add', wt, '-b', 'feature/WEBFRONT-2');
  const wtReal = realpathSync(wt);
  assert.equal(runFF(wtReal, 'state', 'set', 'WEBFRONT-2', 'phase=implement').code, 0);
  const fromRepo = runFF(repo, 'state', 'get', 'WEBFRONT-2');
  const fromWt = runFF(wtReal, 'state', 'get', 'WEBFRONT-2');
  assert.equal(fromRepo.code, 0);
  assert.equal(fromRepo.stdout, fromWt.stdout);
  assert.equal(
    runFF(repo, 'state', 'path', 'WEBFRONT-2').stdout,
    runFF(wtReal, 'state', 'path', 'WEBFRONT-2').stdout,
  );
});

test('list', () => {
  const repo = makeRepo();
  runFF(repo, 'state', 'set', 'WEBFRONT-1', 'phase=plan');
  runFF(repo, 'state', 'set', 'WEBFRONT-2', 'phase=done');
  runFF(repo, 'state', 'set', 'WEBFRONT-3', 'phase=review');
  const r = runFF(repo, 'state', 'list');
  assert.equal(r.code, 0);
  const l = JSON.parse(r.stdout);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((e) => e.key), ['WEBFRONT-3', 'WEBFRONT-1']);
  assert.deepEqual(Object.keys(l[0]).sort(), ['branch', 'key', 'phase', 'updated_at', 'worktree']);
});

test('current', () => {
  const repo = makeRepo();
  assert.equal(runFF(repo, 'state', 'current').code, 2);
  git(repo, 'checkout', '-q', '-b', 'feature/WEBFRONT-2-truc');
  const r = runFF(repo, 'state', 'current');
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), 'WEBFRONT-2');
});

test('current : branche en minuscules avec état → clé en majuscules', () => {
  const repo = makeRepo();
  assert.equal(runFF(repo, 'state', 'set', 'WEBFRONT-1404', 'phase=context').code, 0);
  git(repo, 'checkout', '-q', '-b', 'feature/webfront-1404-onglet-page-introuvable');
  const r = runFF(repo, 'state', 'current');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'WEBFRONT-1404');
});

test('current : minuscules sans état → pas de fausse clé (lot-1, back-1249)', () => {
  const repo = makeRepo();
  git(repo, 'checkout', '-q', '-b', 'feature/refonte-avis-lot-1-back-1249');
  assert.equal(runFF(repo, 'state', 'current').code, 2);
});
