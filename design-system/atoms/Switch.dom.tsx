/**
 * The switch, in a happy-dom document. What matters: it is a switch whose `aria-checked` is its state; a click, Space and Enter each hand
 * on one toggle, and another key none; a held key's auto-repeat hands on no more; a disabled switch hands nothing on; it is named by its
 * accessible name, or by a visible label in its place.
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

import { Switch } from './Switch.tsx';

afterEach(() => {
  cleanup();
});

function renderedSwitch(checked: boolean, toggles: string[], disabled = false): HTMLElement {
  render(<Switch accessibleName="Retry" checked={checked} onToggle={() => toggles.push('toggle')} disabled={disabled} />);
  return screen.getByRole('switch', { name: 'Retry' });
}

describe('the switch', () => {
  test('aria-checked is its state, and it draws one knob', () => {
    expect(renderedSwitch(true, []).getAttribute('aria-checked')).toBe('true');
    cleanup();
    const switchElement = renderedSwitch(false, []);
    expect([switchElement.getAttribute('aria-checked'), switchElement.className, switchElement.querySelectorAll('.design-system-switch-knob').length])
      .toEqual(['false', 'design-system-switch', 1]);
  });

  test('a click, Space and Enter each hand on one toggle, and another key none', () => {
    const toggles: string[] = [];
    const switchElement = renderedSwitch(false, toggles);
    fireEvent.click(switchElement);
    expect(fireEvent.keyDown(switchElement, { key: ' ' })).toBe(false);
    fireEvent.keyDown(switchElement, { key: 'Enter' });
    fireEvent.keyDown(switchElement, { key: 'a' });
    expect(toggles).toEqual(['toggle', 'toggle', 'toggle']);
  });

  test('a held Space hands on one toggle, its auto-repeated presses none', () => {
    const toggles: string[] = [];
    const switchElement = renderedSwitch(false, toggles);
    fireEvent.keyDown(switchElement, { key: ' ' });
    expect(fireEvent.keyDown(switchElement, { key: ' ', repeat: true })).toBe(false);
    fireEvent.keyDown(switchElement, { key: ' ', repeat: true });
    expect(toggles).toEqual(['toggle']);
  });

  test('a disabled switch hands nothing on', () => {
    const toggles: string[] = [];
    const switchElement = renderedSwitch(true, toggles, true);
    fireEvent.click(switchElement);
    fireEvent.keyDown(switchElement, { key: ' ' });
    fireEvent.keyDown(switchElement, { key: 'Enter' });
    expect([toggles, (switchElement as HTMLButtonElement).disabled]).toEqual([[], true]);
  });

  test('a visible label names it in place of its accessible name', () => {
    render(
      <>
        <span id="example-node-title">Human code review</span>
        <Switch accessibleName="Unused name" checked={false} onToggle={() => undefined} labelledBy="example-node-title" />
      </>,
    );
    const switchElement = screen.getByRole('switch', { name: 'Human code review' });
    expect([switchElement.getAttribute('aria-label'), switchElement.getAttribute('aria-labelledby')]).toEqual([null, 'example-node-title']);
  });
});
