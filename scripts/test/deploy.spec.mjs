import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runFF } from './helpers.mjs';
import { waitDeploy } from '../lib/deploy.mjs';

const SHA = 'abcdef1234567';
const resp = (body) => ({ text: async () => body });
const noSleep = async () => {};

test('waitDeploy : prêt au 2e appel', async () => {
  let n = 0;
  const fetchImpl = async () => resp(++n < 2 ? 'build 0000000' : 'build abcdef1');
  const r = await waitDeploy({ sha: SHA, check: { url: 'http://x' }, intervalSec: 0, fetchImpl, sleep: noSleep });
  assert.equal(r, 'ready');
  assert.equal(n, 2);
});

test('waitDeploy : jamais prêt → timeout (un seul contrôle si timeoutSec 0)', async () => {
  let n = 0;
  const fetchImpl = async () => (n++, resp('rien'));
  const r = await waitDeploy({ sha: SHA, check: { url: 'http://x' }, timeoutSec: 0, intervalSec: 0, fetchImpl, sleep: noSleep });
  assert.equal(r, 'timeout');
  assert.equal(n, 1);
});

test('waitDeploy : une erreur réseau compte comme « pas prêt »', async () => {
  let n = 0;
  const fetchImpl = async () => {
    if (++n === 1) throw new Error('ECONNRESET');
    return resp(SHA);
  };
  const r = await waitDeploy({ sha: SHA, check: { url: 'http://x' }, intervalSec: 0, fetchImpl, sleep: noSleep });
  assert.equal(r, 'ready');
});

test('CLI wait-deploy sans recetteReadyCheck → exit 2', () => {
  const r = runFF(makeRepo(), 'wait-deploy', '--sha', SHA);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /recetteReadyCheck non configuré : confirme manuellement que l'environnement est à jour/);
});

test('CLI wait-deploy : timeout → exit 1', () => {
  const repo = makeRepo();
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'front-flow.json'), JSON.stringify({ recetteReadyCheck: { url: 'http://127.0.0.1:1/' } }));
  const r = runFF(repo, 'wait-deploy', '--sha', SHA, '--timeout', '0');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Déploiement non détecté/);
});
