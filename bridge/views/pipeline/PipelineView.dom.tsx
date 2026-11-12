/**
 * The Pipeline view in a happy-dom document. What matters: it names the screen the facts and the route pick, and the setup landing of an
 * unreadable `pipeline.json` shows the warn banner with the reason, which a readable board never shows. The flow screen draws the flow;
 * the smallest pipeline has its "About this pipeline" aside and, while editing, the footer naming the removed steps beside Discard and
 * Apply changes, while a live flow has no footer. The gates area stands under the flow, and Enter on a Gates node selects that phase's
 * tab. A double-click on a node opens its dialog with the node selected, and closing it clears the selection.
 */
import {
  act,
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
import { useState } from 'react';

import type { BoardStateDocument }                      from '../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                             from '../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                   from '../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                     from '../../testing/TimestampSlicesFixture.ts';
import { PipelineView }                                 from './PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

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

  test('a live flow with a review step has the activity aside and the applied footer, and no note and no changes footer', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('region', { name: 'Pipeline flow' }).getAttribute('data-stage')).toBe('live');
    expect(screen.getByRole('complementary', { name: 'Activity' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Applied pipeline' })).toBeDefined();
    expect(screen.queryByRole('complementary', { name: 'About this pipeline' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pipeline changes' })).toBeNull();
  });

  test('the live footer cuts the applied time by the page\'s stamp slices', () => {
    const facts = pipelineBoardStateOf('A5');
    const { page } = facts;
    if (page === undefined) throw new Error('A5 has no page');
    const withSlices = { ...facts, page: { ...page, payload: { ...page.payload, limits: EXAMPLE_TIMESTAMP_SLICES } } };
    render(<PipelineView facts={withSlices} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(within(screen.getByRole('region', { name: 'Applied pipeline' })).getByText(/^Version 2 · applied .*10:30 by User$/)).toBeDefined();
  });

  test('an advise session opens on the pipeline agent\'s tab, an update on the Changes tab', () => {
    const update = pipelineBoardStateOf('A6');
    const { unmount } = fakeControls().render(<PipelineView facts={update} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const asideTabs = screen.getByRole('tablist', { name: 'Changes and the pipeline agent' });
    expect(within(asideTabs).getByRole('tab', { selected: true }).textContent).toContain('Changes');
    unmount();
    const setup = update.pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('A6 has no setup');
    const advise = { ...update, pipelineSetup: { ...setup, record: { ...setup.record, mode: 'advise' as const } } };
    fakeControls().render(<PipelineView facts={advise} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const adviseTabs = screen.getByRole('tablist', { name: 'Changes and the pipeline agent' });
    expect(within(adviseTabs).getByRole('tab', { selected: true }).textContent).toBe('Pipeline agent');
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

describe('the toast after an Apply', () => {
  function renderHost(initial: BoardStateDocument, route: BridgeRoute) {
    const controls = fakeControls();
    let showBoard: (next: BoardStateDocument) => void = () => undefined;

    function Host() {
      const [shown, setShown] = useState(initial);
      showBoard = setShown;
      return <PipelineView facts={shown} route={route} {...pipelineViewServicesOf()} />;
    }
    controls.render(<Host />);
    return { controls, show: (next: BoardStateDocument) => act(() => showBoard(next)) };
  }

  function appliedAt(revision: number): BoardStateDocument {
    const board = pipelineBoardStateOf('A5');
    const { pipeline } = board;
    if (pipeline?.readingVerdict !== 'readable' || pipeline.application === null) throw new Error('A5 has no applied pipeline');
    return { ...board, pipeline: { ...pipeline, application: { ...pipeline.application, appliedRevision: revision } } };
  }

  async function applyFirstPipeline(resumesBoard: boolean) {
    const host = renderHost(pipelineBoardStateOf('A4'), { tab: 'pipeline', item: 'setup/design' });
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline design actions' })).getByRole('button', { name: 'Apply pipeline' }));
    const dialog = screen.getByRole('dialog', { name: 'Apply the pipeline?' });
    if (!resumesBoard) fireEvent.click(within(dialog).getByRole('checkbox'));
    await clickSettled(within(dialog).getByRole('button', { name: 'Apply' }));
    return host;
  }

  test('says "Board resumed" when the first Apply resumed the board, once the facts show it applied', async () => {
    const { show } = await applyFirstPipeline(true);
    expect(document.querySelector('.bridge-toast')).toBeNull();
    show(pipelineBoardStateOf('A5'));
    expect(document.querySelector('.bridge-toast')?.textContent).toBe('Pipeline appliedBoard resumed · Version 2 is live.');
  });

  test('says nothing of the board when the Apply left it as it was, and leaves when its bar ran down', async () => {
    const { show } = await applyFirstPipeline(false);
    show(pipelineBoardStateOf('A5'));
    expect(document.querySelector('.bridge-toast')?.textContent).toBe('Pipeline appliedVersion 2 is live.');
    const timer = document.querySelector('.bridge-toast-timer');
    if (timer === null) throw new Error('no toast timer');
    act(() => {
      timer.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(document.querySelector('.bridge-toast')).toBeNull();
  });

  test('Apply N changes never resumes the board: its toast names the new version only', async () => {
    const { show } = renderHost(pipelineBoardStateOf('A6b'), { tab: 'pipeline', item: null });
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline changes' })).getByRole('button', { name: 'Apply 4 changes' }));
    await clickSettled(within(screen.getByRole('dialog', { name: 'Apply 4 changes?' })).getByRole('button', { name: 'Apply 4 changes' }));
    show(appliedAt(2));
    expect(document.querySelector('.bridge-toast')).toBeNull();
    show(appliedAt(3));
    expect(document.querySelector('.bridge-toast')?.textContent).toBe('Pipeline appliedVersion 3 is live.');
  });

  test('a live board that no Apply of this view reached shows no toast', () => {
    const { show } = renderHost(pipelineBoardStateOf('A5'), { tab: 'pipeline', item: null });
    show(appliedAt(3));
    expect(document.querySelector('.bridge-toast')).toBeNull();
  });
});
