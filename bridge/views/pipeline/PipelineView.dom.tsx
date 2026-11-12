/**
 * The Pipeline view in a happy-dom document. What matters: it names the screen the facts and the route pick, and the setup landing of an
 * unreadable `pipeline.json` shows the warn banner with the reason, which a readable board never shows. The flow screen draws the flow;
 * the smallest pipeline has its "About this pipeline" aside and, while editing, the footer naming the removed steps beside Discard and
 * Apply changes, while a live flow has no footer. The gates area stands under the flow, and Enter on a Gates node selects that phase's
 * tab. A double-click on a node opens its dialog with the node selected, and closing it clears the selection.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { clickSettled, fakeControls }                   from '../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../testing/PipelineFixture.ts';
import { PipelineView }                                 from './PipelineView.tsx';

afterEach(cleanup);

describe('the Pipeline view', () => {
  test('a board with no pipeline shows the setup landing and no banner', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A0')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Set up the pipeline' }).getAttribute('data-screen')).toBe('setup-landing');
    expect(document.querySelector('.bridge-banner')).toBeNull();
  });

  test('an unreadable pipeline.json lands on setup with a banner naming the reason', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A0-unreadable')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('status').textContent).toContain('gates[1] has no run line');
  });

  test('a routed setup step shows that step, and a readable pipeline the live flow', () => {
    const { unmount } = render(<PipelineView facts={pipelineBoardStateOf('A1')} route={{ tab: 'pipeline', item: 'setup/research' }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Research' }).getAttribute('data-screen')).toBe('setup-step');
    unmount();
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Pipeline' }).getAttribute('data-screen')).toBe('flow');
  });

  test('the smallest pipeline being edited shows its aside and a footer naming the removed steps, Discard and Apply changes', async () => {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('A7')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Pipeline flow' }).getAttribute('data-stage')).toBe('editing');
    expect(screen.getByRole('complementary', { name: 'About this pipeline' })).toBeDefined();
    const footer = screen.getByRole('region', { name: 'Pipeline changes' });
    expect(within(footer).getByText('Review and the merge train re-review removed')).toBeDefined();
    expect(within(footer).getByRole('button', { name: 'Apply changes' })).toBeDefined();
    await clickSettled(within(footer).getByRole('button', { name: 'Discard' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-discard', setupId: 'S2' }]);
  });

  test('a live flow with a review step has no aside and no footer', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Pipeline flow' }).getAttribute('data-stage')).toBe('live');
    expect(screen.queryByRole('complementary', { name: 'About this pipeline' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pipeline changes' })).toBeNull();
  });

  test('the gates area stands under the flow, and Enter on a Gates node selects its phase\'s tab', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const gates = screen.getByRole('region', { name: 'Gates' });
    expect(within(gates).getByRole('tab', { selected: true }).getAttribute('aria-label')).toBe('Build, 3 gates');
    const mergeGatesNode = document.querySelector<HTMLElement>('[data-flow-node-id="gates-merge"] .bridge-flow-node');
    if (mergeGatesNode === null) throw new Error('no merge gates node');
    fireEvent.keyDown(mergeGatesNode, { key: 'Enter' });
    expect(within(gates).getByRole('tab', { selected: true }).getAttribute('aria-label')).toBe('Merge, 3 gates');
    expect(within(gates).getByRole('tabpanel', { name: 'Merge gates' })).toBeDefined();
  });

  test('a double-click on a node opens its dialog with the node selected, and Esc closes it', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A6')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const builderNode = document.querySelector<HTMLElement>('[data-flow-node-id="builder"] .bridge-flow-node');
    if (builderNode === null) throw new Error('no Builder node');
    fireEvent.doubleClick(builderNode);
    expect(screen.getByRole('dialog', { name: 'Builder' })).toBeDefined();
    expect(builderNode.hasAttribute('data-selected')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Builder' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Builder' })).toBeNull();
    expect(builderNode.hasAttribute('data-selected')).toBe(false);
  });

  test('Enter on a gate row opens the Gate dialog of that row: a prepare row its prepare variant, a gate its place in the tab\'s phase', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const rows = [...document.querySelectorAll<HTMLElement>('.bridge-pipeline-gate-row[aria-haspopup="dialog"]')];
    const kickerAfterEnterOn = (row: HTMLElement | undefined): string | null => {
      if (row === undefined) throw new Error('no gate row that opens a dialog');
      fireEvent.keyDown(row, { key: 'Enter' });
      const kicker = screen.getByRole('dialog').querySelector('.bridge-dialog-kicker')?.textContent ?? null;
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      return kicker;
    };
    expect([kickerAfterEnterOn(rows[0]), kickerAfterEnterOn(rows[1])]).toEqual(['Prepare step', 'Build gate 1']);
  });
});
