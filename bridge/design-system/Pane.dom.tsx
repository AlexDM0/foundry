/**
 * The pane, in a happy-dom document. What matters: it is named by its label; the title heads it, and the mark, subtitle and count each show
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
    expect(pane.querySelector('h2.bridge-pane-title')?.textContent).toBe('Agents');
    expect(pane.querySelector('.bridge-pane-body[data-body="flush"]')?.textContent).toBe('Example body');
    expect(['.bridge-pane-mark', '.bridge-pane-subtitle', '.bridge-pane-count', '.bridge-pane-head-end', '.bridge-pane-foot']
      .map((selector) => pane.querySelector(selector))).toEqual([null, null, null, null, null]);
  });

  test('the mark, subtitle, count and head end each show in the head when given, and the foot after the body', () => {
    render(
      <Pane
        label="Job J4"
        title="Job"
        titleMark="J4"
        subtitle="builders and reviewers"
        countText="3 jobs"
        headEnd={<button type="button">Example head action</button>}
        foot="Example foot"
        body="padded"
      >
        <p>Example body</p>
      </Pane>,
    );
    const pane = screen.getByRole('region', { name: 'Job J4' });
    const head = pane.querySelector('.bridge-pane-head');
    expect([
      head?.querySelector('.bridge-pane-title')?.textContent,
      head?.querySelector('.bridge-pane-title .bridge-pane-mark')?.textContent,
      head?.querySelector('.bridge-pane-subtitle')?.textContent,
      head?.querySelector('.bridge-pane-count')?.textContent,
      head?.querySelector('.bridge-pane-head-end button')?.textContent,
    ]).toEqual(['Job J4', 'J4', 'builders and reviewers', '3 jobs', 'Example head action']);
    expect([pane.querySelector('.bridge-pane-body')?.getAttribute('data-body'), pane.lastElementChild?.className, pane.lastElementChild?.textContent])
      .toEqual(['padded', 'bridge-pane-foot', 'Example foot']);
  });

  test('an aside pane is an aside', () => {
    render(<Pane label="Example drawer" title="Incidents" body="padded" element="aside">Example body</Pane>);
    expect(screen.getByRole('complementary', { name: 'Example drawer' }).tagName).toBe('ASIDE');
  });

  test('the words are text, never markup', () => {
    render(<Pane label="<b>planted</b>" title="<b>planted</b>" titleMark="<b>planted</b>" countText="<b>planted</b>" body="padded">x</Pane>);
    const pane = screen.getByRole('region', { name: '<b>planted</b>' });
    expect([pane.querySelector('b'), pane.querySelector('.bridge-pane-count')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
