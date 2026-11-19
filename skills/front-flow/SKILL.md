---
name: front-flow
description: Déroule une feature front AlloVoisins de bout en bout (contexte et CT, plan, implémentation, PR, review, recette) avec trois gates humaines et une reprise fiable. À utiliser sur « /front-flow WEBFRONT-123 », « lance front-flow sur ce ticket », « traite cette feature front », une URL Jira ou une page FEATURE Notion à développer côté web, ou « reprends la feature en cours » (sans argument).
argument-hint: "[WEBFRONT-123 | URL Jira | URL Notion]"
---

# front-flow — orchestrateur

Résoudre la cible, préparer ou reprendre l'état, puis router vers la sous-skill de la phase
courante jusqu'à une gate ou la fin. Toute la logique de phase vit dans les sous-skills ; toute la
mémoire vit dans l'état (`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/state.md`).

Écrire chaque commande CLI en entier : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" <cmd>`.
Codes retour : 0 succès (JSON sur stdout, sauf `state path|current` et `detect-base` en texte),
2 absent, 1 erreur (message sur stderr, à citer tel quel puis s'arrêter).

**Questions.** L'orchestrateur ne pose que : la cible si elle manque, le choix entre plusieurs
features en cours, la proposition de setup, et le tour de démarrage unique (étape 3). Aucune autre.

## 1. Résoudre la cible

**Avec argument** ($ARGUMENTS) : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" resolve-target "<arg>"`
→ `{ key, jiraUrl, notionUrl }`.
- `key` nul (URL Notion seule) : lire la page (Notion MCP, `notion-fetch`) et prendre la clé dans sa
  propriété Jira (URL `…/browse/WEBFRONT-123`). Introuvable : demander la clé au dev.
- Exit 1 (cible non reconnue) : citer le message, demander une cible.

**Sans argument** (jamais de nouvelle feature : seulement une reprise) :
1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state current` : exit 0 → clé de la branche ;
   la garder seulement si `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>` sort en
   exit 0 (exit 1 : citer le chemin, s'arrêter). Exit 2 de l'un ou l'autre (branche sans clé, ou
   clé sans état) → pas de feature courante, point 2.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state list` :
   - `[]` : écrire « Aucune feature en cours : donne un ticket (WEBFRONT-123, URL Jira ou URL
     Notion). » et s'arrêter ;
   - une seule : la prendre ;
   - plusieurs : `AskUserQuestion` (« Quelle feature reprendre ? »), une option par feature
     (`<key>`, description `<phase> — <branch>`), les plus récentes d'abord, 4 au plus.

Puis `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>` :
- exit 0 → **reprise** : si `phase` vaut `done` ou `abandoned`, le dire et s'arrêter ; sinon
  étape 2, puis relecture de la CT si `ct.source` vaut `thot` et `phase` n'est plus `context`
  (procédure « Reprise » de `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/ct-read.md`, une
  fois, après la mise en place de l'étape 4 et avant le premier routage), puis étape 4 ;
- exit 2 → **nouvelle feature** (avec argument seulement) : étapes 2, 3 puis 4 ;
- exit 1 → citer le chemin du fichier illisible et s'arrêter, sans rien réécrire.

## 2. Inventaire (démarrage et reprise)

`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" inventory` → JSON compact `{ available, unusable, missing }` ;
`available` ne garde que les ids du mapping effectif et leurs replis (liste complète : `--all`).
Afficher au plus deux lignes, sans bloquer :
- `Inutilisables (disable-model-invocation) : <id>, <id>` si `unusable` n'est pas vide ;
- `Absents : <id> (repli <fallback> disponible | sans repli), …` si `missing` n'est pas vide.

Garder ce résultat en contexte : les sous-skills y choisissent l'agent ou son repli.

## 3. Nouvelle feature : un seul tour de questions

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get` ; `root` = `<racine>`, le checkout
   principal (même depuis un worktree), où vit la config. `configured: false` → proposer
   `/front-flow:setup` (`AskUserQuestion` : « Lancer le setup » / « Continuer avec les défauts ») ;
   « Lancer le setup » → skill `front-flow:setup` (outil `Skill`), puis relire la config. Détail des clés : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/config.md`.
2. Ticket Jira (Atlassian MCP, `getJiraIssue`) : résumé, `fixVersions`, lien Notion éventuel.
   `<jira_url>` = `jiraUrl` de `resolve-target`, sinon `https://<site>/browse/<KEY>` (site du ticket lu).
3. Base : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" detect-base --fix-version "<fixVersion>"`
   (sans fixVersion : `detect-base` seul) → texte brut, `release/<v>` ou la branche de départ.
   Noms : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" names <KEY> --title "<résumé Jira>"` →
   `{ branch, recetteUrl }` (gabarits `branch` et `recetteUrl` de la config) ; `<branche>` = `branch`.
4. **Un seul** `AskUserQuestion`, quatre questions au plus, chaque première option étant la
   valeur détectée suffixée « (détecté) » :

| En-tête | Question | Options |
|---|---|---|
| Base | « Branche cible de la PR ? » | `<base> (détecté)` ; `develop` |
| Mode | « Où travailler, sur la branche <branche> ? » | `Worktree (détecté)` (`<worktreesDir>/<KEY>`) ; `In-place` (checkout courant) — autre nom de branche via « Autre » (worktree), puis `names <KEY> --branch "<nom>"` pour l'URL |
| Flags | « Flags de review ? » (multiSelect) | `<defaultFlags ou aucun> (détecté)` ; `-a11y` ; `-perf` ; `-seo` |
| Recette | « URL et compte de recette ? » | `<recetteUrl de names> (détecté)` (sinon `Plus tard (détecté)`) ; `Plus tard` — URL et compte saisis via « Autre » |

5. `git fetch origin <base>` : base absente d'origin (échec, ou base seulement locale) → dire
   « La base <base> n'existe pas sur origin : la PR ne pourrait pas être créée ; pousse-la ou
   choisis une autre base. » et s'arrêter, sans rien écrire. Puis branche `<branche>` depuis
   `origin/<base>` ; si la branche existe déjà, la réutiliser :
   - worktree, dans `<racine>/<worktreesDir>/<KEY>` : chemin déjà existant → le dire (chemin
     cité) et s'arrêter ; sinon, depuis `<racine>` :
     `git worktree add --no-track -b <branche> <racine>/<worktreesDir>/<KEY> origin/<base>`
     (sans `-b` si la branche existe) ; vérifier que `<worktreesDir>` est ignoré par git, sinon
     le signaler ;
   - in-place : `git switch --no-track -c <branche> origin/<base>` (ou `git switch <branche>`).
   `--no-track` : la branche ne suit pas `<base>` (un `git push` nu n'y pousse jamais).
6. Écrire l'état (chaque paire entre guillemets simples, chemin de worktree absolu ou `null`) :
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> 'phase=context' 'branch=<branche>' 'base=<base>' 'worktree=<chemin|null>' 'flags=[…]' 'recette_url=<url|null>' 'recette_account=<compte|null>' 'notion_url=<url|null>' 'jira_url=<jira_url>'`.

## 4. Router

Mise en place, avant tout routage :
- `state.worktree` défini : se placer dedans (`cd "<worktree>"`) ; dossier disparu : le dire et
  s'arrêter. Toutes les sous-skills travaillent dans ce dossier.
- `state.worktree` nul (in-place) : si `git branch --show-current` ≠ `state.branch`, basculer
  (`git switch <branch>`) quand l'arbre est propre (`git status --porcelain` vide) ; sinon citer
  la branche courante et `state.branch`, et s'arrêter sans rien modifier.

| `phase` | Sous-skill (outil `Skill`, argument `<KEY>`) |
|---|---|
| `context` | `front-flow:ff-context` |
| `plan` | `front-flow:ff-plan` |
| `implement` | `front-flow:ff-implement` |
| `pr` | `front-flow:ff-pr` |
| `review` | `front-flow:ff-review` |
| `recette` | `front-flow:ff-recette` |

Boucle : invoquer la sous-skill de `phase` ; à son retour, relire l'état
(`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>`) ;
- `done` ou `abandoned` → compte rendu final et arrêt ;
- `phase` changée → invoquer la sous-skill suivante sans demander ;
- `phase` inchangée (gate refusée, « Pas maintenant », erreur, attente du dev) → résumer où en
  est la feature et comment reprendre (`/front-flow` sans argument), puis s'arrêter.

Les trois gates (plan, création de PR, verdict de recette) sont posées par les sous-skills :
`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/gates.md`. La lecture de CT :
`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/ct-read.md`.

## Interdits

- Publier quoi que ce soit (PR, review, commentaire) hors des gates prévues.
- Écrire l'état ou les fichiers annexes à la main : toujours via `ff.mjs state …` et le dossier
  annexe hors working tree.
- Poser une question hors des cas listés en tête.
