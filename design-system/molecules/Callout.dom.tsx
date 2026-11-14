/**
 * The callout, in a happy-dom document. What matters: a title heads it as a heading only when one is given, so an untitled quote adds no
 * empty heading to the outline, an `h3` unless the screen picks another element; each tone sets `data-tone`, and only a `state` callout
 * takes a state tone, since the warn tone has colours of its own; its contents follow the title; and the title is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Callout } from './Callout.tsx';

afterEach(() => {
  cleanup();
});

describe('the callout', () => {
  test('a title heads its contents as a heading', () => {
    const { container } = render(<Callout tone="state" stateTone="accent" title="Building in J4"><p>J4 works on #004 Account pages dark mode.</p></Callout>);
    const callout = container.querySelector('.design-system-callout');
    expect(screen.getByRole('heading', { name: 'Building in J4' }).getAttribute('data-type-role')).toBe('title');
    expect([callout?.firstElementChild?.tagName, callout?.lastElementChild?.textContent]).toEqual(['H3', 'J4 works on #004 Account pages dark mode.']);
  });

  test('the screen picks the title\'s element', () => {
    render(<Callout tone="warn" title="Why J4 stopped" titleElement="h4"><p>Stopped by User (J4).</p></Callout>);
    expect(screen.getByRole('heading', { name: 'Why J4 stopped' }).tagName).toBe('H4');
  });

  test('with no title it holds only its contents, and no heading', () => {
    const { container } = render(<Callout tone="warn"><p>Stopped by User (J4).</p></Callout>);
    expect([screen.queryByRole('heading'), container.querySelector('.design-system-callout')?.children.length]).toEqual([null, 1]);
  });

  test('each tone sets data-tone, and only the `state` tone takes a state tone', () => {
    const { container } = render(
      <>
        <Callout tone="state" stateTone="info">Reviewing</Callout>
        <Callout tone="warn">Why J4 stopped</Callout>
      </>,
    );
    expect([...container.querySelectorAll('.design-system-callout')].map((callout) => [callout.getAttribute('data-tone'), callout.getAttribute('data-state-tone')]))
      .toEqual([['state', 'info'], ['warn', null]]);
  });

  test('the title is text, never markup', () => {
    const { container } = render(<Callout tone="warn" title="<b>planted</b>">x</Callout>);
    expect([container.querySelector('b'), screen.getByRole('heading').textContent]).toEqual([null, '<b>planted</b>']);
  });

  test('a state tone does not compile on a warn callout, nor a state callout without one', () => {
    // @ts-expect-error a warn callout has colours of its own
    const warnWithStateTone = <Callout tone="warn" stateTone="info">x</Callout>;
    // @ts-expect-error a state callout takes the colours of a state tone
    const stateWithoutTone = <Callout tone="state">x</Callout>;
    expect([warnWithStateTone, stateWithoutTone]).toHaveLength(2);
  });
});
