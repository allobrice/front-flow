---
name: ff-pr
description: Phase pr de front-flow — commits logiques, Gate 2 (création de PR), push et PR. Appelée par l'orchestrateur front-flow seulement ; ne pas invoquer directement (passer par front-flow:front-flow).
user-invocable: false
---

# ff-pr — commits, Gate 2 et PR

Argument : `<KEY>`. État : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/state.md` ; config et
`ff.mjs commit` : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/config.md` ; Gate 2 :
`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/gates.md`.

## 1. Entrées

- État : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>` ; `<annexe>` = sortie de
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state path <KEY>` sans `.json`.
- Dossier de travail : `state.worktree`, sinon la racine du dépôt ; branche courante = `state.branch`.
- Config : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get` ; `<annexe>/brief.md`.

## 2. Commits

`git status --porcelain` : regrouper les fichiers modifiés en changements logiques (un composant
et son test, un style, une traduction…). Pour chaque groupe :
1. `git add -- <fichier> <fichier>…` : chemins explicites, jamais `git add -A` ni `git add .` ;
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" commit --emoji "<gitmoji>" --files "<composants>" --desc "<description en français>"`
   → `{ "sha" }`. Exit 1 : citer l'erreur du gabarit, `phase` inchangée, arrêt.

Ne pas commiter ce qui n'appartient pas à la feature (`.claude/front-flow.json` écrit pendant le
déroulé, fichiers locaux) : le laisser hors index et le citer au dev.

Commits de la feature : `git log --format='%h %s' origin/<state.base>..HEAD`. Aucun commit et rien
à commiter : le dire, `phase` inchangée, arrêt.

## 3. Retour de recette (`state.pr_url` déjà posé)

La PR existe : pas de Gate 2 (elle ne couvre que la création). Après l'étape 2 :
`git push origin <state.branch>` (échec : citer, arrêt), lister les commits poussés, puis
`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> phase=recette`. Fin de la skill.

## 4. Aperçu et Gate 2 (première passe)

- Titre : `<KEY> : <résumé du ticket>`.
- Corps, écrit dans `<annexe>/pr-body.md` (hors working tree) :
  - **Contexte** : lien Jira (`https://…/browse/<KEY>`), page Notion (`state.notion_url`),
    maquette (`state.figma_url`) s'ils existent ;
  - **Changements** : une puce par commit, en langage fonctionnel ;
  - **Critères d'acceptation** : la liste numérotée de `brief.md`, en cases à cocher ;
  - **CT** : `state.back_ticket` et `ct.verdict` (`ct.source` = `notion` : lien de la page) ;
    verdict `brouillon` → « à revalider avant merge » ; `aucune` → « UI seule ».
- Montrer base, titre, corps et commits (`<sha> <message>`), puis la Gate 2, texte et options
  exacts de `gates.md` :
  - **Créer la PR** → étape 5 ;
  - **Modifier** (ou réponse libre) → appliquer la demande (nouvelle base : `node
    "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> base=<base>`), réécrire `pr-body.md`,
    représenter l'aperçu ;
  - **Pas maintenant** → rien n'est publié, `phase` reste `pr`, arrêt.

## 5. Publication (après « Créer la PR » seulement)

1. `git push -u origin <state.branch>` (la branche est créée sans suivi) ; échec : citer, arrêt.
2. `gh pr create --base <state.base> --head <state.branch> --title "<titre>" --body-file "<annexe>/pr-body.md"`
   → URL sur stdout. PR déjà ouverte pour la branche (phase relancée) : reprendre son URL avec
   `gh pr view <state.branch> --json url -q .url`, sans en créer d'autre.
3. `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> 'pr_url=<url>' phase=review`.
4. `config.jiraTransitions` vrai : Atlassian MCP, `getTransitionsForJiraIssue` puis
   `transitionJiraIssue` vers « En relecture » ; transition introuvable : le dire, sans bloquer.

Compte rendu : URL de la PR, commits poussés, fichiers laissés hors commit.

## Interdits

- Pousser ou ouvrir la PR sans « Créer la PR » à la Gate 2 (première passe).
- `git add -A`, `git add .`, `git commit` direct hors `ff.mjs commit`, `git push --force`.
- Merger la PR.
