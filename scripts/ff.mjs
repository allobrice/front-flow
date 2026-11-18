#!/usr/bin/env node
import { loadConfig, resolveTarget } from './lib/config.mjs';
import { readState, writeState, statePath, listStates, currentKey } from './lib/state.mjs';
import { detectBase } from './lib/base.mjs';

// Convention : succès → 0 (+ JSON sur stdout) ; absent / rien à faire → 2 ; erreur → 1.
class Absent extends Error {}
const absent = (msg) => new Absent(msg);

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** `a.b=c` → { a: { b: 'c' } } ; fusionne plusieurs paires. */
function parsePairs(pairs) {
  const patch = {};
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    if (i < 1) throw new Error(`Argument « ${pair} » invalide : attendu clé=valeur.`);
    const path = pair.slice(0, i).split('.');
    let node = patch;
    for (const seg of path.slice(0, -1)) node = node[seg] ??= {};
    node[path.at(-1)] = parseValue(pair.slice(i + 1));
  }
  return patch;
}

const need = (v, what) => {
  if (!v) throw new Error(`Argument manquant : ${what}.`);
  return v;
};

/** `--nom valeur …` → { nom: 'valeur' } ; option inconnue ou sans valeur → erreur. */
function parseOptions(args, known) {
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] ?? '';
    const name = flag.replace(/^--/, '');
    if (!flag.startsWith('--') || !known.includes(name)) {
      throw new Error(`Option « ${flag} » inconnue (${known.map((k) => `--${k}`).join(', ')}).`);
    }
    opts[name] = need(args[i + 1], flag);
  }
  return opts;
}

// Chaque handler reçoit (cwd, args) et renvoie le texte à écrire sur stdout.
const state = {
  path: (cwd, [key]) => `${statePath(cwd, need(key, 'clé'))}\n`,
  get(cwd, [key]) {
    const s = readState(cwd, need(key, 'clé'));
    if (!s) throw absent(`Aucun état pour ${key}.`);
    return json(s);
  },
  set: (cwd, [key, ...pairs]) => json(writeState(cwd, need(key, 'clé'), parsePairs(pairs))),
  list: (cwd) => json(listStates(cwd)),
  current(cwd) {
    const k = currentKey(cwd);
    if (!k) throw absent('Aucune feature en cours : la branche courante ne contient pas de clé de ticket.');
    return `${k}\n`;
  },
};

const commands = {
  config: (cwd, [sub]) => {
    if (sub !== 'get') throw new Error(`Sous-commande « config ${sub ?? ''} » inconnue (get).`);
    return json(loadConfig(cwd));
  },
  'resolve-target': (_cwd, [arg]) => json(resolveTarget(need(arg, 'cible'))),
  'detect-base': (cwd, args) => {
    const opts = parseOptions(args, ['fix-version', 'start']);
    return `${detectBase(cwd, { fixVersion: opts['fix-version'], start: opts.start })}\n`;
  },
  state: (cwd, [sub, ...rest]) => {
    const handler = state[sub];
    if (!handler) throw new Error(`Sous-commande « state ${sub ?? ''} » inconnue (${Object.keys(state).join(', ')}).`);
    return handler(cwd, rest);
  },
};

function main(argv) {
  const [name, ...rest] = argv;
  try {
    const cmd = commands[name];
    if (!cmd) throw new Error(`Commande « ${name ?? ''} » inconnue (${Object.keys(commands).join(', ')}).`);
    process.stdout.write(cmd(process.cwd(), rest));
    return 0;
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    return e instanceof Absent ? 2 : 1;
  }
}

process.exitCode = main(process.argv.slice(2));
