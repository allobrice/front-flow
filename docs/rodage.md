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
   `node scripts/commit.mjs -e {emoji} -t {KEY} -f {files} -d {desc}`, `worktreesDir: ".worktrees"` (déjà
   ignoré par git). Ajouter l'URL de recette si elle est stable. Lancé depuis un worktree, le
   fichier doit être écrit dans le checkout principal (`root` de `config get`).
2. **Démarrage** : `/front-flow:front-flow WEBFRONT-xxx`. Vérifier : un seul tour de questions
   (≤ 4), base détectée (`release/<fixVersion>` si elle existe sur origin), mode **Worktree**,
   branche `feature/webfront-xxx-<3 mots du titre>` et URL de recette
   `https://webfront-xxx-<…>.feature.allovoisins.com` proposées (config du 2026-11-19 :
   `branch`, `recetteUrl`, `recetteReadyCheck.workflow`).
3. **Worktree** (jamais exercé sur un vrai dépôt) : contrôler que
   `git worktree add --no-track -b <branche> <racine>/.worktrees/<KEY> origin/<base>` réussit,
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
   phase, avec la relecture de la CT si elle vient de thot. Depuis le worktree (branche en
   minuscules), `state current` doit rendre la clé en majuscules.
9. **review** : `frontend-toolkit:reviewing-code` appelé avec les flags, sa propre confirmation respectée ; retours
   traités, réponses inline montrées avant envoi.
10. **recette / Gate 3** : env déployé (jamais le serveur local), attente du run
    `deploy-features.yml` du SHA poussé (`wait-deploy` en mode `workflow`), confirmation en une
    ligne si aucun run, rapport `recette-1.md`. « Accepté » → `phase: done`, proposition de retirer le
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
| 2026-11-19 | R1 · WEBFRONT-1404 | pr | `ff.mjs commit` refusé : « no ticket found in branch "feature/webfront-1404-…" ». Le gabarit `branch` (`{key}`) produit une branche en minuscules, alors que `scripts/commit.mjs` n'extrait que les clés en majuscules. Contourné par un appel direct à `commit.mjs -t WEBFRONT-1404`. | P0 | **Corrigé en 0.3.0** (PR #6) : jetons `{KEY}`/`{key}` dans le gabarit `commit`, `--key` passé par ff-pr, ff-review et ff-recette. Vérifié sur WEBFRONT-1405 : commits passés du premier coup. |
| 2026-11-19, 2026-11-20 | R1 · WEBFRONT-1404, WEBFRONT-1405 | implement | `verify` rouge dans le worktree neuf : 19 puis 22 suites en « Could not locate module @allovoisins/sequoia ». `jest.config.frontoffice.js` mappe sequoia sur `<rootDir>/node_modules`, absent d'un worktree. Contourné en copiant `../../node_modules/@allovoisins/sequoia`. Deux runs sur deux. | P1 | Étape de provisionnement après `git worktree add` (clé de config `worktreeSetup` : liste de commandes ou de copies), ou correctif côté repo (mapper via `require.resolve`). L'étape « Dépendances » de ff-implement ne voit pas le cas : le `package.json` racine se résout par remontée. |
| 2026-11-19, 2026-11-20 | R1 · WEBFRONT-1404, WEBFRONT-1405 | pr | `git push` refusé par le pre-push : « vuetify introuvable depuis apps/backoffice ». Le `node_modules` niché de `apps/backoffice` n'existe pas dans un worktree. Contourné par `cp -r ../../apps/backoffice/node_modules apps/backoffice/`. Deux runs sur deux ; sur 1405, `gh pr create` a échoué derrière (« Head sha can't be blank »). | P1 | Même `worktreeSetup` que ci-dessus. Dans ff-pr, ne lancer `gh pr create` que si le push a réussi. |
| 2026-11-20 | R1 · WEBFRONT-1405 | démarrage | Le worktree créé n'a ni `.env`, ni `.claude/settings.local.json`, ni le lien `.claude/CLAUDE.md` que `av-worktrees.md` demande. Les deux premiers copiés à la main ; le lien a été oublié. | P2 | Même `worktreeSetup`, ou lire la section « Ce qu'il reste à copier » des rules du repo au setup. |
| 2026-11-20 | R1 · WEBFRONT-1405 | implement | `scripts/verify.sh` lancé tel quel → `permission denied` (bit exécutable absent dans le worktree). Contourné par `bash scripts/verify.sh`. ff-implement l'aurait compté comme un échec de vérification. | P1 | Dans setup, détecter un script non exécutable et proposer `bash <script>` ; ou config `verify: "bash scripts/verify.sh"`. |
| 2026-11-20 | R1 · WEBFRONT-1405 | démarrage | Ticket qui dépend d'une PR non mergée (1405 s'appuie sur le code de #8841). `detect-base` propose `release/26.6.0`, qui n'avait pas ce code. #8841 a été mergée juste avant le `git fetch`, donc sans effet ici, mais rien ne l'aurait signalé. | P2 | Au démarrage, lire les liens Jira et la description (mention d'une PR) et signaler une PR liée encore ouverte, avec l'option de baser sur sa branche. |
| 2026-11-20 | R1 · WEBFRONT-1405 | review | La description de PR et le `brief.md` ne suivent pas les correctifs de review. La 1re passe a ajouté deux pages (et un critère 6) ; la 2e passe a relevé la description périmée. Mis à jour à la main (`brief.md`, `pr-body.md`). | P2 | ff-review, étape 4 : après un lot qui change le périmètre, réécrire `pr-body.md` (et les critères de `brief.md`), puis proposer la mise à jour de la PR avec l'envoi des réponses. |
| 2026-11-20 | R1 · WEBFRONT-1405 | review | `gh pr edit --body-file` échoue : « GraphQL: Projects (classic) is being deprecated… (repository.pullRequest.projectCards) ». Contourné par `gh api -X PATCH repos/<o>/<r>/pulls/<n> -F body=@pr-body.md`. | P2 | Toute mise à jour de PR passe par l'API REST, pas par `gh pr edit`. |
| 2026-11-20 | R1 · WEBFRONT-1405 | review | La 1re passe de `reviewing-code` a laissé la lentille superpowers lire `routes.php` et `C_unsubscribe`, ce que le socle des prompts autorise (« tu peux en lire un pour comprendre un contrat »). Le profil front-only du dev l'interdit sans opt-in. Le P1 confirmé reposait sur cette lecture. 2e passe : interdiction explicite dans les prompts. | P2 | frontend-toolkit : le socle des lentilles respecte une exclusion déclarée par le repo ou le dev (formuler un doute au lieu de lire), ou ff-review passe ce périmètre à la skill. |
| 2026-11-20 | R1 · WEBFRONT-1405 | review | « Relancer » : `reviewing-code` réécrit dans le même `{outDir}` (`reviewing-code-<repo>-<n>`), ce qui écraserait la 1re passe. Contourné par un suffixe `-p2`. Les findings de `/code-review` (fork) se recopient aussi à la main dans `code-review.json` à chaque passe. | P3 | ff-review passe un `--out` numéroté par passe. Côté frontend-toolkit, un script de conversion `ReportFindings → code-review.json`. |
| 2026-11-20 | R1 · WEBFRONT-1405 | recette | Le navigateur MCP avait redémarré : basic auth de l'env feature et session perdues. Le dev a répondu « Connecté » mais la page restait en `body.not_logged` ; vu seulement parce que le router SPA n'était pas monté (`/accueil` → `/`). Deuxième demande de connexion. | P2 | ff-recette, étape 1 : vérifier la session par un critère objectif (page connectée accessible sans redirection) plutôt qu'un `take_snapshot`, et prévenir que l'authentification HTTP de l'env est à saisir. |
| 2026-11-20 | R1 · WEBFRONT-1405 | recette | Critère 6 (pages après POST de formulaire) recetté en GET sans données : les liens de désinscription factices ne rendent pas le formulaire. Résolution du router vérifiée, pas le parcours réel. | P3 | Rubrique « Données de recette » dans `brief.md` (liens réels, comptes), que ff-context demande quand un critère en a besoin. |
| 2026-11-19, 2026-11-20 | R1 · WEBFRONT-1404, WEBFRONT-1405 | toutes | Ce qui a marché comme prévu : un seul tour de questions, base `release/<fixVersion>` détectée, worktree sans suivi (`--no-track`), état dans `.git/front-flow/`, Gate 1 approuvée sans effacer le contexte, reprise sans argument (1404), `wait-deploy` en mode workflow (exit 0), Gate 3 et retrait du worktree sans `--force`. | — | Points 2, 3, 5, 8 et 10 du rodage 1 validés. Restent : setup depuis un worktree (point 1), Gate 1 en effaçant le contexte (point 11), rodage 2. |

