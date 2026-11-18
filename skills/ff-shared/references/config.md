# Config par dépôt

Fichier `.claude/front-flow.json` à la racine du dépôt, fusionné en profondeur avec les défauts du
plugin (`defaults/config.json`) : les objets se fusionnent, les tableaux et scalaires du dépôt
remplacent ceux des défauts.

Lecture : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get` → `{ "config": {…}, "configured": true|false }`
(exit 0). `configured: false` : pas de fichier, défauts seuls ; proposer `/front-flow:setup`.
Exit 1 : hors dépôt git, ou fichier JSON invalide (chemin cité).

## Clés

| Clé | Type | Rôle | Défaut |
|---|---|---|---|
| `verify` | chaîne ou `null` | commande lancée (outil Bash, depuis la racine du worktree) jusqu'au vert après chaque lot de modifications | `null` : aucune vérification ; le signaler |
| `commit` | tableau argv | gabarit de commit lancé sans shell par `ff.mjs commit` ; jetons `{emoji}`, `{files}`, `{desc}` | `["git","commit","-m","{emoji} {desc}"]` |
| `worktreesDir` | chaîne | dossier des worktrees, relatif à la racine du dépôt ; worktree = `<worktreesDir>/<KEY>` | `".worktrees"` |
| `recetteUrl` | chaîne ou `null` | URL par défaut de l'environnement de recette déployé | `null` |
| `recetteReadyCheck` | `{ "url": … }` ou `null` | URL qui expose le SHA déployé ; `ff.mjs wait-deploy` l'interroge jusqu'à y trouver les 7 premiers caractères du SHA poussé | `null` : le dev confirme en une ligne que l'env est à jour |
| `defaultFlags` | tableau | flags de `reviewing-code` proposés au démarrage (`-seo`, `-perf`, `-archi`, `-a11y`) | `[]` |
| `jiraTransitions` | booléen | proposer les transitions Jira (PR créée, recette acceptée) | `false` |
| `mapping` | objet, facultatif | remplace, phase par phase, la liste d'agents/skills de `defaults/mapping.json` : `{ "<phase>": [{ "id", "kind": "agent"\|"skill", "fallback" }] }` | absent |

## Commandes liées

- `ff.mjs commit --emoji <e> --files <f> --desc <d>` : remplit le gabarit, commite **l'index
  tel quel** (le script ne fait jamais `git add` : indexer d'abord, fichier par fichier, jamais
  `git add -A`) ; sortie `{ "sha": "<court>" }`, exit 1 avec l'erreur du gabarit sinon. Les
  valeurs passent telles quelles en argv (guillemets, `$(…)`, accents sans risque). `{files}` est
  le segment « fichiers/composants » du message (`SearchPost`), pas une liste de chemins.
- `ff.mjs wait-deploy --sha <sha> [--timeout <s>]` (défaut 900 s, sondage toutes les 15 s) :
  exit 0 `{ "status": "ready" }` ; exit 2 si `recetteReadyCheck` n'est pas configuré (demander
  alors la confirmation manuelle) ; exit 1 au délai dépassé.

## Exemples

ILokYou-Site :

```json
{
  "verify": "scripts/verify.sh",
  "commit": ["node", "scripts/commit.mjs", "-e", "{emoji}", "-f", "{files}", "-d", "{desc}"],
  "worktreesDir": ".worktrees",
  "recetteUrl": null,
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
  "recetteUrl": null,
  "recetteReadyCheck": null,
  "defaultFlags": [],
  "jiraTransitions": false
}
```

Dépôt sans `scripts/verify.sh` (Front-Disconnected) : `verify` composé des scripts
`package.json` présents, par exemple `"npm run lint && npm run typecheck && npm run test"`.
