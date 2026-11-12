/**
 * The zoom control, in a happy-dom document. What matters: the step buttons are named by their labels and hand on their presses, the zoom
 * text sits between them, and Fit hands on its press; at a bound the step button that would pass it is disabled and hands nothing on, while
 * Fit always works.
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

import { ZoomControl } from './ZoomControl.tsx';

afterEach(() => {
  cleanup();
});

function renderedZoom(presses: string[], canZoomOut: boolean, canZoomIn: boolean, zoomText = '100%'): void {
  render(
    <ZoomControl
      zoomText={zoomText}
      onZoomOut={() => presses.push('out')}
      onZoomIn={() => presses.push('in')}
      onFit={() => presses.push('fit')}
      zoomOutLabel="Zoom out"
      zoomInLabel="Zoom in"
      fitLabel="Fit"
      canZoomOut={canZoomOut}
      canZoomIn={canZoomIn}
    />,
  );
}

function pressEach(names: readonly string[]): void {
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }));
}

describe('the zoom control', () => {
  test('zoom out, the zoom text, zoom in, then Fit, each button handing on its press', () => {
    const presses: string[] = [];
    renderedZoom(presses, true, true);
    pressEach(['Zoom out', 'Zoom in', 'Fit']);
    const steps = document.querySelector('.bridge-zoom > .bridge-zoom-steps');
    expect([[...(steps?.children ?? [])].map((part) => part.textContent), presses])
      .toEqual([['−', '100%', '+'], ['out', 'in', 'fit']]);
  });

  test('at the lower bound zoom out is disabled and hands nothing on', () => {
    const presses: string[] = [];
    renderedZoom(presses, false, true, '50%');
    pressEach(['Zoom out', 'Zoom in', 'Fit']);
    expect([(screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement).disabled, presses]).toEqual([true, ['in', 'fit']]);
  });

  test('at the upper bound zoom in is disabled and hands nothing on', () => {
    const presses: string[] = [];
    renderedZoom(presses, true, false, '200%');
    pressEach(['Zoom out', 'Zoom in', 'Fit']);
    expect([(screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement).disabled, presses]).toEqual([true, ['out', 'fit']]);
  });
});
