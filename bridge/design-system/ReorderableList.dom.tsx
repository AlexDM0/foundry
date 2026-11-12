/**
 * The reorderable list, in a happy-dom document. What matters: from the keyboard, Space or Enter grabs a row, the arrows move it in the
 * page with the focus kept on its grip, and Space or Enter drops it, calling `onReorder` once with the old and the new index; Esc puts it
 * back, calls nothing and goes no further up the page; a row never leaves its band, by key or by pointer; a pointer sequence over injected
 * row boxes slides the passed rows, draws the drop line and calls `onReorder` on release, and Esc cancels it; each move is spoken in the
 * caller's words by a polite live region. happy-dom lays nothing out, so the pointer cases inject the row boxes.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ReorderableList, type ReorderableItem } from './ReorderableList.tsx';
import type { RowBox }                           from './utils/ReorderIndexUtil.ts';

interface ExampleRow {
  readonly name:  string;
  readonly band?: string;
}

interface Reorder {
  readonly fromIndex: number;
  readonly toIndex:   number;
}

const GATE_ROWS: readonly ExampleRow[] = [{ name: 'lint' }, { name: 'build' }, { name: 'test' }];
const BANDED_ROWS: readonly ExampleRow[] = [
  { name: 'install', band: 'prepare' },
  { name: 'lint', band: 'gate' },
  { name: 'test', band: 'gate' },
];

const ROW_HEIGHT = 28;
const ROW_GAP = 4;
const LIST_TOP = 100;
const ROW_SPAN = ROW_HEIGHT + ROW_GAP;
const POINTER_ID = 7;

const THREE_ROW_BOXES: readonly RowBox[] = [0, 1, 2].map((index) => ({ top: LIST_TOP + index * ROW_SPAN, height: ROW_HEIGHT }));

function middleOfRow(index: number): number {
  return LIST_TOP + index * ROW_SPAN + ROW_HEIGHT / 2;
}

function itemsOf(rows: readonly ExampleRow[]): ReorderableItem[] {
  return rows.map((row, index) => ({
    key:       row.name,
    content:   <span>{row.name}</span>,
    grabLabel: `Move ${row.name}, position ${index + 1} of ${rows.length}`,
    ...(row.band === undefined ? {} : { band: row.band }),
  }));
}

function renderList(rows: readonly ExampleRow[], reorders: Reorder[], parentKeys: string[] = []): void {
  const announce = (fromIndex: number, toIndex: number): string => `${rows[fromIndex]?.name ?? ''} moved to position ${toIndex + 1}`;
  render(
    <div onKeyDown={(event) => parentKeys.push(event.key)}>
      <ReorderableList
        label="Build gates"
        items={itemsOf(rows)}
        onReorder={(fromIndex, toIndex) => reorders.push({ fromIndex, toIndex })}
        announce={announce}
        measureRows={() => THREE_ROW_BOXES}
      />
    </div>
  );
}

function grip(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Move ${name},`) });
}

function rowOf(name: string): HTMLElement {
  const row = grip(name).closest('li');
  if (row === null) throw new Error(`no row holds the grip of ${name}`);
  return row;
}

function displayedNames(): string[] {
  return screen.getAllByRole('listitem').map((row) => row.textContent);
}

function announcer(): Element {
  const region = document.querySelector('.bridge-reorder-announcer');
  if (region === null) throw new Error('the list has no live region');
  return region;
}

function pressOn(element: HTMLElement, key: string): void {
  fireEvent.keyDown(element, { key });
}

afterEach(() => {
  cleanup();
});

describe('the list', () => {
  test('is a list named by its label, each row led by a grip button named by its grab label', () => {
    renderList(GATE_ROWS, []);
    expect(screen.getByRole('list', { name: 'Build gates' }).closest('.bridge-reorder-list')).not.toBeNull();
    expect(displayedNames()).toEqual(['lint', 'build', 'test']);
    expect(grip('build').getAttribute('aria-label')).toBe('Move build, position 2 of 3');
    expect([grip('build').className, rowOf('build').className]).toEqual(['bridge-reorder-grip', 'bridge-reorder-row']);
    expect(announcer().getAttribute('aria-live')).toBe('polite');
  });
});

describe('a keyboard reorder', () => {
  test('Space grabs, ArrowUp moves the row in the page with the focus on its grip, and Enter drops it with onReorder(1, 0)', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    grip('build').focus();
    pressOn(grip('build'), ' ');
    expect(rowOf('build').getAttribute('data-dragging')).toBe('keyboard');
    pressOn(grip('build'), 'ArrowUp');
    expect(displayedNames()).toEqual(['build', 'lint', 'test']);
    expect(document.activeElement).toBe(grip('build'));
    expect(reorders).toEqual([]);
    pressOn(grip('build'), 'Enter');
    expect(reorders).toEqual([{ fromIndex: 1, toIndex: 0 }]);
    expect(rowOf('build').hasAttribute('data-dragging')).toBe(false);
  });

  test('Enter grabs as well, and a move down keeps the focus on the moved grip', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    grip('lint').focus();
    pressOn(grip('lint'), 'Enter');
    pressOn(grip('lint'), 'ArrowDown');
    pressOn(grip('lint'), 'ArrowDown');
    expect(document.activeElement).toBe(grip('lint'));
    pressOn(grip('lint'), ' ');
    expect(reorders).toEqual([{ fromIndex: 0, toIndex: 2 }]);
  });

  test('Esc puts the row back, calls nothing and goes no further up the page', () => {
    const reorders: Reorder[] = [];
    const parentKeys: string[] = [];
    renderList(GATE_ROWS, reorders, parentKeys);
    grip('test').focus();
    pressOn(grip('test'), ' ');
    pressOn(grip('test'), 'ArrowUp');
    pressOn(grip('test'), 'Escape');
    expect(displayedNames()).toEqual(['lint', 'build', 'test']);
    expect(rowOf('test').hasAttribute('data-dragging')).toBe(false);
    expect(reorders).toEqual([]);
    expect(parentKeys).not.toContain('Escape');
    pressOn(grip('test'), 'Enter');
    pressOn(grip('test'), 'Enter');
    expect(reorders).toEqual([]);
  });

  test('a drop where the row started calls nothing, and the arrows do nothing before a grab', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    pressOn(grip('build'), 'ArrowUp');
    expect(displayedNames()).toEqual(['lint', 'build', 'test']);
    pressOn(grip('build'), ' ');
    pressOn(grip('build'), 'ArrowUp');
    pressOn(grip('build'), 'ArrowDown');
    pressOn(grip('build'), ' ');
    expect(reorders).toEqual([]);
  });
});

describe('the band', () => {
  test('a gate never moves above the prepare step by key, and the list ends hold it at the bottom', () => {
    const reorders: Reorder[] = [];
    renderList(BANDED_ROWS, reorders);
    pressOn(grip('lint'), ' ');
    pressOn(grip('lint'), 'ArrowUp');
    expect(displayedNames()).toEqual(['install', 'lint', 'test']);
    pressOn(grip('lint'), 'ArrowDown');
    pressOn(grip('lint'), 'ArrowDown');
    expect(displayedNames()).toEqual(['install', 'test', 'lint']);
    pressOn(grip('lint'), ' ');
    expect(reorders).toEqual([{ fromIndex: 1, toIndex: 2 }]);
  });

  test('the prepare step never moves below the gates by pointer', () => {
    const reorders: Reorder[] = [];
    renderList(BANDED_ROWS, reorders);
    fireEvent.pointerDown(grip('install'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(0) });
    fireEvent.pointerMove(grip('install'), { pointerId: POINTER_ID, clientY: middleOfRow(2) + 1 });
    expect(document.querySelector('.bridge-reorder-drop-line')).toBeNull();
    fireEvent.pointerUp(grip('install'), { pointerId: POINTER_ID, clientY: middleOfRow(2) + 1 });
    expect(reorders).toEqual([]);
  });

  test('a gate dragged by pointer above the prepare step lands at the top of its own band', () => {
    const reorders: Reorder[] = [];
    renderList(BANDED_ROWS, reorders);
    fireEvent.pointerDown(grip('test'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(2) });
    fireEvent.pointerMove(grip('test'), { pointerId: POINTER_ID, clientY: LIST_TOP - 40 });
    fireEvent.pointerUp(grip('test'), { pointerId: POINTER_ID, clientY: LIST_TOP - 40 });
    expect(reorders).toEqual([{ fromIndex: 2, toIndex: 1 }]);
  });
});

describe('a pointer reorder over injected row boxes', () => {
  test('the dragged row follows the pointer, the passed rows slide up, the drop line marks the landing, and release calls onReorder', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    const pointerTravel = middleOfRow(2) + 1 - middleOfRow(0);
    fireEvent.pointerDown(grip('lint'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(0) });
    expect(grip('lint').hasPointerCapture(POINTER_ID)).toBe(true);
    expect(rowOf('lint').getAttribute('data-dragging')).toBe('pointer');
    fireEvent.pointerMove(grip('lint'), { pointerId: POINTER_ID, clientY: middleOfRow(0) + pointerTravel });
    expect(rowOf('lint').style.getPropertyValue('--reorder-offset')).toBe(`${pointerTravel}px`);
    expect(['build', 'test'].map((name) => rowOf(name).getAttribute('data-shifted'))).toEqual(['up', 'up']);
    expect(document.querySelector('.bridge-reorder-list')?.getAttribute('style')).toContain(`--reorder-slot-span: ${ROW_SPAN}px`);
    expect((document.querySelector('.bridge-reorder-drop-line') as HTMLElement | null)?.style.top).toBe(`${2 * ROW_SPAN + ROW_HEIGHT}px`);
    expect(displayedNames()).toEqual(['lint', 'build', 'test']);
    fireEvent.pointerUp(grip('lint'), { pointerId: POINTER_ID, clientY: middleOfRow(0) + pointerTravel });
    expect(reorders).toEqual([{ fromIndex: 0, toIndex: 2 }]);
    expect(grip('lint').hasPointerCapture(POINTER_ID)).toBe(false);
    expect(document.querySelector('[data-dragging], [data-shifted], .bridge-reorder-drop-line')).toBeNull();
  });

  test('Esc during a drag cancels it: the rows go back and release calls nothing', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    fireEvent.pointerDown(grip('test'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(2) });
    fireEvent.pointerMove(grip('test'), { pointerId: POINTER_ID, clientY: middleOfRow(0) - 1 });
    expect(['lint', 'build'].map((name) => rowOf(name).getAttribute('data-shifted'))).toEqual(['down', 'down']);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-dragging], [data-shifted], .bridge-reorder-drop-line')).toBeNull();
    fireEvent.pointerUp(grip('test'), { pointerId: POINTER_ID, clientY: middleOfRow(0) - 1 });
    expect(reorders).toEqual([]);
  });

  test('another pointer, or a button other than the primary, moves nothing', () => {
    const reorders: Reorder[] = [];
    renderList(GATE_ROWS, reorders);
    fireEvent.pointerDown(grip('lint'), { pointerId: POINTER_ID, button: 2, clientY: middleOfRow(0) });
    expect(rowOf('lint').hasAttribute('data-dragging')).toBe(false);
    fireEvent.pointerDown(grip('lint'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(0) });
    fireEvent.pointerMove(grip('lint'), { pointerId: POINTER_ID + 1, clientY: middleOfRow(2) + 1 });
    fireEvent.pointerUp(grip('lint'), { pointerId: POINTER_ID + 1, clientY: middleOfRow(2) + 1 });
    expect(reorders).toEqual([]);
    expect(rowOf('lint').getAttribute('data-dragging')).toBe('pointer');
  });
});

describe('the announcements', () => {
  test('each keyboard move is spoken in the caller\'s words, and Esc speaks the row back at its place', () => {
    renderList(GATE_ROWS, []);
    pressOn(grip('lint'), ' ');
    expect(announcer().textContent).toBe('');
    pressOn(grip('lint'), 'ArrowDown');
    expect(announcer().textContent).toBe('lint moved to position 2');
    pressOn(grip('lint'), 'ArrowDown');
    expect(announcer().textContent).toBe('lint moved to position 3');
    pressOn(grip('lint'), 'Escape');
    expect(announcer().textContent).toBe('lint moved to position 1');
  });

  test('each pointer move to a new place is spoken', () => {
    renderList(GATE_ROWS, []);
    fireEvent.pointerDown(grip('test'), { pointerId: POINTER_ID, button: 0, clientY: middleOfRow(2) });
    fireEvent.pointerMove(grip('test'), { pointerId: POINTER_ID, clientY: middleOfRow(1) - 1 });
    expect(announcer().textContent).toBe('test moved to position 2');
    fireEvent.pointerMove(grip('test'), { pointerId: POINTER_ID, clientY: middleOfRow(0) - 1 });
    expect(announcer().textContent).toBe('test moved to position 1');
  });
});
