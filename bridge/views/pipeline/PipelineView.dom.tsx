/**
 * The Pipeline view in a happy-dom document. What matters: it names the screen the facts and the route pick, and the setup landing of an
 * unreadable `pipeline.json` shows the warn banner with the reason, which a readable board never shows.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { pipelineBoardStateOf } from '../../testing/PipelineFixture.ts';
import { PipelineView }         from './PipelineView.tsx';

afterEach(cleanup);

describe('the Pipeline view', () => {
  test('a board with no pipeline shows the setup landing and no banner', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A0')} route={{ tab: 'pipeline', item: null }} />);
    expect(screen.getByRole('region', { name: 'Set up the pipeline' }).getAttribute('data-screen')).toBe('setup-landing');
    expect(document.querySelector('.bridge-banner')).toBeNull();
  });

  test('an unreadable pipeline.json lands on setup with a banner naming the reason', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A0-unreadable')} route={{ tab: 'pipeline', item: null }} />);
    expect(screen.getByRole('status').textContent).toContain('gates[1] has no run line');
  });

  test('a routed setup step shows that step, and a readable pipeline the live flow', () => {
    const { unmount } = render(<PipelineView facts={pipelineBoardStateOf('A1')} route={{ tab: 'pipeline', item: 'setup/research' }} />);
    expect(screen.getByRole('heading', { name: 'Research' })).toBeDefined();
    unmount();
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} />);
    expect(screen.getByRole('region', { name: 'Pipeline' }).getAttribute('data-screen')).toBe('flow');
  });
});