Bilan à tirer après les deux rodages : frictions P0/P1 corrigées avant publication, décision sur
la délégation de la recette à un agent (audit #5) et sur
la publication de `frontend-toolkit` dans `allovoisins-cc-tools` (dépendance cross-marketplace).

## Pistes à étudier après le rodage

### Suivi en direct du traitement d'un ticket (idée du 2026-11-19)

Voir ce qui se joue pendant le déroulé d'une feature, à trois niveaux, du plus léger au plus complet :

1. **Ligne d'état Claude Code** : `ff.mjs status` lit la feature en cours (`state current`) et
   rend `WEBFRONT-123 · review · PR #456 · base release/2.14` sous la saisie. Coût : quelques
   lignes.
2. **Tableau de bord local** : `ff.mjs dashboard` sert une page sur `localhost` (Node sans
   dépendance) qui suit `git-common-dir/front-flow/` : features en cours, frise des six phases,
   gates en attente ou passées, verdict CT, lien de PR, retours de review traités, rapport de
   recette P0–P3. Rien ne sort de la machine.
3. **Page claude.ai partageable** : même contenu, publiée en page privée dont front-flow
   alimente la base à chaque étape ; un PO ou un collègue suit la feature sans terminal.
   L'avancement sort de la machine : publication soumise à accord.

Prérequis commun : un **journal d'événements** à côté de l'état (`<KEY>/events.jsonl`), car
l'état ne bouge qu'aux changements de phase. Deux sources possibles : une commande `ff.mjs log`
appelée par chaque sous-skill (journal propre, à maintenir) ou des hooks Claude Code sur les
appels d'outils (exhaustif, plus bruyant).

Ordre proposé : ligne d'état et journal d'abord (utiles aussi pour diagnostiquer les rodages),
tableau de bord local si le besoin se confirme, page partageable seulement quand d'autres
personnes doivent suivre.
