import { afterEach, describe, expect, it } from 'vitest';
import { applyFontPct, clampPct, PCT_DEFAULT, PCT_MAX, PCT_MIN, wirePct } from '../../src/app/tune.js';

describe('clampPct', () => {
  it('defaults to 100 for empty, junk, or non-numbers', () => {
    for (const bad of [undefined, null, '', '  ', 'nope', NaN, Infinity, -Infinity, {}, []]) {
      expect(clampPct(bad)).toBe(PCT_DEFAULT);
    }
  });
  it('clamps to 50–300 and rounds', () => {
    expect(clampPct(50)).toBe(PCT_MIN);
    expect(clampPct(300)).toBe(PCT_MAX);
    expect(clampPct(49)).toBe(PCT_MIN);
    expect(clampPct(301)).toBe(PCT_MAX);
    expect(clampPct(149.4)).toBe(149);
    expect(clampPct(149.5)).toBe(150);
    expect(clampPct(' 175 ')).toBe(175);
    expect(clampPct('50')).toBe(50);
    expect(clampPct('300')).toBe(300);
  });
});

describe('applyFontPct', () => {
  afterEach(() => document.documentElement.style.removeProperty('--font-scale'));

  it('sets --font-scale as a fraction of 100, clamped', () => {
    applyFontPct(150);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.5');
    applyFontPct(10);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.5');
    applyFontPct(900);
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('3');
  });
});

describe('wirePct', () => {
  function field(value = '100') {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    document.body.append(input);
    return input;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies live on a valid input without rewriting the field', () => {
    const input = field();
    const seen = [];
    wirePct(input, (v, writeField) => seen.push([v, writeField]), () => 100);
    input.value = '120';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([[120, false]]);
    expect(input.value).toBe('120');
  });

  it('does not apply mid-typing while the number is out of range', () => {
    const input = field();
    const seen = [];
    wirePct(input, (v) => seen.push(v), () => 100);
    input.value = '2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([]);
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(seen).toEqual([]);
  });

  it('clamps on change and Enter, and reverts empty or junk to the saved value', () => {
    const input = field();
    let saved = 100;
    wirePct(input, (v, writeField = true) => {
      saved = clampPct(v);
      if (writeField) input.value = String(saved);
    }, () => saved);

    input.value = '999';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saved).toBe(300);
    expect(input.value).toBe('300');

    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(saved).toBe(300);
    expect(input.value).toBe('300');

    input.value = '10';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(saved).toBe(50);
    expect(input.value).toBe('50');
  });
});
