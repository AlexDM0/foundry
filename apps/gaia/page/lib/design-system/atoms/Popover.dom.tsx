/**
 * The popover: closed it renders nothing, open it is a dialog named by its label; Esc and a pointer down outside call `onDismiss` with the
 * reason, but not one on its anchor; width and placement set attributes; while its leaving animation runs it stays marked out and inert; and the
 * words are text, never markup.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
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

  test('the wide width sets its attribute', () => {
    render(<AnchoredPopover isOpen reasons={[]} width="wide" />);
    expect(screen.getByRole('dialog', { name: 'Example filters' }).getAttribute('data-width')).toBe('wide');
  });

  test('its width and placement set their attributes', () => {
    render(<AnchoredPopover isOpen reasons={[]} placement="below-start" width="inbox" />);
    const popover = screen.getByRole('dialog');
    expect([popover.getAttribute('data-placement'), popover.getAttribute('data-width')]).toEqual(['below-start', 'inbox']);
  });

  test('closing with a leaving animation, it stays marked out and inert until that animation\'s time has passed', async () => {
    const leavingStyle = document.createElement('style');
    leavingStyle.textContent = '.design-system-popover[data-motion="out"] { animation-name: example-leave; animation-duration: 0.02s; }';
    document.head.append(leavingStyle);
    const { rerender } = render(<AnchoredPopover isOpen reasons={[]} />);
    act(() => rerender(<AnchoredPopover isOpen={false} reasons={[]} />));
    const leaving = document.querySelector('.design-system-popover');
    expect([leaving?.getAttribute('data-motion'), leaving?.hasAttribute('inert')]).toEqual(['out', true]);
    await waitFor(() => {
      expect(document.querySelector('.design-system-popover')).toBeNull();
    });
    leavingStyle.remove();
  });

  test('the label is text, never markup', () => {
    render(<AnchoredPopover isOpen reasons={[]} label="<b>planted</b>" />);
    expect(screen.getByRole('dialog', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
