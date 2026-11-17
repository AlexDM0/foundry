/**
 * The Pipeline view in a happy-dom document. What matters: it names the screen the facts and the route pick, and the setup landing of an
 * unreadable `pipeline.json` shows the warn banner with the reason, which a readable board never shows. The flow screen draws the Focus
 * layout under its title row; the smallest pipeline has its "About this pipeline" aside and, while editing, the footer naming the removed
 * steps beside Discard and Apply changes, while a live flow has the applied footer and no changes footer. The Build phase opens first;
 * a phase tab opens its phase with its gates table, and Enter on a Gates step opens that phase's table. A double-click on a step opens
 * its dialog with the step selected, and closing it clears the selection. A gate dialog opened on any screen shows a running
 * profile's output from the follower the view was given, the one the shell builds over the stream route. One modal dialog is open at a
 * time: a step dialog closes the Apply dialog and Apply closes the step dialog, and an Apply sent in one update never opens by itself in
 * the next. A Gates step marks each gate whose newest run in its phase, a job's or a profile's, reported a full or partial cache hit, and
 * no gate whose run reported a miss, reported nothing, or reported only in another phase.
 * A live monorepo pipeline (MonoLive) shows the level the route names, with the rail and the breadcrumb: an entity's steps carry only its
 * own tickets, its gates head names its profile under way, the activity names each row's entity or the forge and lists every entity's
 * profile under way, and Ask carries the entity;
 * the forge's level lists the merge train and the board's jobs in place of the phases. Each rail row counts its level's work: an entity's
 * open tickets and the crossings in a package stage there, the forge's jobs and merge train; an entity's page shows the crossings that
 * run a package stage now, out of it or into it; an activity row of a package stage names the crossing it runs; the merge train names
 * each ticket's entity; and each entity's jobs stand against its cap, worded in jobs, with the crossings they serve and the ready tickets
 * that wait for a slot.
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
import type { ProfileOutputLine }                       from '../../api/ProfileStreamClient.ts';
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
    expect(document.querySelector('.design-system-banner')).toBeNull();
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
    expect(screen.getByRole('heading', { level: 2, name: 'Update your pipeline' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Phase 2: Build' }).getAttribute('data-stage')).toBe('editing');
    expect(screen.getByRole('complementary', { name: 'About this pipeline' })).toBeDefined();
    const footer = screen.getByRole('region', { name: 'Pipeline changes' });
    expect(within(footer).getByText('Review and the merge train re-review removed')).toBeDefined();
    expect(within(footer).getByRole('button', { name: 'Apply changes' })).toBeDefined();
    await clickSettled(within(footer).getByRole('button', { name: 'Discard' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-discard', setupId: 'S2' }]);
  });

  test('a live flow with a review step has the activity aside and the applied footer, and no note and no changes footer', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your pipeline' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Phase 2: Build' }).getAttribute('data-stage')).toBe('live');
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

  test('the Build phase opens first; a phase tab opens its phase, and Enter on a Gates step opens that phase\'s gates', async () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const phases = screen.getByRole('group', { name: 'Pipeline phases' });
    expect(within(phases).getAllByRole('button').map((tab) => [tab.getAttribute('data-phase'), tab.getAttribute('aria-pressed')])).toEqual([
      ['ticket', 'false'], ['build', 'true'], ['review', 'false'], ['merge', 'false'],
    ]);
    expect(screen.getByRole('region', { name: 'Build gates' })).toBeDefined();
    await clickSettled(within(phases).getByRole('button', { name: /^Merge/ }));
    const mergeGatesStep = document.querySelector<HTMLElement>('[data-step-node-id="gates-merge"]');
    if (mergeGatesStep === null) throw new Error('no merge gates step');
    fireEvent.keyDown(mergeGatesStep, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'Phase 4: Merge' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Merge gates' })).toBeDefined();
  });

  test('a double-click on a step opens its dialog with the step selected, and Esc closes it', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A6')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const builderStep = document.querySelector<HTMLElement>('[data-step-node-id="builder"]');
    const builderCard = builderStep?.querySelector('.design-system-card') ?? null;
    if (builderStep === null || builderCard === null) throw new Error('no Builder step');
    fireEvent.doubleClick(builderStep);
    expect(screen.getByRole('dialog', { name: 'Builder' })).toBeDefined();
    expect(builderCard.hasAttribute('data-selected')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Builder' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Builder' })).toBeNull();
    expect(builderCard.hasAttribute('data-selected')).toBe(false);
  });

  test('Enter on a gate row opens the Gate dialog of that row: a prepare row its prepare variant, a gate its place in the tab\'s phase', () => {
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
    const rows = [...document.querySelectorAll<HTMLElement>('.bridge-pipeline-gate-row[aria-haspopup="dialog"]')];
    const kickerAfterEnterOn = (row: HTMLElement | undefined): string | null => {
      if (row === undefined) throw new Error('no gate row that opens a dialog');
      fireEvent.keyDown(row, { key: 'Enter' });
      const kicker = screen.getByRole('dialog').querySelector('.design-system-dialog-kicker')?.textContent ?? null;
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      return kicker;
    };
    expect([kickerAfterEnterOn(rows[0]), kickerAfterEnterOn(rows[1])]).toEqual(['Prepare step', 'Build gate 1']);
  });
});

/** The view over facts a spec can replace, as the shell's next board event does. */
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

