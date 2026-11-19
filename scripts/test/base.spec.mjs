import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeRepo, runFF } from './helpers.mjs';

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();

/** Crée release/<v> sur origin puis revient sur develop. */
function pushRelease(repo, v) {
  git(repo, 'checkout', '-q', '-b', `release/${v}`);
  git(repo, 'push', '-q', 'origin', `release/${v}`);
  git(repo, 'checkout', '-q', 'develop');
}

test('--fix-version présent sur origin → release/<v>', () => {
  const repo = makeRepo({ withOrigin: true });
  pushRelease(repo, '2026.11');
  const r = runFF(repo, 'detect-base', '--fix-version', '2026.11');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'release/2026.11\n');
});

test('--fix-version absent sur origin → branche courante', () => {
  const repo = makeRepo({ withOrigin: true });
  const r = runFF(repo, 'detect-base', '--fix-version', '2026.12');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'develop\n');
});

test('sans --fix-version, --start est utilisé tel quel', () => {
  const repo = makeRepo({ withOrigin: true });
  const r = runFF(repo, 'detect-base', '--start', 'feature/x');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'feature/x\n');
});

test('sans origin, ls-remote échoue : repli sur --start sans planter', () => {
  const repo = makeRepo();
  const r = runFF(repo, 'detect-base', '--fix-version', '2026.11', '--start', 'feature/x');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'feature/x\n');
});

test('--fix-version malveillant : pas d\'injection, repli sur la branche courante', () => {
  const repo = makeRepo({ withOrigin: true });
  const r = runFF(repo, 'detect-base', '--fix-version', '2026.11 hotfix; touch pwned');
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'develop\n');
  assert.equal(existsSync(join(repo, 'pwned')), false);
});

test('option inconnue ou sans valeur → erreur', () => {
  const repo = makeRepo({ withOrigin: true });
  const r = runFF(repo, 'detect-base', '--fix-version');
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--fix-version/);
});
