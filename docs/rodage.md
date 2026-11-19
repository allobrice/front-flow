# Plan de rodage — front-flow 0.1.0

But : exercer le plugin sur de vrais tickets avant de le publier dans `allovoisins-cc-tools`, et
relever chaque friction dans la grille en fin de document. Installation : voir `README.md`.

## Avant de commencer

- `claude plugin validate ~/dev/front-flow` et `node --test 'scripts/test/*.spec.mjs'` au vert.
- `/plugin marketplace add ~/dev/front-flow`, `/plugin install front-flow@front-flow-local`,
  puis vérifier que le menu montre `/front-flow:front-flow` et `/front-flow:setup`, et aucun `ff-*`.
- `gh auth status` ; MCP Atlassian, Notion, Chrome DevTools connectés.
- Smoke test du 2026-11-18 dans ILokYou-Site (lecture seule) : `inventory --all` → 152
  disponibles (16 retenus par défaut : mapping et replis), 6 inutilisables (aucun du mapping),
  0 absent ; `reviewing-code`, `vue-developer`,
  `writing-clean-code`, `thot:thot-read`, `web-front:figma-analyzer` et
  `web-front:type-generator` disponibles ; `config get` → défauts, `configured: false` ;
  `state list` → `[]` ; `detect-base` → branche de départ.
- Inventaire du 2026-11-19 dans ILokYou-Site après passage du mapping à `frontend-toolkit` :
  15 retenus, 0 inutilisable, 0 absent ; les 7 éléments `frontend-toolkit:*` du mapping,
  `runtime-bug-reporter`, `thot:thot-read` et les replis `web-front:*` sont disponibles.
- Contrôle du 2026-11-19 depuis le worktree `ILokYou-Site/.worktrees/WEBFRONT-1251` :
  `config get` → `root: "/home/allobrice/dev/ILokYou-Site"` (checkout principal), `configured: false`.

## Rodage 1 — ILokYou-Site, petit ticket WEBFRONT, de bout en bout

Choisir un ticket court (une page ou un composant, CT simple ou UI seule) avec un env de recette
déployable.

1. **Setup** : `/front-flow:setup`. Attendu : `verify: "scripts/verify.sh"`, `commit` =
   `node scripts/commit.mjs -e {emoji} -f {files} -d {desc}`, `worktreesDir: ".worktrees"` (déjà
   ignoré par git). Ajouter l'URL de recette si elle est stable. Lancé depuis un worktree, le
   fichier doit être écrit dans le checkout principal (`root` de `config get`).
2. **Démarrage** : `/front-flow:front-flow WEBFRONT-xxx`. Vérifier : un seul tour de questions
   (≤ 4), base détectée (`release/<fixVersion>` si elle existe sur origin), mode **Worktree**.
3. **Worktree** (jamais exercé sur un vrai dépôt) : contrôler que
   `git worktree add --no-track -b feature/<KEY> <racine>/.worktrees/<KEY> origin/<base>` réussit,
   que `git -C <worktree> rev-parse --abbrev-ref @{u}` échoue (pas de suivi), que `state get`
   donne le chemin absolu du worktree, et que l'état est dans `.git/front-flow/` du checkout
   principal (et non dans le worktree).
4. **context** : `brief.md` sous `.git/front-flow/<KEY>/`, critères numérotés, verdict CT cohérent.
5. **plan / Gate 1** : approuver **sans effacer le contexte** une première fois.
6. **implement** : dépendances installées dans le worktree neuf, `verify` au vert, aucun commit.
7. **pr / Gate 2** : commits via `scripts/commit.mjs`, aucun `git add -A`, aperçu complet ;
   « Créer la PR » → PR vers la bonne base.
8. **Interruption** : après la Gate 2 (ou en cours de review), `/clear`, puis
   `/front-flow:front-flow` **sans argument** depuis le checkout principal (branche sans clé) :
   la feature doit être retrouvée par `state list`, le travail repris dans le worktree, à la bonne
   phase, avec la relecture de la CT si elle vient de thot.
