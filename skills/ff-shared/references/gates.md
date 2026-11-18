# Les trois gates

Seules ces trois gates arrêtent le déroulé. Chacune est un `AskUserQuestion` à une question, avec
exactement le texte et les options ci-dessous (`<…>` remplacé). Rien n'est publié (PR, review,
commentaire) sans le « oui » correspondant. Une réponse libre (« Autre ») vaut « Modifier » ou
« À reprendre » avec ce commentaire.

`ff` abrège `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs"`.

## Gate 1 — validation du plan (`ff-plan`)

Montrer le plan (`plan.md` du dossier annexe), puis :

> **Question** : « Valider le plan de <KEY> ? »
> En-tête : `Plan`

| Option | Description | Effet |
|---|---|---|
| Valider | « Lancer l'implémentation avec ce plan. » | `ff state set <KEY> phase=implement` |
| Modifier | « Préciser ce qui doit changer ; le plan est revu puis représenté. » | reste en `plan` |
| Abandonner | « Arrêter la feature ; l'état est conservé. » | `ff state set <KEY> phase=abandoned` |

## Gate 2 — création de la PR (`ff-pr`)

Montrer l'aperçu : base (`<base>`), titre, corps, liste des commits (`<sha> <message>`). Puis :

> **Question** : « Créer la PR de <KEY> vers <base> ? »
> En-tête : `PR`

| Option | Description | Effet |
|---|---|---|
| Créer la PR | « Pousser la branche et ouvrir la PR avec ce titre et ce corps. » | push, `gh pr create --base <base>`, `ff state set <KEY> pr_url=<url> phase=review` |
| Modifier | « Changer le titre, le corps ou la base avant création. » | reste en `pr`, aperçu représenté |
| Pas maintenant | « Ne rien publier ; reprendre plus tard avec /front-flow. » | reste en `pr`, arrêt |

## Gate 3 — verdict de recette (`ff-recette`)

Montrer le dernier rapport (`recette-<n>.md`), puis :

> **Question** : « Verdict de recette pour <KEY> ? »
> En-tête : `Recette`

| Option | Description | Effet |
|---|---|---|
| Accepté | « La feature est validée ; fin du déroulé. » | `ff state set <KEY> phase=done` ; transition Jira si `jiraTransitions` ; puis proposer de supprimer le worktree |
| À reprendre | « Retour en implémentation avec le rapport de recette. » | `ff state set <KEY> phase=implement` ; le rapport sert d'entrée à `ff-implement` |
| Abandonner | « Arrêter la feature ; l'état est conservé. » | `ff state set <KEY> phase=abandoned` |

Après « Accepté », si `worktree` est défini :

> **Question** : « Supprimer le worktree <worktree> ? La branche feature/<KEY> est conservée. »
> En-tête : `Worktree`
> Options : « Supprimer » (`git worktree remove <worktree>` depuis le checkout principal, puis
> `ff state set <KEY> worktree=null`) ; « Garder ».

Jamais de merge : la PR suit son cycle normal.
