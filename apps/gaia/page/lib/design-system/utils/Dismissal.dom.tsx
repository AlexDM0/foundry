/**
 * The dismissal hook: Esc dismisses with `escape` and is default-prevented, so the side panel and embedded page leave it; a pointer down or focus
 * outside dismisses with `outside`, inside nothing does; a closed popover listens to nothing; an Esc already taken dismisses nothing; and in the
 * capture phase Esc arrives before a bubbling document listener.
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

import { useDismissal, type DismissalReason } from './Dismissal.ts';

interface ExamplePopoverProps {
  readonly isOpen:       boolean;
  readonly reasons:      DismissalReason[];
  readonly escapePhase?: 'capture' | 'bubble';
}

function ExamplePopover({ isOpen, reasons, escapePhase = 'bubble' }: ExamplePopoverProps) {
  const popover = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useDismissal({
    isOpen, insideRefs: [popover, trigger], onDismiss: (reason) => reasons.push(reason), escapePhase,
  });
  return (
    <>
      <button ref={trigger} type="button">Trigger</button>
      <div ref={popover}><button type="button">Inside</button></div>
      <button type="button">Outside</button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('the dismissal', () => {
  test('Esc dismisses with escape and marks the event default-prevented', () => {
    const reasons: DismissalReason[] = [];
    render(<ExamplePopover isOpen reasons={reasons} />);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    expect([reasons, escape.defaultPrevented]).toEqual([['escape'], true]);
  });

  test('a pointer down or focus outside dismisses with outside', () => {
    const reasons: DismissalReason[] = [];
    render(<ExamplePopover isOpen reasons={reasons} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    fireEvent.focusIn(screen.getByRole('button', { name: 'Outside' }));
    expect(reasons).toEqual(['outside', 'outside']);
  });

  test('a pointer down or focus inside the popover or on its trigger dismisses nothing', () => {
    const reasons: DismissalReason[] = [];
    render(<ExamplePopover isOpen reasons={reasons} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.focusIn(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Trigger' }));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(reasons).toEqual([]);
  });

  test('a closed popover listens to nothing', () => {
    const reasons: DismissalReason[] = [];
    render(<ExamplePopover isOpen={false} reasons={reasons} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(reasons).toEqual([]);
  });

  test('an Esc another layer already took dismisses nothing', () => {
    const reasons: DismissalReason[] = [];
    const takingListener = (event: KeyboardEvent): void => {
      event.preventDefault();
    };
    document.addEventListener('keydown', takingListener, true);
    render(<ExamplePopover isOpen reasons={reasons} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), { key: 'Escape' });
    document.removeEventListener('keydown', takingListener, true);
    expect(reasons).toEqual([]);
  });

  test('in the capture phase the Esc arrives before a listener waiting for it to bubble, which then finds it taken', () => {
    const reasons: DismissalReason[] = [];
    const bubblingSaw: boolean[] = [];
    const bubblingListener = (event: KeyboardEvent): void => {
      bubblingSaw.push(event.defaultPrevented);
    };
    document.addEventListener('keydown', bubblingListener);
    render(<ExamplePopover isOpen reasons={reasons} escapePhase="capture" />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Inside' }), { key: 'Escape' });
    document.removeEventListener('keydown', bubblingListener);
    expect([reasons, bubblingSaw]).toEqual([['escape'], [true]]);
  });
});
