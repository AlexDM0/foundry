/**
 * The tooltip, in a happy-dom document. What matters: its text is a `tooltip` whose id the trigger names in `aria-describedby`, so hover
 * and focus, which show it by CSS on its holder, show the text of the element they reach; the title leads in bold only when given; the
 * placement is a `data-*` attribute; Esc hides it once and is then left to whatever holds it, and leaving with the pointer or the focus
 * brings it back; the text is text, never markup.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { Tooltip } from './Tooltip.tsx';

afterEach(() => {
  cleanup();
});

describe('the tooltip', () => {
  test('the trigger is described by the tooltip, and the tooltip hangs in the trigger\'s holder', () => {
    render(
      <Tooltip title="Derived from the builder" text="Change it on that step." placement="above">
        <button type="button">Merge</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Merge' });
    const tooltip = screen.getByRole('tooltip');
    expect([trigger.getAttribute('aria-describedby'), tooltip.parentElement?.className, trigger.parentElement?.className])
      .toEqual([tooltip.id, 'bridge-tooltip-trigger', 'bridge-tooltip-trigger']);
    expect(tooltip.id).not.toBe('');
  });

  test('the title leads in bold only when given, and the placement is an attribute', () => {
    render(
      <>
        <Tooltip title="Derived" text="From the builder." placement="above"><span tabIndex={0}>First</span></Tooltip>
        <Tooltip text="<b>planted</b>" placement="below"><span tabIndex={0}>Second</span></Tooltip>
      </>,
    );
    const tooltipParts = screen.getAllByRole('tooltip').map((tooltip) => [
      tooltip.getAttribute('data-placement'),
      tooltip.querySelector('.bridge-tooltip-title')?.textContent ?? null,
      tooltip.querySelector('.bridge-tooltip-text')?.textContent,
      tooltip.querySelector('b'),
    ]);
    expect(tooltipParts).toEqual([['above', 'Derived', 'From the builder.', null], ['below', null, '<b>planted</b>', null]]);
  });

  test('Esc hides it once and then passes on, and leaving brings it back', () => {
    render(<Tooltip text="Why" placement="above"><button type="button">Trigger</button></Tooltip>);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    const holder = trigger.parentElement;
    expect(fireEvent.keyDown(trigger, { key: 'Escape' })).toBe(false);
    expect(holder?.hasAttribute('data-dismissed')).toBe(true);
    expect(fireEvent.keyDown(trigger, { key: 'Escape' })).toBe(true);
    fireEvent.blur(trigger);
    expect(holder?.hasAttribute('data-dismissed')).toBe(false);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    fireEvent.mouseLeave(holder ?? trigger);
    expect(holder?.hasAttribute('data-dismissed')).toBe(false);
  });
});
