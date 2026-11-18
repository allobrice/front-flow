# front-flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plugin Claude Code « front-flow » qui déroule une feature front AlloVoisins (contexte + CT → plan → implémentation → PR → review → recette) avec 3 gates humaines et une reprise fiable.

**Architecture:** Skills courtes en prose (un orchestrateur qui route + une sous-skill par phase), adossées à un script Node sans dépendance `scripts/ff.mjs` qui porte tout ce qui doit être exact : état, config, résolution de cible, branche de base, inventaire, commit, attente de déploiement.

**Tech Stack:** Node ≥ 20 (ESM, `node:test`, `node:child_process` en `execFileSync` uniquement), Markdown (SKILL.md), JSON.

**Spec:** `docs/superpowers/specs/2026-11-18-front-flow-design.md`

## Global Constraints

- Zéro dépendance npm ; pas de `package.json` obligatoire. Tests : `node --test scripts/test/`.
- Aucune commande externe via un shell : toujours `execFileSync(cmd, argv)` (jamais `exec`, jamais d'interpolation dans une chaîne de commande).
- État : `$(git rev-parse --path-format=absolute --git-common-dir)/front-flow/<KEY>.json` ; dossier annexe `…/front-flow/<KEY>/` (`brief.md`, `ct-bundle.json`). Jamais dans le working tree.
- Phases (enum exact) : `context`, `plan`, `implement`, `pr`, `review`, `recette`, `done`, `abandoned`.
- Champs d'état : `key, phase, branch, base, worktree, pr_url, flags, recette_url, recette_account, back_ticket, ct {source, verdict, fingerprint}, notion_url, figma_url, updated_at`.
- Config repo : `.claude/front-flow.json` = `{ verify, commit, worktreesDir, recetteUrl, recetteReadyCheck?, defaultFlags, jiraTransitions, mapping? }`.
- Toute prose et tout texte affiché en français avec accents.
- SKILL.md de phase ≤ 80 lignes ; orchestrateur ≤ 150 lignes ; détails dans `skills/ff-shared/references/`.
- Trois gates seulement : validation du plan, création de PR, verdict de recette. Rien n'est publié (PR, review, commentaire) sans accord explicite.
- Le plugin n'embarque aucun agent ni skill perso : il les appelle par leur nom.
- Commits du repo front-flow : gitmoji + description en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Lancement sans argument sur une branche sans clé (`develop`) et sans feature en cours → message clair « aucune feature en cours, donne un ticket », pas de crash. (Task 1 : `state current` exit 2 ; Task 6 : orchestrateur.)
2. Fichier d'état corrompu ou tronqué → `state get` sort en exit 1 avec le chemin du fichier fautif, sans l'écraser ; écritures atomiques (tmp + rename). (Task 1.)
3. `state set` lancé depuis un worktree → même fichier que depuis le checkout principal. (Task 1.)
4. Description de commit avec guillemets, accents, `$(…)` ou backticks → passée telle quelle en argv, aucune exécution. (Task 5.)
5. `fixVersion` avec espaces ou caractères inattendus (`2026.11 hotfix`) → pas d'injection, repli sur la branche de départ si la branche distante n'existe pas. (Task 3.)

---

## File Structure

```
front-flow/
├── .claude-plugin/plugin.json          # manifeste
├── .claude-plugin/marketplace.json     # marketplace locale de rodage
├── defaults/config.json                # config par défaut (fusionnée avec .claude/front-flow.json)
├── defaults/mapping.json               # phase → agents/skills + replis
├── scripts/ff.mjs                      # CLI : dispatch des sous-commandes, sortie JSON/texte, codes retour
├── scripts/lib/git.mjs                 # git(cwd, ...args), commonDir(cwd), currentBranch(cwd)
├── scripts/lib/state.mjs               # état
├── scripts/lib/config.mjs              # config + resolveTarget
├── scripts/lib/base.mjs                # detectBase
├── scripts/lib/frontmatter.mjs         # parseFrontmatter(text)
├── scripts/lib/inventory.mjs           # inventaire
├── scripts/lib/commit.mjs              # runCommit
├── scripts/lib/deploy.mjs              # waitDeploy
├── scripts/test/helpers.mjs            # makeRepo(), runFF()
├── scripts/test/*.spec.mjs
└── skills/
    ├── front-flow/SKILL.md             # orchestrateur (/front-flow:front-flow)
    ├── setup/SKILL.md                  # /front-flow:setup
    ├── ff-context/ ff-plan/ ff-implement/ ff-pr/ ff-review/ ff-recette/SKILL.md
    └── ff-shared/references/{state.md, config.md, ct-read.md, gates.md}
```

Arbitrage (écart à la spec) : pas de dossier `commands/` — les skills sont directement invocables
(`/front-flow:front-flow`, `/front-flow:setup`) ; `mapping-defaults.json` vit dans `defaults/` car le
script le lit. Les sous-skills de phase portent `user-invocable: false`.

Convention CLI commune : succès → exit 0, JSON sur stdout (sauf `state path`, `state current`,
`detect-base` : texte brut) ; « absent / rien à faire » → exit 2 + message sur stderr ; erreur →
exit 1 + message en français sur stderr.

---

### Task 1: Squelette du plugin + état

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `scripts/ff.mjs`, `scripts/lib/git.mjs`, `scripts/lib/state.mjs`, `scripts/test/helpers.mjs`
- Test: `scripts/test/state.spec.mjs`

**Interfaces:**
- Produces:
  - `git(cwd: string, ...args: string[]): string` (trim), `commonDir(cwd): string` (absolu), `currentBranch(cwd): string`
  - `statePath(cwd, key): string`, `readState(cwd, key): object | null` (lève `Error` si JSON invalide), `writeState(cwd, key, patch: object): object` (fusion profonde, `updated_at` ISO, atomique), `listStates(cwd): Array<{key, phase, branch, worktree, updated_at}>` (hors `done`/`abandoned`, tri `updated_at` desc), `currentKey(cwd): string | null` (regex `/[A-Z]{2,}-\d+/` sur la branche)
  - CLI : `ff.mjs state path|get|set|list|current`. `set` accepte `k=v` avec clés pointées (`ct.verdict=engagé`) ; `v` est parsé en JSON si possible, sinon chaîne ; `phase` hors enum → exit 1.
  - helpers : `makeRepo(): string` (repo git temporaire avec un commit sur `develop`), `runFF(cwd, ...args): {code, stdout, stderr}`

- [ ] **Step 1: Write the failing tests** (`state.spec.mjs`)
  - `set puis get` : `state set WEBFRONT-1 phase=plan ct.verdict=engagé` puis `get` → `{key:"WEBFRONT-1", phase:"plan", ct:{verdict:"engagé"}}` et `updated_at` présent.
  - `get absent` → code 2.
  - `phase invalide` : `set WEBFRONT-1 phase=foo` → code 1, stderr contient `phase`.
  - `JSON corrompu` : écrire `{` dans le fichier → `get` code 1, stderr contient le chemin, fichier inchangé.
  - `worktree partagé` : `git worktree add ../wt -b feature/WEBFRONT-2` ; `set` depuis `wt`, `get` depuis le repo → même contenu ; `state path` identique des deux côtés.
  - `list` : 3 états (`plan`, `done`, `review`) → 2 entrées, la plus récente d'abord.
  - `current` : branche `feature/WEBFRONT-2-truc` → `WEBFRONT-2` ; branche `develop` → code 2.
- [ ] **Step 2: Run** `node --test scripts/test/state.spec.mjs` → FAIL (module absent).
- [ ] **Step 3: Implement** `lib/git.mjs`, `lib/state.mjs`, dispatch dans `ff.mjs`. `plugin.json` : `{"name":"front-flow","version":"0.1.0","description":"Déroule une feature front AlloVoisins de bout en bout : contexte et CT, plan, implémentation, PR, review, recette.","author":{"name":"Brice Le Gallo-Tastet"}}`. `marketplace.json` : `{"name":"front-flow-local","owner":{"name":"Brice"},"plugins":[{"name":"front-flow","source":"./","description":"…"}]}`.
- [ ] **Step 4: Run** `node --test scripts/test/` → PASS.
- [ ] **Step 5: Commit** `✨ ff.mjs : état et squelette du plugin`.

### Task 2: Config et résolution de cible

**Files:**
- Create: `defaults/config.json`, `scripts/lib/config.mjs`
- Test: `scripts/test/config.spec.mjs`

**Interfaces:**
- Consumes: `git()` (Task 1) pour trouver la racine (`git rev-parse --show-toplevel`).
- Produces:
  - `loadConfig(cwd): {config: object, configured: boolean}` — défauts de `defaults/config.json` fusionnés en profondeur avec `<toplevel>/.claude/front-flow.json` ; `mapping` fusionné par phase.
  - `resolveTarget(arg: string): {key: string|null, jiraUrl: string|null, notionUrl: string|null}`
  - CLI : `ff.mjs config get`, `ff.mjs resolve-target <arg>`.
- `defaults/config.json` : `{"verify": null, "commit": ["git","commit","-m","{emoji} {desc}"], "worktreesDir": ".worktrees", "recetteUrl": null, "recetteReadyCheck": null, "defaultFlags": [], "jiraTransitions": false}`.

- [ ] **Step 1: Write the failing tests**
  - sans fichier → `configured:false`, `worktreesDir:".worktrees"`, `jiraTransitions:false`.
  - fichier `{"verify":"scripts/verify.sh","defaultFlags":["-a11y"]}` → `configured:true`, valeurs surchargées, `commit` par défaut conservé.
  - JSON invalide dans `.claude/front-flow.json` → exit 1, stderr nomme le fichier.
  - `resolveTarget("WEBFRONT-123")` → key `WEBFRONT-123` ; `"https://allovoisins.atlassian.net/browse/WEBFRONT-45"` → key + jiraUrl ; `"…/jira/software/projects/WEBFRONT/boards/1?selectedIssue=WEBFRONT-46"` → key `WEBFRONT-46` ; `"https://www.notion.so/allovoisins/Feature-abc123"` → key `null`, notionUrl ; `"n'importe quoi"` → exit 1.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lib/config.mjs` + dispatch.
- [ ] **Step 4: Run** `node --test scripts/test/` → PASS.
- [ ] **Step 5: Commit** `✨ ff.mjs : config par repo et résolution de cible`.

### Task 3: Branche de base

**Files:**
- Create: `scripts/lib/base.mjs`
- Test: `scripts/test/base.spec.mjs`

**Interfaces:**
- Produces: `detectBase(cwd, {fixVersion?: string, start?: string}): string` — `release/<fixVersion>` si `git ls-remote --heads origin release/<fixVersion>` renvoie une ligne, sinon `start` (défaut : branche courante). CLI : `ff.mjs detect-base [--fix-version <v>] [--start <b>]`.

- [ ] **Step 1: Write the failing tests** (repo + `origin` bare local)
  - `release/2026.11` poussée sur origin, `--fix-version 2026.11` → `release/2026.11`.
  - `--fix-version 2026.12` absente → branche courante (`develop`).
  - sans `--fix-version`, `--start feature/x` → `feature/x`.
  - `--fix-version "2026.11 hotfix; touch pwned"` → retourne la branche courante, aucun fichier `pwned` créé.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `✨ ff.mjs : détection de la branche de base`.

### Task 4: Inventaire agents/skills

**Files:**
- Create: `defaults/mapping.json`, `scripts/lib/frontmatter.mjs`, `scripts/lib/inventory.mjs`
- Test: `scripts/test/inventory.spec.mjs` (+ fixtures créées dans un dossier temporaire par le test)

**Interfaces:**
- Consumes: `loadConfig()` (Task 2) pour `mapping` surchargé.
- Produces:
  - `parseFrontmatter(text): Record<string, string|boolean>` (bloc `---` initial ; `true`/`false` en booléens ; valeurs `>`/`|` multilignes ramenées à une chaîne)
  - `inventory(cwd, {claudeHome}): {available: Item[], unusable: Item[], missing: Missing[]}` avec `Item = {id, kind: "agent"|"skill", source: "user"|"repo"|"plugin"}` et `Missing = {id, phase, fallback: string|null, fallbackAvailable: boolean}`
  - Sources : `<claudeHome>/agents/*.md`, `<claudeHome>/skills/*/SKILL.md`, `<toplevel>/.claude/{agents,skills}`, et pour chaque entrée de `<claudeHome>/plugins/installed_plugins.json` (`version: 2`, `plugins["nom@marketplace"]`, dernier `installPath`) ses `agents/*.md` et `skills/*/SKILL.md`, id = `<plugin>:<name>`.
  - `claudeHome` = `process.env.FF_CLAUDE_HOME ?? ~/.claude`. CLI : `ff.mjs inventory`.
- `defaults/mapping.json` :
  ```json
  {"implement": [{"id":"vue-developer","kind":"agent","fallback":"web-front:vue-developer"},{"id":"typescript-pro","kind":"agent","fallback":"web-front:typescript-pro"},{"id":"writing-clean-code","kind":"skill","fallback":null},{"id":"developing-scss","kind":"skill","fallback":"web-front:developing-scss"}],
   "review": [{"id":"reviewing-code","kind":"skill","fallback":"code-review"}],
   "recette": [{"id":"auditing-accessibility","kind":"skill","fallback":"web-front:audit-a11y"},{"id":"auditing-performance","kind":"skill","fallback":null},{"id":"runtime-bug-reporter","kind":"skill","fallback":null}],
   "context": [{"id":"thot:thot-read","kind":"skill","fallback":null},{"id":"web-front:figma-analyzer","kind":"agent","fallback":null},{"id":"web-front:type-generator","kind":"agent","fallback":null}]}
  ```

- [ ] **Step 1: Write the failing tests**
  - fixture : skill `reviewing-code` avec `disable-model-invocation: true` → dans `unusable`, pas dans `available`.
  - fixture sans `vue-developer` mais plugin `web-front` avec `agents/vue-developer.md` → `missing` contient `{id:"vue-developer", fallback:"web-front:vue-developer", fallbackAvailable:true}`.
  - `parseFrontmatter` sur une `description: >` multiligne → chaîne non vide.
  - `installed_plugins.json` absent → pas d'erreur, plugins ignorés.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `✨ ff.mjs : inventaire des agents et skills`.

### Task 5: Commit et attente de déploiement

**Files:**
- Create: `scripts/lib/commit.mjs`, `scripts/lib/deploy.mjs`
- Test: `scripts/test/commit.spec.mjs`, `scripts/test/deploy.spec.mjs`

**Interfaces:**
- Consumes: `loadConfig()` (Task 2).
- Produces:
  - `runCommit(cwd, {emoji, files, desc}): string` — prend `config.commit` (argv), remplace `{emoji}`, `{files}`, `{desc}` **dans chaque élément**, puis `execFileSync(argv[0], argv.slice(1), {cwd})` ; renvoie le SHA court du nouveau HEAD. N'effectue jamais de `git add`. CLI : `ff.mjs commit --emoji ✨ --files "X.vue" --desc "…"`.
  - `waitDeploy({sha, check, timeoutSec = 900, intervalSec = 15, fetchImpl = fetch}): Promise<"ready"|"timeout">` — `check = config.recetteReadyCheck` = `{url}` : GET `url`, prêt si le corps contient les 7 premiers caractères de `sha`. CLI : `ff.mjs wait-deploy --sha <sha> [--timeout <s>]` → exit 0 prêt, 2 si `recetteReadyCheck` absent (« confirme manuellement »), 1 timeout.

- [ ] **Step 1: Write the failing tests**
  - index avec un fichier stagé, `--desc 'corrige "x" $(touch pwned) \`id\` — été'` → commit créé, message contient la chaîne exacte, aucun fichier `pwned`.
  - index vide → exit 1 (erreur de git relayée).
  - `waitDeploy` avec `fetchImpl` simulé renvoyant le SHA au 2ᵉ appel, `intervalSec:0` → `"ready"` ; jamais → `"timeout"` avec `timeoutSec:0`.
  - CLI `wait-deploy` sans `recetteReadyCheck` → exit 2.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `✨ ff.mjs : commit par gabarit et attente du déploiement`.

### Task 6: Références partagées, orchestrateur et setup

**Files:**
- Create: `skills/ff-shared/references/{state.md,config.md,ct-read.md,gates.md}`, `skills/front-flow/SKILL.md`, `skills/setup/SKILL.md`
- Test: `scripts/test/skills.spec.mjs`

**Interfaces:**
- Consumes: toutes les sous-commandes `ff.mjs` (Tasks 1–5), appelées sous la forme `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" <cmd>`.
- Produces: noms de sous-skills invoqués par l'orchestrateur : `front-flow:ff-context`, `front-flow:ff-plan`, `front-flow:ff-implement`, `front-flow:ff-pr`, `front-flow:ff-review`, `front-flow:ff-recette`.

Contenu imposé :
- `front-flow/SKILL.md` (`argument-hint: [WEBFRONT-123 | URL Jira | URL Notion]`) : (1) `resolve-target` si argument ; sinon `state current`, puis `state list` (0 → demander une cible ; 1 → elle ; plusieurs → `AskUserQuestion`) ; URL Notion seule → clé lue dans la propriété Jira de la page (Notion MCP), sinon demandée. (2) `inventory` : afficher `unusable`/`missing` en une ligne chacun, ne pas bloquer. (3) Nouvelle feature : `config get` (si `configured:false`, proposer `/front-flow:setup`), Jira (fixVersion) → `detect-base`, puis **un seul** `AskUserQuestion` ≤ 4 questions pré-remplies (base, worktree/in-place, flags, URL + compte de recette) ; créer le worktree si choisi (`<worktreesDir>/<KEY>`, branche `feature/<KEY>`), `state set`. (4) Router : invoquer la sous-skill de `state.phase` ; à son retour relire l'état et enchaîner jusqu'à une gate ou `done`/`abandoned`. Toujours travailler dans `state.worktree` s'il est défini.
- `setup/SKILL.md` : détecter `scripts/verify.sh`, `scripts/commit.mjs`, scripts `package.json` (`lint`, `typecheck`, `test`) ; proposer la config (ILokYou-Site : `verify:"scripts/verify.sh"`, `commit:["node","scripts/commit.mjs","-e","{emoji}","-f","{files}","-d","{desc}"]`, `worktreesDir:".worktrees"`) ; écrire `.claude/front-flow.json` après accord ; lancer `inventory`.
- `ct-read.md` : appel `thot:thot-read <BACK> --platform webfront --no-ask [--previous <…/front-flow/<KEY>/ct-bundle.json>]` ; copie du paquet rendu vers `…/front-flow/<KEY>/ct-bundle.json` **après** prise en compte seulement ; conduite par verdict = table de `thot-read` (engagé → coder ; brouillon → coder + prévenir ; périmé/incomplet → demander ; retiré → ne pas coder) ; à la reprise, `delta` non nul → prévenir avant de continuer. CT en lien Notion → `ct.source:"notion"`, pas de Thot.
- `gates.md` : texte exact des 3 gates et options (Gate 3 : « Accepté » → `done` + proposition de supprimer le worktree, « À reprendre » → `implement`, « Abandonner » → `abandoned`).

- [ ] **Step 1: Write the failing test** `skills.spec.mjs` : pour chaque `skills/*/SKILL.md` (hors `ff-shared`) : frontmatter avec `name` = nom du dossier et `description` non vide ; ≤ 80 lignes (≤ 150 pour `front-flow`) ; tout `references/<x>.md` cité existe sous `skills/ff-shared/references/` ; toute sous-commande `ff.mjs <cmd>` citée ∈ {`state`, `config`, `resolve-target`, `detect-base`, `inventory`, `commit`, `wait-deploy`} ; les sous-skills `ff-*` ont `user-invocable: false` ; aucun caractère ASCII de remplacement d'accent dans des mots courants (`/\b(etat|creer|deja|recupere)\b/` absent).
- [ ] **Step 2: Run** → FAIL. **Step 3: Write** les 6 fichiers (charger la skill `creating-skills`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `✨ skills : orchestrateur, setup et références`.

### Task 7: Phases context, plan, implement

**Files:**
- Create: `skills/ff-context/SKILL.md`, `skills/ff-plan/SKILL.md`, `skills/ff-implement/SKILL.md`
- Test: `scripts/test/skills.spec.mjs` (déjà en place, couvre les nouveaux fichiers)

Contenu imposé :
- `ff-context` : Jira (Atlassian MCP) : description, critères, fixVersion, liens (ticket BACK) ; Notion (spec, lien CT, lien Figma) ; Figma → agent `web-front:figma-analyzer` si présent ; CT selon `references/ct-read.md` ; types via `web-front:type-generator` si CT engagée et le dev le veut ; écrire `…/front-flow/<KEY>/brief.md` (specs, critères d'acceptation numérotés, maquette, contrat) ; `state set phase=plan`. À la reprise (état existant, phase > context) : seule la relecture CT est rejouée.
- `ff-plan` : passer en mode plan (`EnterPlanMode`), plan basé sur `brief.md`, agents/skills de `mapping.implement` cités ; **Gate 1** = `ExitPlanMode` ; plan approuvé copié dans `…/<KEY>/plan.md` ; `state set phase=implement`.
- `ff-implement` : dispatch de l'agent `mapping.implement[0]` (ou son repli) avec `brief.md` + `plan.md` et la consigne de charger les skills du mapping ; puis `config.verify` jusqu'au vert (3 tentatives max, sinon s'arrêter et montrer l'erreur) ; `state set phase=pr`. Retour depuis la recette (« À reprendre ») : le rapport de recette est ajouté au prompt.

- [ ] **Step 1: Write** les 3 SKILL.md (le contenu en prose n'a pas de test d'échec préalable ; `skills.spec.mjs` vérifie la structure).
- [ ] **Step 2: Run** `node --test scripts/test/` → PASS.
- [ ] **Step 3: Commit** `✨ skills : phases context, plan, implement`.

### Task 8: Phases pr, review, recette

**Files:**
- Create: `skills/ff-pr/SKILL.md`, `skills/ff-review/SKILL.md`, `skills/ff-recette/SKILL.md`

Contenu imposé :
- `ff-pr` : regrouper les changements en commits logiques ; pour chacun, `git add <fichiers explicites>` puis `ff.mjs commit` ; **Gate 2** : aperçu (liste des commits, titre `<KEY> : <résumé>`, corps : contexte, changements, critères, lien CT) → `AskUserQuestion` ; après accord : `git push -u origin <branche>`, `gh pr create --base <state.base> --title … --body-file …` ; `state set pr_url=… phase=review` ; transition Jira « En relecture » si `jiraTransitions`.
- `ff-review` : `Skill reviewing-code "<pr_url> <flags>"` (repli `code-review` si inventorié absent/inutilisable, en le disant) ; puis récupérer **tous** les commentaires non résolus de la PR (`gh api repos/{owner}/{repo}/pulls/{n}/comments` + threads via `gh api graphql` `reviewThreads(isResolved:false)`) ; si le dev a choisi « Ne pas publier » : traiter le `review.json` local dont le chemin est rendu par le skill ; appliquer `superpowers:receiving-code-review` ; correctifs → `verify` → un commit par lot → push ; réponses inline montrées puis envoyées après accord ; proposer une relance de `reviewing-code` seulement si un P0/P1 a été corrigé ; `state set phase=recette`.
- `ff-recette` : URL = `state.recette_url` (env déployé) ; avant chaque passe : `ff.mjs wait-deploy --sha $(git rev-parse HEAD)` (exit 2 → demander au dev de confirmer en une ligne) ; Chrome DevTools MCP : connexion avec `recette_account`, chaque critère de `brief.md` vérifié, console et réseau relevés ; skills de `mapping.recette` selon les flags ; rapport P0–P3 dans `…/<KEY>/recette-<n>.md` ; correctifs P0–P2 par lot → `verify` → commit → push → nouvelle passe ; **Gate 3** selon `references/gates.md` ; transitions Jira si activées.

- [ ] **Step 1: Write** les 3 SKILL.md.
- [ ] **Step 2: Run** `node --test scripts/test/` → PASS.
- [ ] **Step 3: Commit** `✨ skills : phases pr, review, recette`.

### Task 9: Validation et rodage

**Files:**
- Create: `README.md` (installation, `/front-flow:setup`, usage, prérequis : retirer `disable-model-invocation` de `reviewing-code`), `docs/rodage.md`

- [ ] **Step 1:** `claude plugin validate ~/dev/front-flow` → aucune erreur.
- [ ] **Step 2:** `node --test scripts/test/` → tout PASS.
- [ ] **Step 3:** Installation locale : `/plugin marketplace add ~/dev/front-flow` puis `/plugin install front-flow@front-flow-local` ; vérifier que `/front-flow:front-flow` et `/front-flow:setup` apparaissent et que les `ff-*` n'apparaissent pas dans le menu.
- [ ] **Step 4:** Smoke test dans ILokYou-Site : `node ~/dev/front-flow/scripts/ff.mjs inventory` et `config get` → sorties cohérentes avec l'inventaire réel (reviewing-code signalé inutilisable tant que le flag est présent).
- [ ] **Step 5:** Audit `claude-plugin-auditor` sur le plugin ; corriger les P0/P1.
- [ ] **Step 6:** Écrire `docs/rodage.md` : rodage 1 (petit ticket WEBFRONT d'ILokYou-Site, de bout en bout, puis `/clear` et reprise sans argument), rodage 2 (Front-Disconnected, setup différent), grille de relevé des frictions.
- [ ] **Step 7: Commit** `📝 README, rapport d'audit et plan de rodage`.
