# État d'une feature

`ff` abrège `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs"` : écrire la commande en entier à chaque
appel.

## Emplacements

L'état vit dans le dossier git commun, partagé par le checkout principal et tous ses worktrees,
jamais dans le working tree :

- État : `<git-common-dir>/front-flow/<KEY>.json` (chemin exact : `ff state path <KEY>`).
- Dossier annexe : le même chemin sans `.json`, soit `<git-common-dir>/front-flow/<KEY>/` :
  - `brief.md` : synthèse du contexte (Jira, Notion, Figma, CT) et critères d'acceptation ;
  - `plan.md` : plan validé à la Gate 1 ;
  - `ct-bundle.json` : dernier paquet `thot-read` pris en compte (voir `ct-read.md`) ;
  - `recette-<n>.md` : rapport P0–P3 de la passe de recette n° n (1, 2…).

Créer le dossier annexe au besoin (`mkdir -p`). Ne jamais écrire ces fichiers dans le dépôt.

## Champs

| Champ | Contenu |
|---|---|
| `key` | clé du ticket (`WEBFRONT-123`) ; posée par le script |
| `phase` | phase courante (énumération ci-dessous) |
| `branch` | branche de travail, `feature/<KEY>` |
| `base` | branche cible de la PR (`release/<fixVersion>` ou branche de départ) |
| `worktree` | chemin absolu du worktree, `null` en mode in-place |
| `pr_url` | URL de la PR, `null` avant la Gate 2 |
| `flags` | tableau de flags de `reviewing-code` (`["-a11y","-perf"]`) |
| `recette_url` | URL de l'environnement déployé |
| `recette_account` | compte de recette (identifiant, sans mot de passe) |
| `back_ticket` | ticket BACK porteur de la CT (`BACK-456`), `null` sinon |
| `ct` | `{ source, verdict, fingerprint }` : `source` ∈ `thot`, `notion`, `aucune` ; `verdict` et `fingerprint` décrits dans `ct-read.md` |
| `notion_url` / `figma_url` | page FEATURE Notion / maquette Figma |
| `updated_at` | horodatage ISO ; posé par le script à chaque écriture |

Phases, dans l'ordre : `context` → `plan` → `implement` → `pr` → `review` → `recette` → `done`.
`abandoned` est terminale aussi. Toute autre valeur est refusée (exit 1).

## Commandes

| Commande | Sortie | Codes retour |
|---|---|---|
| `ff state path <KEY>` | chemin, texte brut | 0 ; 1 si clé invalide |
| `ff state get <KEY>` | état JSON | 0 ; 2 si absent ; 1 si le fichier est illisible (le chemin est cité, le fichier n'est pas touché) |
| `ff state set <KEY> k=v…` | état complet JSON après écriture | 0 ; 1 si argument ou phase invalide |
| `ff state list` | tableau JSON des features en cours (`phase` ≠ `done`/`abandoned`), la plus récente d'abord : `{ key, phase, branch, worktree, updated_at }` | 0 (tableau vide possible) |
| `ff state current` | clé tirée de la branche courante (`[A-Z]{2,}-\d+`), texte brut | 0 ; 2 si la branche n'en porte pas |

`state set` : chaque valeur est lue comme du JSON si possible, sinon comme une chaîne
(`worktree=null` → `null`, `flags='["-a11y"]'` → tableau). Une clé pointée écrit un sous-champ
(`ct.verdict=engagé`) ; les objets sont fusionnés, les tableaux et scalaires remplacés. Entourer
chaque paire de guillemets simples. L'écriture est atomique (fichier temporaire puis renommage) et
donne le même fichier depuis n'importe quel worktree.

## Règles de reprise

- Une phase ne passe `phase` à la suivante qu'une fois son travail fini (ou sa gate validée). Une
  phase relancée repart donc de son début et s'appuie sur ce qui existe déjà (fichiers annexes,
  commits, `pr_url`) sans le refaire.
- `done` ou `abandoned` : rien à reprendre ; le dire et s'arrêter.
- `worktree` défini : travailler dans ce dossier. S'il n'existe plus, le dire (chemin cité) et
  s'arrêter, sans recréer ni modifier l'état.
- `ct.source` = `thot` : relire la CT avec `--previous` à l'entrée de chaque phase reprise (voir
  `ct-read.md`).
- Fichier d'état illisible (exit 1) : citer le chemin et s'arrêter ; ne jamais le réécrire.
