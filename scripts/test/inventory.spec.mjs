import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, symlinkSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFrontmatter } from '../lib/frontmatter.mjs';
import { inventory } from '../lib/inventory.mjs';
import { makeRepo, runFF } from './helpers.mjs';

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'ff-inv-')));
const put = (file, content) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
};
const skill = (home, dir, fm) => put(join(home, 'skills', dir, 'SKILL.md'), `---\n${fm}\n---\n# corps\n`);

test('parseFrontmatter : booléens, guillemets, description > multiligne', () => {
  const fm = parseFrontmatter('---\nname: "x"\ndisable-model-invocation: true\nflag: false\ndescription: >\n  ligne un\n  ligne deux\nother: v\n---\ncorps\n');
  assert.equal(fm.name, 'x');
  assert.equal(fm['disable-model-invocation'], true);
  assert.equal(fm.flag, false);
  assert.equal(fm.description, 'ligne un ligne deux');
  assert.equal(fm.other, 'v');
  assert.deepEqual(parseFrontmatter('pas de frontmatter'), {});
});

test('skill disable-model-invocation: true → unusable, absent de available', () => {
  const home = tmp();
  skill(home, 'reviewing-code', 'name: reviewing-code\ndisable-model-invocation: true');
  const inv = inventory(makeRepo(), { claudeHome: home });
  assert.deepEqual(inv.unusable, [{ id: 'reviewing-code', kind: 'skill', source: 'user' }]);
  assert.ok(!inv.available.some((i) => i.id === 'reviewing-code'));
  assert.ok(inv.missing.some((m) => m.id === 'reviewing-code'));
});

test('skill disable-model-invocation: false → available', () => {
  const home = tmp();
  skill(home, 'reviewing-code', 'name: reviewing-code\ndisable-model-invocation: false');
  const inv = inventory(makeRepo(), { claudeHome: home });
  assert.deepEqual(inv.available, [{ id: 'reviewing-code', kind: 'skill', source: 'user' }]);
  assert.deepEqual(inv.unusable, []);
  assert.ok(!inv.missing.some((m) => m.id === 'reviewing-code'));
});

test('plugin web-front : vue-developer manquant mais repli disponible', () => {
  const home = tmp();
  const plugin = join(tmp(), 'web-front');
  put(join(plugin, 'agents', 'vue-developer.md'), '---\nname: vue-developer\n---\n');
  put(
    join(home, 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'web-front@market': [
          { scope: 'user', installPath: '/chemin/inexistant', version: '9', lastUpdated: '2030-01-01T00:00:00Z' },
          { scope: 'user', installPath: plugin, version: '1', lastUpdated: '2026-01-01T00:00:00Z' },
        ],
      },
    }),
  );
  const inv = inventory(makeRepo(), { claudeHome: home });
  assert.ok(inv.available.some((i) => i.id === 'web-front:vue-developer' && i.source === 'plugin'));
  assert.deepEqual(
    inv.missing.find((m) => m.id === 'vue-developer'),
    { id: 'vue-developer', phase: 'implement', fallback: 'web-front:vue-developer', fallbackAvailable: true },
  );
  assert.equal(inv.missing.find((m) => m.id === 'typescript-pro').fallbackAvailable, false);
});

test('repli sans préfixe : plugin code-review:code-review satisfait « code-review »', () => {
  const home = tmp();
  const plugin = tmp();
  put(join(plugin, 'skills', 'code-review', 'SKILL.md'), '---\nname: code-review\n---\n');
  put(join(home, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'code-review@m': [{ installPath: plugin }] } }));
  const inv = inventory(makeRepo(), { claudeHome: home });
  assert.equal(inv.missing.find((m) => m.id === 'reviewing-code').fallbackAvailable, true);
});

test('installed_plugins.json absent → pas d\'erreur', () => {
  const inv = inventory(makeRepo(), { claudeHome: tmp() });
  assert.deepEqual(inv.available, []);
  assert.ok(inv.missing.length > 0);
});

test('sources repo, tri par id, mapping du repo remplaçant une phase', () => {
  const home = tmp();
  skill(home, 'zeta', 'name: zeta');
  const repo = makeRepo();
  put(join(repo, '.claude', 'agents', 'alpha.md'), '---\ndescription: x\n---\n');
  put(join(repo, '.claude', 'front-flow.json'), JSON.stringify({ mapping: { review: [{ id: 'custom-review', kind: 'skill', fallback: null }] } }));
  const inv = inventory(repo, { claudeHome: home });
  assert.deepEqual(inv.available.map((i) => `${i.id}:${i.source}`), ['alpha:repo', 'zeta:user']);
  assert.ok(inv.missing.some((m) => m.id === 'custom-review' && m.phase === 'review'));
  assert.ok(!inv.missing.some((m) => m.id === 'reviewing-code'));
  assert.ok(inv.missing.some((m) => m.id === 'vue-developer'));
});

test('hors dépôt git : fonctionne (sources repo ignorées)', () => {
  const home = tmp();
  skill(home, 'zeta', 'name: zeta');
  const inv = inventory(tmp(), { claudeHome: home });
  assert.deepEqual(inv.available.map((i) => i.id), ['zeta']);
});

test('CLI ff.mjs inventory lit FF_CLAUDE_HOME', () => {
  const home = tmp();
  skill(home, 'zeta', 'name: zeta');
  process.env.FF_CLAUDE_HOME = home;
  try {
    const r = runFF(makeRepo(), 'inventory');
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).available.map((i) => i.id), ['zeta']);
  } finally {
    delete process.env.FF_CLAUDE_HOME;
  }
});

test('config repo corrompue → erreur avec le chemin (CLI exit 1)', () => {
  const repo = makeRepo();
  put(join(repo, '.claude', 'front-flow.json'), '{ pas du json');
  assert.throws(() => inventory(repo, { claudeHome: tmp() }), /front-flow\.json/);
  process.env.FF_CLAUDE_HOME = tmp();
  try {
    const r = runFF(repo, 'inventory');
    assert.equal(r.code, 1);
    assert.match(r.stderr, /front-flow\.json/);
  } finally {
    delete process.env.FF_CLAUDE_HOME;
  }
});

test('skill et agent installés en lien symbolique sont suivis ; lien cassé ignoré', () => {
  const home = tmp();
  const store = tmp();
  put(join(store, 'real-skill', 'SKILL.md'), '---\nname: linked-skill\n---\n');
  put(join(store, 'linked-agent.md'), '---\nname: linked-agent\n---\n');
  mkdirSync(join(home, 'skills'), { recursive: true });
  mkdirSync(join(home, 'agents'), { recursive: true });
  symlinkSync(join(store, 'real-skill'), join(home, 'skills', 'linked-skill'));
  symlinkSync(join(store, 'linked-agent.md'), join(home, 'agents', 'linked-agent.md'));
  symlinkSync(join(store, 'nope'), join(home, 'skills', 'broken'));
  symlinkSync(join(store, 'nope.md'), join(home, 'agents', 'broken.md'));
  const inv = inventory(makeRepo(), { claudeHome: home });
  assert.deepEqual(inv.available.map((i) => `${i.kind}:${i.id}`), ['agent:linked-agent', 'skill:linked-skill']);
});
