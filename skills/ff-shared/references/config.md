# Config par dépôt

Fichier `.claude/front-flow.json` à la racine du **checkout principal** du dépôt (même lancé
depuis un worktree : la config y est souvent ignorée par git), fusionné en profondeur avec les
défauts du plugin (`defaults/config.json`) : les objets se fusionnent, les tableaux et scalaires
du dépôt remplacent ceux des défauts.

Lecture : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get` → `{ "config": {…}, "configured": true|false, "root": "<checkout principal>" }`
(exit 0). `root` : où lire et écrire `.claude/front-flow.json` et où créer les worktrees.
`configured: false` : pas de fichier, défauts seuls ; proposer `/front-flow:setup`.
Exit 1 : hors dépôt git, fichier JSON invalide, ou `commit` qui n'est pas un tableau non vide de
chaînes (chemin du fichier cité).

## Clés

| Clé | Type | Rôle | Défaut |
|---|---|---|---|
| `verify` | chaîne ou `null` | commande lancée (outil Bash, depuis la racine du worktree) jusqu'au vert après chaque lot de modifications | `null` : aucune vérification ; le signaler |
| `commit` | tableau argv non vide de chaînes | gabarit de commit lancé sans shell par `ff.mjs commit` ; jetons `{emoji}`, `{files}`, `{desc}`, `{KEY}` (clé en majuscules), `{key}` (minuscules) — les deux derniers exigent `--key` | `["git","commit","-m","{emoji} {desc}"]` |
| `worktreesDir` | chaîne | dossier des worktrees, **relatif** et à l'intérieur du dépôt (ni chemin absolu ni `..`) ; worktree = `<root>/<worktreesDir>/<KEY>` | `".worktrees"` |
| `branch` | chaîne | gabarit de la branche de travail ; jetons `{KEY}` (clé en majuscules), `{key}` (minuscules), `{slug}` (3 mots du résumé Jira, sans accents ni mots vides) ; `{KEY}` ou `{key}` obligatoire | `"feature/{KEY}"` |
| `recetteUrl` | chaîne ou `null` | URL de l'environnement de recette déployé ; jeton `{branchSlug}` = dernier segment de la branche en minuscules, tronqué à 63 caractères | `null` |
| `recetteReadyCheck` | `{ "url": … }`, `{ "workflow": … }` ou `null` | `url` : page qui expose le SHA déployé, interrogée jusqu'à y trouver ses 7 premiers caractères ; `workflow` : fichier GitHub Actions de déploiement, dont `ff.mjs wait-deploy` suit le run du SHA poussé sur la branche courante (`gh run list`) | `null` : le dev confirme en une ligne que l'env est à jour |
| `defaultFlags` | tableau | flags de `reviewing-code` proposés au démarrage (`-seo`, `-perf`, `-archi`, `-a11y`) | `[]` |
| `jiraTransitions` | booléen | transitions Jira (« En relecture » à la création de PR, l'état qui suit la recette à « Accepté ») : nommées dans la gate concernée, appliquées après accord à la gate | `false` |
| `mapping` | objet, facultatif | remplace, phase par phase, la liste d'agents/skills de `defaults/mapping.json` : `{ "<phase>": [{ "id", "kind": "agent"\|"skill", "fallback" }] }` | absent |

## Commandes liées

- `ff.mjs commit --key <KEY> --emoji <e> --files <f> --desc <d>` : remplit le gabarit ; `--key`
  est obligatoire si le gabarit utilise `{KEY}` ou `{key}` (exit 1 sinon, jamais de valeur vide),
  et toujours passé par les sous-skills ; commite **l'index
  tel quel** (le script ne fait jamais `git add` : indexer d'abord, fichier par fichier, jamais
  `git add -A`) ; sortie `{ "sha": "<court>" }`, exit 1 avec l'erreur du gabarit sinon. Les
  valeurs passent telles quelles en argv (guillemets, `$(…)`, accents sans risque). `{files}` est
  le segment « fichiers/composants » du message (`SearchPost`), pas une liste de chemins.
- `ff.mjs names <KEY> [--title <résumé>] [--branch <nom>]` : `{ "branch", "recetteUrl" }` à
  partir des gabarits ; `--branch` impose le nom et ne recalcule que l'URL.
- `ff.mjs wait-deploy --sha <sha> [--timeout <s>]` (défaut 900 s, sondage toutes les 15 s) :
  exit 0 `{ "status": "ready" }` ; exit 2 si `recetteReadyCheck` n'est pas configuré, ou (mode
  `workflow`) si aucun run n'apparaît pour ce SHA en 2 min — push filtré par le workflow, docs
  seules par exemple : demander alors la confirmation manuelle ; exit 1 au délai dépassé ou si
  le run de déploiement échoue (URL du run citée).

## Exemples

ILokYou-Site :

```json
{
  "verify": "scripts/verify.sh",
  "commit": ["node", "scripts/commit.mjs", "-e", "{emoji}", "-t", "{KEY}", "-f", "{files}", "-d", "{desc}"],
  "worktreesDir": ".worktrees",
  "branch": "feature/{key}-{slug}",
  "recetteUrl": "https://{branchSlug}.feature.allovoisins.com",
  "recetteReadyCheck": { "workflow": "deploy-features.yml" },
  "defaultFlags": [],
  "jiraTransitions": false
}
```

Dépôt sans config (défauts du plugin) :

```json
{
  "verify": null,
  "commit": ["git", "commit", "-m", "{emoji} {desc}"],
  "worktreesDir": ".worktrees",
  "branch": "feature/{KEY}",
  "recetteUrl": null,
  "recetteReadyCheck": null,
  "defaultFlags": [],
  "jiraTransitions": false
}
```

Dépôt sans `scripts/verify.sh` (Front-Disconnected) : `verify` composé des scripts
`package.json` présents, par exemple `"npm run lint && npm run typecheck && npm run test"`.
