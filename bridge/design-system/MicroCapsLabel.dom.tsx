/**
 * The small-capitals label, in a happy-dom document. What matters: it renders the element asked for; a `label` carries its field and
 * names it; muted sets no tone while the state and error tones set `data-tone`; and a label is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { MicroCapsLabel } from './MicroCapsLabel.tsx';

afterEach(() => {
  cleanup();
});

describe('the small-capitals label', () => {
  test('it renders the element asked for, a span by default', () => {
    const { container } = render(
      <>
        <MicroCapsLabel text="Finished work" />
        <MicroCapsLabel text="Escalated" element="div" />
        <MicroCapsLabel text="Asks User" element="h3" />
        <MicroCapsLabel text="Group" element="h4" />
      </>,
    );
    expect([...container.querySelectorAll('.bridge-micro-caps')].map((label) => label.tagName)).toEqual(['SPAN', 'DIV', 'H3', 'H4']);
  });

  test('a label element carries its field and names it', () => {
    render(
      <>
        <MicroCapsLabel text="From" element="label" htmlFor="example-from" />
        <input id="example-from" />
      </>,
    );
    expect(screen.getByLabelText('From').id).toBe('example-from');
  });

  test('muted sets no tone, and the state and error tones set data-tone', () => {
    const { container } = render(
      <>
        <MicroCapsLabel text="Muted" id="example-muted" />
        <MicroCapsLabel text="Waiting" tone="state" />
        <MicroCapsLabel text="Escalated" tone="error" />
      </>,
    );
    expect([...container.querySelectorAll('.bridge-micro-caps')].map((label) => [label.id, label.getAttribute('data-tone')])).toEqual([
      ['example-muted', null],
      ['', 'state'],
      ['', 'error'],
    ]);
  });

  test('a label is text, never markup', () => {
    const { container } = render(<MicroCapsLabel text="<b>planted</b>" />);
    expect([container.querySelector('b'), container.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
