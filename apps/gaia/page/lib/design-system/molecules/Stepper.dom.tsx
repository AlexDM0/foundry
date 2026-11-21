/**
 * The stepper, in a happy-dom document. What matters: each step carries its status in `data-status` and only the current one is
 * `aria-current="step"`; a done step shows a check and every other step its number; a done or recheck step with an `href` links back,
 * through its label or, with an `actionLabel`, through an action described by the label, while a current or upcoming step never links;
 * every step but the last draws a line in its own status; the orientation reaches `data-orientation`; and a compact stepper draws no
 * number: a check before a done step, an empty marker for the dot before the current one, and nothing before the others.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Stepper, type StepperStep } from './Stepper.tsx';

const SETUP_STEPS: readonly StepperStep[] = [
  {
    key: 'billing', label: 'Billing', status: 'done', href: '#setup/billing'
  },
  {
    key: 'research', label: 'Research', status: 'recheck', href: '#setup/research'
  },
  {
    key: 'constitution', label: 'Constitution', status: 'current', href: '#setup/constitution'
  },
  {
    key: 'design', label: 'Layout design', status: 'upcoming', href: '#setup/design'
  },
  { key: 'apply', label: 'Apply', status: 'upcoming' },
];

afterEach(() => {
  cleanup();
});

describe('the stepper', () => {
  test('each step carries its status, and only the current one is the current step', () => {
    const { container } = render(<Stepper label="Setup steps" orientation="horizontal" steps={SETUP_STEPS} />);
    const list = screen.getByRole('list', { name: 'Setup steps' });
    expect([list.getAttribute('class'), list.getAttribute('data-orientation')]).toEqual(['design-system-stepper', 'horizontal']);
    const steps = [...container.querySelectorAll('.design-system-stepper-step')];
    expect(steps.map((step) => [step.getAttribute('data-status'), step.getAttribute('aria-current')])).toEqual([
      ['done', null],
      ['recheck', null],
      ['current', 'step'],
      ['upcoming', null],
      ['upcoming', null],
    ]);
  });

  test('a done step shows a check, and every other step its number', () => {
    const { container } = render(<Stepper label="Setup steps" orientation="horizontal" steps={SETUP_STEPS} />);
    const circles = [...container.querySelectorAll('.design-system-stepper-circle')];
    expect(circles.map((circle) => [circle.textContent, circle.querySelector('.design-system-stepper-check') !== null])).toEqual([
      ['', true],
      ['2', false],
      ['3', false],
      ['4', false],
      ['5', false],
    ]);
    expect(circles.every((circle) => circle.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  test('a done or recheck step with an href links through its label; a current or upcoming step never links', () => {
    render(<Stepper label="Setup steps" orientation="horizontal" steps={SETUP_STEPS} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('class')])).toEqual([
      ['Billing', '#setup/billing', 'design-system-stepper-label'],
      ['Research', '#setup/research', 'design-system-stepper-label'],
    ]);
  });

  test('with an action label the step links through an action at its end, described by its label, and the label stays text', () => {
    render(
      <Stepper
        label="Setup steps"
        orientation="vertical"
        steps={[
          {
            key: 'billing', label: 'Billing', status: 'done', href: '#setup/billing', actionLabel: 'Open', detail: 'Subscription'
          },
          {
            key: 'apply', label: 'Apply', status: 'upcoming', href: '#setup/apply', actionLabel: 'Open'
          },
        ]}
      />,
    );
    const action = screen.getByRole('link', { name: 'Open' });
    expect([action.getAttribute('class'), action.getAttribute('href')]).toEqual(['design-system-stepper-action', '#setup/billing']);
    const label = document.getElementById(action.getAttribute('aria-describedby') ?? '');
    expect([label?.tagName, label?.textContent]).toEqual(['SPAN', 'Billing']);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(document.querySelector('.design-system-stepper-detail')?.textContent).toBe('Subscription');
    expect(document.querySelector('.design-system-stepper')?.getAttribute('data-orientation')).toBe('vertical');
  });

  test('every step but the last draws a line to the next, in its own status', () => {
    const { container } = render(<Stepper label="Setup steps" orientation="horizontal" steps={SETUP_STEPS} />);
    const lines = [...container.querySelectorAll('.design-system-stepper-line')];
    expect(lines.map((line) => line.getAttribute('data-status'))).toEqual(['done', 'recheck', 'current', 'upcoming']);
    expect(container.querySelectorAll('.design-system-stepper-step')[SETUP_STEPS.length - 1]?.querySelector('.design-system-stepper-line')).toBeNull();
  });

  test('a compact stepper draws no number: a check before a done step, the dot before the current one, nothing before the others', () => {
    const { container } = render(<Stepper label="Setup steps" orientation="horizontal" compact steps={SETUP_STEPS} />);
    expect(screen.getByRole('list', { name: 'Setup steps' }).hasAttribute('data-compact')).toBe(true);
    const steps = [...container.querySelectorAll('.design-system-stepper-step')];
    expect(steps.map((step) => {
      const marker = step.querySelector('.design-system-stepper-circle');
      return marker === null ? null : [marker.textContent, marker.querySelector('.design-system-stepper-check') !== null];
    })).toEqual([['', true], null, ['', false], null, null]);
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Billing', 'Research']);
  });
});
