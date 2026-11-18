---
name: ff-plan
description: Phase plan de front-flow — passe en mode plan, construit le plan d'implémentation à partir de brief.md, le soumet à la Gate 1 (validation du plan) puis passe en phase implement. Invoquée par l'orchestrateur front-flow quand la phase vaut « plan » (« planifie WEBFRONT-123 », « propose le plan de la feature »).
user-invocable: false
---

# ff-plan — plan et Gate 1

Argument : `<KEY>`. État et dossier annexe : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/state.md` ;
Gate 1 : `${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/gates.md`.

## 1. Entrées

- État : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state get <KEY>` ; `<annexe>` = sortie de
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state path <KEY>` sans `.json`.
- `<annexe>/brief.md` : la source du plan. Absent : le dire, laisser `phase` à `plan`, s'arrêter.
- `<annexe>/plan.md` s'il existe (phase relancée) : point de départ, à revoir plutôt qu'à refaire.
- Mapping `implement` effectif : `config.mapping.implement` de
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get`, sinon la liste `implement` de
  `${CLAUDE_PLUGIN_ROOT}/defaults/mapping.json` ; disponibilité d'après l'inventaire de
  l'orchestrateur (`available`, `missing[].fallbackAvailable`).

## 2. Mode plan

`EnterPlanMode`, puis explorer le code du dossier de travail (lecture seule) : composants,
composables, stores, styles et tests touchés ; conventions existantes à suivre.

Le plan contient :
- le rappel du ticket et du verdict CT (avec « à revalider avant merge » s'il figure au brief) ;
- les étapes, fichier par fichier, dans l'ordre d'exécution ;
- pour chaque critère d'acceptation numéroté du brief, l'étape qui le couvre ;
- l'agent d'implémentation (premier du mapping ou son repli) et les skills qu'il chargera ;
  un élément absent sans repli est signalé ;
- les tests à ajouter et la vérification finale (`config.verify`, ou « aucune » si `null`) ;
- les points ouverts du brief, avec la décision proposée ;
- **en dernière étape**, auto-portante pour survivre à un contexte effacé à l'approbation :
  « Copier ce plan dans `<chemin absolu de l'annexe>/plan.md` ; lancer
  `node "<chemin absolu de ff.mjs>" state set <KEY> phase=implement` ; puis `/front-flow:front-flow`. »
  Chemins écrits en clair (`${CLAUDE_PLUGIN_ROOT}` développé), sans variable ni renvoi.

## 3. Gate 1

La Gate 1 se pose par `ExitPlanMode` avec le plan complet (pas d'`AskUserQuestion`) ; les effets
suivent `gates.md`. Recommander au dev d'approuver **sans effacer le contexte** ; s'il l'efface,
la dernière étape du plan fait le travail ci-dessous.

- **Approuvé** (Valider) : exécuter la dernière étape du plan sauf la relance (l'orchestrateur
  enchaîne) : plan tel quel dans `<annexe>/plan.md`, puis
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> phase=implement`.
- **Refusé avec commentaire** (Modifier) : rester en mode plan, réviser selon le commentaire et
  représenter par `ExitPlanMode` ; `phase` reste `plan`.
- **Abandon demandé** : rien ne s'écrit en mode plan. Demander au dev d'en sortir (Shift+Tab),
  puis de confirmer l'abandon ; alors seulement
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" state set <KEY> phase=abandoned`. Sans sortie ni
  confirmation : `phase` reste `plan`, dire pourquoi l'on s'arrête.
- **Arrêt sans décision** (le dev veut reprendre plus tard) : `phase` reste `plan` ; dire que
  `/front-flow` reprendra au plan.

Aucun code n'est écrit dans cette phase.
