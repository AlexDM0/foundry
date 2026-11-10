/**
 * The callout, in a happy-dom document. What matters: a title heads it as a heading only when one is given, so an untitled quote adds no
 * empty heading to the outline; each tone sets `data-tone`, and the state shows only with the state tone, since the warn tone has colours
 * of its own; its contents follow the title; and the title is text, never markup.
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
    const { container } = render(<Callout tone="state" state="in-progress" title="Building in J4"><p>J4 works on #004 Account pages dark mode.</p></Callout>);
    const callout = container.querySelector('.bridge-callout');
    expect(screen.getByRole('heading', { name: 'Building in J4' }).className).toBe('bridge-callout-title');
    expect([callout?.firstElementChild?.tagName, callout?.lastElementChild?.textContent]).toEqual(['H3', 'J4 works on #004 Account pages dark mode.']);
  });

  test('with no title it holds only its contents, and no heading', () => {
    const { container } = render(<Callout tone="warn"><p>Stopped by User (J4).</p></Callout>);
    expect([screen.queryByRole('heading'), container.querySelector('.bridge-callout')?.children.length]).toEqual([null, 1]);
  });

  test('each tone sets data-tone, and the state shows only with the state tone', () => {
    const { container } = render(
      <>
        <Callout tone="state" state="reviewing">Reviewing</Callout>
        <Callout tone="warn" state="reviewing">Why J4 stopped</Callout>
      </>,
    );
    expect([...container.querySelectorAll('.bridge-callout')].map((callout) => [callout.getAttribute('data-tone'), callout.getAttribute('data-state')]))
      .toEqual([['state', 'reviewing'], ['warn', null]]);
  });

  test('the title is text, never markup', () => {
    const { container } = render(<Callout tone="warn" title="<b>planted</b>">x</Callout>);
    expect([container.querySelector('b'), container.querySelector('.bridge-callout-title')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
