import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookKey, parseQuery, refFor, splitReference } from '../../src/app/refparse.js';

const full = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
const p = (q, cur = { abbr: 'John' }) => parseQuery(full, q, cur);
const names = (r) => r.suggestions.map((b) => b.name);

describe('the reported bug', () => {
  it('"1 john 3:16" resolves to 1 John 3:16', () => {
    const r = p('1 john 3:16');
    expect([r.kind, r.book?.name, r.chapter, r.verse, r.error]).toEqual(['resolved', '1 John', 3, 16, null]);
  });
});

describe('number prefixes, case, spaces, periods', () => {
  it.each(['1john', '1 john', '1 John', '1JOHN', '1 jn.', '1jn', 'I John', 'i jn.', 'First John', 'first john', '1st John', '1st jn', 'I. John'])(
    '%s → 1 John', (q) => {
      const r = p(q);
      expect(r.kind).toBe('resolved');
      expect(r.book.name).toBe('1 John');
    },
  );
  it.each([['II Kings', '2 Kings'], ['second kings', '2 Kings'], ['2nd Sam', '2 Samuel'], ['III John', '3 John'], ['third jn', '3 John'], ['3 jn', '3 John'], ['ii cor', '2 Corinthians'], ['1 Cor', '1 Corinthians'], ['1 thess', '1 Thessalonians'], ['2 tim.', '2 Timothy'], ['1 pet', '1 Peter']])(
    '%s → %s', (q, name) => expect(p(q).book?.name).toBe(name),
  );
  it('bookKey normalizes ordinals and strips punctuation', () => {
    expect(bookKey('I. Jn.')).toBe('1jn');
    expect(bookKey('Second  Kings')).toBe('2kings');
    expect(bookKey('Isaiah')).toBe('isaiah');
  });
});

describe('common abbreviations', () => {
  it.each([
    ['Gen', 'Genesis'], ['Ex', 'Exodus'], ['Exod', 'Exodus'], ['Lev', 'Leviticus'], ['Ps', 'Psalm'], ['Psa', 'Psalm'], ['Pss', 'Psalm'],
    ['Psalms', 'Psalm'], ['Prov', 'Proverbs'], ['Isa', 'Isaiah'], ['Jer', 'Jeremiah'], ['Mt', 'Matthew'], ['Matt', 'Matthew'], ['Mk', 'Mark'],
    ['Lk', 'Luke'], ['Jn', 'John'], ['Rom', 'Romans'], ['Rev', 'Revelation'], ['Revelations', 'Revelation'], ['Song of Songs', 'Song of Solomon'],
    ['Song of Solomon', 'Song of Solomon'], ['Song', 'Song of Solomon'], ['Canticles', 'Song of Solomon'], ['SoS', 'Song of Solomon'],
    ['Phil', 'Philippians'], ['Philem', 'Philemon'], ['Jas', 'James'], ['Eccl', 'Ecclesiastes'], ['Ezek', 'Ezekiel'],
  ])('%s → %s', (q, name) => {
    const r = p(q);
    expect(r.kind).toBe('resolved');
    expect(r.book.name).toBe(name);
  });
});

describe('reference forms', () => {
  it.each([
    ['John 3:16', 3, 16], ['john 3.16', 3, 16], ['john 3 16', 3, 16], ['john3:16', 3, 16], ['John 3: 16', 3, 16],
    ['John 3', 3, null], ['ps 23', 23, null], ['Rom 8:28-30', 8, 28], ['1 jn 3:16', 3, 16], ['I Jn. 3.16', 3, 16],
  ])('%s → %s:%s', (q, c, v) => {
    const r = p(q);
    expect([r.chapter, r.verse]).toEqual([c, v]);
  });
  it('splitReference keeps a lone number prefix as part of the book', () => {
    expect(splitReference('1 john')).toEqual({ bookText: '1 john', chapter: null, verse: null });
    expect(splitReference('2')).toEqual({ bookText: '2', chapter: null, verse: null });
    expect(splitReference('2 kings 5')).toEqual({ bookText: '2 kings', chapter: 5, verse: null });
  });
  it('a bare reference uses the current book', () => {
    const r = p('3:16', { abbr: 'John' });
    expect([r.kind, r.book.name, r.chapter, r.verse]).toEqual(['resolved', 'John', 3, 16]);
    expect(parseQuery(full, '3:16', null).kind).toBe('none');
  });
  it('single-chapter books read one number as a verse', () => {
    const r = p('Jude 5');
    expect([r.chapter, r.verse, r.error]).toEqual([1, 5, null]);
    expect(p('III John 4').book.name).toBe('3 John');
  });
  it('out-of-range chapter or verse is an error, never a jump', () => {
    expect(p('John 22').error).toBe('John has 21 chapters.');
    expect(p('John 3:99').error).toBe('John 3 has 36 verses.');
  });
  it('refFor validates and defaults the verse to 1', () => {
    const john = full.books.find((b) => b.abbr === 'John');
    expect(refFor(john, 3, null)).toEqual({ chapter: 3, verse: 1 });
    expect(refFor(john, 22, 1)).toBeNull();
    expect(refFor(john, null, null)).toBeNull();
  });
});

describe('never silently choose wrong', () => {
  it('"J" is ambiguous and lists J books', () => {
    const r = p('J');
    expect(r.kind).toBe('ambiguous');
    expect(r.book).toBeNull();
    expect(names(r)).toEqual(expect.arrayContaining(['John', 'Job', 'James', 'Joshua']));
    expect(r.suggestions.length).toBeLessThanOrEqual(8);
  });
  it('"Ph" suggests Philippians and Philemon', () => {
    const r = p('Ph');
    expect(r.kind).toBe('ambiguous');
    expect(names(r)).toEqual(['Philippians', 'Philemon']);
  });
  it.each([['jud', ['Judges', 'Jude']], ['ma', ['Malachi', 'Matthew', 'Mark']], ['jo', ['Joshua', 'Job', 'Joel', 'Jonah', 'John']]])(
    '%s is ambiguous', (q, expected) => {
      const r = p(q);
      expect(r.kind).toBe('ambiguous');
      expect(names(r)).toEqual(expect.arrayContaining(expected));
    },
  );
  it('a lone ordinal suggests numbered books (and Isaiah for "I")', () => {
    expect(p('1').kind).toBe('ambiguous');
    expect(names(p('ii')).every((n) => n.startsWith('2 '))).toBe(true);
    expect(names(p('I'))).toContain('Isaiah');
    expect(names(p('I'))).toContain('1 Samuel');
  });
  it('single letters never auto-resolve', () => {
    for (const q of ['o', 'z', 'r', 'g']) expect(p(q).kind).not.toBe('resolved');
  });
  it('an unambiguous prefix auto-resolves', () => {
    expect(p('obad').book.name).toBe('Obadiah');
    expect(p('habak').book.name).toBe('Habakkuk');
    expect(p('1 j').book.name).toBe('1 John');
    expect(p('philem').book.name).toBe('Philemon');
  });
  it('typos give fuzzy suggestions, not a resolution', () => {
    const r = p('genisis 1');
    expect(r.kind).toBe('fuzzy');
    expect(r.book).toBeNull();
    expect(names(r)[0]).toBe('Genesis');
    expect(names(p('revelatoin'))).toContain('Revelation');
  });
  it('nonsense → none; empty → empty', () => {
    expect(p('xyzzy').kind).toBe('none');
    expect(p('Hezekiah').book).toBeNull(); // only a fuzzy suggestion (Ezekiel), never a jump
    expect(p('').kind).toBe('empty');
    expect(p('   ').kind).toBe('empty');
  });
});
