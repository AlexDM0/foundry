/**
 * The flow frame, in a happy-dom document. What matters: it is a group named by its label, which it shows once to the eye and only once to
 * assistive technology; its children are inside it, in their order.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FlowFrame } from './FlowFrame.tsx';

afterEach(() => {
  cleanup();
});

describe('the flow frame', () => {
  test('a group named by its label, showing the label hidden from assistive technology, around its children', () => {
    render(
      <FlowFrame label="Merge train · Airlock, one at a time">
        <span>Merge main into the tree</span>
        <span>Gates</span>
      </FlowFrame>,
    );
    const frame = screen.getByRole('group', { name: 'Merge train · Airlock, one at a time' });
    const label = frame.querySelector('.bridge-flow-frame-label');
    expect([
      frame.className,
      label?.textContent,
      label?.getAttribute('aria-hidden'),
      [...frame.children].slice(1).map((child) => child.textContent),
    ]).toEqual(['bridge-flow-frame', 'Merge train · Airlock, one at a time', 'true', ['Merge main into the tree', 'Gates']]);
  });
});
