/**
 * The menu: the trigger toggles it in `aria-expanded`; Esc (caught before a side panel's), a pointer down or focus outside, and an item by its
 * `closing` close it, but a `stays-open` toggle does not; a caller may hold whether it is open; items show hints, checks, descriptions and
 * separators; and each kind of trigger draws and names itself as its kind does.
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

import { Menu, MenuItem, MenuSeparator } from './Menu.tsx';

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

  test('a disabled item calls nothing and leaves the menu open', () => {
    const chosen: string[] = [];
    render(
      <Menu label="Example options" trigger="icon" align="end" triggerName="Example options" triggerContent="⋯">
        <MenuItem label="Not now" disabled closing="return-focus" onChoose={() => chosen.push('chosen')} />
      </Menu>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Example options' }));
    const item = screen.getByRole('button', { name: 'Not now' });
    fireEvent.click(item);
    expect([chosen, (item as HTMLButtonElement).disabled, screen.queryByRole('dialog', { name: 'Example options' }) === null]).toEqual([[], true, false]);
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

  test('catches Esc before a side panel\'s own listener, which finds it handled', () => {
    const escapesSeenHandled: boolean[] = [];
    const panelListener = (event: KeyboardEvent): void => {
      escapesSeenHandled.push(event.defaultPrevented);
    };
    document.addEventListener('keydown', panelListener);
    try {
      const { trigger, menu } = renderMenu();
      fireEvent.click(trigger);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(menu()).toBeNull();
      expect(escapesSeenHandled).toEqual([true]);
    } finally {
      document.removeEventListener('keydown', panelListener);
    }
  });

  test('a caller holding whether it is open opens and closes it, and is told each open and close the menu would make', () => {
    const changes: boolean[] = [];

    function HeldMenu({ isOpen }: { readonly isOpen: boolean }) {
      return (
        <Menu label="Example held" trigger="button" align="end" triggerContent="More" isOpen={isOpen} onOpenChange={(open) => changes.push(open)}>
          <MenuItem label="Choose" closing="return-focus" onChoose={NOTHING} />
        </Menu>
      );
    }
    const { rerender } = render(<HeldMenu isOpen={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(changes).toEqual([true]);
    expect(screen.queryByRole('dialog', { name: 'Example held' })).toBeNull();
    rerender(<HeldMenu isOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    expect(changes).toEqual([true, false]);
    expect(screen.queryByRole('dialog', { name: 'Example held' })).not.toBeNull();
    rerender(<HeldMenu isOpen={false} />);
    expect(screen.queryByRole('dialog', { name: 'Example held' })).toBeNull();
  });

  test('a wide menu marks its popover, and a menu without it marks none', () => {
    const { container } = render(
      <>
        <Menu label="Wide options" trigger="button" align="end" triggerContent="More" wide><MenuItem label="Stop" closing="keep-focus" onChoose={NOTHING} /></Menu>
        <Menu label="Plain options" trigger="button" align="end" triggerContent="Less"><MenuItem label="Hold" closing="keep-focus" onChoose={NOTHING} /></Menu>
      </>,
    );
    expect([...container.querySelectorAll('.design-system-menu-popover')].map((popover) => popover.hasAttribute('data-wide'))).toEqual([true, false]);
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
    expect(screen.getByRole('button', { name: 'Fit the rows shown' }).querySelector('.design-system-menu-hint')?.textContent).toBe('the rows shown');
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
    expect([checked.getAttribute('aria-pressed'), checked.querySelector('.design-system-menu-check')?.textContent]).toEqual(['true', '✓']);
    expect([pressed.getAttribute('aria-pressed'), pressed.querySelector('.design-system-menu-check')]).toEqual(['true', null]);
    expect(unchecked.getAttribute('aria-pressed')).toBe('false');
  });

  test('a marked trigger and a marked item carry the mark, and an item opening a dialog says whether it is open', () => {
    openMenuOf(<MenuItem label="Custom…" marked dialogIsOpen={false} closing="keep-focus" onChoose={NOTHING} />);
    const item = screen.getByRole('button', { name: 'Custom…' });
    expect(screen.getByRole('button', { name: 'Range' }).hasAttribute('data-marked')).toBe(true);
    expect([item.hasAttribute('data-marked'), item.getAttribute('aria-haspopup'), item.getAttribute('aria-expanded')]).toEqual([true, 'dialog', 'false']);
  });
  test('a description shows under the label and describes the item, whose name stays its label and hint', () => {
    openMenuOf(
      <>
        <MenuItem label="Wind down J4" description="J4 gets a wind-down turn, then ends; #004 is held." closing="return-focus" onChoose={NOTHING} />
        <MenuItem label="Fresh agent" hint="J4" description="Ends the session of J4 and starts a new writer on item-004." closing="return-focus" onChoose={NOTHING} />
      </>,
    );
    const windDown = screen.getByRole('button', { name: 'Wind down J4', description: 'J4 gets a wind-down turn, then ends; #004 is held.' });
    const freshAgent = screen.getByRole('button', { name: 'Fresh agent J4', description: 'Ends the session of J4 and starts a new writer on item-004.' });
    expect([windDown.lastElementChild?.className, windDown.firstElementChild?.textContent]).toEqual(['design-system-menu-item-description', 'Wind down J4']);
    expect(freshAgent.querySelector('.design-system-menu-hint')?.textContent).toBe('J4');
  });

  test('an item with no description keeps its name from its content and has none', () => {
    openMenuOf(<MenuItem label="Fit" closing="return-focus" onChoose={NOTHING} />);
    const item = screen.getByRole('button', { name: 'Fit' });
    const description = item.querySelector('.design-system-menu-item-description');
    expect([item.getAttribute('aria-labelledby'), item.getAttribute('aria-describedby'), description]).toEqual([null, null, null]);
  });

  test('a separator is a separator between the items', () => {
    openMenuOf(
      <>
        <MenuItem label="Fresh agent" closing="return-focus" onChoose={NOTHING} />
        <MenuSeparator />
        <MenuItem label="Park #004" closing="return-focus" onChoose={NOTHING} />
      </>,
    );
    const separator = screen.getByRole('separator');
    expect([separator.className, separator.previousElementSibling?.textContent, separator.nextElementSibling?.textContent])
      .toEqual(['design-system-menu-separator', 'Fresh agent', 'Park #004']);
  });
});

describe('the trigger', () => {
  test('an icon trigger keeps the name given apart from its glyph, and a button trigger is drawn as a button', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Example options' }).textContent).toBe('⋯');
    cleanup();
    render(<Menu label="Job moves" trigger="button" align="end" triggerContent="More"><MenuItem label="Stop" closing="return-focus" onChoose={NOTHING} /></Menu>);
    const trigger = screen.getByRole('button', { name: 'More' });
    expect([trigger.classList.contains('design-system-button'), trigger.getAttribute('data-trigger')]).toEqual([true, 'button']);
  });

  test('the insert trigger draws its own plus under its name, says whether it is open, and its menu leads with its heading', () => {
    render(
      <>
        <Menu label="Add a step" trigger="insert" insertStyle="solid" heading="Add after the writer" align="start" triggerName="Add a step after Writer">
          <MenuItem label="A gate" description="Runs a command" closing="return-focus" onChoose={NOTHING} />
        </Menu>
        <Menu label="Add a gate" trigger="insert" insertStyle="dashed" align="start" triggerName="Add a step before the fast-forward">
          <MenuItem label="A gate" closing="return-focus" onChoose={NOTHING} />
        </Menu>
      </>,
    );
    const trigger = screen.getByRole('button', { name: 'Add a step after Writer' });
    const dashedTrigger = screen.getByRole('button', { name: 'Add a step before the fast-forward' });
    expect([
      trigger.getAttribute('data-trigger'),
      trigger.getAttribute('data-insert'),
      dashedTrigger.getAttribute('data-insert'),
      trigger.getAttribute('aria-expanded'),
      trigger.querySelector('svg.design-system-menu-insert-glyph')?.getAttribute('aria-hidden'),
      trigger.textContent,
    ]).toEqual(['insert', 'solid', 'dashed', 'false', 'true', '']);
    fireEvent.click(trigger);
    const menu = screen.getByRole('dialog', { name: 'Add a step' });
    expect([trigger.getAttribute('aria-expanded'), menu.getAttribute('data-trigger'), menu.firstElementChild?.className, menu.firstElementChild?.textContent])
      .toEqual(['true', 'insert', 'design-system-menu-heading', 'Add after the writer']);
    fireEvent.click(trigger);
    expect([trigger.getAttribute('aria-expanded'), screen.queryByText('Add after the writer')]).toEqual(['false', null]);
  });

  test('the caret trigger draws its own chevron under its name and shows no content', () => {
    render(
      <Menu label="Example views" trigger="caret" align="start" triggerName="Example views" triggerContent="ignored">
        <MenuItem label="Example one" closing="return-focus" onChoose={NOTHING} />
      </Menu>,
    );
    const trigger = screen.getByRole('button', { name: 'Example views' });
    expect([trigger.getAttribute('data-trigger'), trigger.querySelector('svg.design-system-menu-caret-glyph')?.getAttribute('aria-hidden'), trigger.textContent])
      .toEqual(['caret', 'true', '']);
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Example views' }).getAttribute('data-trigger')).toBe('caret');
  });

  test('a trigger other than insert carries no insert style', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: 'Example options' }).hasAttribute('data-insert')).toBe(false);
  });

  test('the segment trigger says whether it is pressed, and another trigger says nothing of it', () => {
    render(
      <>
        <Menu label="More examples" trigger="segment" align="end" triggerContent="2 more" pressed>
          <MenuItem label="Example four" pressed closing="return-focus" onChoose={NOTHING} />
        </Menu>
        <Menu label="Other examples" trigger="segment" align="end" triggerContent="3 more">
          <MenuItem label="Example five" closing="return-focus" onChoose={NOTHING} />
        </Menu>
        <Menu label="Outlined examples" trigger="outlined" align="end" triggerContent="Outlined" pressed>
          <MenuItem label="Example six" closing="return-focus" onChoose={NOTHING} />
        </Menu>
      </>,
    );
    const triggers = ['2 more', '3 more', 'Outlined'].map((name) => screen.getByRole('button', { name }));
    expect(triggers.map((trigger) => [trigger.getAttribute('data-trigger'), trigger.getAttribute('aria-pressed')]))
      .toEqual([['segment', 'true'], ['segment', 'false'], ['outlined', null]]);
    fireEvent.click(triggers[0] ?? document.body);
    expect(screen.getByRole('dialog', { name: 'More examples' }).getAttribute('data-trigger')).toBe('segment');
  });

  test('the words are text, never markup', () => {
    const planted = '<b>planted</b>';
    render(
      <Menu label={planted} trigger="outlined" align="start" triggerContent={planted}>
        <MenuItem label={planted} hint={planted} description={planted} closing="return-focus" onChoose={NOTHING} />
      </Menu>,
    );
    fireEvent.click(screen.getByRole('button', { name: '<b>planted</b>' }));
    const menu = screen.getByRole('dialog', { name: '<b>planted</b>' });
    expect([menu.querySelector('b'), menu.querySelector('.design-system-menu-item')?.textContent]).toEqual([null, '<b>planted</b><b>planted</b><b>planted</b>']);
  });
});
