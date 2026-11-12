/**
 * The gate dialog (A2bGateModal) in a happy-dom document, opened through the dialog host. What matters: Save is disabled with no phase
 * ticked; Profile again sends the start command and the box shows profiling once the facts say the run is running; Stop sends the stop
 * command and the stopped run reads "Stopped · no result"; the log lines come only from the profile log the box follows, never from the
 * board facts; Remove gate sends `null`; the prepare variant has no phases and no fix command and removes the step; a new gate from a +
 * ticks its phase and asks for a name; and on a live board a Save opens the update first.
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

import type { BoardStateDocument }                        from '../../../@types/BoardStateDocument.ts';
import type { ProfileOutputLine }                         from '../../../api/ProfileStreamClient.ts';
import { clickSettled, fakeControls }                     from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                           from '../flow/PipelineFlow.tsx';
import type { GatesOpenRequest }                          from '../gates/GatesAreaModel.ts';
import { PipelineDialogs }                                from './PipelineDialogs.tsx';
import type { ProfileLogFollower }                        from './ProfileBox.tsx';

afterEach(cleanup);

type DialogRequest = FlowOpenRequest | GatesOpenRequest;

const TYPECHECK_REQUEST: DialogRequest = { kind: 'gate', gateName: 'typecheck', phase: 'build' };

const BROWSER_TESTS_REQUEST: DialogRequest = { kind: 'gate', gateName: 'browser-tests', phase: 'merge' };

interface HarnessProps {
  readonly initial:    BoardStateDocument;
  readonly request:    DialogRequest;
  readonly onFacts:    (showFacts: (facts: BoardStateDocument) => void) => void;
  readonly followLog?: ProfileLogFollower;
}

function DialogHarness({
  initial, request, onFacts, followLog
}: HarnessProps) {
  const [facts, setFacts] = useState(initial);
  const [open, setOpen] = useState<DialogRequest | null>(request);
  useEffect(() => onFacts(setFacts), [onFacts]);
  return <PipelineDialogs facts={facts} request={open} onClose={() => setOpen(null)} {...(followLog === undefined ? {} : { followLog })} />;
}

function renderDialog(name: PipelineFixtureName, request: DialogRequest, followLog?: ProfileLogFollower) {
  const controls = fakeControls();
  const handle = { showFacts: (_facts: BoardStateDocument): void => undefined };
  controls.render(
    <DialogHarness
      initial={pipelineBoardStateOf(name)}
      request={request}
      onFacts={(showFacts) => { handle.showFacts = showFacts; }}
      {...(followLog === undefined ? {} : { followLog })}
    />,
  );
  const showFacts = (next: PipelineFixtureName): void => act(() => handle.showFacts(pipelineBoardStateOf(next)));
  return { controls, showFacts };
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog');
}

function button(name: string): HTMLButtonElement {
  return within(dialog()).getByRole('button', { name }) as HTMLButtonElement;
}

/** A follower a spec feeds by hand, recording which runs were followed. */
function fakeProfileLog() {
  const followed: string[] = [];
  let deliver: (lines: readonly ProfileOutputLine[]) => void = () => undefined;
  const follow: ProfileLogFollower = (profileRunId, onLines) => {
    followed.push(profileRunId);
    deliver = onLines;
    return () => undefined;
  };
  return { follow, followed, feed: (lines: readonly ProfileOutputLine[]) => act(() => deliver(lines)) };
}

