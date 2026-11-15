/**
 * The button, in a happy-dom document. What matters: a quiet button calls `onPress` and a disabled one does not; each emphasis, the
 * attention ring, the link tint and the compact and dense heights is a `data-*` attribute on the one class; with an `href` the button is a
 * link and no button; a toggle and a disclosure carry their aria state; the leading glyph comes before the label, in its box; and a label is text,
 * never markup.
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

import { Button } from './Button.tsx';

afterEach(() => {
  cleanup();
});

describe('the button', () => {
  test('a quiet button calls onPress and carries no emphasis', () => {
    const presses: string[] = [];
    render(<Button label="Example action" onPress={() => presses.push('pressed')} />);
    const button = screen.getByRole('button', { name: 'Example action' });
    fireEvent.click(button);
    expect(presses).toEqual(['pressed']);
    expect([button.className, button.hasAttribute('data-primary'), button.hasAttribute('data-danger')]).toEqual(['design-system-button', false, false]);
  });

  test('primary sets data-primary and danger sets data-danger', () => {
    render(
      <>
        <Button label="Lead" emphasis="primary" />
        <Button label="Stop J4" emphasis="danger" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Lead' }).hasAttribute('data-primary')).toBe(true);
    expect(screen.getByRole('button', { name: 'Stop J4' }).hasAttribute('data-danger')).toBe(true);
  });

  test('attention sets data-attention on the primary, the link tint sets data-tint, and a plain button has neither', () => {
    render(
      <>
        <Button label="Apply the plan" emphasis="primary" attention />
        <Button label="Update the plan" tint="link" />
        <Button label="Cancel" />
      </>,
    );
    const attributesOf = (name: string): [boolean, boolean, string | null] => {
      const button = screen.getByRole('button', { name });
      return [button.hasAttribute('data-primary'), button.hasAttribute('data-attention'), button.getAttribute('data-tint')];
    };
    expect([attributesOf('Apply the plan'), attributesOf('Update the plan'), attributesOf('Cancel')])
      .toEqual([[true, true, null], [false, false, 'link'], [false, false, null]]);
  });

  test('ghost sets data-ghost, compact sets data-compact and dense sets data-dense; a plain button sets none of them', () => {
    render(
      <>
        <Button label="Cancel" emphasis="ghost" />
        <Button label="Hold" compact />
        <Button label="Park" dense />
        <Button label="Resume" />
      </>,
    );
    const attributesOf = (name: string): [boolean, boolean, boolean] => {
      const button = screen.getByRole('button', { name });
      return [button.hasAttribute('data-ghost'), button.hasAttribute('data-compact'), button.hasAttribute('data-dense')];
    };
    expect([attributesOf('Cancel'), attributesOf('Hold'), attributesOf('Park'), attributesOf('Resume')])
      .toEqual([[true, false, false], [false, true, false], [false, false, true], [false, false, false]]);
  });

  test('with an href it is a link drawn as a button, and no button', () => {
    render(<Button label="Watch J4" href="#agents/J4" emphasis="primary" />);
    const link = screen.getByRole('link', { name: 'Watch J4' });
    expect([link.className, link.getAttribute('href'), link.hasAttribute('data-primary')]).toEqual(['design-system-button', '#agents/J4', true]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('a disabled button does not call onPress', () => {
    const presses: string[] = [];
    render(<Button label="Example action" disabled onPress={() => presses.push('pressed')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Example action' }));
    expect(presses).toEqual([]);
  });

  test('a toggle sets aria-pressed and a disclosure sets aria-expanded and aria-controls', () => {
    render(
      <>
        <Button label="Show diagnostics" pressed />
        <Button label="Hide incidents" expanded={false} controls="example-drawer" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Show diagnostics' }).getAttribute('aria-pressed')).toBe('true');
    const disclosure = screen.getByRole('button', { name: 'Hide incidents' });
    expect([disclosure.getAttribute('aria-expanded'), disclosure.getAttribute('aria-controls')]).toEqual(['false', 'example-drawer']);
  });

  test('the leading glyph shows in its box before the label, and the accessible name replaces the label as the name', () => {
    render(<Button label="New chat" leading={<span data-leading="">+</span>} accessibleName="Start a new example chat" />);
    const button = screen.getByRole('button', { name: 'Start a new example chat' });
    expect([button.firstElementChild?.firstElementChild?.hasAttribute('data-leading'), button.textContent]).toEqual([true, '+New chat']);
  });

  test('a label is text, never markup', () => {
    render(<Button label="<b>planted</b>" />);
    const button = screen.getByRole('button');
    expect([button.querySelector('b'), button.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
