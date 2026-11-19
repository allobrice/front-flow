# front-flow

Plugin Claude Code qui déroule une feature front AlloVoisins de bout en bout à partir d'un ticket
Jira ou d'une page FEATURE Notion : contexte et contrat d'API back (CT), plan, implémentation, PR,
review, recette sur l'environnement déployé. Trois gates humaines seulement, rien n'est publié sans
accord explicite, et la reprise se fait sans argument après un `/clear` ou une nouvelle session.
Le plugin n'embarque aucun agent ni skill perso : il appelle ceux de la session par leur nom.

## Prérequis

- Node ≥ 20 ; `git` ; `gh` authentifié (`gh auth status`).
- MCP : Atlassian (Jira), Notion, Chrome DevTools (installé comme plugin `chrome-devtools-mcp`) ;
  Figma facultatif.
- Plugin `thot` (lecture de la CT via `thot:thot-read`) ; plugin `web-front` facultatif
  (`figma-analyzer`, `type-generator`, replis des agents).
- Agents et skills perso appelés par leur nom : `vue-developer`, `writing-clean-code`,
  `reviewing-code`. `reviewing-code` ne doit pas porter `disable-model-invocation: true` dans son
  frontmatter (sinon front-flow ne peut pas l'appeler et se replie sur `code-review`).
  L'inventaire (`/front-flow:setup`) signale les éléments absents ou inutilisables.

## Installation (marketplace locale de rodage)

```
/plugin marketplace add ~/dev/front-flow
/plugin install front-flow@front-flow-local
```

Seuls `/front-flow:front-flow` et `/front-flow:setup` apparaissent dans le menu ; les skills de
phase (`ff-*`) sont internes.

## Setup d'un dépôt

Dans le dépôt cible : `/front-flow:setup`. La skill détecte la commande de vérification
(`scripts/verify.sh`, sinon `lint` / `typecheck` / `test` de `package.json`) et le gabarit de
commit (`scripts/commit.mjs` s'il existe), montre le JSON proposé et n'écrit
`.claude/front-flow.json` qu'avec ton accord, toujours à la racine du checkout principal (même
lancé depuis un worktree ; `config get` en donne le chemin dans `root`). `worktreesDir` reste un
chemin relatif, à l'intérieur du dépôt (`.worktrees` par défaut, ignoré par git). Ce fichier est versionnable : ses commandes
(`verify`, `commit`, `recetteReadyCheck`) sont exécutées par le plugin, à relire comme du code ;
jamais de mot de passe ni de jeton dedans.

## Usage

```
/front-flow:front-flow WEBFRONT-123
/front-flow:front-flow https://…atlassian.net/browse/WEBFRONT-123
/front-flow:front-flow https://www.notion.so/…        # page FEATURE
/front-flow:front-flow                                 # reprise de la feature en cours
```

Au démarrage, un seul tour de questions : branche cible, worktree ou in-place, flags de review,
URL et compte de recette. La base doit exister sur origin (sinon la PR serait impossible : arrêt).
Sans argument, jamais de nouvelle feature : la clé de la branche courante si elle a un état,
sinon l'unique feature en cours, sinon un choix ; aucune feature → « Aucune feature en cours :
donne un ticket ».

| Phase | Ce qui se passe | Gate |
|---|---|---|
| `context` | Jira, Notion, Figma, CT (`thot-read`) → `brief.md` | |
| `plan` | Mode plan, plan fichier par fichier | **Gate 1** : validation du plan |
| `implement` | Agent `vue-developer` (+ skills du mapping), puis `verify` jusqu'au vert | |
| `pr` | Commits logiques, aperçu titre/corps/commits | **Gate 2** : création de la PR |
| `review` | `reviewing-code` (sa propre confirmation de publication), traitement des retours, réponses inline validées | |
| `recette` | Chrome DevTools MCP sur l'env déployé, rapport P0–P3, correctifs par lot | **Gate 3** : verdict de recette |

## Où vit l'état

Dans le dossier git commun, partagé par le checkout et ses worktrees, jamais dans le working tree :
`$(git rev-parse --path-format=absolute --git-common-dir)/front-flow/<KEY>.json`, et à côté le
dossier `<KEY>/` (`brief.md`, `plan.md`, `ct-bundle.json`, `recette-<n>.md`). Lecture :
`node ~/dev/front-flow/scripts/ff.mjs state get <KEY>` ou `state list`.

## Développement

```
node --test 'scripts/test/*.spec.mjs'
claude plugin validate ~/dev/front-flow
```

Design : `docs/superpowers/specs/2026-11-18-front-flow-design.md` · audit :
`docs/audit-2026-11-18.md` · plan de rodage : `docs/rodage.md`.
