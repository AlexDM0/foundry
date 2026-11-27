/**
 * The callout: a title heads it (an `h3` unless picked otherwise) only when given, so an untitled quote adds no empty heading; each tone sets
 * `data-tone`, only `state` takes a state tone, only warn can be tinted and only neutral dashed; contents follow the title and actions follow in
 * their own part; and the title is text, never markup.
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
        <Callout tone="error">The example service does not answer</Callout>
        <Callout tone="neutral">The example setup is not finished</Callout>
      </>,
    );
    expect([...container.querySelectorAll('.design-system-callout')].map((callout) => [callout.getAttribute('data-tone'), callout.getAttribute('data-state-tone')]))
      .toEqual([['state', 'info'], ['warn', null], ['error', null], ['neutral', null]]);
  });

  test('tinted sets data-tinted on a warn callout and dashed sets data-dashed on a neutral one; a plain callout sets neither', () => {
    const { container } = render(
      <>
        <Callout tone="warn" tinted>Held</Callout>
        <Callout tone="neutral" dashed>Not finished</Callout>
        <Callout tone="warn">Why J4 stopped</Callout>
      </>,
    );
    expect([...container.querySelectorAll('.design-system-callout')].map((callout) => [callout.hasAttribute('data-tinted'), callout.hasAttribute('data-dashed')]))
      .toEqual([[true, false], [false, true], [false, false]]);
  });

  test('its actions follow its title and contents, each in a part of their own', () => {
    const { container } = render(
      <Callout tone="error" title="Example service" actions={<button type="button">Try again</button>}>
        <p>The example service does not answer.</p>
      </Callout>,
    );
    const callout = container.querySelector('.design-system-callout');
    const [body, actions] = [...callout?.children ?? []];
    expect([callout?.hasAttribute('data-with-actions'), body?.className, actions?.className])
      .toEqual([true, 'design-system-callout-body', 'design-system-callout-actions']);
    expect([body?.firstElementChild?.tagName, body?.lastElementChild?.textContent]).toEqual(['H3', 'The example service does not answer.']);
    expect(actions?.contains(screen.getByRole('button', { name: 'Try again' }))).toBe(true);
  });

  test('with no actions it holds no part for them', () => {
    const { container } = render(<Callout tone="neutral" dashed><p>Not finished.</p></Callout>);
    expect([container.querySelector('.design-system-callout-actions'), container.querySelector('[data-with-actions]')]).toEqual([null, null]);
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
    // @ts-expect-error an error callout has colours of its own
    const errorWithStateTone = <Callout tone="error" stateTone="info">x</Callout>;
    expect([warnWithStateTone, stateWithoutTone, errorWithStateTone]).toHaveLength(3);
  });

  test('tinted does not compile beside any tone but warn, nor dashed beside any tone but neutral', () => {
    // @ts-expect-error only a warn callout is tinted
    const tintedError = <Callout tone="error" tinted>x</Callout>;
    // @ts-expect-error only a neutral callout is dashed
    const dashedWarn = <Callout tone="warn" dashed>x</Callout>;
    expect([tintedError, dashedWarn]).toHaveLength(2);
  });
});
