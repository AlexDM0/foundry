/**
 * The flow's toolbar in a happy-dom document. What matters: the stage's mark and note show; Update pipeline is offered on a live board
 * only and sends `pipeline-update-start`; the zoom steps hand on the next step, and a bound disables its button.
 */
import { cleanup, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { clickSettled, fakeControls } from '../../../testing/FakeControls.ts';
import { FlowToolbar }                from './FlowToolbar.tsx';

afterEach(cleanup);

function renderToolbar(stage: 'proposal' | 'live' | 'editing', zoomPercent = 100) {
  const controls = fakeControls();
  const zooms: number[] = [];
  controls.render(<FlowToolbar stage={stage} note="Example note" zoomPercent={zoomPercent} onZoom={(zoom) => zooms.push(zoom)} onFit={() => undefined} />);
  return { controls, zooms };
}

describe('the flow toolbar', () => {
  test('shows the stage mark and note; only a live board offers Update pipeline, which opens an update', async () => {
    const { controls } = renderToolbar('live');
    expect(document.querySelector('.bridge-pipeline-flow-stage-mark')?.getAttribute('data-stage')).toBe('live');
    expect(screen.getByText('Example note')).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Update pipeline' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
    cleanup();
    renderToolbar('editing');
    expect(screen.queryByRole('button', { name: 'Update pipeline' })).toBeNull();
  });

  test('the zoom hands on the next step, and its bound disables the button', async () => {
    const { zooms } = renderToolbar('proposal');
    await clickSettled(screen.getByRole('button', { name: 'Zoom out' }));
    expect(zooms).toEqual([90]);
    cleanup();
    renderToolbar('proposal', 150);
    expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true);
  });
});
