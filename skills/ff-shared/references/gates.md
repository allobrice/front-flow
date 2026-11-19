# Les trois gates

Seules ces trois gates arrêtent le déroulé. Chacune est un `AskUserQuestion` à une question, avec
exactement le texte et les options ci-dessous (`<…>` remplacé). Rien n'est publié (PR, review,
commentaire) sans le « oui » correspondant. Une réponse libre (« Autre ») vaut « Modifier » ou
« À reprendre » avec ce commentaire.

`ff` abrège `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs"`.

## Gate 1 — validation du plan (`ff-plan`)

Exception à la forme `AskUserQuestion` : la Gate 1 est l'approbation du plan par `ExitPlanMode`,
qui présente le plan complet au dev. Le plan **commence** par une étape auto-portante, formulée
comme une instruction (« Avant tout : copier ce plan dans `<annexe>/plan.md`, `state set`
`'phase=implement'`, puis invoquer `/front-flow:front-flow` ; ne pas implémenter soi-même »), qui
survit à un contexte effacé. Sans effacement, `ff-plan` fait ce travail et `ff-implement` ignore
cette étape.

| Réponse du dev | Vaut | Effet |
|---|---|---|
| Plan approuvé | Valider | plan copié dans `<annexe>/plan.md`, puis `ff state set <KEY> 'phase=implement'` |
| Rejet avec commentaire | Modifier | on reste en mode plan, le plan est révisé puis représenté par `ExitPlanMode` ; reste en `plan` |
| Abandon demandé | Abandonner | rien n'est écrit en mode plan : le dev en sort (Shift+Tab) et confirme, puis `ff state set <KEY> 'phase=abandoned'` ; sinon reste en `plan` |

## Gate 2 — création de la PR (`ff-pr`)

Montrer l'aperçu : base (`<base>`), titre, corps, liste des commits (`<sha> <message>`) et, si
`jiraTransitions` est vrai, la ligne « Transition Jira → En relecture ». Puis :

> **Question** : « Créer la PR de <KEY> vers <base> ? »
> En-tête : `PR`

| Option | Description | Effet |
|---|---|---|
| Créer la PR | « Pousser la branche et ouvrir la PR avec ce titre et ce corps. » | push, `gh pr create --base <base>`, `ff state set <KEY> 'pr_url=<url>' 'phase=review'` ; transition Jira annoncée appliquée après accord |
| Modifier | « Changer le titre, le corps ou la base avant création. » | reste en `pr`, aperçu représenté |
| Pas maintenant | « Ne rien publier ; reprendre plus tard avec /front-flow. » | reste en `pr`, arrêt |

## Gate 3 — verdict de recette (`ff-recette`)

Montrer le dernier rapport (`recette-<n>.md`). Si `jiraTransitions` est vrai, nommer d'abord la
transition qui suit la recette et l'ajouter à la description d'« Accepté » (« … Transition Jira →
<nom>. »). Puis :

> **Question** : « Verdict de recette pour <KEY> ? »
> En-tête : `Recette`

| Option | Description | Effet |
|---|---|---|
| Accepté | « La feature est validée ; fin du déroulé. » | `ff state set <KEY> 'phase=done'` ; transition Jira nommée appliquée après accord ; puis « Suppression du worktree » |
| À reprendre | « Retour en implémentation avec le rapport de recette. » | `ff state set <KEY> 'recette_report=<chemin du recette-<n>.md>' 'phase=implement'` ; `ff-implement` ajoute ce rapport au prompt de l'agent ; le champ est remis à `null` quand `implement` passe en `pr` |
| Abandonner | « Arrêter la feature ; l'état est conservé. » | `ff state set <KEY> 'phase=abandoned'` ; puis « Suppression du worktree » |

### Suppression du worktree (après « Accepté » ou « Abandonner »)

Seulement si `worktree` est défini :

> **Question** : « Supprimer le worktree <worktree> ? La branche <branch> est conservée. »
> En-tête : `Worktree`
> Options : « Supprimer » ; « Garder ».

« Supprimer » : `cd` dans le checkout principal (`root` de `ff config get`), puis
`git worktree remove <worktree>` sans `--force`. Refus (fichiers non commités) : citer les
fichiers restants, le dev décide. Seulement après un retrait réussi :
`ff state set <KEY> 'worktree=null'`.

Jamais de merge : la PR suit son cycle normal.
