/**
 * The live flow's footer in a happy-dom document, over the A5 fixture. What matters: it names the applied version with its time and User,
 * the content hash and the constitution commit's short id; View pipeline.json shows the stored text byte for byte, read-only; Update
 * pipeline sends `pipeline-update-start` and moves to `#pipeline/edit` only once the Overseer took it.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { clickSettled, fakeControls } from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf }       from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }   from '../../../testing/TimestampSlicesFixture.ts';
import { LiveFooter }                 from './LiveFooter.tsx';
import { LivePipelineModel }          from './LivePipelineModel.ts';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderFooter() {
  const footer = LivePipelineModel.footerOf(pipelineBoardStateOf('A5').pipeline, { todayCalendarDate: '2026-11-12', slices: EXAMPLE_TIMESTAMP_SLICES });
  if (footer === null) throw new Error('A5 has no footer');
  const controls = fakeControls();
  controls.render(<LiveFooter footer={footer} />);
  return { controls, footer };
}

describe('the live footer', () => {
  test('names the version, its time and User, the content hash and the constitution commit', () => {
    renderFooter();
    const footer = screen.getByRole('region', { name: 'Applied pipeline' });
    expect(within(footer).getByText('Applied')).toBeDefined();
    expect(within(footer).getByText('Version 2 · applied 10:30 by User')).toBeDefined();
    expect(within(footer).getByText('content hash example-')).toBeDefined();
    expect(within(footer).getByText('CONSTITUTION.md 2222222')).toBeDefined();
  });

  test('View pipeline.json shows the stored text, byte for byte', async () => {
    const { footer } = renderFooter();
    await clickSettled(screen.getByRole('button', { name: 'View pipeline.json' }));
    const dialog = screen.getByRole('dialog', { name: 'pipeline.json' });
    expect(dialog.querySelector('pre')?.textContent).toBe(footer.fileText);
    expect(dialog.querySelector('textarea, input')).toBeNull();
  });

  test('Update pipeline sends the update start and moves to the edit route once taken', async () => {
    const { controls } = renderFooter();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: an update is open.' });
    await clickSettled(screen.getByRole('button', { name: 'Update pipeline' }));
    expect(window.location.hash).toBe('');
    await clickSettled(screen.getByRole('button', { name: 'Update pipeline' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }, { kind: 'pipeline-update-start' }]);
    expect(window.location.hash).toBe('#pipeline/edit');
  });
});