9. **review** : `frontend-toolkit:reviewing-code` appelé avec les flags, sa propre confirmation respectée ; retours
   traités, réponses inline montrées avant envoi.
10. **recette / Gate 3** : env déployé (jamais le serveur local), attente du SHA ou confirmation
    en une ligne, rapport `recette-1.md`. « Accepté » → `phase: done`, proposition de retirer le
    worktree (`git worktree remove` sans `--force`).
11. Variante à tester une fois : Gate 1 approuvée **en effaçant le contexte** (la première étape
    du plan, « Avant tout : … », doit suffire à reprendre sans implémenter hors orchestrateur).

## Rodage 2 — Front-Disconnected, setup différent

Dépôt : `~/dev/AlloVoisins-Front-Disconnected` (monorepo pnpm, pas de `scripts/verify.sh` ni de
`scripts/commit.mjs`).

1. `/front-flow:setup`. Attendu : `verify` = `pnpm run lint && pnpm run typecheck && pnpm run test`
   (lockfile `pnpm-lock.yaml`), `commit` par défaut `git commit -m "{emoji} {desc}"`. Vérifier que
   `pnpm run test` (`vitest` dans `apps/frontend`) ne reste pas en mode watch ; sinon préférer
   `test:ci` via « Modifier ». Proposer `.worktrees/` au `.gitignore` s'il n'y est pas.
2. Un petit ticket, mode **in-place** cette fois (bascule de branche, arbre propre exigé).
3. Vérifier les replis : si un élément du mapping manque sur ce poste, l'inventaire le dit sans
   bloquer.
4. Mêmes points de contrôle que le rodage 1 pour les gates et la reprise sans argument.

## Points connus à surveiller

Reliquats mineurs reportés pendant l'implémentation, utiles en conditions réelles :

- **Démarrage / base** : `detect-base` interroge `git ls-remote` sans `GIT_TERMINAL_PROMPT=0` ni
  timeout (blocage possible si l'auth git demande une saisie) ; HEAD détaché non géré ;
  `fixVersion` lu mais pas réutilisé ensuite ; options parfois en double dans la question de
  démarrage ; plus de 4 features en cours → seules 4 proposées.
- **État** : `recette_account` purement numérique converti en nombre par `state set` ; messages
  git bruts (en anglais) hors dépôt ; fichier `.tmp` laissé après une écriture interrompue.
- **Inventaire** : lancé parfois deux fois ; un repli sans préfixe (`code-review`) est aussi
  satisfait par un item d'un autre type (agent `web-front:code-review`) ;
  commentaires YAML en fin de ligne dans un frontmatter mal lus ; `installed_plugins.json`
  invalide ignoré sans avertissement.
- **Chemins** : `${CLAUDE_PLUGIN_ROOT}` des références n'est pas développé ; repérer toute
  commande `node "/scripts/ff.mjs"`.
- **CT / thot** : consignes `spec_inexploitable`, `x-thot-gap` et code-search peu précisées.
- **PR** : changement de base à la Gate 2 sans rebase.
- **Review** : pas de pagination GraphQL (> 100 fils) ; `reply.md` réutilisé d'un fil à l'autre ;
  fils déjà répondus mais non résolus retraités ; avec « Ne pas publier », les fils humains ne
  sont pas traités ; « 3 tentatives » et limite de passes interprétables.
- **Recette** : `wait-deploy` en mode URL sans timeout de requête ni contrôle `res.ok`, SHA vide
  vu comme prêt ; push fait avant chaque passe ; `runtime-bug-reporter` supposé toujours
  disponible.

## Grille de relevé des frictions

Gravité : P0 bloque le déroulé · P1 contournement manuel lourd · P2 gêne · P3 cosmétique.

| Date | Rodage / ticket | Phase | Friction observée | Gravité | Piste |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

Bilan à tirer après les deux rodages : frictions P0/P1 corrigées avant publication, décision sur
la délégation de la recette à un agent (audit #5) et sur
l'embarquement ou non des skills perso pour l'équipe.
