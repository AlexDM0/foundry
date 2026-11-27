/**
 * A phase's gates table in a happy-dom document, over the pipeline fixtures: the head and add buttons, the time chip's profile command,
 * a row's Gate dialog, keyboard reorder and Delete, the live board's head and held edits, and each row's newest served run time.
 */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useEffect, useState } from 'react';

import type { BoardDocument }                                                from '../../../../@types/board/BoardDocument.ts';
import type { BoardStepRunTimeDocument }                                     from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase }                                               from '../../../../@types/board/BoardVocabulary.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                  from '../../../testing/FakeControls.ts';
import { onBoard }                                                           from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, type PipelineFixtureName, withPipelineFacts } from '../../../testing/PipelineFixture.ts';
import { usePipelineFlowEditSender }                                         from '../flow/PipelineFlowEditSender.ts';
import { FlowActivityPanelModel }                                            from '../live/FlowActivityPanelModel.ts';
import type { GatesOpenRequest }                                             from './GatesAreaModel.ts';
import { GatesTable }                                                        from './GatesTable.tsx';

afterEach(cleanup);

interface HarnessProps {
  readonly initial: BoardDocument;
  readonly phase:   BoardGatePhase;
  readonly onFacts: (showFacts: (facts: BoardDocument) => void) => void;
  readonly opened:  GatesOpenRequest[];
}

/** One phase's table as the open phase holds it: its edit sender opens an update first on a live board. */
function GatesHarness({
  initial, phase, onFacts, opened
}: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  useEffect(() => onFacts(setFacts), [onFacts]);
  const flow = facts.pipeline.flow ?? null;
  const record = facts.pipeline.setup?.record ?? null;
  const live = flow?.toolbarStage === 'live';
  const editSender = usePipelineFlowEditSender(live || record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision });
  if (flow === null) return null;
  return (
    <GatesTable
      phase={phase}
      rows={flow.gateRows[phase]}
      profileRuns={facts.pipeline.profileRuns}
      stepRunTimes={facts.pipeline.stepRunTimes}
      profileSetupId={live ? null : record?.setupId ?? null}
      reviewRuns={flow.nodes.some((node) => node.nodeKind === 'review')}
      nowTickets={live ? FlowActivityPanelModel.occupantChipsOf(flow, `gates-${phase}`) : null}
      selectedRowKey={null}
      editSender={editSender}
      onOpen={(request) => opened.push(request)}
    />
  );
}

function renderGates(name: PipelineFixtureName, phase: BoardGatePhase = 'build') {
  return renderGatesOn(pipelineBoardStateOf(name), phase);
}

function renderGatesOn(board: BoardDocument, phase: BoardGatePhase) {
  const controls = fakeControls();
  const opened: GatesOpenRequest[] = [];
  const handle = { showFacts: (_facts: BoardDocument): void => undefined };
  controls.render(onBoard(<GatesHarness initial={board} phase={phase} onFacts={(showFacts) => { handle.showFacts = showFacts; }} opened={opened} />));
  return { controls, opened, handle };
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('group', { name: new RegExp(`^Open the ${name} `) });
}

