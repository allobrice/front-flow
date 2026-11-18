---
name: ff-recette
description: Phase recette de front-flow — recette de l'env déployé via Chrome DevTools MCP, rapport P0–P3, correctifs par lot, Gate 3 (verdict). Appelée par l'orchestrateur front-flow seulement ; ne pas invoquer directement (passer par front-flow:front-flow).
user-invocable: false
---

# ff-recette — recette sur l'environnement déployé et Gate 3

Argument : `<KEY>`. État : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/state.md` ; config et
`wait-deploy` : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/config.md` ; Gate 3 :
`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/gates.md`.

## 1. Entrées

- État : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>` ; `<annexe>` = sortie de
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state path <KEY>` sans `.json`.
- `<annexe>/brief.md` : critères d'acceptation numérotés. Absent : le dire, `phase` inchangée, arrêt.
- `state.recette_url` (env déployé, jamais le serveur local) nul : la demander une fois
  (`AskUserQuestion`, saisie via « Autre » / « Pas maintenant »), puis
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> 'recette_url=<url>'` ; « Pas maintenant » → arrêt.
- Mapping `recette` effectif (`config.mapping.recette`, sinon `${CLAUDE_PLUGIN_ROOT}/defaults/mapping.json`)
  croisé avec l'inventaire : `-a11y` dans `state.flags` → `auditing-accessibility` ; `-perf` →
  `auditing-performance` ; `runtime-bug-reporter` toujours disponible pour diagnostiquer un échec.
  Élément absent : son repli s'il est disponible, sinon le citer sans bloquer.

## 2. Attente du déploiement (avant chaque passe)

HEAD doit être poussé (`git push origin <state.branch>` s'il est en avance), puis
`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" wait-deploy --sha "$(git rev-parse HEAD)" --timeout 540`,
lancé par l'outil Bash avec `timeout: 600000` (ms) :
- exit 0 → passe ;
- exit 2 → `AskUserQuestion` en une ligne : « <recette_url> sert-il le commit <sha court> ? »
  (« Oui, à jour » / « Pas encore ») ; « Pas encore » → `phase` inchangée, arrêt ;
- exit 1 → citer le message, puis `AskUserQuestion` (« Relancer l'attente » / « Confirmer à la
  main que l'env est à jour » / « Pas maintenant ») ; « Pas maintenant » → `phase` inchangée, arrêt.

## 3. Passe n

`n` = 1 + le plus grand numéro des `<annexe>/recette-*.md` existants. Outils du MCP Chrome
DevTools, quel que soit leur préfixe (`navigate_page`, `take_snapshot`, `fill`, `click`,
`list_console_messages`, `list_network_requests`) :
1. `navigate_page` sur `recette_url` ; `state.recette_account` défini et session non connectée :
   remplir l'identifiant (`fill`, `click`) ; le mot de passe est saisi par le dev dans le
   navigateur, jamais écrit dans l'état ni le rapport.
2. Pour chaque critère du brief : parcours (`navigate_page`, `take_snapshot`, `fill`, `click`),
   résultat OK / KO avec la preuve observée.
3. `list_console_messages` (erreurs, avertissements) et `list_network_requests` (4xx, 5xx, échecs).
4. Skills retenues (outil `Skill`) sur `recette_url` ; un KO inexpliqué → `runtime-bug-reporter`.

Rapport `<annexe>/recette-<n>.md` : en-tête (clé, URL, SHA, date, passe n), tableau des critères,
constats P0 (bloquant, critère KO) → P3 (cosmétique) avec étapes de reproduction, console, réseau,
sorties des audits. Montrer la synthèse au dev.

## 4. Correctifs par lot

Constats P0–P2 : les corriger tous en un lot (agent `implement` du mapping ou correction directe),
`config.verify` jusqu'au vert (3 tentatives au plus, sinon erreur montrée, `phase` inchangée,
arrêt), `git add -- <fichiers>` (jamais `git add -A`), un seul
`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" commit --emoji "<gitmoji>" --files "<composants>" --desc "<description>"`,
`git push origin <state.branch>`, puis nouvelle passe (étape 2). Au plus 3 passes ; au-delà, ou
sans P0–P2, aller à la Gate 3.

## 5. Gate 3

Montrer le dernier rapport, puis la Gate 3, texte et options exacts de `gates.md` :
- **Accepté** → `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> phase=done` ;
  `config.jiraTransitions` vrai : Atlassian MCP, `getTransitionsForJiraIssue` puis
  `transitionJiraIssue` vers l'état qui suit la recette (plusieurs candidats : les citer et
  demander) ; puis la question worktree de `gates.md`. « Supprimer » : `cd` dans le checkout
  principal (1re entrée `worktree` de `git worktree list --porcelain`), `git worktree remove
  <worktree>` sans `--force` ; refus (fichiers non commités, ex. `.claude/front-flow.json`) :
  citer les fichiers restants, le dev décide ; seulement après un retrait réussi, depuis le
  checkout principal : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> worktree=null` ;
- **À reprendre** (ou réponse libre, ajoutée au rapport) →
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> 'recette_report=<annexe>/recette-<n>.md' phase=implement` ;
- **Abandonner** → `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> phase=abandoned`.

Compte rendu : passes faites, messages des commits poussés, chemin du dernier rapport.

Interdits : recetter le serveur local ; merger la PR ; `git push --force`.
