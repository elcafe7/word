// Passage picker: edition → book → chapter → verse (SPEC §10.9).
import { DEFAULT_EDITION } from '../ref.js';
import { parseQuery, refFor } from '../refparse.js';
import { $, byId, clear, el } from './dom.js';

/**
 * @param {import('../books.js').Index} index
 * @param {{onSelect: (t: {edition: string, abbr: string, chapter: number, verse: number}) => void, onOpen: () => void}} h
 */
export function createPicker(index, h) {
  const root = $('picker');
  const filter = /** @type {HTMLInputElement} */ ($('picker-book-filter'));
  const booksBox = byId('picker-books');
  const numbers = byId('picker-numbers');
  const stepBooks = byId('picker-step-books');
  const nav = byId('picker-nav');
  const crumb = byId('picker-crumb');
  const backBtn = $('picker-back');
  const editions = byId('picker-editions');
  let st = { step: 'books', edition: DEFAULT_EDITION, book: null, chapter: 0, current: null };

  for (const e of index.editions) {
    const b = el('button', { type: 'button', 'data-testid': `picker-edition-${e.id}`, 'aria-pressed': 'false', title: e.name }, e.short);
    b.addEventListener('click', () => {
      st.edition = e.id;
      renderEditions();
    });
    editions.append(b);
  }

  function renderEditions() {
    for (const b of editions.children) b.setAttribute('aria-pressed', String(b.dataset.testid === `picker-edition-${st.edition}`));
  }

  /** Marks the chosen item of a step: filled background, strong border and a check (styles.css), plus aria-current. */
  function markSelected(btn, on) {
    btn.classList.toggle('current', on);
    if (on) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  }

  /** The book that is chosen: the one picked in this session (kept when stepping back), else the current position's. */
  const chosenBook = () => st.book?.abbr ?? st.current?.abbr ?? null;
  /** The chosen chapter of st.book: picked this session, else the current position's when it is the same book. */
  const chosenChapter = () => (st.chapter ? st.chapter : st.current && st.current.abbr === st.book?.abbr ? st.current.chapter : 0);

  function bookButton(b) {
    const btn = el('button', { type: 'button', 'data-testid': 'picker-book', 'data-abbr': b.abbr }, b.name);
    markSelected(btn, chosenBook() === b.abbr);
    btn.addEventListener('click', () => {
      if (st.book?.abbr !== b.abbr) st.chapter = 0;
      st.book = b;
      st.step = 'chapters';
      render();
    });
    return btn;
  }

  const hint = byId('picker-hint');
  /** @type {{el: HTMLElement, run: () => void}[]} */
  let opts = [];
  let active = -1;

  function setActive(i) {
    active = i;
    opts.forEach((o, k) => o.el.setAttribute('aria-selected', String(k === i)));
    if (i >= 0 && opts[i]) {
      filter.setAttribute('aria-activedescendant', opts[i].el.id);
      opts[i].el.scrollIntoView({ block: 'nearest' });
    } else {
      filter.removeAttribute('aria-activedescendant');
    }
  }

  function go(abbr, chapter, verse) {
    close();
    h.onSelect({ edition: st.edition, abbr, chapter, verse });
  }

  function option(testid, label, run, extra) {
    const b = el('button', { type: 'button', role: 'option', id: `picker-opt-${opts.length}`, tabindex: '-1', 'aria-selected': 'false', 'data-testid': testid }, label);
    if (extra) b.append(el('span', { class: 'opt-ref' }, extra));
    b.addEventListener('click', run);
    opts.push({ el: b, run });
    return b;
  }

  function renderBooks() {
    clear(booksBox);
    opts = [];
    active = -1;
    hint.textContent = '';
    filter.removeAttribute('aria-activedescendant');
    const q = filter.value;
    const r = parseQuery(index, q, st.current);
    if (r.kind === 'empty') {
      filter.setAttribute('aria-expanded', 'false');
      for (const [t, label] of [['OT', 'Old Testament'], ['NT', 'New Testament']]) {
        booksBox.append(el('h2', { class: 'picker-heading' }, label));
        const grid = el('div', { class: 'picker-grid books' });
        index.books.filter((b) => b.testament === t).forEach((b) => grid.append(bookButton(b)));
        booksBox.append(grid);
      }
      return;
    }
    const list = el('div', { class: 'picker-suggest', id: 'picker-suggest', role: 'listbox', 'aria-label': 'Suggestions', 'data-testid': 'picker-suggest' });
    const pickBook = (b) => () => {
      const ref = refFor(b, r.chapter, r.verse);
      if (ref) go(b.abbr, ref.chapter, ref.verse);
      else {
        if (st.book?.abbr !== b.abbr) st.chapter = 0;
        st.book = b;
        st.step = 'chapters';
        render();
      }
    };
    if (r.kind === 'resolved') {
      const b = r.book;
      const ref = r.error ? null : refFor(b, r.chapter, r.verse);
      if (ref) {
        const label = `${b.name} ${ref.chapter}:${ref.verse}`;
        list.append(option('picker-go', `Go to ${label}`, () => go(b.abbr, ref.chapter, ref.verse)));
        hint.textContent = `Enter: go to ${label}.`;
      } else {
        hint.textContent = r.error ?? `Enter: choose ${b.name}.`;
      }
      const bb = option('picker-book', b.name, () => {
        if (st.book?.abbr !== b.abbr) st.chapter = 0;
        st.book = b;
        st.step = 'chapters';
        render();
      });
      bb.dataset.abbr = b.abbr;
      list.append(bb);
    } else if (r.suggestions.length) {
      hint.textContent = r.kind === 'fuzzy' ? 'Did you mean one of these? Use ↓ to pick.' : 'More than one book matches. Keep typing or use ↓ to pick.';
      for (const b of r.suggestions) {
        const ref = refFor(b, r.chapter, r.verse);
        const o = option('picker-book', b.name, pickBook(b), ref ? ` ${ref.chapter}:${ref.verse}` : undefined);
        o.dataset.abbr = b.abbr;
        list.append(o);
      }
    }
    if (!opts.length) {
      filter.setAttribute('aria-expanded', 'false');
      booksBox.append(el('p', { class: 'picker-empty' }, 'No matching book.'));
      return;
    }
    booksBox.append(list);
    filter.setAttribute('aria-expanded', 'true');
    // Only an unambiguous result is pre-selected for Enter; ambiguous lists wait for ↓/↑ or a click.
    if (r.kind === 'resolved') setActive(0);
  }

  filter.addEventListener('keydown', (e) => {
    if (!opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(active < opts.length - 1 ? active + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active > 0 ? active - 1 : opts.length - 1);
    } else if (e.key === 'Home' && active >= 0) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && active >= 0) {
      e.preventDefault();
      setActive(opts.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) opts[active].run();
    }
  });

  function renderNumbers(count, kind, isCurrent, onPick) {
    clear(numbers);
    for (let n = 1; n <= count; n += 1) {
      const b = el('button', { type: 'button', 'data-testid': `picker-${kind}`, [kind === 'chapter' ? 'data-ch' : 'data-v']: String(n) }, String(n));
      markSelected(b, isCurrent(n));
      b.addEventListener('click', () => onPick(n));
      numbers.append(b);
    }
  }

  function render() {
    renderEditions();
    stepBooks.hidden = st.step !== 'books';
    numbers.hidden = st.step === 'books';
    nav.hidden = st.step === 'books';
    const cur = st.current;
    if (st.step === 'books') {
      renderBooks();
    } else if (st.step === 'chapters') {
      backBtn.textContent = '‹ Books';
      crumb.textContent = st.book.name;
      const ch = chosenChapter();
      renderNumbers(st.book.verses.length, 'chapter', (n) => n === ch, (n) => {
        st.chapter = n;
        st.step = 'verses';
        render();
      });
    } else {
      backBtn.textContent = '‹ Chapters';
      crumb.textContent = `${st.book.name} ${st.chapter}`;
      renderNumbers(st.book.verses[st.chapter - 1], 'verse', (n) => cur && cur.abbr === st.book.abbr && cur.chapter === st.chapter && cur.verse === n, (n) => {
        close();
        h.onSelect({ edition: st.edition, abbr: st.book.abbr, chapter: st.chapter, verse: n });
      });
    }
  }

  function open(current) {
    h.onOpen();
    st = { step: 'books', edition: current.edition, book: null, chapter: 0, current };
    filter.value = '';
    root.hidden = false;
    render();
    // Focus the filter on devices with a keyboard; avoid popping the phone keyboard.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) filter.focus();
  }

  function close() {
    root.hidden = true;
  }

  filter.addEventListener('input', () => renderBooks());
  backBtn.addEventListener('click', () => {
    st.step = st.step === 'verses' ? 'chapters' : 'books';
    render();
    // Keep the chosen book or chapter in view after stepping back.
    root.querySelector('[aria-current="true"][data-testid^="picker-"]')?.scrollIntoView({ block: 'nearest' });
  });
  $('picker-close').addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });

  return { open, close, isOpen: () => !root.hidden };
}
