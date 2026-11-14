/**
 * A phase's gates table in a happy-dom document, over the designed fixtures. What matters: the head counts the phase's gates, and the
 * smallest pipeline's empty table says so beside "Add <phase> gate" and, in Build, "Add prepare step"; a press on a time chip sends
 * `gate-profile-start` for that gate in the table's phase, the only command a row sends by itself, and a measuring chip takes no press;
 * a double-click or Enter on a row asks for its Gate dialog (a prepare row: the prepare variant) and sends nothing; "Add prepare step"
 * shows in the Build phase only; a keyboard reorder sends the phase's new order and never lifts a gate above a prepare step; Delete on a
 * focused row sends the order without it, or removes a prepare step; on a live board the add buttons hide, the head names the tickets in
 * the phase's gates once, since the facts tie a ticket to the phase's gates and not to one gate, so no row names one, and a reorder sends
 * `pipeline-update-start` first.
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

import type { GatePhase }                                 from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { BoardStateDocument }                        from '../../../@types/BoardStateDocument.ts';
import { clickSettled, fakeControls }                     from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { usePipelineFlowEditSender }                      from '../flow/PipelineFlowEditSender.ts';
import { FlowActivityPanelModel }                         from '../live/FlowActivityPanelModel.ts';
import type { GatesOpenRequest }                          from './GatesAreaModel.ts';
import { GatesTable }                                     from './GatesTable.tsx';

afterEach(cleanup);

interface HarnessProps {
  readonly initial: BoardStateDocument;
  readonly phase:   GatePhase;
  readonly onFacts: (showFacts: (facts: BoardStateDocument) => void) => void;
  readonly opened:  GatesOpenRequest[];
}

/** One phase's table as the open phase holds it: its edit sender opens an update first on a live board. */
function GatesHarness({
  initial, phase, onFacts, opened
}: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  useEffect(() => onFacts(setFacts), [onFacts]);
  const flow = facts.pipelineFlow ?? null;
  const record = facts.pipelineSetup?.record ?? null;
  const live = flow?.toolbarStage === 'live';
  const editSender = usePipelineFlowEditSender(live || record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision });
  if (flow === null) return null;
  return (
    <GatesTable
      phase={phase}
      rows={flow.gateRows[phase]}
      profileRuns={facts.profileRuns ?? []}
      profileSetupId={live ? null : record?.setupId ?? null}
      reviewRuns={flow.nodes.some((node) => node.nodeKind === 'review')}
      nowTickets={live ? FlowActivityPanelModel.occupantChipsOf(flow, `gates-${phase}`) : null}
      selectedRowKey={null}
      editSender={editSender}
      onOpen={(request) => opened.push(request)}
    />
  );
}

function renderGates(name: PipelineFixtureName, phase: GatePhase = 'build') {
  const controls = fakeControls();
  const opened: GatesOpenRequest[] = [];
  const handle = { showFacts: (_facts: BoardStateDocument): void => undefined };
  controls.render(<GatesHarness initial={pipelineBoardStateOf(name)} phase={phase} onFacts={(showFacts) => { handle.showFacts = showFacts; }} opened={opened} />);
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
    expect(build.querySelector('.bridge-pipeline-gates-head')?.textContent).toContain('Build gates3What the builder must pass before review');
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
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build'
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
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 7, edits: [{ field: 'phase-order:build', value: ['typecheck', 'unit-tests', 'lint'] }]
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
    expect(controls.sent.map((command) => command['edits'])).toEqual([
      [{ field: 'phase-order:build', value: ['typecheck', 'unit-tests'] }],
      [{ field: 'prepare:install', value: null }],
    ]);
  });

  test('on a live board the add buttons hide, and a reorder opens the update first and sends its order once the record shows', async () => {
    const { controls, handle } = renderGates('A5');
    expect(screen.queryByRole('button', { name: 'Add build gate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add prepare step' })).toBeNull();
    moveByKeyboard('lint', ['ArrowDown']);
    await settle();
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
    await act(async () => {
      handle.showFacts(pipelineBoardStateOf('A6'));
      await Promise.resolve();
    });
    expect(controls.sent).toEqual([
      { kind: 'pipeline-update-start' },
      {
        kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'phase-order:build', value: ['typecheck', 'unit-tests', 'lint'] }]
      },
    ]);
  });

  test('on a live board the head names the tickets in the phase\'s gates once, and no row names one; an empty phase\'s head says Idle', () => {
    renderGates('A5');
    const build = screen.getByRole('region', { name: 'Build gates' });
    const head = build.querySelector<HTMLElement>('.bridge-pipeline-gates-head');
    if (head === null) throw new Error('the Build gates table has no head');
    expect(within(head).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([['12', '#kanban/ticket/12']]);
    expect(within(head).getByText('Now:')).toBeDefined();
    expect(build.querySelectorAll('.bridge-pipeline-gate-row a')).toHaveLength(0);
    cleanup();
    renderGates('A5', 'merge');
    const merge = screen.getByRole('region', { name: 'Merge gates' });
    expect(merge.querySelector('.bridge-pipeline-gates-head')?.textContent).toContain('Now:Idle');
  });

  test('on a live board the time chip profiles the applied gate, with no record', async () => {
    const { controls } = renderGates('A5');
    await clickSettled(within(rowOf('typecheck')).getByRole('button', { name: /not measured/ }));
    expect(controls.sent).toEqual([{
      kind: 'gate-profile-start', setupId: null, gateName: 'typecheck', phase: 'build'
    }]);
  });
});
