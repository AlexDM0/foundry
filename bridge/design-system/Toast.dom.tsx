/**
 * The toast, in a happy-dom document, which runs no CSS animation: a spec ends one by dispatching `animationend`, or fires the injected
 * timer. What matters: the toast is a status region with its title and text, and its check glyph only when asked; `onExpired` comes on the
 * end of the timer bar's own animation and not on one that bubbles from inside; with motion the injected timer is never started; a pointer
 * over the toast or the focus in it pauses it, and leaving resumes it; under reduced motion `onExpired` comes from the injected timer after
 * the toast's duration, and a pause cancels that timer and the resume starts it again.
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
    const { container } = render(<Toast title="Pipeline applied" text="Board resumed." glyph="check" onExpired={jest.fn()} />);
    const toast = screen.getByRole('status');
    expect([toast.getAttribute('class'), container.querySelector('.bridge-toast-title')?.textContent, container.querySelector('.bridge-toast-message')?.textContent])
      .toEqual(['bridge-toast', 'Pipeline applied', 'Board resumed.']);
    expect(container.querySelector('.bridge-toast-check')?.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    const withoutGlyph = render(<Toast title="Saved" text="The gate is saved." onExpired={jest.fn()} />);
    expect(withoutGlyph.container.querySelector('.bridge-toast-check')).toBeNull();
  });

  test('onExpired comes on the end of the timer bar\'s animation, never on one bubbling from inside, and the timer is not started', () => {
    const onExpired = jest.fn();
    const { timer, started } = recordingExpiryTimer();
    const { container } = render(<Toast title="Pipeline applied" text="Board resumed." glyph="check" onExpired={onExpired} expiryTimer={timer} />);
    fireEvent.animationEnd(container.querySelector('.bridge-toast-check') as Element);
    expect(onExpired).not.toHaveBeenCalled();
    fireEvent.animationEnd(container.querySelector('.bridge-toast-timer') as Element);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(started).toEqual([]);
  });

  test('a pointer over the toast or the focus in it pauses it, and leaving resumes it', () => {
    render(<Toast title="Pipeline applied" text="Board resumed." onExpired={jest.fn()} />);
    const toast = screen.getByRole('status');
    expect(toast.hasAttribute('data-paused')).toBe(false);
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
    render(<Toast title="Pipeline applied" text="Board resumed." onExpired={onExpired} expiryTimer={timer} />);
    expect(started.map((startedTimer) => startedTimer.milliseconds)).toEqual([TOAST_DURATION_MILLISECONDS]);
    act(() => started[0]?.fire());
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  test('under reduced motion a pause cancels the timer and the resume starts it again', () => {
    happyDomDevice().prefersReducedMotion = 'reduce';
    const onExpired = jest.fn();
    const { timer, started } = recordingExpiryTimer();
    render(<Toast title="Pipeline applied" text="Board resumed." onExpired={onExpired} expiryTimer={timer} />);
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    expect([started.length, started[0]?.cancel.mock.calls.length]).toEqual([1, 1]);
    fireEvent.mouseLeave(toast);
    expect(started.map((startedTimer) => startedTimer.milliseconds)).toEqual([TOAST_DURATION_MILLISECONDS, TOAST_DURATION_MILLISECONDS]);
    act(() => started[1]?.fire());
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
