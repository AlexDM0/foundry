/**
 * The popover, in a happy-dom document. What matters: closed, it renders nothing; open, it is a dialog named by its label; Esc and a
 * pointer down outside call `onDismiss` with the reason, while a pointer down on its anchor does not; its width and placement set their
 * attributes; and the words are text, never markup.
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
import { useRef } from 'react';

import type { DismissalReason }                              from '../utils/Dismissal.ts';
import { Popover, type PopoverPlacement, type PopoverWidth } from './Popover.tsx';

interface AnchoredPopoverProps {
  readonly isOpen:     boolean;
  readonly reasons:    DismissalReason[];
  readonly label?:     string;
  readonly placement?: PopoverPlacement;
  readonly width?:     PopoverWidth;
}

function AnchoredPopover({
  isOpen, reasons, label = 'Example filters', placement = 'below-end', width = 'menu'
}: AnchoredPopoverProps) {
  const anchor = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={anchor}>
        <button type="button">Anchor</button>
        <Popover label={label} role="dialog" isOpen={isOpen} onDismiss={(reason) => reasons.push(reason)} anchorRef={anchor} placement={placement} width={width}>
          <button type="button">Inside</button>
        </Popover>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('the popover', () => {
  test('closed, it renders nothing', () => {
    render(<AnchoredPopover isOpen={false} reasons={[]} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('open, it is a dialog named by its label', () => {
    render(<AnchoredPopover isOpen reasons={[]} />);
    expect(screen.getByRole('dialog', { name: 'Example filters' }).className).toBe('design-system-popover');
  });

  test('Esc and a pointer down outside call onDismiss with the reason, a pointer down on the anchor does not', () => {
    const reasons: DismissalReason[] = [];
    render(<AnchoredPopover isOpen reasons={reasons} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Anchor' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(reasons).toEqual(['escape', 'outside']);
  });

  test('its width and placement set their attributes', () => {
    render(<AnchoredPopover isOpen reasons={[]} placement="below-start" width="inbox" />);
    const popover = screen.getByRole('dialog');
    expect([popover.getAttribute('data-placement'), popover.getAttribute('data-width')]).toEqual(['below-start', 'inbox']);
  });

  test('the label is text, never markup', () => {
    render(<AnchoredPopover isOpen reasons={[]} label="<b>planted</b>" />);
    expect(screen.getByRole('dialog', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