describe('the gates\' cache marks', () => {
  function pillTextsOf(nodeId: string): string[] {
    const step = document.querySelector<HTMLElement>(`[data-step-node-id="${nodeId}"]`);
    if (step === null) throw new Error(`no step ${nodeId}`);
    return ['typecheck', 'lint', 'unit-tests', 'browser-tests'].flatMap((gateName) => within(step).queryAllByText(new RegExp(`^${gateName}( · .+)?$`)))
      .map((pill) => pill.textContent ?? '');
  }

  test('a Gates step marks a hit and a partial hit, and no miss, no gate that reported nothing and no mark of another phase', async () => {
    const facts: BoardStateDocument = {
      ...pipelineBoardStateOf('A5'),
      gateCacheMarks: [
        { gateName: 'typecheck', phase: 'build', cacheReport: 'hit' },
        { gateName: 'lint', phase: 'build', cacheReport: 'partial' },
        { gateName: 'unit-tests', phase: 'build', cacheReport: 'miss' },
        { gateName: 'browser-tests', phase: 'review', cacheReport: 'hit' },
      ],
    };
    render(<PipelineView facts={facts} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);

    expect(pillTextsOf('gates-build')).toEqual(['typecheck · cached', 'lint · partly cached', 'unit-tests']);

    await clickSettled(within(screen.getByRole('group', { name: 'Pipeline phases' })).getByRole('button', { name: /^Merge/ }));
    expect(pillTextsOf('gates-merge')).toEqual(['typecheck', 'unit-tests', 'browser-tests']);
  });

  test('a board that serves no cache marks marks no gate', () => {
    render(<PipelineView facts={pipelineBoardStateOf('A5')} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);

    expect(pillTextsOf('gates-build')).toEqual(['typecheck', 'lint', 'unit-tests']);
  });
});