function gripOf(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^Move ${name},`) });
}

function moveByKeyboard(name: string, keys: readonly string[]): void {
  const grip = gripOf(name);
  grip.focus();
  fireEvent.keyDown(grip, { key: ' ' });
  keys.forEach((key) => fireEvent.keyDown(gripOf(name), { key }));
  fireEvent.keyDown(gripOf(name), { key: ' ' });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** A line's run as the forge serves it, of the forge's own pipeline unless an entity is named. */
function stepRunTime(changes: Partial<BoardStepRunTimeDocument> & Pick<BoardStepRunTimeDocument, 'stepKind' | 'stepName' | 'phase' | 'runMilliseconds'>): BoardStepRunTimeDocument {
  return {
    entity: null, ending: 'passed', at: '2026-11-12T09:00:00', ...changes,
  };
}

const STEP_RUN_TIMES: readonly BoardStepRunTimeDocument[] = [
  stepRunTime({
    stepKind: 'prepare', stepName: 'install', phase: null, runMilliseconds: 41_000, at: '2026-11-12T09:10:00'
  }),
  stepRunTime({
    stepKind: 'prepare', stepName: 'install', phase: 'build', runMilliseconds: 3_000, at: '2026-11-12T09:05:00'
  }),
  stepRunTime({
    stepKind: 'gate', stepName: 'typecheck', phase: 'build', runMilliseconds: 12_400
  }),
  stepRunTime({
    stepKind: 'gate', stepName: 'lint', phase: 'build', runMilliseconds: 4_000, ending: 'failed'
  }),
  stepRunTime({
    stepKind: 'gate', stepName: 'unit-tests', phase: 'build', runMilliseconds: 900_000, ending: 'time-bound'
  }),
  stepRunTime({
    stepKind: 'gate', stepName: 'unit-tests', phase: 'merge', runMilliseconds: 5_000
  }),
  stepRunTime({
    entity: 'web', stepKind: 'gate', stepName: 'typecheck', phase: 'merge', runMilliseconds: 7_000
  }),
];

function lastRunOf(name: string): HTMLElement | null {
  return rowOf(name).querySelector<HTMLElement>('.board-pipeline-gate-run-time');
}

describe('the last run of each line', () => {
  test('each prepare and gate row shows its newest served run time in the phase in view, the failure tone and the bound\'s mark', () => {
    renderGatesOn(withPipelineFacts(pipelineBoardStateOf('A2'), { stepRunTimes: STEP_RUN_TIMES }), 'build');
    expect(['install', 'typecheck', 'lint', 'unit-tests'].map((name) => [lastRunOf(name)?.getAttribute('aria-label'), lastRunOf(name)?.getAttribute('data-ending')]))
      .toEqual([
        ['Last run 41 s, passed', 'passed'],
        ['Last run 12 s, passed', 'passed'],
        ['Last run 4 s, failed', 'failed'],
        ['Last run 15 m 0 s, stopped at its time bound', 'time-bound'],
      ]);
    expect(lastRunOf('unit-tests')?.textContent).toBe('15 m 0 sbound');
    expect(lastRunOf('lint')?.textContent).toBe('4 s');
  });

  test('another phase shows that phase\'s runs, and a line with no recorded run there, or only another entity\'s, shows no time', () => {
    renderGatesOn(withPipelineFacts(pipelineBoardStateOf('A2'), { stepRunTimes: STEP_RUN_TIMES }), 'merge');
    expect(lastRunOf('unit-tests')?.getAttribute('aria-label')).toBe('Last run 5 s, passed');
    expect(lastRunOf('install')?.getAttribute('aria-label')).toBe('Last run 41 s, passed');
    expect(lastRunOf('typecheck')).toBeNull();
    expect(lastRunOf('browser-tests')).toBeNull();
  });
});

describe('the head and the empty table', () => {
  test('the smallest pipeline\'s empty table says so beside its add buttons', async () => {
    const { opened, controls } = renderGates('A7');
    const table = screen.getByRole('region', { name: 'Build gates' });
    expect(within(table).getByText('No build gates. No command checks a ticket after its build.')).toBeDefined();
    expect(within(table).queryAllByRole('group')).toEqual([]);
    await clickSettled(within(table).getByRole('button', { name: 'Add build gate' }));
    await clickSettled(within(table).getByRole('button', { name: 'Add prepare step' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'build' }, { kind: 'new-prepare-step' }]);
    expect(controls.sent).toEqual([]);
  });

  test('a table counts its gates and says its line; Add prepare step is the Build phase\'s alone', async () => {
    renderGates('A2');
    const build = screen.getByRole('region', { name: 'Build gates' });
    expect(build.querySelector('.board-pipeline-gates-head')?.textContent).toContain('Build gates3What the builder must pass before review');
    expect(within(build).getByRole('button', { name: 'Add prepare step' })).toBeDefined();
    cleanup();
    const { opened } = renderGates('A2', 'merge');
    expect(screen.getByText('Run on the latest main merged in, before the fast-forward')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add prepare step' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Add merge gate' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'merge' }]);
    expect(rowOf('browser-tests').textContent).toContain('on · registry.example.com');
  });
});

describe('the rows', () => {
  test('a press on the time chip sends gate-profile-start for that gate in the table\'s phase', async () => {
    const { controls } = renderGates('A2');
    await clickSettled(within(rowOf('lint')).getByRole('button', { name: /not measured/ }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build', entity: null
    }]);
  });

  test('a measuring chip is busy and takes no press', () => {
    renderGates('profile-running', 'merge');
    const chip = within(rowOf('browser-tests')).getByText('measuring');
    expect([chip.hasAttribute('data-busy'), chip.getAttribute('data-tone')]).toEqual([true, 'waiting']);
    expect(chip.closest('button')).toBeNull();
  });

  test('a double-click or Enter asks for the Gate dialog, a prepare row its prepare variant, and sends nothing', () => {
    const { opened, controls } = renderGates('A2');
    fireEvent.doubleClick(rowOf('lint'));
    fireEvent.keyDown(rowOf('typecheck'), { key: 'Enter' });
    fireEvent.doubleClick(rowOf('install'));
    expect(opened).toEqual([
      { kind: 'gate', gateName: 'lint', phase: 'build' },
      { kind: 'gate', gateName: 'typecheck', phase: 'build' },
      { kind: 'prepare-step', name: 'install' },
    ]);
    expect(rowOf('lint').getAttribute('aria-haspopup')).toBe('dialog');
    expect(controls.sent).toEqual([]);
  });

  test('a double-click on the time chip opens no dialog', () => {
    const { opened } = renderGates('A2');
    fireEvent.doubleClick(within(rowOf('lint')).getByRole('button', { name: /not measured/ }));
    expect(opened).toEqual([]);
  });
});

describe('reorder and Delete', () => {
  test('a keyboard reorder of a gate sends the phase\'s new order', async () => {
    const { controls } = renderGates('A2');
    moveByKeyboard('unit-tests', ['ArrowUp']);
    await settle();
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 7,
      edits:         [{ target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests', 'lint'] }],
      isACopy:       false,
    }]);
  });

  test('a gate cannot move above a prepare step', async () => {
    const { controls } = renderGates('A2');
    moveByKeyboard('typecheck', ['ArrowUp', 'ArrowUp']);
    await settle();
    expect(controls.sent).toEqual([]);
    expect(screen.getAllByRole('listitem').map((item) => within(item).getByRole('group').getAttribute('aria-label'))[0]).toBe('Open the install prepare step');
  });

  test('Delete on a focused gate row sends the phase order without it, and on a prepare row removes the step', async () => {
    const { controls } = renderGates('A2');
    fireEvent.keyDown(rowOf('lint'), { key: 'Delete' });
    await settle();
    fireEvent.keyDown(rowOf('install'), { key: 'Delete' });
    await settle();
    expect(controls.sent.map((command) => (command.kind === 'pipeline-draft-edit' ? command.edits : null))).toEqual([
      [{ target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests'] }],
      [{ target: 'prepare', name: 'install', value: null }],
    ]);
  });

  test('a second Delete while the first edit is on its way is not taken, so its order built on the old rows never undoes the first', async () => {
    const { controls, handle } = renderGates('A2');
    controls.holdCommands();
    fireEvent.keyDown(rowOf('lint'), { key: 'Delete' });
    await settle();
    const facts = pipelineBoardStateOf('A2');
    const { setup } = facts.pipeline;
    if (setup === null || setup === undefined) throw new Error('the A2 fixture has no setup record');
    await act(async () => {
      handle.showFacts(withPipelineFacts(facts, { setup: { ...setup, record: { ...setup.record, draftRevision: 8 } } }));
      await Promise.resolve();
    });
    fireEvent.keyDown(rowOf('typecheck'), { key: 'Delete' });
    await settle();
    await controls.releaseCommands();
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 7,
      edits:         [{ target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests'] }],
      isACopy:       false,
    }]);
  });

  test('on a live board a second gesture before the opened record shows is not taken, so the first gesture\'s edits still go', async () => {
    const { controls, handle } = renderGates('A5');
    moveByKeyboard('lint', ['ArrowDown']);
    await settle();
    moveByKeyboard('typecheck', ['ArrowDown']);
    await settle();
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([
      { ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null },
      {
        ...SENT_COMMAND_VERSION,
        kind:          'pipeline-draft-edit',
        setupId:       'S2',
        draftRevision: 7,
        edits:         [{ target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests', 'lint'] }],
        isACopy:       false,
      },
    ]);
  });

  test('on a live board the add buttons hide, and a reorder opens the update first and sends its order once the record shows', async () => {
    const { controls, handle } = renderGates('A5');
    expect(screen.queryByRole('button', { name: 'Add build gate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add prepare step' })).toBeNull();
    moveByKeyboard('lint', ['ArrowDown']);
    await settle();
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([
      { ...SENT_COMMAND_VERSION, kind: 'pipeline-update-start', entity: null },
      {
        ...SENT_COMMAND_VERSION,
        kind:          'pipeline-draft-edit',
        setupId:       'S2',
        draftRevision: 7,
        edits:         [{ target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests', 'lint'] }],
        isACopy:       false,
      },
    ]);
  });

  test('on a live board the head names the tickets in the phase\'s gates once, and no row names one; an empty phase\'s head says Idle', () => {
    renderGates('A5');
    const build = screen.getByRole('region', { name: 'Build gates' });
    const head = build.querySelector<HTMLElement>('.board-pipeline-gates-head');
    if (head === null) throw new Error('the Build gates table has no head');
    expect(within(head).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['12', '#forge/example-tracker/tickets/ticket/12']]);
    expect(within(head).getByText('Now:')).toBeDefined();
    expect(build.querySelectorAll('.board-pipeline-gate-row a')).toHaveLength(0);
    cleanup();
    renderGates('A5', 'merge');
    const merge = screen.getByRole('region', { name: 'Merge gates' });
    expect(merge.querySelector('.board-pipeline-gates-head')?.textContent).toContain('Now:Idle');
  });

  test('on a live board the time chip profiles the applied gate, with no record', async () => {
    const { controls } = renderGates('A5');
    await clickSettled(within(rowOf('typecheck')).getByRole('button', { name: /not measured/ }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'gate-profile-start', setupId: null, gateName: 'typecheck', phase: 'build', entity: null
    }]);
  });
});
