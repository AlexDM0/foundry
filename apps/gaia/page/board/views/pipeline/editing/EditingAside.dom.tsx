/**
 * Editing an applied pipeline (A6Editing) in a happy-dom document, through the Pipeline view against fake controls. What matters: the
 * footer counts exactly the change list beside the version the board runs on, and Apply N changes opens the change list's dialog; gate
 * pills and gate rows carry their change (changed, removed and new), while a removed agent step is not drawn, its add card comes back and
 * the Changes tab lists it; switching Human code review sends its edit, and the facts that come back draw its steps in the Review phase; the
 * in-flight note lists the tickets in flight as chips; the Human code review card says what a reviewed ticket then does; the Changes tab
 * comes first and the Pipeline agent tab second; a new gate's Benchmark sends `gate-profile-start`, Ask the pipeline agent to check sends
 * `pipeline-check` and turns to the agent, and Discard sends `pipeline-draft-discard` and returns to `#pipeline`.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                                                     from '../../../../@types/board/BoardDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                       from '../../../testing/FakeControls.ts';
import { onBoard }                                                                from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderEditing(board: BoardDocument | PipelineFixtureName = 'A6-drawn-changes') {
  const controls = fakeControls();
  const facts = typeof board === 'string' ? pipelineBoardStateOf(board) : board;
  controls.render(onBoard(<PipelineView facts={facts} route={{ tab: 'pipeline', item: 'edit' }} {...pipelineViewServicesOf()} />));
  return controls;
}

function stepOf(nodeId: string): HTMLElement {
  const step = document.querySelector<HTMLElement>(`[data-step-node-id="${nodeId}"]`);
  if (step === null) throw new Error(`no step ${nodeId}`);
  return step;
}

async function openPhase(name: RegExp): Promise<void> {
  await clickSettled(within(screen.getByRole('group', { name: 'Pipeline phases' })).getByRole('button', { name }));
}

function stepIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-step-node-id]')].map((step) => step.dataset['stepNodeId'] ?? '');
}

function chipChangeOf(nodeId: string, gateName: string): string | null {
  return within(stepOf(nodeId)).getByText(gateName).closest('[data-change]')?.getAttribute('data-change') ?? null;
}

function changesPanel(): HTMLElement {
  return screen.getByRole('tabpanel', { name: 'Changes' });
}

function cardOf(title: string): HTMLElement {
  const card = within(changesPanel()).getByText(title).closest<HTMLElement>('.design-system-change-row');
  if (card === null) throw new Error(`no change card ${title}`);
  return card;
}

describe('the counts', () => {
  test('the footer counts the change list beside the version the board runs on, and Apply N changes opens its dialog', async () => {
    renderEditing();
    expect(screen.getByText('Changes show on the steps and gates. The board runs on version 2 until you apply.')).toBeDefined();
    const footer = screen.getByRole('region', { name: 'Pipeline changes' });
    expect(within(footer).getByText('4 changes · version 2 → 3')).toBeDefined();
    expect(within(footer).getByText('The board keeps running on version 2 until Apply.')).toBeDefined();
    await clickSettled(within(footer).getByRole('button', { name: 'Apply 4 changes' }));
    expect(screen.getByRole('dialog', { name: 'Apply 4 changes?' })).toBeDefined();
  });
});

describe('the marks', () => {
  test('gate pills and rows carry their change: changed, removed and new', async () => {
    renderEditing();
    expect([chipChangeOf('gates-build', 'typecheck'), chipChangeOf('gates-build', 'lint'), chipChangeOf('gates-build', 'unit-tests')])
      .toEqual(['changed', 'removed', null]);
    const buildRows = [...document.querySelectorAll<HTMLElement>('.board-pipeline-gate-row[data-row-kind="gate"]')];
    expect(buildRows.map((row) => row.getAttribute('data-change'))).toEqual(['changed', 'removed', null]);
    await openPhase(/^Merge/);
    expect(chipChangeOf('gates-merge', 'a11y')).toBe('new');
  });

  test('a removed agent step is not drawn, its add card comes back, and the Changes tab lists it', async () => {
    renderEditing('A6-re-review-removed');
    await openPhase(/^Merge/);
    expect(document.querySelector('[data-step-node-id="re-review-in-airlock"]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Add before the fast-forward' })).toBeDefined();
    expect(cardOf('Merge train').getAttribute('data-change')).toBe('removed');
    expect(within(cardOf('Merge train')).getByText('re-review · removed')).toBeDefined();
  });
});

describe('Human code review', () => {
  test('its switch sends the edit, and the facts that come back draw its steps in the Review phase', async () => {
    const controls = renderEditing('A6');
    await openPhase(/^Review/);
    expect(stepIds()).not.toContain('merge-before-human-code-review');
    await clickSettled(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ target: 'approval', approval: 'merge', value: true }], isACopy: false
    }]);
    cleanup();
    renderEditing('A6-drawn-changes');
    await openPhase(/^Review/);
    expect(stepIds()).toEqual(expect.arrayContaining(['merge-before-human-code-review', 'gates-review-again', 'human-code-review']));
    expect(within(stepOf('human-code-review')).getByRole('switch', { name: 'Human code review' }).getAttribute('aria-checked')).toBe('true');
    expect(within(stepOf('human-code-review')).getByText('Off → on')).toBeDefined();
  });

  test('its card says what a reviewed ticket then does', () => {
    renderEditing();
    const card = cardOf('Human code review');
    expect(within(card).getByText('switch · off → on')).toBeDefined();
    expect(within(card).getByText('A reviewed ticket merges main in, passes the review gates again, then waits for User\'s Merge.')).toBeDefined();
  });
});

describe('the aside', () => {
  test('the Changes tab comes first, and its in-flight note lists the tickets in flight as chips', () => {
    renderEditing();
    const aside = screen.getByRole('complementary', { name: 'Changes' });
    expect(within(aside).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Changes4', 'Pipeline agent']);
    const tickets = within(changesPanel()).getByRole('list', { name: 'Tickets in flight' });
    expect(within(tickets).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['14', '17', '12', '9', '7']);
    expect(within(tickets).getAllByRole('link').map((chip) => [chip.className, chip.getAttribute('href')])).toEqual(
      ['14', '17', '12', '9', '7'].map((ticketId) => ['design-system-tag', `#forge/example-tracker/tickets/ticket/${ticketId}`]),
    );
    expect(within(changesPanel()).getByText('5 tickets are in flight.')).toBeDefined();
  });

  test('a changed gate shows its run line before and after, and only a new gate offers its benchmark', async () => {
    const controls = renderEditing();
    expect(within(cardOf('typecheck')).getByText('bun run typecheck')).toBeDefined();
    expect(within(cardOf('typecheck')).getByText('bun run typecheck --incremental')).toBeDefined();
    expect(within(changesPanel()).getAllByRole('button', { name: /^Benchmark/u })).toHaveLength(1);
    expect(within(cardOf('a11y')).getByText('Not benchmarked yet')).toBeDefined();
    expect(controls.sent).toEqual([]);
    await clickSettled(within(cardOf('a11y')).getByRole('button', { name: 'Benchmark in the merge phase: a11y' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'gate-profile-start', setupId: 'S2', gateName: 'a11y', phase: 'merge', entity: null
    }]);
  });

  test('Ask the pipeline agent to check sends pipeline-check and turns to the agent\'s tab', async () => {
    const controls = renderEditing();
    await clickSettled(screen.getByRole('button', { name: 'Ask the pipeline agent to check' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-check', setupId: 'S2' }]);
    expect(screen.getByRole('tabpanel', { name: 'Chat with the pipeline agent' })).toBeDefined();
  });
});

describe('Discard', () => {
  test('sends pipeline-draft-discard and returns to #pipeline', async () => {
    window.location.hash = '#forge/example-tracker/pipeline/edit';
    const controls = renderEditing();
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline changes' })).getByRole('button', { name: 'Discard' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-discard', setupId: 'S2' }]);
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline');
  });
});
