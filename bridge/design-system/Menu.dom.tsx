/**
 * The menu in a happy-dom document. What matters: the trigger opens and closes it and says so in `aria-expanded`; Esc closes it and hands
 * the focus back to the trigger; a pointer down or focus outside closes it; an item closes it by its `closing`, handing the focus back or
 * leaving it, while a `stays-open` item, a toggle, leaves it open; a trigger named apart from its glyph keeps that name; an item shows its
 * hint, a checked item says so and shows its check, a pressed one only says so; a button trigger is drawn as a button; and the words are
 * text, never markup.
 */
import {
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
import type { ReactNode } from 'react';

import { Menu, MenuItem } from './Menu.tsx';

const NOTHING = (): void => undefined;

function renderMenu() {
  render(
    <>
      <Menu label="Example options" trigger="icon" align="end" triggerName="Example options" triggerContent="⋯">
        <MenuItem label="Choose" closing="return-focus" onChoose={NOTHING} />
        <MenuItem label="Open elsewhere" closing="keep-focus" onChoose={NOTHING} />
        <MenuItem label="Toggle" closing="stays-open" onChoose={NOTHING} />
      </Menu>
      <button type="button">Outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Example options' });
  return { trigger, menu: () => screen.queryByRole('dialog', { name: 'Example options' }) };
}

afterEach(cleanup);

describe('the menu', () => {
  test('opens and closes from its trigger, saying so', () => {
    const { trigger, menu } = renderMenu();
    expect(menu()).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(menu()).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(trigger);
    expect(menu()).toBeNull();
  });

  test('closes on Esc and hands the focus back to its trigger', () => {
    const { trigger, menu } = renderMenu();
    fireEvent.click(trigger);
    screen.getByRole('button', { name: 'Toggle' }).focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('closes on a pointer down or focus outside', () => {
    const { trigger, menu } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(menu()).toBeNull();

    fireEvent.click(trigger);
    fireEvent.focusIn(screen.getByRole('button', { name: 'Outside' }));
    expect(menu()).toBeNull();
  });

  test('stays open on a pointer down inside it and on a stays-open item', () => {
    const { trigger, menu } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Toggle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(menu()).not.toBeNull();
  });

  test('closes on a closing item, handing the focus back or leaving it as the item says', () => {
    const { trigger, menu } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);

    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.click(trigger);
    outside.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Open elsewhere' }));
    expect(menu()).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  test('an item calls its choice', () => {
    const chosen: string[] = [];
    render(
      <Menu label="Example options" trigger="outlined" align="start" triggerContent="Range">
        <MenuItem label="Choose" closing="return-focus" onChoose={() => chosen.push('Choose')} />
      </Menu>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(chosen).toEqual(['Choose']);
  });
});

describe('the items', () => {
  function openMenuOf(items: ReactNode): void {
    render(<Menu label="Example items" trigger="outlined" align="start" marked triggerContent="Range">{items}</Menu>);
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
  }

  test('an item with a hint shows it after its label', () => {
    openMenuOf(<MenuItem label="Fit" hint="the rows shown" closing="return-focus" onChoose={NOTHING} />);
    expect(screen.getByRole('button', { name: 'Fit the rows shown' }).querySelector('.bridge-menu-hint')?.textContent).toBe('the rows shown');
  });

  test('a checked item says so and shows its check, a pressed one only says so', () => {
    openMenuOf(
      <>
        <MenuItem label="Wide titles" checked closing="return-focus" onChoose={NOTHING} />
        <MenuItem label="4h" pressed closing="return-focus" onChoose={NOTHING} />
        <MenuItem label="Review rows" checked={false} closing="return-focus" onChoose={NOTHING} />
      </>,
    );
    const checked = screen.getByRole('button', { name: 'Wide titles' });
    const pressed = screen.getByRole('button', { name: '4h' });
    const unchecked = screen.getByRole('button', { name: 'Review rows' });
    expect([checked.getAttribute('aria-pressed'), checked.querySelector('.bridge-menu-check')?.textContent]).toEqual(['true', '✓']);
    expect([pressed.getAttribute('aria-pressed'), pressed.querySelector('.bridge-menu-check')]).toEqual(['true', null]);
    expect(unchecked.getAttribute('aria-pressed')).toBe('false');
  });

  test('a marked trigger and a marked item carry the mark, and an item opening a dialog says whether it is open', () => {
    openMenuOf(<MenuItem label="Custom…" marked dialogIsOpen={false} closing="keep-focus" onChoose={NOTHING} />);
    const item = screen.getByRole('button', { name: 'Custom…' });
    expect(screen.getByRole('button', { name: 'Range' }).hasAttribute('data-marked')).toBe(true);
    expect([item.hasAttribute('data-marked'), item.getAttribute('aria-haspopup'), item.getAttribute('aria-expanded')]).toEqual([true, 'dialog', 'false']);
  });
});

describe('the trigger', () => {
  test('an icon trigger keeps the name given apart from its glyph, and a button trigger is drawn as a button', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Example options' }).textContent).toBe('⋯');
    cleanup();
    render(<Menu label="Job moves" trigger="button" align="end" triggerContent="More"><MenuItem label="Stop" closing="return-focus" onChoose={NOTHING} /></Menu>);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect([trigger.classList.contains('bridge-button'), trigger.getAttribute('data-trigger')]).toEqual([true, 'button']);
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    render(
      <Menu label={planted} trigger="outlined" align="start" triggerContent={planted}>
        <MenuItem label={planted} hint={planted} closing="return-focus" onChoose={NOTHING} />
      </Menu>,
    );
    fireEvent.click(screen.getByRole('button', { name: '<b>planted</b>' }));
    const menu = screen.getByRole('dialog', { name: '<b>planted</b>' });
    expect([menu.querySelector('b'), menu.querySelector('.bridge-menu-item')?.textContent]).toEqual([null, '<b>planted</b><b>planted</b>']);
  });
});
