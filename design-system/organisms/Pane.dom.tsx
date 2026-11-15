/**
 * The pane, in a happy-dom document. What matters: it is named by its label; the title heads it (an `h2` unless the screen picks another
 * element), and the mark, subtitle and count each show
 * only when given; what the head adds sits in the head; the body says whether it is padded or flush; the foot shows only when given; it can
 * be an aside; and the words are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Pane } from './Pane.tsx';

afterEach(() => {
  cleanup();
});

describe('the pane', () => {
  test('a bare pane is named by its label and shows its title and body, and nothing it was not given', () => {
    render(<Pane label="Example agents" title="Agents" body="flush"><p>Example body</p></Pane>);
    const pane = screen.getByRole('region', { name: 'Example agents' });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Agents');
    expect(pane.querySelector('.design-system-pane-body[data-body="flush"]')?.textContent).toBe('Example body');
    expect(['.design-system-pane-mark', '.design-system-pane-subtitle', '.design-system-pane-count', '.design-system-pane-head-end', '.design-system-pane-foot']
      .map((selector) => pane.querySelector(selector))).toEqual([null, null, null, null, null]);
  });

  test('the mark, subtitle, count and head end each show in the head when given, and the foot after the body', () => {
    render(
      <Pane
        label="Task J4"
        title="Task"
        titleMark="J4"
        subtitle="writers and checkers"
        countText="3 tasks"
        headEnd={<button type="button">Example head action</button>}
        foot="Example foot"
        body="padded"
      >
        <p>Example body</p>
      </Pane>,
    );
    const pane = screen.getByRole('region', { name: 'Task J4' });
    const head = pane.querySelector('.design-system-pane-head');
    expect([
      head?.querySelector('[data-type-role="page"]')?.textContent,
      head?.querySelector('[data-type-role="page"] .design-system-pane-mark')?.textContent,
      head?.querySelector('.design-system-pane-subtitle')?.textContent,
      head?.querySelector('.design-system-pane-count')?.textContent,
      head?.querySelector('.design-system-pane-head-end button')?.textContent,
    ]).toEqual(['Task J4', 'J4', 'writers and checkers', '3 tasks', 'Example head action']);
    expect([pane.querySelector('.design-system-pane-body')?.getAttribute('data-body'), pane.lastElementChild?.className, pane.lastElementChild?.textContent])
      .toEqual(['padded', 'design-system-pane-foot', 'Example foot']);
  });

  test('the screen picks the title\'s element', () => {
    render(<Pane label="Example drawer" title="Incidents" titleElement="h3" body="padded">Example body</Pane>);
    expect(screen.getByRole('heading', { name: 'Incidents' }).tagName).toBe('H3');
  });

  test('an aside pane is an aside', () => {
    render(<Pane label="Example drawer" title="Incidents" body="padded" element="aside">Example body</Pane>);
    expect(screen.getByRole('complementary', { name: 'Example drawer' }).tagName).toBe('ASIDE');
  });

  test('the words are text, never markup', () => {
    render(<Pane label="<b>planted</b>" title="<b>planted</b>" titleMark="<b>planted</b>" countText="<b>planted</b>" body="padded">x</Pane>);
    const pane = screen.getByRole('region', { name: '<b>planted</b>' });
    expect([pane.querySelector('b'), pane.querySelector('.design-system-pane-count')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
