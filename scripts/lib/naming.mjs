// Nom de la branche de travail et URL de recette, à partir des gabarits de la config.

/** Mots vides retirés du slug (titres Jira en français). */
const STOPWORDS = new Set([
  'a', 'au', 'aux', 'avec', 'ce', 'ces', 'dans', 'de', 'des', 'du', 'en', 'est', 'et', 'il', 'je',
  'l', 'la', 'le', 'les', 'leur', 'ma', 'mes', 'mon', 'ne', 'ou', 'par', 'pas', 'pour', 'qu', 'que',
  'qui', 'quand', 'sa', 'se', 'ses', 'son', 'sur', 'un', 'une', 'vers', 'd', 'j', 'n', 's', 't',
]);
export const SLUG_WORDS = 3;
const LABEL_MAX = 63; // longueur maximale d'un label DNS (sous-domaine de l'env feature)

/** Titre libre → `mot-mot-mot` : sans accents, minuscules, mots vides retirés, `maxWords` mots. */
export function slugify(title, maxWords = SLUG_WORDS) {
  const words = String(title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return words.slice(0, maxWords).join('-');
}

/** Dernier segment de la branche, en minuscules : `feature/WEBFRONT-1-x` → `webfront-1-x`. */
export const branchSlug = (branch) => String(branch).split('/').at(-1).toLowerCase();

/** Remplace les jetons `{nom}` connus ; un jeton inconnu est une erreur de config. */
function fill(template, values, what) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`Jeton « {${name}} » inconnu dans ${what} (${Object.keys(values).map((k) => `{${k}}`).join(', ')}).`);
    return values[name];
  });
}

/**
 * Branche de travail (gabarit `config.branch`, jetons `{KEY}`, `{key}`, `{slug}`) et URL de
 * recette (gabarit `config.recetteUrl`, jeton `{branchSlug}`). `branch` explicite : utilisé tel
 * quel. Le label `{branchSlug}` est tronqué à 63 caractères (limite DNS), sans tiret final.
 */
export function names(config, key, { title = '', branch = null } = {}) {
  let name = branch;
  if (!name) {
    const template = config.branch ?? 'feature/{KEY}';
    name = fill(template, { KEY: key.toUpperCase(), key: key.toLowerCase(), slug: slugify(title) }, 'la clé « branch »');
    name = name.replace(/-+$/, '').replace(/-+(?=\/|$)/g, ''); // slug vide : pas de tiret orphelin
    const label = branchSlug(name);
    if (label.length > LABEL_MAX) name = name.slice(0, name.length - label.length) + label.slice(0, LABEL_MAX).replace(/-+$/, '');
  }
  const recetteUrl = config.recetteUrl ? fill(config.recetteUrl, { branchSlug: branchSlug(name) }, 'la clé « recetteUrl »') : null;
  return { branch: name, recetteUrl };
}
