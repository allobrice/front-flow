# Design — plugin Claude Code « front-flow »

> Source : `~/.claude/plans/je-souhaite-d-velopper-un-temporal-fox.md`.

## Contexte

À chaque feature front, Brice réécrit le même enchaînement de prompts : ticket Jira / page Notion →
récupération de la CT (contrat d'API back) → mode plan → `vue-developer` + `writing-clean-code` →
PR vers la branche cible → `/reviewing-code <url> <flags>` → traitement des retours → recette via
Chrome DevTools MCP. `/av-tools:treat-ticket` couvre ce cycle mais est trop lourd
(`av-treat-jira-ticket` : 1 584 lignes ; rédaction/versionnement de CT, transitions, gates,
multi-phase) et n'utilise pas ses outils. But : un plugin léger qui déroule ce cycle avec 3 gates
humaines et une reprise fiable.

## Objectifs / non-objectifs / anti-objectifs

- **Objectifs** : un point d'entrée `/front-flow <WEBFRONT-123 | URL Jira | URL Notion>` ; reprise
  sans argument ; un seul tour de questions au démarrage ; 3 gates (plan, création de PR, verdict
  de recette) ; portable sur ILokYou-Site, Front-Disconnected, Front-Sequoia via une config par repo.
- **Non-objectifs** : rédiger ou versionner la CT ; multi-phase ; gates intermédiaires ;
  transitions Jira obligatoires (option, désactivée par défaut).
- **Anti-objectifs** (échec même si ça marche) : redevenir un av-tools bis (orchestrateur
  > ~150 lignes, questions à chaque phase) ; publier quoi que ce soit (PR, review, commentaire)
  sans accord explicite ; copier les agents/skills perso dans le plugin.

## Approches considérées

| Approche | Compromis | Verdict |
|---|---|---|
| **Skills en prose + script Node `ff.mjs`** | Un petit script à maintenir ; reprise et inventaire exacts et testables | **Choisie** |
| Skills en prose seules | Rien à coder ; reprise fragile (JSON écrit à la main, chemins de worktree) | Écartée |
| Pilotage par hooks | Plus automatique ; opaque, dur à déboguer en rodage | Écartée |

## Décisions prises (par Brice)

- Format plugin, développé dans `~/dev/front-flow`, installé via marketplace locale pendant le
  rodage, publié ensuite dans `allovoisins-cc-tools` (`~/dev/IA-Claude-Marketplace`).
- **Review toujours publiée** : `/reviewing-code <url> <flags>` publie sa review sur la PR (avec le
  garde-fou de confirmation propre au skill), puis front-flow traite les commentaires publiés,
  pousse les correctifs et répond inline.
- Approche prose + `ff.mjs`.
- `reviewing-code` : modification minimale = retirer `disable-model-invocation: true` de
  `~/.claude/skills/reviewing-code/SKILL.md` (le skill lit `$ARGUMENTS` et demande déjà l'accord
  avant publication : compatible avec un appel via `Skill`).

## Structure du plugin

```
front-flow/
├── .claude-plugin/plugin.json        # name, description, (plus tard) dependencies: ["web-front", "thot"]
├── .claude-plugin/marketplace.json   # marketplace locale de rodage
├── commands/front-flow.md            # /front-flow [cible] → skill front-flow
├── commands/setup.md                 # /front-flow:setup → skill ff-setup
├── skills/
│   ├── front-flow/SKILL.md           # orchestrateur : résout la cible, lit l'état, route
│   ├── ff-setup/SKILL.md             # génère .claude/front-flow.json + inventaire
│   ├── ff-context/ ff-plan/ ff-implement/ ff-pr/ ff-review/ ff-recette/   # SKILL.md courts
│   └── ff-shared/references/         # ct-read.md, mapping-defaults.json, state.md, config.md
├── scripts/ff.mjs (+ ff.spec.mjs)    # node:test, zéro dépendance
└── docs/superpowers/specs/…
```

Progressive disclosure : chaque SKILL.md ≤ ~80 lignes, détails dans `ff-shared/references/`.

## Script `ff.mjs` (Node ≥ 20, sans dépendance)

| Commande | Rôle |
|---|---|
| `state path <KEY>` / `state get <KEY>` / `state set <KEY> k=v…` | JSON sous `$(git rev-parse --path-format=absolute --git-common-dir)/front-flow/<KEY>.json` ; création atomique |
| `state current` | KEY de la feature en cours, déduite de la branche courante (regex `[A-Z]{2,}-\d+`) |
| `config get` | lit `.claude/front-flow.json` fusionné avec les défauts du plugin |
| `detect-base --fix-version <v>` | `release/<v>` si la branche distante existe, sinon la branche de départ |
| `inventory` | liste agents/skills de `~/.claude/agents`, `~/.claude/skills`, `.claude/` du repo et plugins installés ; signale **inutilisable** (`disable-model-invocation: true`) et **absent** (avec le repli de `mapping-defaults.json`) |

Champs d'état : `key, phase, branch, base, worktree, pr_url, flags, recette_url, recette_account,
back_ticket, ct {source, verdict, fingerprint}, notion_url, figma_url, updated_at`.

## Config par repo `.claude/front-flow.json`

`{ verify, commit, worktreesDir, recetteUrl, recetteReadyCheck?, defaultFlags, jiraTransitions, mapping? }`.
`commit` est un gabarit : ILokYou-Site → `node scripts/commit.mjs -e {emoji} -f {files} -d {desc}` ;
défaut → `git commit -m "{message}"`. Front-Disconnected n'a pas de `scripts/verify.sh` :
`ff-setup` propose la commande détectée (`package.json` : lint/typecheck/test).

## Déroulé

**Démarrage** (`front-flow`) : résout la cible (clé, URL Jira, URL Notion → clé via la propriété
Jira de la page) ; si un état existe → reprise à la phase enregistrée ; sinon un seul
`AskUserQuestion` (≤ 4 questions pré-remplies) : branche cible, worktree/in-place, flags de
review, URL + compte de recette. Inventaire exécuté au démarrage et à la reprise.

1. **context** : Jira (Atlassian MCP) + Notion + Figma (`web-front:figma-analyzer` si maquette).
   CT : lien dans la page Notion, sinon `thot:thot-read BACK-XXXX --platform webfront --no-ask
   [--previous <bundle précédent>]` (ticket BACK depuis les liens Jira / propriété « Jira Back »,
   sinon demandé). Verdict : `engagé` → on code contre ; `brouillon`/`périmé` → le dev tranche ;
   `retiré`/aucune CT → UI seule ou arrêt, au choix du dev. Paquet rangé sous
   `git-common-dir/front-flow/<KEY>/ct-bundle.json` ; à la reprise, relecture et alerte si le
   fingerprint change. Types optionnels via `web-front:type-generator`. Écrit `brief.md` dans le
   même dossier (hors suivi git).
2. **plan** : mode plan, plan validé → **Gate 1**.
3. **implement** : dispatch `vue-developer` (charge `writing-clean-code`, `developing-scss`…
   selon le mapping) ; puis `config.verify` jusqu'au vert.
4. **pr** : commit via `config.commit`, push, aperçu titre/corps, `gh pr create --base <base>`
   → **Gate 2**.
5. **review** : `Skill reviewing-code "<pr_url> <flags>"` (publication avec sa propre
   confirmation) → `superpowers:receiving-code-review` sur les commentaires publiés → correctifs,
   `verify`, push, réponses inline (montrées avant envoi).
6. **recette** (décision Brice : **environnement déployé**) : Chrome DevTools MCP sur
   `recette_url` (env déployé, pas le serveur local), critères d'acceptation de `brief.md`, rapport
   P0–P3. Boucle de correction *par lot* pour limiter les redéploiements : tous les correctifs
   P0–P2 d'une passe → `verify` → un commit → push → attente du redéploiement → nouvelle passe.
   Attente (arbitrage Claude) : si `config.recetteReadyCheck` est défini (commande ou URL qui
   expose le SHA déployé), front-flow l'interroge jusqu'au SHA poussé (timeout configurable) ;
   sinon il demande au dev de confirmer en une ligne que l'env est à jour. → **Gate 3** (verdict
   final). Transitions Jira si
   `jiraTransitions: true`.

## Mapping phase → agents/skills (défauts, surchargeables)

> Révision du 2026-11-19 : les agents et skills perso ont rejoint le plugin `frontend-toolkit`,
> déclaré en dépendance (avec `thot`) ; `web-front` ne sert plus que de repli et pour le contexte.

- implement : `frontend-toolkit:vue-developer` (repli `web-front:vue-developer`),
  `frontend-toolkit:writing-clean-code`, `frontend-toolkit:developing-typescript`,
  `frontend-toolkit:developing-scss` (repli `web-front:developing-scss`)
- review : `frontend-toolkit:reviewing-code` (repli `code-review`)
- recette : `frontend-toolkit:auditing-accessibility` (repli `web-front:audit-a11y`),
  `frontend-toolkit:auditing-performance`, `runtime-bug-reporter`

Chaque phase peut aussi invoquer tout autre agent/skill de la session dont la description
correspond au besoin.

## Arbitrages pris par Claude (à vérifier par Brice)

- **Reprise en mode worktree** : `ff.mjs state list` liste les features en cours (`phase != done`)
  sous `git-common-dir/front-flow/`. Sans argument : si la branche courante porte une clé → elle ;
  sinon une seule en cours → elle ; plusieurs → choix. L'orchestrateur travaille ensuite dans
  `state.worktree`. Plusieurs features en parallèle sont permises.
- **Après la Gate 3** : options « Accepté » → `phase: done` (état conservé, proposition de supprimer
  le worktree, pas de merge) ; « À reprendre » → retour à `implement` avec le rapport ;
  « Abandonner » → `phase: abandoned`.
- **Review** : une passe de `reviewing-code` ; puis traitement de **tous** les commentaires non
  résolus de la PR (review automatique + reviewers humains présents à ce moment). Relance de
  `reviewing-code` proposée seulement si des P0/P1 ont été corrigés. Si le dev choisit « Ne pas
  publier » : traitement du `review.json` local. Pas de nouvelle passe automatique ensuite.
- **Commits** : un commit par changement logique ; Claude choisit emoji / `{files}` / description,
  stage explicitement les fichiers concernés (jamais `git add -A`), et la liste des commits figure
  dans l'aperçu de la Gate 2. Correctifs de review/recette : un commit par lot, sans gate (push
  après `verify` vert), messages montrés dans le compte rendu.
- **Public** : rodage perso. Les éléments perso absents sont signalés par l'inventaire ; pour un
  collègue, la phase review sans `reviewing-code` se rabat sur `/code-review` (skill intégrée).
  L'embarquement des skills perso se tranche au passage en équipe.

## Laissé au builder

Formulations des SKILL.md, nommage interne de `ff.mjs`, format exact de `brief.md`, détection des
commandes de `package.json` au setup.

## Vérification

- `node --test scripts/` sur `ff.mjs` (état, detect-base, inventory sur fixtures).
- `claude plugin validate` puis audit `claude-plugin-auditor`.
- Rodage 1 : petit ticket WEBFRONT d'ILokYou-Site de `/front-flow` à la recette, puis `/clear` et
  reprise sans argument.
- Rodage 2 : Front-Disconnected avec un `/front-flow:setup` différent (portabilité).

## Suite après approbation

1. Créer `~/dev/front-flow` (git init) et y copier ce design dans
   `docs/superpowers/specs/2026-11-18-front-flow-design.md`, commité.
2. Retirer `disable-model-invocation: true` de `~/.claude/skills/reviewing-code/SKILL.md`.
3. `superpowers:writing-plans` → plan d'implémentation → implémentation avec `creating-skills`
   → audit `claude-plugin-auditor` → plan de rodage sur un vrai ticket WEBFRONT.
