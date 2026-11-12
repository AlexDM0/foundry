/**
 * The gates area in a happy-dom document, over the designed fixtures. What matters: the tabs are real tabs with their gate counts, and
 * the smallest pipeline shows the empty state with its add buttons; a press on a stopwatch chip sends `gate-profile-start` for that gate
 * in the tab's phase, the only command a row sends by itself, and a measuring chip takes no press; a double-click or Enter on a row asks
 * for its Gate dialog (a prepare row: the prepare variant) and sends nothing; "Add prepare step" shows in the Build tab only; a keyboard
 * reorder sends the phase's new order and never lifts a gate above a prepare step; Delete on a focused row sends the order without it,
 * or removes a prepare step; on a live board the add buttons hide and a reorder sends `pipeline-update-start` first.
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
import { GatesArea }                                      from './GatesArea.tsx';
import type { GatesOpenRequest }                          from './GatesAreaModel.ts';

afterEach(cleanup);

interface HarnessProps {
  readonly initial: BoardStateDocument;
  readonly onFacts: (showFacts: (facts: BoardStateDocument) => void) => void;
  readonly opened:  GatesOpenRequest[];
}

function GatesHarness({ initial, onFacts, opened }: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  const [phase, setPhase] = useState<GatePhase>('build');
  useEffect(() => onFacts(setFacts), [onFacts]);
  const flow = facts.pipelineFlow ?? null;
  if (flow === null) return null;
  const record = facts.pipelineSetup?.record ?? null;
  return (
    <GatesArea
      gateRows={flow.gateRows}
      stage={flow.toolbarStage}
      editTarget={record === null ? null : { setupId: record.setupId, draftRevision: record.draftRevision }}
      profileRuns={facts.profileRuns ?? []}
      phase={phase}
      onSelectPhase={setPhase}
      onOpen={(request) => opened.push(request)}
    />
  );
}

function renderGates(name: PipelineFixtureName) {
  const controls = fakeControls();
  const opened: GatesOpenRequest[] = [];
  const handle = { showFacts: (_facts: BoardStateDocument): void => undefined };
  controls.render(<GatesHarness initial={pipelineBoardStateOf(name)} onFacts={(showFacts) => { handle.showFacts = showFacts; }} opened={opened} />);
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

describe('the tabs and the empty state', () => {
  test('the smallest pipeline has real tabs at 0 and the empty state with its add buttons', async () => {
    const { opened, controls } = renderGates('A7');
    expect(screen.getAllByRole('tab').map((tab) => [tab.getAttribute('aria-label'), tab.getAttribute('aria-selected')])).toEqual([
      ['Build, 0 gates', 'true'],
      ['Review, 0 gates', 'false'],
      ['Merge, 0 gates', 'false'],
    ]);
    const panel = screen.getByRole('tabpanel', { name: 'Build gates' });
    expect(within(panel).getByText('No gates: no command judges a ticket before it lands.')).toBeDefined();
    await clickSettled(within(panel).getByRole('button', { name: 'Add build gate' }));
    await clickSettled(within(panel).getByRole('button', { name: 'Add prepare step' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'build' }, { kind: 'new-prepare-step' }]);
    expect(controls.sent).toEqual([]);
  });

  test('a tab shows its phase\'s rows and meaning; Add prepare step is the Build tab\'s alone', async () => {
    const { opened } = renderGates('A2');
    expect(screen.getByRole('tab', { name: 'Build, 3 gates' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add prepare step' })).toBeDefined();
    await clickSettled(screen.getByRole('tab', { name: 'Merge, 3 gates' }));
    expect(screen.getByText('run on the latest main merged in, before the fast-forward')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add prepare step' })).toBeNull();
    await clickSettled(screen.getByRole('button', { name: 'Add merge gate' }));
    expect(opened).toEqual([{ kind: 'new-gate', phase: 'merge' }]);
    expect(rowOf('browser-tests').textContent).toContain('on · registry.example.com');
  });
});

describe('the rows', () => {
  test('a press on the stopwatch chip sends gate-profile-start for that gate in the tab\'s phase', async () => {
    const { controls } = renderGates('A2');
    await clickSettled(within(rowOf('lint')).getByRole('button', { name: /not profiled/ }));
    expect(controls.sent).toEqual([{
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build'
    }]);
  });

  test('a measuring chip turns and takes no press', async () => {
    renderGates('profile-running');
    await clickSettled(screen.getByRole('tab', { name: /^Merge/ }));
    const chip = within(rowOf('browser-tests')).getByText('measuring');
    expect(chip.closest('.bridge-tag')?.hasAttribute('data-busy')).toBe(true);
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

  test('a double-click on the stopwatch chip opens no dialog', () => {
    const { opened } = renderGates('A2');
    fireEvent.doubleClick(within(rowOf('lint')).getByRole('button', { name: /not profiled/ }));
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

  test('on a live board the stopwatch chip profiles the applied gate, with no record', async () => {
    const { controls } = renderGates('A5');
    await clickSettled(within(rowOf('typecheck')).getByRole('button', { name: /not profiled/ }));
    expect(controls.sent).toEqual([{
      kind: 'gate-profile-start', setupId: null, gateName: 'typecheck', phase: 'build'
    }]);
  });
});
