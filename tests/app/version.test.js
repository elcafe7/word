import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TAG_RE, footerEditionLine, readOfflineTag } from '../../scripts/offline/version.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

describe('offline release version', () => {
  const tag = readFileSync(resolve(ROOT, 'VERSION'), 'utf8').trim();

  it('VERSION is an offline-YYYYMMDD or offline-YYYYMMDD-N tag', () => {
    expect(tag).toMatch(TAG_RE);
  });

  it('README shows the current tag prominently under the title and in the download line', () => {
    const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(`**Current offline release: [${tag}](https://github.com/elcafe7/word/releases/tag/${tag})**`);
    expect(readme).toContain(`<sub>${tag} · one HTML file per Bible`);
    const date = tag.replace(/^offline-/, '').replace(/-\d+$/, '');
    expect(readme).toContain(`/download/word-offline-${date}-all-editions.zip`);
    expect(readme).toContain(`/download/word-offline-${date}-all-editions.tar.gz`);
    expect(readme).toContain(`All three (.zip)`);
    expect(readme).toContain(`All three (.tar.gz)`);
    expect(readme).toContain(`word-${tag}`);
  });

  it('footer line leads with Word and the tag', () => {
    expect(footerEditionLine(tag, 'Geneva Bible (1599)')).toBe(
      `Word ${tag} · Geneva Bible (1599) · no internet needed`,
    );
  });

  it('WORD_OFFLINE_TAG wins over VERSION', () => {
    expect(readOfflineTag({ WORD_OFFLINE_TAG: 'offline-20260101' })).toBe('offline-20260101');
  });
});
