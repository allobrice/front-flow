---
name: setup
description: Prépare un dépôt front pour front-flow — détecte la commande de vérification et le gabarit de commit, propose puis écrit `.claude/front-flow.json`, et lance l'inventaire des agents et skills. À utiliser sur « /front-flow:setup », « configure front-flow pour ce repo », « initialise front-flow », ou quand l'orchestrateur signale une config absente.
---

# front-flow — setup

Produire `.claude/front-flow.json` à la racine du dépôt courant. Clés, défauts et exemples :
`${CLAUDE_PLUGIN_ROOT}/skills/ff-shared/references/config.md`. Rien n'est écrit sans accord.

## 1. Lire l'existant

1. Racine : `git rev-parse --show-toplevel` (hors dépôt git : le dire et s'arrêter).
2. Config actuelle : `node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" config get`. Si `configured` vaut
   `true`, partir de ce fichier : ne proposer que les clés absentes ou à changer.
3. Exit 1 (JSON invalide) : citer le message et s'arrêter, sans écraser le fichier.

## 2. Détecter

| Indice (racine du dépôt) | Proposition |
|---|---|
| `scripts/verify.sh` présent | `verify: "scripts/verify.sh"` |
| sinon, scripts `lint`, `typecheck`, `test` de `package.json` | `verify` = ceux présents, dans cet ordre, joints par ` && ` (`npm run lint && npm run typecheck && npm run test` ; gestionnaire déduit du lockfile : `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, sinon `npm`) |
| aucun des deux | `verify: null`, en le signalant |
| `scripts/commit.mjs` présent | `commit: ["node","scripts/commit.mjs","-e","{emoji}","-f","{files}","-d","{desc}"]` |
| sinon | `commit` par défaut : `["git","commit","-m","{emoji} {desc}"]` |

Toujours proposer `worktreesDir: ".worktrees"`. Garder les défauts pour `recetteUrl`,
`recetteReadyCheck`, `defaultFlags` et `jiraTransitions`, sauf indication du dev.

Pour ILokYou-Site, le résultat attendu est :
`{ "verify": "scripts/verify.sh", "commit": ["node","scripts/commit.mjs","-e","{emoji}","-f","{files}","-d","{desc}"], "worktreesDir": ".worktrees" }`.

## 3. Proposer et écrire

1. Montrer le JSON proposé (complet, indenté) et ce qui a été détecté.
2. `AskUserQuestion` à une question, « Écrire cette config dans .claude/front-flow.json ? » :
   « Écrire » ; « Modifier » (le dev précise : URL de recette, flags par défaut, check de
   déploiement…, puis représenter) ; « Annuler ».
3. « Écrire » : créer `.claude/` au besoin et écrire le fichier (JSON indenté de 2 espaces, ligne
   finale vide). Relire avec `config get` pour valider (exit 0, `configured: true`).
4. Si `<worktreesDir>/` n'est pas ignoré (`git check-ignore -q <worktreesDir>/x`), proposer de
   l'ajouter au `.gitignore` ; ne rien modifier sans accord.

Le fichier est versionnable : ne jamais y mettre de mot de passe ni de jeton.

## 4. Inventaire

`node "${CLAUDE_PLUGIN_ROOT}/scripts/ff.mjs" inventory --all` → JSON compact `{ available, unusable, missing }`
(`available` complet).
Rendre un court bilan :
- `unusable` : skills marquées `disable-model-invocation: true` (front-flow ne peut pas les
  appeler ; retirer cette ligne de leur frontmatter) ;
- `missing` : par phase, l'id manquant et son repli (`fallbackAvailable` : disponible ou non) ;
- conclure par « Prêt : lancer /front-flow <ticket>. »
