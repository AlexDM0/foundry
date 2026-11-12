/**
 * The stepper, in a happy-dom document. What matters: each step carries its status in `data-status` and only the current one is
 * `aria-current="step"`; a done step shows a check and every other step its number; a done or recheck step with an `href` links back,
 * through its label or, with an `actionLabel`, through an action described by the label, while a current or upcoming step never links;
 * every step but the last draws a line in its own status; and the orientation reaches `data-orientation`.
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
    key: 'billing', label: 'Billing', status: 'done', href: '#pipeline/setup/billing'
  },
  {
    key: 'research', label: 'Research', status: 'recheck', href: '#pipeline/setup/research'
  },
  {
    key: 'constitution', label: 'Constitution', status: 'current', href: '#pipeline/setup/constitution'
  },
  {
    key: 'design', label: 'Pipeline design', status: 'upcoming', href: '#pipeline/setup/design'
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
    expect([list.getAttribute('class'), list.getAttribute('data-orientation')]).toEqual(['bridge-stepper', 'horizontal']);
    const steps = [...container.querySelectorAll('.bridge-stepper-step')];
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
    const circles = [...container.querySelectorAll('.bridge-stepper-circle')];
    expect(circles.map((circle) => [circle.textContent, circle.querySelector('.bridge-stepper-check') !== null])).toEqual([
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
      ['Billing', '#pipeline/setup/billing', 'bridge-stepper-label'],
      ['Research', '#pipeline/setup/research', 'bridge-stepper-label'],
    ]);
  });

  test('with an action label the step links through an action at its end, described by its label, and the label stays text', () => {
    render(
      <Stepper
        label="Setup steps"
        orientation="vertical"
        steps={[
          {
            key: 'billing', label: 'Billing', status: 'done', href: '#pipeline/setup/billing', actionLabel: 'Open', detail: 'Subscription'
          },
          {
            key: 'apply', label: 'Apply', status: 'upcoming', href: '#pipeline/setup/apply', actionLabel: 'Open'
          },
        ]}
      />,
    );
    const action = screen.getByRole('link', { name: 'Open' });
    expect([action.getAttribute('class'), action.getAttribute('href')]).toEqual(['bridge-stepper-action', '#pipeline/setup/billing']);
    const label = document.getElementById(action.getAttribute('aria-describedby') ?? '');
    expect([label?.tagName, label?.textContent]).toEqual(['SPAN', 'Billing']);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(document.querySelector('.bridge-stepper-detail')?.textContent).toBe('Subscription');
    expect(document.querySelector('.bridge-stepper')?.getAttribute('data-orientation')).toBe('vertical');
  });

  test('every step but the last draws a line to the next, in its own status', () => {
    const { container } = render(<Stepper label="Setup steps" orientation="horizontal" steps={SETUP_STEPS} />);
    const lines = [...container.querySelectorAll('.bridge-stepper-line')];
    expect(lines.map((line) => line.getAttribute('data-status'))).toEqual(['done', 'recheck', 'current', 'upcoming']);
    expect(container.querySelectorAll('.bridge-stepper-step')[SETUP_STEPS.length - 1]?.querySelector('.bridge-stepper-line')).toBeNull();
  });
});
