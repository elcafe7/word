// Word RSVP engine — original code written for Word (not derived from any third-party RSVP project).

/**
 * Split one paragraph (a verse) into whitespace-separated tokens.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeParagraph(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean);
}

/**
 * Flatten chapters of paragraphs into one token array.
 * @param {{title?: string, paragraphs: string[]}[]} chapters
 * @returns {{tokens: string[], paraStarts: number[], chapters: {title: string, start: number}[]}}
 */
export function buildTokens(chapters) {
  const tokens = [];
  const paraStarts = [];
  const starts = [];
  for (const ch of chapters) {
    starts.push({ title: ch.title ?? '', start: tokens.length });
    for (const p of ch.paragraphs) {
      paraStarts.push(tokens.length);
      for (const t of tokenizeParagraph(p)) tokens.push(t);
    }
  }
  return { tokens, paraStarts, chapters: starts };
}
