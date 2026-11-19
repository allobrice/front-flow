import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FF = join(dirname(fileURLToPath(import.meta.url)), '..', 'ff.mjs');

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });

/** Repo git temporaire avec un commit sur `develop`. `withOrigin` ajoute un remote bare `origin`. */
export function makeRepo({ withOrigin = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ff-repo-')));
  run(dir, 'init', '-q', '-b', 'develop');
  run(dir, 'config', 'user.name', 'Test');
  run(dir, 'config', 'user.email', 'test@example.com');
  run(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
  if (withOrigin) {
    const origin = realpathSync(mkdtempSync(join(tmpdir(), 'ff-origin-')));
    run(origin, 'init', '-q', '--bare', '-b', 'develop');
    run(dir, 'remote', 'add', 'origin', origin);
    run(dir, 'push', '-q', 'origin', 'develop');
  }
  return dir;
}

export function runFF(cwd, ...args) {
  const r = spawnSync(process.execPath, [FF, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