describe('one modal dialog at a time', () => {
  function nextUpdate(): BoardStateDocument {
    const board = pipelineBoardStateOf('A6b');
    const setup = board.pipelineSetup ?? null;
    if (setup === null) throw new Error('the fixture A6b has no setup');
    return { ...board, pipelineSetup: { ...setup, record: { ...setup.record, setupId: 'S3' } } };
  }

  function dialogName(dialog: HTMLElement): string | null {
    return document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent ?? null;
  }

  function builderStep(): HTMLElement {
    const step = document.querySelector<HTMLElement>('[data-step-node-id="builder"]');
    if (step === null) throw new Error('no Builder step');
    return step;
  }

  test('an Apply sent in one update does not open again in the next update', async () => {
    const { show } = renderHost(pipelineBoardStateOf('A6b'), { tab: 'pipeline', item: null });
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline changes' })).getByRole('button', { name: 'Apply 4 changes' }));
    await clickSettled(within(screen.getByRole('dialog', { name: 'Apply 4 changes?' })).getByRole('button', { name: 'Apply 4 changes' }));
    show(appliedAt(3));
    show(nextUpdate());
    expect(screen.getByRole('region', { name: 'Phase 2: Build' }).getAttribute('data-stage')).toBe('editing');
    expect(screen.queryAllByRole('dialog')).toEqual([]);
    fireEvent.doubleClick(builderStep());
    expect(screen.getAllByRole('dialog').map(dialogName)).toEqual(['Builder']);
  });

  test('a step dialog closes the Apply dialog, and Apply closes the step dialog', async () => {
    renderHost(pipelineBoardStateOf('A6b'), { tab: 'pipeline', item: null });
    const footer = screen.getByRole('region', { name: 'Pipeline changes' });
    await clickSettled(within(footer).getByRole('button', { name: 'Apply 4 changes' }));
    fireEvent.doubleClick(builderStep());
    expect(screen.getAllByRole('dialog').map(dialogName)).toEqual(['Builder']);
    await clickSettled(within(footer).getByRole('button', { name: 'Apply 4 changes' }));
    expect(screen.getAllByRole('dialog').map(dialogName)).toEqual(['Apply 4 changes?']);
  });
});

describe('the toast after an Apply', () => {
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
    expect(document.querySelector('.design-system-toast')).toBeNull();
    show(pipelineBoardStateOf('A5'));
    expect(document.querySelector('.design-system-toast')?.textContent).toBe('Pipeline appliedBoard resumed · Version 2 is live.');
  });

  test('says nothing of the board when the Apply left it as it was, and leaves when its bar ran down', async () => {
    const { show } = await applyFirstPipeline(false);
    show(pipelineBoardStateOf('A5'));
    expect(document.querySelector('.design-system-toast')?.textContent).toBe('Pipeline appliedVersion 2 is live.');
    const timer = document.querySelector('.design-system-toast-timer');
    if (timer === null) throw new Error('no toast timer');
    act(() => {
      timer.dispatchEvent(new Event('animationend', { bubbles: true }));
    });
    expect(document.querySelector('.design-system-toast')).toBeNull();
  });

  test('Apply N changes never resumes the board: its toast names the new version only', async () => {
    const { show } = renderHost(pipelineBoardStateOf('A6b'), { tab: 'pipeline', item: null });
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline changes' })).getByRole('button', { name: 'Apply 4 changes' }));
    await clickSettled(within(screen.getByRole('dialog', { name: 'Apply 4 changes?' })).getByRole('button', { name: 'Apply 4 changes' }));
    show(appliedAt(2));
    expect(document.querySelector('.design-system-toast')).toBeNull();
    show(appliedAt(3));
    expect(document.querySelector('.design-system-toast')?.textContent).toBe('Pipeline appliedVersion 3 is live.');
  });

  test('a live board that no Apply of this view reached shows no toast', () => {
    const { show } = renderHost(pipelineBoardStateOf('A5'), { tab: 'pipeline', item: null });
    show(appliedAt(3));
    expect(document.querySelector('.design-system-toast')).toBeNull();
  });
});

describe('the profile log', () => {
  test('a gate dialog opened from a gates table follows the running profile through the view\'s follower and shows its lines', async () => {
    const followed: string[] = [];
    let deliver: (lines: readonly ProfileOutputLine[]) => void = () => undefined;
    const services = {
      ...pipelineViewServicesOf(),
      followProfileLog: (profileRunId: string, onLines: (lines: readonly ProfileOutputLine[]) => void) => {
        followed.push(profileRunId);
        deliver = onLines;
        return () => undefined;
      },
    };
    fakeControls().render(<PipelineView facts={pipelineBoardStateOf('profile-running')} route={{ tab: 'pipeline', item: 'setup/design' }} {...services} />);
    await clickSettled(within(screen.getByRole('group', { name: 'Pipeline phases' })).getByRole('button', { name: /^Merge/ }));
    fireEvent.doubleClick(screen.getByRole('group', { name: /^Open the browser-tests / }));
    expect(followed).toEqual(['P1']);
    act(() => deliver([{ lineNumber: 1, text: 'Running 12 tests' }]));
    const tail = within(screen.getByRole('dialog')).getByRole('list', { name: 'Profile output' });
    expect([...tail.children].map((line) => line.textContent)).toEqual(['Running 12 tests']);
  });
});

