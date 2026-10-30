import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS, loadMinimal, loadPosition, loadSettings, loadTheme, saveMinimal, savePosition, saveSettings, saveTheme,
} from '../../src/app/store.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('settings', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('defaults on bad JSON', () => {
    localStorage.setItem('word-settings', '{nope');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('replaces out-of-range or wrong-type fields only', () => {
    localStorage.setItem('word-settings', JSON.stringify({ v: 1, wpm: 950, frameSize: 2, redLetter: 'yes', commaMult: 1.7, verseMult: 4.05, status: 'off' }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, frameSize: 2, commaMult: 1.7, status: 'off' });
  });
  it('rejects a wpm off the 25 step', () => {
    localStorage.setItem('word-settings', JSON.stringify({ wpm: 310 }));
    expect(loadSettings().wpm).toBe(300);
  });
  it('saveSettings merges and persists', () => {
    expect(saveSettings({ wpm: 600 }).wpm).toBe(600);
    expect(JSON.parse(localStorage.getItem('word-settings'))).toEqual({ ...DEFAULT_SETTINGS, wpm: 600 });
  });
  it('defaults and no throw when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadPosition()).toBeNull();
    expect(loadTheme()).toBeNull();
    expect(loadMinimal()).toBe(false);
    expect(() => saveSettings({ wpm: 500 })).not.toThrow();
    expect(() => saveTheme('light')).not.toThrow();
    expect(() => savePosition({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 0 })).not.toThrow();
  });
});

describe('position', () => {
  it('round-trips', () => {
    savePosition({ edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 5, updatedAt: 1760893200000 });
    expect(localStorage.getItem('word-position')).toBe('{"v":1,"edition":"kjv","abbr":"John","chapter":3,"verse":16,"word":5,"updatedAt":1760893200000}');
    expect(loadPosition()).toEqual({ v: 1, edition: 'kjv', abbr: 'John', chapter: 3, verse: 16, word: 5, updatedAt: 1760893200000 });
  });
  it('ignores invalid values', () => {
    for (const bad of ['x', '{}', '{"v":2,"edition":"kjv","abbr":"John","chapter":3,"verse":1,"word":0}', '{"v":1,"edition":"kjv","abbr":"John","chapter":0,"verse":1,"word":0}', '{"v":1,"edition":"kjv","abbr":"John","chapter":3,"verse":1,"word":-1}']) {
      localStorage.setItem('word-position', bad);
      expect(loadPosition()).toBeNull();
    }
  });
});

describe('theme and minimal', () => {
  it('theme', () => {
    expect(loadTheme()).toBeNull();
    saveTheme('light');
    expect(loadTheme()).toBe('light');
    localStorage.setItem('word-theme', 'blue');
    expect(loadTheme()).toBeNull();
  });
  it('minimal', () => {
    expect(loadMinimal()).toBe(false);
    saveMinimal(true);
    expect(localStorage.getItem('word-minimal')).toBe('1');
    expect(loadMinimal()).toBe(true);
    saveMinimal(false);
    expect(loadMinimal()).toBe(false);
  });
});
