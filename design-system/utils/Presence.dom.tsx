/**
 * The presence hook, in a happy-dom document. What matters: open, the part is shown and not leaving; closed with no leaving animation, it
 * goes at once; closed with one, it stays shown and leaving until that animation's time has passed, then goes; opened again while it
 * leaves, it is shown and no longer leaving.
 */
import {
  act,
  cleanup,
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

import { usePresence } from './Presence.ts';

interface ExamplePartProps {
  readonly isOpen:           boolean;
  /** The leaving animation's duration, such as `0.02s`; absent, the part has no animation. */
  readonly leavingDuration?: string;
}

function ExamplePart({ isOpen, leavingDuration }: ExamplePartProps) {
  const part = useRef<HTMLDivElement | null>(null);
  const { isShown, isLeaving } = usePresence(isOpen, part);
  if (!isShown) return null;
  const leavingStyle = leavingDuration === undefined ? undefined : { animationName: 'example-leave', animationDuration: leavingDuration };
  return <div ref={part} role="status" data-motion={isLeaving ? 'out' : 'in'} style={leavingStyle}>Example part</div>;
}

const part = (): HTMLElement | null => screen.queryByRole('status');

afterEach(() => {
  cleanup();
});

describe('the presence', () => {
  test('open, the part is shown and not leaving; closed from the start, it is not shown', () => {
    const { rerender } = render(<ExamplePart isOpen={false} />);
    expect(part()).toBeNull();
    rerender(<ExamplePart isOpen />);
    expect(part()?.getAttribute('data-motion')).toBe('in');
  });

  test('closed with no leaving animation, the part goes at once', () => {
    const { rerender } = render(<ExamplePart isOpen />);
    act(() => rerender(<ExamplePart isOpen={false} />));
    expect(part()).toBeNull();
  });

  test('closed with a leaving animation, the part stays shown and leaving until its time has passed', async () => {
    const { rerender } = render(<ExamplePart isOpen leavingDuration="0.02s" />);
    act(() => rerender(<ExamplePart isOpen={false} leavingDuration="0.02s" />));
    expect(part()?.getAttribute('data-motion')).toBe('out');
    await waitFor(() => {
      expect(part()).toBeNull();
    });
  });

  test('opened again while it leaves, the part is shown and no longer leaving', () => {
    const { rerender } = render(<ExamplePart isOpen leavingDuration="10s" />);
    act(() => rerender(<ExamplePart isOpen={false} leavingDuration="10s" />));
    expect(part()?.getAttribute('data-motion')).toBe('out');
    act(() => rerender(<ExamplePart isOpen leavingDuration="10s" />));
    expect(part()?.getAttribute('data-motion')).toBe('in');
  });
});
