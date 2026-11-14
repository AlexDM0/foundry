/**
 * Apply on a running board (A6bApplyChanges) in a happy-dom document, opened from the editing flow's footer against fake controls. What
 * matters: one row per change, changed, new or removed, each naming where it is and its kind, a removed one struck through, and a changed
 * constitution as committed to main on Apply; the title counts the changes and the version line names the applied revision and the next;
 * the in-flight note lists the tickets in flight; Apply N changes sends `pipeline-apply` that never resumes the board; a
 * `pipeline-moved` or `constitution-moved` refusal shows verbatim with nothing else offered; Back closes it; with a constitution change,
 * the committing, held and refused states show as in the first Apply, with Cancel apply.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ApplyStateFacts }                         from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { BoardStateDocument }                      from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                             from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                   from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                 from '../PipelineView.tsx';

const EDITING_ROUTE: BridgeRoute = { tab: 'pipeline', item: null };

afterEach(cleanup);

function withApplyState(applyState: ApplyStateFacts): BoardStateDocument {
  const board = pipelineBoardStateOf('A6b');
  const setup = board.pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture A6b has no setup');
  return { ...board, pipelineSetup: { ...setup, applyState } };
}

function pendingApply(changes: Partial<ApplyStateFacts> & Pick<ApplyStateFacts, 'state'>): ApplyStateFacts {
  return {
    draftRevision: 7, resumesBoard: false, commitJobId: 'J9', reason: null, blockingFiles: [], ticketIdHoldingMain: null, ...changes,
  };
}

function renderEditing(board: BoardStateDocument = pipelineBoardStateOf('A6b')) {
  const controls = fakeControls();
  controls.render(<PipelineView facts={board} route={EDITING_ROUTE} {...pipelineViewServicesOf()} />);
  return controls;
}

function applyChangesDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Apply 4 changes?' });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  return within(container).getByRole<HTMLButtonElement>('button', { name });
}

async function openApplyChanges() {
  const controls = renderEditing();
  await clickSettled(button(screen.getByRole('region', { name: 'Pipeline changes' }), 'Apply 4 changes'));
  return controls;
}

function rows(): HTMLElement[] {
  return [...applyChangesDialog().querySelectorAll<HTMLElement>('.design-system-change-row')];
}

describe('the rows', () => {
  test('one row per change, each naming where it is and its kind, a changed constitution as committed to main on Apply', async () => {
    await openApplyChanges();
    expect(rows().map((row) => [row.getAttribute('data-change'), row.getAttribute('data-density'), row.textContent])).toEqual([
      ['changed', 'row', 'Review agent step · changed'],
      ['new', 'row', 'browser-tests merge gate · new'],
      ['removed', 'row', 'lint build and review gate · removed'],
      ['changed', 'row', 'Constitution CONSTITUTION.md · committed to main on Apply'],
    ]);
  });

  test('the title counts the changes, and the version line names the applied version and the next', async () => {
    await openApplyChanges();
    expect(within(applyChangesDialog()).getByText('Version 2 becomes version 3. Everything else stays as it is.')).toBeDefined();
  });

  test('the in-flight note lists the tickets in flight', async () => {
    await openApplyChanges();
    expect(within(applyChangesDialog()).getByText('2 tickets are in flight.')).toBeDefined();
    const tickets = within(applyChangesDialog()).getByRole('list', { name: 'Tickets in flight' });
    expect(within(tickets).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['14', '15']);
  });
});

describe('Apply N changes', () => {
  test('sends pipeline-apply that never resumes the board', async () => {
    const controls = await openApplyChanges();
    await clickSettled(button(applyChangesDialog(), 'Apply 4 changes'));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-apply', setupId: 'S2', draftRevision: 7, resumesBoard: false,
    }]);
  });

  test('a pipeline-moved or constitution-moved refusal shows verbatim and offers nothing else', async () => {
    const controls = await openApplyChanges();
    const buttonNamesBefore = within(applyChangesDialog()).getAllByRole('button').map((element) => element.textContent);
    for (const refusal of [
      'pipeline.json changed since update S2 started from it: discard the update and start again. Nothing was written.',
      'CONSTITUTION.md changed on main since update S2 started from it: discard the update and start again. Nothing was written.',
    ]) {
      controls.answerNextWith({ verdict: 'refused', refusal });
      await clickSettled(button(applyChangesDialog(), 'Apply 4 changes'));
      expect(within(applyChangesDialog()).getByText(refusal)).toBeDefined();
      expect(within(applyChangesDialog()).getAllByRole('button').map((element) => element.textContent)).toEqual(buttonNamesBefore);
    }
  });

  test('Back closes the dialog and sends nothing', async () => {
    const controls = await openApplyChanges();
    await clickSettled(button(applyChangesDialog(), 'Back'));
    expect(screen.queryByRole('dialog', { name: 'Apply 4 changes?' })).toBeNull();
    expect(controls.sent).toEqual([]);
  });
});

describe('with a constitution change, a pending Apply', () => {
  test('while committing, shows the work under way and Cancel apply sends pipeline-apply-cancel', async () => {
    const controls = renderEditing(withApplyState(pendingApply({ state: 'committing' })));
    expect(within(applyChangesDialog()).getByRole('progressbar', { name: 'Committing CONSTITUTION.md to main' })).toBeDefined();
    expect(within(applyChangesDialog()).queryByRole('button', { name: 'Back' })).toBeNull();
    expect(within(applyChangesDialog()).queryByRole('button', { name: 'Apply 4 changes' })).toBeNull();
    await clickSettled(button(applyChangesDialog(), 'Cancel apply'));
    expect(controls.sent).toEqual([{ kind: 'pipeline-apply-cancel', setupId: 'S2' }]);
  });

  test('when held, shows the reason and the blocking files', () => {
    renderEditing(withApplyState(pendingApply({
      state: 'held', commitJobId: null, reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'],
    })));
    expect(within(applyChangesDialog()).getByText('Main has uncommitted changes to CONSTITUTION.md.')).toBeDefined();
    expect(button(applyChangesDialog(), 'Cancel apply')).toBeDefined();
  });

  test('when refused for signing, offers the text of CONSTITUTION.md and Apply again', async () => {
    const controls = renderEditing(withApplyState(pendingApply({ state: 'refused', commitJobId: null, reason: 'constitution-commit-unsigned' })));
    expect(within(applyChangesDialog()).getByText('Git could not sign the commit, and nothing commits unsigned.')).toBeDefined();
    expect(button(applyChangesDialog(), 'View CONSTITUTION.md')).toBeDefined();
    await clickSettled(button(applyChangesDialog(), 'Apply 4 changes'));
    expect(controls.sent.at(-1)).toEqual({
      kind: 'pipeline-apply', setupId: 'S2', draftRevision: 7, resumesBoard: false,
    });
  });
});
