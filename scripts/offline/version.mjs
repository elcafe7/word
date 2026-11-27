// Shared offline release-tag helpers (imported by inline.mjs and tests).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const TAG_RE = /^offline-\d{8}(-\d+)?$/;

/** Canonical published tag from VERSION, or WORD_OFFLINE_TAG when set. */
export function readOfflineTag(env = process.env, versionFile = path.join(ROOT, 'VERSION')) {
  const fromEnv = String(env.WORD_OFFLINE_TAG || '').trim();
  if (fromEnv) {
    if (!TAG_RE.test(fromEnv)) throw new Error(`WORD_OFFLINE_TAG must look like offline-YYYYMMDD (got ${fromEnv})`);
    return fromEnv;
  }
  const text = fs.readFileSync(versionFile, 'utf8').trim();
  if (!TAG_RE.test(text)) throw new Error(`VERSION must look like offline-YYYYMMDD (got ${JSON.stringify(text)})`);
  return text;
}

/** Visible footer line in the single-file offline build. */
export function footerEditionLine(tag, editionName) {
  return `Word ${tag} · ${editionName} · no internet needed`;
}