describe('a live monorepo pipeline', () => {
  function renderAt(item: string) {
    const controls = fakeControls();
    controls.render(<PipelineView facts={pipelineBoardStateOf('mono-live')} route={{ tab: 'pipeline', item }} {...pipelineViewServicesOf()} />);
    return controls;
  }

  function ticketsOnBuilder(): string {
    return document.querySelector('[data-step-node-id="builder"]')?.textContent ?? '';
  }

  test('an entity\'s level shows the rail, its breadcrumb and only its own tickets on its steps', () => {
    const { unmount } = render(<PipelineView facts={pipelineBoardStateOf('mono-live')} route={{ tab: 'pipeline', item: 'entity/web' }} {...pipelineViewServicesOf()} />);
    expect(screen.getByRole('navigation', { name: 'Pipeline levels' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Level' }).textContent).toContain('web');
    expect(screen.getByRole('heading', { name: 'web' })).toBeDefined();
    expect(ticketsOnBuilder()).toContain('21');
    expect(ticketsOnBuilder()).not.toContain('22');
    unmount();
    render(<PipelineView facts={pipelineBoardStateOf('mono-live')} route={{ tab: 'pipeline', item: 'entity/design-system' }} {...pipelineViewServicesOf()} />);
    expect(ticketsOnBuilder()).toContain('22');
    expect(ticketsOnBuilder()).not.toContain('21');
  });

  test('an entity\'s live gates head names its own profile under way', () => {
    renderAt('entity/web');
    const buildGates = screen.getByRole('region', { name: 'Build gates' });
    expect(within(buildGates).getByText('typecheck being profiled')).toBeDefined();
  });

  test('the activity lists every entity\'s work, each row naming its entity or the forge', () => {
    renderAt('entity/web');
    const rows = [...document.querySelectorAll('.design-system-activity-row')].map((row) => [
      row.querySelector('.design-system-activity-row-id')?.textContent,
      row.querySelector('.design-system-activity-row-step')?.textContent,
    ]);
    expect(rows.map(([idText]) => idText)).toEqual(['D3', '21', '22', '19', '23', 'Profile']);
    expect(rows.find(([idText]) => idText === '21')?.[1]).toStartWith('web · ');
    expect(rows.find(([idText]) => idText === '22')?.[1]).toStartWith('design-system · ');
    expect(rows.find(([idText]) => idText === 'D3')?.[1]).toStartWith('Forge · ');
    expect(rows.find(([idText]) => idText === '19')?.[1]).toStartWith('Forge · ');
    expect(rows.find(([idText]) => idText === '23')?.[1]).not.toMatch(/^(Forge|web|design-system) · /);
    expect(screen.getByText('Every entity · 2 jobs at a time')).toBeDefined();
  });

  test('the activity lists every entity\'s gate profile under way as a row naming its entity, at every level', () => {
    for (const item of ['entity/design-system', 'forge']) {
      const { unmount } = render(<PipelineView facts={pipelineBoardStateOf('mono-live')} route={{ tab: 'pipeline', item }} {...pipelineViewServicesOf()} />);
      const profileSteps = [...document.querySelectorAll('.design-system-activity-row')]
        .filter((row) => row.querySelector('.design-system-activity-row-id')?.textContent === 'Profile')
        .map((row) => row.querySelector('.design-system-activity-row-step')?.textContent);
      expect(profileSteps).toEqual(['web · profiling typecheck · Build phase']);
      unmount();
    }
  });

  test('Ask the pipeline agent at an entity carries the entity, and its tab names the level', async () => {
    const controls = renderAt('entity/web');
    expect(screen.getByRole('tab', { name: 'Pipeline agent · web' })).toBeDefined();
    await clickSettled(screen.getByRole('button', { name: 'Ask the pipeline agent about web' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-agent-advise', entity: 'web' }]);
  });

  test('the forge\'s level lists the merge train and the board\'s jobs in place of the phases', () => {
    renderAt('forge');
    expect(screen.getByRole('heading', { name: 'Forge' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Pipeline phases' })).toBeNull();
    const train = screen.getByRole('table', { name: 'Merge train' });
    expect(within(train).getByRole('link', { name: 'Open ticket 19' }).getAttribute('href')).toBe('#kanban/ticket/19');
    expect(within(train).getByText('Waiting for the Airlock')).toBeDefined();
    expect(screen.getByText('Board: 2 of 2 jobs running')).toBeDefined();
    expect(document.querySelector('[data-step-node-id="ticket-creation"]')?.textContent).toContain('D3');
  });

  test('each rail row counts its level\'s work: an entity\'s open tickets and crossings, the forge\'s jobs and merge train', () => {
    renderAt('entity/web');
    const rail = screen.getByRole('navigation', { name: 'Pipeline levels' });
    const rowNamed = (name: string): string => within(rail).getByRole('button', { name: new RegExp(`^${name},`) }).getAttribute('aria-label') ?? '';
    expect(rowNamed('Forge')).toContain('2 of 2 jobs · 1 merging, 1 waiting');
    expect(rowNamed('web')).toContain('2 tickets');
    expect(rowNamed('design-system')).toContain('1 ticket · 1 crossing');
    expect(rowNamed('root')).toContain('No tickets');
  });

  test('an entity\'s page shows the crossings in a package stage now, out of it and into it, and the forge\'s page none', () => {
    for (const item of ['entity/web', 'entity/design-system']) {
      const { unmount } = render(<PipelineView facts={pipelineBoardStateOf('mono-live')} route={{ tab: 'pipeline', item }} {...pipelineViewServicesOf()} />);
      const crossing = screen.getByRole('region', { name: 'Crossing now' });
      expect(within(crossing).getByRole('link', { name: 'Open ticket 22' }).getAttribute('href')).toBe('#kanban/ticket/22');
      expect(crossing.textContent).toContain('web→design-system· package build, with design-system’s constitution, builder and gates');
      unmount();
    }
    renderAt('forge');
    expect(screen.queryByRole('region', { name: 'Crossing now' })).toBeNull();
  });

  test('an activity row of a package stage names the crossing it runs', () => {
    renderAt('forge');
    const stepOf = (idText: string): string | null | undefined => [...document.querySelectorAll('.design-system-activity-row')]
      .find((row) => row.querySelector('.design-system-activity-row-id')?.textContent === idText)
      ?.querySelector('.design-system-activity-row-step')?.textContent;
    expect(stepOf('22')).toStartWith('design-system · ');
    expect(stepOf('22')).toEndWith(' · Package build of a crossing from web');
    expect(stepOf('21')).not.toContain('crossing');
  });

  test('the merge train names each ticket\'s entity', () => {
    renderAt('forge');
    const train = screen.getByRole('table', { name: 'Merge train' });
    const rows = within(train).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows.map((cells) => [cells[1], cells[2]])).toEqual([['19', 'web'], ['23', 'design-system']]);
  });

  test('each entity\'s jobs stand against its cap in jobs, with the crossings they serve and the tickets waiting for a slot', () => {
    renderAt('forge');
    const table = screen.getByRole('table', { name: 'Jobs by entity' });
    const rows = within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['web', '1 job', '1', 'At its cap24'],
      ['design-system', 'Board limit', '1 · crossing from web', 'None'],
      ['root', 'For a person', 'No jobs', 'None'],
    ]);
    expect(within(table).getByRole('link', { name: '24' }).getAttribute('href')).toBe('#kanban/ticket/24');
  });
});
