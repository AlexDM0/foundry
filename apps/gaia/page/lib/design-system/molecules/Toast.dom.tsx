/**
 * The toast; happy-dom runs no CSS animation, so a spec dispatches `animationend` or fires the injected timer. It is a status region that takes
 * the focus; `onExpired` comes on the timer bar's own animation end, never a bubbled one, or under reduced motion from the injected timer; hover
 * or focus pauses it and leaving resumes it, restarting that timer.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  jest,
  test
} from 'bun:test';

import { Toast, type ToastExpiryTimer } from './Toast.tsx';

/** The value of `--toast-duration` in `tokens.css`, which a document without the stylesheet falls back to. */
const TOAST_DURATION_MILLISECONDS = 5000;

interface HappyDomDevice {
  prefersReducedMotion: string;
}

function happyDomDevice(): HappyDomDevice {
  return (window as unknown as { happyDOM: { settings: { device: HappyDomDevice } } }).happyDOM.settings.device;
}

interface StartedTimer {
  readonly milliseconds: number;
  readonly fire:         () => void;
  readonly cancel:       ReturnType<typeof jest.fn>;
}

function recordingExpiryTimer(): { readonly timer: ToastExpiryTimer; readonly started: StartedTimer[] } {
  const started: StartedTimer[] = [];
  const timer: ToastExpiryTimer = (milliseconds, onEnd) => {
    const cancel = jest.fn();
    started.push({ milliseconds, fire: onEnd, cancel });
    return cancel;
  };
  return { timer, started };
}

afterEach(() => {
  cleanup();
  happyDomDevice().prefersReducedMotion = 'no-preference';
});

describe('the toast', () => {
  test('a status region with its title, its text and the check glyph when asked', () => {
    const { container } = render(<Toast title="Plan applied" text="Work resumed." glyph="check" onExpired={jest.fn()} />);
    const toast = screen.getByRole('status');
    expect([toast.getAttribute('class'), container.querySelector('.design-system-toast-title')?.textContent, container.querySelector('.design-system-toast-message')?.textContent])
      .toEqual(['design-system-toast', 'Plan applied', 'Work resumed.']);
    expect(container.querySelector('.design-system-toast-check')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const withoutGlyph = render(<Toast title="Saved" text="The gate is saved." onExpired={jest.fn()} />);
    expect(withoutGlyph.container.querySelector('.design-system-toast-check')).toBeNull();
  });

  test('onExpired comes on the end of the timer bar\'s animation, never on one bubbling from inside, and the timer is not started', () => {
    const onExpired = jest.fn();
    const { timer, started } = recordingExpiryTimer();
    const { container } = render(<Toast title="Plan applied" text="Work resumed." glyph="check" onExpired={onExpired} expiryTimer={timer} />);
    fireEvent.animationEnd(container.querySelector('.design-system-toast-check') as Element);
    expect(onExpired).not.toHaveBeenCalled();
    fireEvent.animationEnd(container.querySelector('.design-system-toast-timer') as Element);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(started).toEqual([]);
  });

  test('a pointer over the toast or the focus in it pauses it, and leaving resumes it', () => {
    render(<Toast title="Plan applied" text="Work resumed." onExpired={jest.fn()} />);
    const toast = screen.getByRole('status');
    expect([toast.tabIndex, toast.hasAttribute('data-paused')]).toEqual([0, false]);
    fireEvent.mouseEnter(toast);
    expect(toast.hasAttribute('data-paused')).toBe(true);
    fireEvent.mouseLeave(toast);
    expect(toast.hasAttribute('data-paused')).toBe(false);
    fireEvent.focus(toast);
    expect(toast.hasAttribute('data-paused')).toBe(true);
    fireEvent.blur(toast);
    expect(toast.hasAttribute('data-paused')).toBe(false);
  });

  test('under reduced motion onExpired comes from the injected timer after the toast\'s duration', () => {
    happyDomDevice().prefersReducedMotion = 'reduce';
    const onExpired = jest.fn();
    const { timer, started } = recordingExpiryTimer();
    render(<Toast title="Plan applied" text="Work resumed." onExpired={onExpired} expiryTimer={timer} />);
    expect(started.map((startedTimer) => startedTimer.milliseconds)).toEqual([TOAST_DURATION_MILLISECONDS]);
    act(() => started[0]?.fire());
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  test('under reduced motion a pause cancels the timer and the resume starts it again', () => {
    happyDomDevice().prefersReducedMotion = 'reduce';
    const onExpired = jest.fn();
    const { timer, started } = recordingExpiryTimer();
    render(<Toast title="Plan applied" text="Work resumed." onExpired={onExpired} expiryTimer={timer} />);
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    expect([started.length, started[0]?.cancel.mock.calls.length]).toEqual([1, 1]);
    fireEvent.mouseLeave(toast);
    expect(started.map((startedTimer) => startedTimer.milliseconds)).toEqual([TOAST_DURATION_MILLISECONDS, TOAST_DURATION_MILLISECONDS]);
    act(() => started[1]?.fire());
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
