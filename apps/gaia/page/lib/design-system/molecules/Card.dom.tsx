/**
 * The card, in a happy-dom document. What matters: the ground flags and the combinable flags are data attributes on the frame; the
 * caller's padding and margin override the stylesheet's defaults inline on the frame, while the layout props reach the View inside; a
 * title is drawn in the title role in the element asked for, spaced by the card's gap, carrying its id when given, so a region can be
 * named by it, and with no title nothing is drawn; and two ground flags, or a title id without a title, do not compile.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Card } from './Card.tsx';

afterEach(() => {
  cleanup();
});

describe('the card', () => {
  test('the ground and the combinable flags are data attributes on the frame', () => {
    const { container } = render(
      <>
        <Card />
        <Card quiet />
        <Card step dashed selected />
        <Card decision interactive />
      </>,
    );
    const flagNames = ['data-ground', 'data-dashed', 'data-interactive', 'data-selected'];
    expect([...container.querySelectorAll('.design-system-card')].map((card) => flagNames.map((name) => card.getAttribute(name)))).toEqual([
      [null, null, null, null],
      ['quiet', null, null, null],
      ['step', '', null, ''],
      ['decision', null, '', null],
    ]);
  });

  test('highlighted and grow are data attributes on the frame, and grow never reaches the view inside', () => {
    const { container } = render(<Card step highlighted grow />);
    const frame = container.querySelector('.design-system-card');
    const view = container.querySelector('.design-system-card > .design-system-view');
    expect([frame?.hasAttribute('data-highlighted'), frame?.hasAttribute('data-grow'), view?.hasAttribute('data-grow')]).toEqual([true, true, false]);
  });

  test('the step radius, clipped and washes are data attributes on the frame, and the section radius sets none', () => {
    const { container } = render(<><Card radius="step" clipped washes /><Card radius="section" /></>);
    const frames = [...container.querySelectorAll('.design-system-card')];
    expect(frames.map((frame) => [frame.getAttribute('data-radius'), frame.hasAttribute('data-clipped'), frame.hasAttribute('data-washes')])).toEqual([
      ['step', true, true],
      [null, false, false],
    ]);
  });

  test('padding and margin override the defaults on the frame, and the layout props reach the view inside', () => {
    const { container } = render(<Card padding="twelve" marginBottom="eight" row between gap="six"><span>Build</span></Card>);
    const frame = container.querySelector<HTMLElement>('.design-system-card');
    const view = container.querySelector<HTMLElement>('.design-system-card > .design-system-view');
    expect([frame?.style.paddingTop, frame?.style.paddingLeft, frame?.style.marginBottom, frame?.style.gap]).toEqual(['var(--space-12)', 'var(--space-12)', 'var(--space-8)', '']);
    expect([view?.getAttribute('data-row'), view?.getAttribute('data-justify'), view?.style.gap, view?.style.paddingTop, view?.textContent])
      .toEqual(['', 'between', 'var(--space-6)', '', 'Build']);
  });

  test('a title is drawn in the title role in the element asked for, spaced by the gap', () => {
    const { container } = render(
      <>
        <Card title="Agents at work" titleElement="h3" gap="ten"><span>Idle</span></Card>
        <Card title="Gates"><span>None</span></Card>
      </>,
    );
    const titles = [...container.querySelectorAll<HTMLElement>('.design-system-card > .design-system-text')];
    expect(titles.map((title) => [title.tagName, title.getAttribute('data-type-role'), title.style.marginBottom, title.textContent])).toEqual([
      ['H3', 'title', 'var(--space-10)', 'Agents at work'],
      ['SPAN', 'title', 'var(--space-8)', 'Gates'],
    ]);
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Agents at work');
  });

  test('a title id is the id of the title, so a region can be named by it, and a title without one has none', () => {
    const { container } = render(
      <>
        <section aria-labelledby="example-gates-title"><Card title="Gates" titleId="example-gates-title"><span>None</span></Card></section>
        <Card title="Agents"><span>Idle</span></Card>
      </>,
    );
    const titles = [...container.querySelectorAll('.design-system-card > .design-system-text')];
    expect([titles.map((title) => title.getAttribute('id')), screen.getByRole('region', { name: 'Gates' }).tagName]).toEqual([['example-gates-title', null], 'SECTION']);
  });

  test('with no title nothing is drawn above the children', () => {
    const { container } = render(<Card><span>Own title</span></Card>);
    expect([...container.querySelectorAll('.design-system-card > *')].map((part) => part.className)).toEqual(['design-system-view']);
  });

  test('two ground flags do not compile together, nor a title id without a title', () => {
    // @ts-expect-error a card has one ground
    const twoGrounds = <Card quiet decision />;
    // @ts-expect-error a title id names the title, so it needs one
    const titleIdWithoutTitle = <Card titleId="example-title" />;
    expect([twoGrounds, titleIdWithoutTitle]).toHaveLength(2);
  });
});
