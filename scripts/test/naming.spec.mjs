import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify, branchSlug, names } from '../lib/naming.mjs';
import { makeRepo, runFF } from './helpers.mjs';

const ILOKYOU = { branch: 'feature/{key}-{slug}', recetteUrl: 'https://{branchSlug}.feature.allovoisins.com' };
const TITLE_1404 = 'Onglet "page introuvable" sur la page Espace Presse';

test('slugify : accents, ponctuation, mots vides, 3 mots', () => {
  assert.equal(slugify(TITLE_1404), 'onglet-page-introuvable');
  assert.equal(slugify('Bug affichage messagerie quand je répond à une demande'), 'bug-affichage-messagerie');
  assert.equal(slugify('Widgets d’auth : migrer les clés Loco'), 'widgets-auth-migrer');
  assert.equal(slugify(''), '');
});

test('branchSlug : dernier segment en minuscules', () => {
  assert.equal(branchSlug('feature/WEBFRONT-1404-onglet'), 'webfront-1404-onglet');
});

test('names : convention ILokYou-Site (branche et URL de l\'env feature)', () => {
  assert.deepEqual(names(ILOKYOU, 'WEBFRONT-1404', { title: TITLE_1404 }), {
    branch: 'feature/webfront-1404-onglet-page-introuvable',
    recetteUrl: 'https://webfront-1404-onglet-page-introuvable.feature.allovoisins.com',
  });
});

test('names : défaut feature/{KEY}, sans recetteUrl', () => {
  assert.deepEqual(names({}, 'WEBFRONT-7', { title: 'x' }), { branch: 'feature/WEBFRONT-7', recetteUrl: null });
});

test('names : titre vide → pas de tiret orphelin', () => {
  assert.equal(names(ILOKYOU, 'WEBFRONT-1', { title: '' }).branch, 'feature/webfront-1');
});

test('names : branche saisie par le dev → URL recalculée', () => {
  const r = names(ILOKYOU, 'WEBFRONT-1404', { branch: 'feature/WEBFRONT-1404-titre-onglet' });
  assert.deepEqual(r, { branch: 'feature/WEBFRONT-1404-titre-onglet', recetteUrl: 'https://webfront-1404-titre-onglet.feature.allovoisins.com' });
});

test('names : label DNS tronqué à 63 caractères, sans tiret final', () => {
  const r = names({ branch: 'feature/{key}-{slug}-abcdefghijklmnopqrstuvwxyz-abcdefghijklmnopqrstuvwxyz' }, 'WEBFRONT-1', { title: 'mot' });
  const label = branchSlug(r.branch);
  assert.ok(label.length <= 63, label);
  assert.ok(!label.endsWith('-'));
  assert.ok(r.branch.startsWith('feature/webfront-1-mot-'));
});

test('names : jeton inconnu → erreur explicite', () => {
  assert.throws(() => names({ branch: 'feature/{ticket}' }, 'WEBFRONT-1'), /Jeton « \{ticket\} » inconnu/);
});

test('CLI names : lit la config du dépôt, clé en minuscules acceptée', () => {
  const repo = makeRepo();
  mkdirSync(join(repo, '.claude'));
  writeFileSync(join(repo, '.claude', 'front-flow.json'), JSON.stringify(ILOKYOU));
  const r = runFF(repo, 'names', 'webfront-1404', '--title', TITLE_1404);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).branch, 'feature/webfront-1404-onglet-page-introuvable');
});