describe('the form', () => {
  test('Save gate is disabled with no phase ticked', () => {
    renderDialog('A2', TYPECHECK_REQUEST);
    expect(button('Save gate').disabled).toBe(false);
    within(dialog()).getAllByRole('checkbox').forEach((checkbox) => {
      if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    });
    expect(button('Save gate').disabled).toBe(true);
  });

  test('the kicker names the phase, the place and the mark; the command is focused', () => {
    renderDialog('A2', TYPECHECK_REQUEST);
    expect(dialog().querySelector('.bridge-dialog-kicker')?.textContent).toBe('Build gate 1 · proposed');
    expect(document.activeElement).toBe(within(dialog()).getByRole('textbox', { name: 'Command' }));
  });

  test('Save sends the definition and the order of a phase whose box changed', async () => {
    const { controls } = renderDialog('A2', TYPECHECK_REQUEST);
    fireEvent.click(within(dialog()).getByRole('checkbox', { name: 'Review' }));
    await clickSettled(button('Save gate'));
    expect(controls.sent[0]).toMatchObject({
      kind:  'pipeline-draft-edit',
      edits: [{ field: 'gate:typecheck', value: { name: 'typecheck', run: 'bun run typecheck' } }, { field: 'phase-order:review', value: ['lint', 'unit-tests'] }],
    });
  });

  test('Remove gate sends value null', async () => {
    const { controls } = renderDialog('A2', TYPECHECK_REQUEST);
    await clickSettled(button('Remove gate'));
    expect(controls.sent[0]).toMatchObject({ edits: [{ field: 'gate:typecheck', value: null }] });
  });

  test('the prepare variant has no phases and no fix command, and removes the step', async () => {
    const { controls } = renderDialog('A2', { kind: 'prepare-step', name: 'install' });
    expect(dialog().querySelector('.bridge-dialog-kicker')?.textContent).toBe('Prepare step · proposed');
    expect(within(dialog()).queryByRole('group', { name: 'Phases' })).toBeNull();
    expect(within(dialog()).queryByRole('textbox', { name: 'Fix command, for the builder' })).toBeNull();
    expect(within(dialog()).queryByRole('region', { name: 'Profile' })).toBeNull();
    await clickSettled(button('Remove prepare step'));
    expect(controls.sent[0]).toMatchObject({ edits: [{ field: 'prepare:install', value: null }] });
  });

  test('a new gate from a + ticks its phase and asks for a name before it can be saved', async () => {
    const { controls } = renderDialog('A7', { kind: 'new-gate', phase: 'build' });
    expect(within(dialog()).getByRole('heading', { name: 'Add build gate' })).toBeDefined();
    expect((within(dialog()).getByRole('checkbox', { name: 'Build' }) as HTMLInputElement).checked).toBe(true);
    expect(button('Save gate').disabled).toBe(true);
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Name' }), { target: { value: 'typecheck' } });
    fireEvent.change(within(dialog()).getByRole('textbox', { name: 'Command' }), { target: { value: 'bun run typecheck' } });
    await clickSettled(button('Save gate'));
    expect(controls.sent[0]).toMatchObject({
      setupId: 'S2',
      edits:   [{ field: 'gate:typecheck', value: { name: 'typecheck', run: 'bun run typecheck' } }, { field: 'phase-order:build', value: ['typecheck'] }],
    });
  });

  test('on a live board a Save opens the update first', async () => {
    const { controls } = renderDialog('A5', TYPECHECK_REQUEST);
    await clickSettled(button('Save gate'));
    expect(controls.sent).toEqual([{ kind: 'pipeline-update-start' }]);
  });
});

describe('the profile box', () => {
  test('Profile again sends the start command for the dialog\'s phase; the box shows profiling once the facts say running', async () => {
    const { controls, showFacts } = renderDialog('profile-passed', BROWSER_TESTS_REQUEST);
    expect(within(dialog()).getByText('Passed in 94 s')).toBeDefined();
    await clickSettled(button('Profile again'));
    expect(controls.sent).toEqual([{
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'browser-tests', phase: 'merge',
    }]);
    expect(dialog().querySelector('.bridge-pipeline-profile')?.getAttribute('data-state')).toBe('result');
    showFacts('profile-running');
    expect(dialog().querySelector('.bridge-pipeline-profile')?.getAttribute('data-state')).toBe('profiling');
    expect(within(dialog()).getByText('Profiling · preparing a fresh worktree, then running the command')).toBeDefined();
  });

  test('Stop sends the stop command, and the stopped run reads "Stopped · no result"', async () => {
    const { controls, showFacts } = renderDialog('profile-running', BROWSER_TESTS_REQUEST);
    await clickSettled(button('Stop'));
    expect(controls.sent).toEqual([{ kind: 'gate-profile-stop', profileRunId: 'P1' }]);
    showFacts('profile-stopped');
    expect(within(dialog()).getByText('Stopped · no result')).toBeDefined();
  });

  test('the log lines come from the profile stream the box follows, never from the board facts', () => {
    const profileLog = fakeProfileLog();
    renderDialog('profile-running', BROWSER_TESTS_REQUEST, profileLog.follow);
    expect(profileLog.followed).toEqual(['P1']);
    const tail = within(dialog()).getByRole('list', { name: 'Profile output' });
    expect(tail.children).toHaveLength(0);
    profileLog.feed([{ lineNumber: 1, text: 'Running 12 tests' }]);
    profileLog.feed([{ lineNumber: 2, text: '12 passed' }]);
    expect([...tail.children].map((line) => line.textContent)).toEqual(['Running 12 tests', '12 passed']);
  });

  test('a run that has not been started offers Profile, and a passed run follows no log', () => {
    const profileLog = fakeProfileLog();
    renderDialog('A2', TYPECHECK_REQUEST, profileLog.follow);
    expect(button('Profile')).toBeDefined();
    expect(within(dialog()).queryByRole('list', { name: 'Profile output' })).toBeNull();
    expect(profileLog.followed).toEqual([]);
  });
});
