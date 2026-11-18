import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRepo, runFF } from './helpers.mjs';

const writeCfg = (repo, text) => {
  mkdirSync(join(repo, '.claude'), { recursive: true });
  writeFileSync(join(repo, '.claude', 'front-flow.json'), text);
};

test('sans fichier : défauts, configured false', () => {
  const r = runFF(makeRepo(), 'config', 'get');
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.configured, false);
  assert.equal(out.config.worktreesDir, '.worktrees');
  assert.equal(out.config.jiraTransitions, false);
  assert.deepEqual(out.config.commit, ['git', 'commit', '-m', '{emoji} {desc}']);
});

test('fichier : surcharge, défauts conservés, depuis un sous-dossier', () => {
  const repo = makeRepo();
  writeCfg(repo, '{"verify":"scripts/verify.sh","defaultFlags":["-a11y"],"mapping":{"plan":{"agent":"x"}}}');
  mkdirSync(join(repo, 'sub'));
  const r = runFF(join(repo, 'sub'), 'config', 'get');
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.configured, true);
  assert.equal(out.config.verify, 'scripts/verify.sh');
  assert.deepEqual(out.config.defaultFlags, ['-a11y']);
  assert.deepEqual(out.config.commit, ['git', 'commit', '-m', '{emoji} {desc}']);
  assert.deepEqual(out.config.mapping, { plan: { agent: 'x' } });
});

test('JSON invalide : exit 1 et nom du fichier', () => {
  const repo = makeRepo();
  writeCfg(repo, '{oops');
  const r = runFF(repo, 'config', 'get');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /front-flow\.json/);
});

test('hors dépôt git : exit 1 en français', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ff-nogit-')));
  const r = runFF(dir, 'config', 'get');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /dépôt git/);
});

const target = (arg) => runFF(makeRepo(), 'resolve-target', arg);

test('resolve-target : clé seule', () => {
  assert.deepEqual(JSON.parse(target('WEBFRONT-123').stdout), { key: 'WEBFRONT-123', jiraUrl: null, notionUrl: null });
});

test('resolve-target : URL Jira browse', () => {
  const u = 'https://allovoisins.atlassian.net/browse/WEBFRONT-45';
  assert.deepEqual(JSON.parse(target(u).stdout), { key: 'WEBFRONT-45', jiraUrl: u, notionUrl: null });
});

test('resolve-target : URL Jira board selectedIssue', () => {
  const u = 'https://allovoisins.atlassian.net/jira/software/projects/WEBFRONT/boards/1?selectedIssue=WEBFRONT-46';
  assert.deepEqual(JSON.parse(target(u).stdout), { key: 'WEBFRONT-46', jiraUrl: u, notionUrl: null });
});

test('resolve-target : URL Notion sans clé', () => {
  const u = 'https://www.notion.so/allovoisins/Feature-abc123';
  assert.deepEqual(JSON.parse(target(u).stdout), { key: null, jiraUrl: null, notionUrl: u });
});

test('resolve-target : notion.site accepté', () => {
  const u = 'https://acme.notion.site/Feature-abc123';
  assert.equal(JSON.parse(target(u).stdout).notionUrl, u);
});

test('resolve-target : n\'importe quoi → exit 1', () => {
  const r = target("n'importe quoi");
  assert.equal(r.code, 1);
  assert.match(r.stderr, /ticket|cible/i);
});
