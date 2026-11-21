/**
 * The text of the type scale, in a happy-dom document. What matters: the role is carried as `data-type-role`, body by default; the element
 * is the caller's choice and never the role's, a span by default; each flag is its own data attribute; the margins arrive inline as
 * the spacing tokens of their steps; the text is text, never markup; and `muted` with `subtle` does not compile.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Text } from './Text.tsx';

afterEach(() => {
  cleanup();
});

describe('the text', () => {
  test('the role is carried as data-type-role, body by default, and never picks the element', () => {
    const { container } = render(
      <>
        <Text>Body</Text>
        <Text typeRole="page" element="h2">Overview</Text>
        <Text typeRole="page">Billing</Text>
        <Text typeRole="lead" element="p">One sentence under the title.</Text>
      </>,
    );
    expect([...container.querySelectorAll('.design-system-text')].map((text) => [text.tagName, text.getAttribute('data-type-role')])).toEqual([
      ['SPAN', 'body'],
      ['H2', 'page'],
      ['SPAN', 'page'],
      ['P', 'lead'],
    ]);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Overview');
  });

  test('the section role is carried as data-type-role on the element the caller picks', () => {
    const { container } = render(<><Text typeRole="section" element="h3">Example section</Text><Text typeRole="section">Example card</Text></>);
    expect([...container.querySelectorAll('.design-system-text')].map((text) => [text.tagName, text.getAttribute('data-type-role')])).toEqual([
      ['H3', 'section'],
      ['SPAN', 'section'],
    ]);
  });

  test('each flag is its own data attribute, and an unset flag sets none', () => {
    const { container } = render(
      <>
        <Text bold muted mono>T-014</Text>
        <Text subtle struck centered>Dropped</Text>
        <Text>Plain</Text>
      </>,
    );
    const flagNames = ['data-bold', 'data-ink', 'data-mono', 'data-struck', 'data-centered'];
    expect([...container.querySelectorAll('.design-system-text')].map((text) => flagNames.map((name) => text.getAttribute(name)))).toEqual([
      ['', 'muted', '', null, null],
      [null, 'subtle', null, '', ''],
      [null, null, null, null, null],
    ]);
  });

  test('the margins arrive as the spacing tokens of their steps', () => {
    const { container } = render(<Text marginTop="four" marginBottom="twelve">Spaced</Text>);
    const text = container.querySelector<HTMLElement>('.design-system-text');
    expect([text?.style.marginTop, text?.style.marginBottom, text?.style.marginLeft]).toEqual(['var(--space-4)', 'var(--space-12)', '']);
  });

  test('a text is text, never markup', () => {
    const { container } = render(<Text>{'<b>planted</b>'}</Text>);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });

  test('muted and subtle are two inks and do not compile together', () => {
    // @ts-expect-error a text has one ink
    const twoInks = <Text muted subtle>Both</Text>;
    expect(twoInks).toBeDefined();
  });
});
