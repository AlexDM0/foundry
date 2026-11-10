/**
 * The side panel, in a happy-dom document. What matters: its top docks under the bottom of what `dockBelow` returns and follows it on a
 * scroll; it mounts out of view and enters after a frame; closing slides it out and reports it gone once the slide ends, at once without
 * motion; the close button is named by `closeLabel` and calls `onClose`; it takes the focus on the first showing only, and only when asked;
 * a new content key cross-fades the contents; the head and foot sit outside the scroll; the width sets `data-width`; and the words are
 * text, never markup.
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
import type { ReactNode } from 'react';

import { SidePanel, type SidePanelProps } from './SidePanel.tsx';

const DOCK_BOTTOM_PIXELS = 120;
const SCROLLED_DOCK_BOTTOM_PIXELS = 40;

interface PanelEvents {
  readonly closes: string[];
}

type PanelOverrides = Partial<Omit<SidePanelProps, 'children'>> & { readonly children?: ReactNode };

function panelElementOf(events: PanelEvents, overrides: PanelOverrides = {}) {
  return (
    <SidePanel
      label="Example panel"
      width="detail"
      dockBelow={() => null}
      isClosing={false}
      onClosed={() => events.closes.push('closed')}
      onClose={() => events.closes.push('close')}
      closeLabel="Close"
      focusesCloseOnOpen={() => false}
      contentKey="ticket/014"
      {...overrides}
    >
      {overrides.children ?? <p>Example contents</p>}
    </SidePanel>
  );
}

function renderPanel(overrides: PanelOverrides = {}) {
  const events: PanelEvents = { closes: [] };
  const rendered = render(panelElementOf(events, overrides));
  return { events, rerender: (next: PanelOverrides) => rendered.rerender(panelElementOf(events, { ...overrides, ...next })) };
}

async function nextFrame(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      requestAnimationFrame(resolve);
    });
  });
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Example panel' });
}

afterEach(() => {
  cleanup();
});

describe('the docking', () => {
  test('the top sits under the dock\'s bottom and follows it on a scroll', () => {
    let dockBottom = DOCK_BOTTOM_PIXELS;
    const dock = document.createElement('div');
    dock.getBoundingClientRect = () => DOMRect.fromRect({
      x: 0, y: 0, width: 0, height: dockBottom
    });
    renderPanel({ dockBelow: () => dock });
    expect(panel().style.getPropertyValue('--side-panel-top')).toBe(`${DOCK_BOTTOM_PIXELS}px`);
    dockBottom = SCROLLED_DOCK_BOTTOM_PIXELS;
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(panel().style.getPropertyValue('--side-panel-top')).toBe(`${SCROLLED_DOCK_BOTTOM_PIXELS}px`);
  });

  test('with nothing to dock under, the top is the window\'s', () => {
    renderPanel();
    expect(panel().style.getPropertyValue('--side-panel-top')).toBe('0px');
  });
});

describe('the slide', () => {
  test('mounts out of view and enters after a frame; closing without motion slides out and reports it gone at once', async () => {
    const { events, rerender } = renderPanel();
    expect(panel().getAttribute('data-motion')).toBe('out');
    await nextFrame();
    expect(panel().hasAttribute('data-motion')).toBe(false);
    act(() => rerender({ isClosing: true }));
    expect([panel().getAttribute('data-motion'), events.closes]).toEqual(['out', ['closed']]);
  });

  test('closing with motion reports it gone once the slide ends', async () => {
    const { events, rerender } = renderPanel();
    await nextFrame();
    panel().style.transitionDuration = '0.01s';
    act(() => rerender({ isClosing: true }));
    expect(events.closes).toEqual([]);
    await waitFor(() => {
      expect(events.closes).toEqual(['closed']);
    });
  });
});

describe('the close and the focus', () => {
  test('the close button is named by its label and calls onClose', () => {
    const { events } = renderPanel({ closeLabel: 'Close the example' });
    fireEvent.click(screen.getByRole('button', { name: 'Close the example' }));
    expect(events.closes).toEqual(['close']);
  });

  test('asked on the first showing, the close takes the focus; new contents later leave the focus where it is', () => {
    const { rerender } = renderPanel({ focusesCloseOnOpen: () => true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();
    act(() => rerender({ contentKey: 'ticket/015' }));
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  test('not asked, the close leaves the focus alone', () => {
    renderPanel();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Close' }));
  });
});

describe('the contents', () => {
  test('a new content key cross-fades the contents, which the first key does not', () => {
    const { rerender } = renderPanel();
    expect(panel().querySelector('.bridge-side-panel-scroll')?.hasAttribute('data-swapped')).toBe(false);
    act(() => rerender({ contentKey: 'ticket/015' }));
    expect(panel().querySelector('.bridge-side-panel-scroll')?.hasAttribute('data-swapped')).toBe(true);
  });

  test('the head and foot sit outside the scroll, and the width sets data-width', () => {
    renderPanel({ width: 'question', head: <p>Example head</p>, foot: <p>Example foot</p> });
    const parts = [...panel().children].map((part) => [part.className, part.textContent]);
    expect(parts).toEqual([
      ['bridge-icon-button', '×'],
      ['bridge-side-panel-head', 'Example head'],
      ['bridge-side-panel-scroll', 'Example contents'],
      ['bridge-side-panel-foot', 'Example foot'],
    ]);
    expect(panel().getAttribute('data-width')).toBe('question');
  });

  test('without a head or foot only the close and the scroll show', () => {
    renderPanel();
    expect([...panel().children].map((part) => part.className)).toEqual(['bridge-icon-button', 'bridge-side-panel-scroll']);
  });

  test('the label is text, never markup', () => {
    render(panelElementOf({ closes: [] }, { label: '<b>planted</b>' }));
    expect(screen.getByRole('complementary', { name: '<b>planted</b>' }).querySelector('b')).toBeNull();
  });
});
