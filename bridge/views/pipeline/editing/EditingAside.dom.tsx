/**
 * Editing an applied pipeline (A6Editing) in a happy-dom document, through the Pipeline view against fake controls. What matters: the
 * toolbar and the footer count exactly the change list, and Apply N changes opens the change list's dialog; gate chips and gate rows carry
 * their change (changed, removed and new), while a removed agent step is not drawn, its + comes back and the Changes tab lists it;
 * switching Human code review sends its edit, and the facts that come back draw its branch in place of "Ready for the merge train"; the
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

import type { BoardStateDocument }                                                from '../../../@types/BoardStateDocument.ts';
import { clickSettled, fakeControls }                                             from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderEditing(board: BoardStateDocument | PipelineFixtureName = 'A6-drawn-changes') {
  const controls = fakeControls();
  const facts = typeof board === 'string' ? pipelineBoardStateOf(board) : board;
  controls.render(<PipelineView facts={facts} route={{ tab: 'pipeline', item: 'edit' }} {...pipelineViewServicesOf()} />);
  return controls;
}

function nodeOf(nodeId: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-flow-node-id="${nodeId}"] .bridge-flow-node`);
  if (node === null) throw new Error(`no node ${nodeId}`);
  return node;
}

function branchNodeIds(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[data-column="branch"] [data-flow-node-id]')].map((cell) => cell.dataset['flowNodeId'] ?? '');
}

function chipChangeOf(nodeId: string, gateName: string): string | null {
  return within(nodeOf(nodeId)).getByText(gateName).closest('[data-change]')?.getAttribute('data-change') ?? null;
}

function changesPanel(): HTMLElement {
  return screen.getByRole('tabpanel', { name: 'Changes' });
}

function cardOf(title: string): HTMLElement {
  const card = within(changesPanel()).getByText(title).closest<HTMLElement>('.bridge-change-row');
  if (card === null) throw new Error(`no change card ${title}`);
  return card;
}

describe('the counts', () => {
  test('the toolbar and the footer count the change list, and Apply N changes opens its dialog', async () => {
    renderEditing();
    expect(screen.getByRole('toolbar', { name: 'Flow' }).textContent).toContain('Editing · 4 changes, not applied');
    const footer = screen.getByRole('region', { name: 'Pipeline changes' });
    expect(within(footer).getByText('4 changes · version 2 → 3')).toBeDefined();
    expect(within(footer).getByText('The board keeps running on version 2 until Apply.')).toBeDefined();
    await clickSettled(within(footer).getByRole('button', { name: 'Apply 4 changes' }));
    expect(screen.getByRole('dialog', { name: 'Apply 4 changes?' })).toBeDefined();
  });
});

describe('the marks', () => {
  test('gate chips and rows carry their change: changed, removed and new', () => {
    renderEditing();
    expect([chipChangeOf('gates-build', 'typecheck'), chipChangeOf('gates-build', 'lint'), chipChangeOf('gates-build', 'unit-tests')])
      .toEqual(['changed', 'removed', null]);
    expect(chipChangeOf('gates-merge', 'a11y')).toBe('new');
    const buildRows = [...document.querySelectorAll<HTMLElement>('.bridge-pipeline-gate-row[data-row-kind="gate"]')];
    expect(buildRows.map((row) => row.getAttribute('data-change'))).toEqual(['changed', 'removed', null]);
  });

  test('a removed agent step is not drawn, its + comes back, and the Changes tab lists it', () => {
    renderEditing('A6-re-review-removed');
    expect(document.querySelector('[data-flow-node-id="re-review-in-airlock"]')).toBeNull();
    expect(document.querySelector('.bridge-pipeline-flow-train .bridge-pipeline-flow-slot')).not.toBeNull();
    expect(cardOf('Merge train').getAttribute('data-change')).toBe('removed');
    expect(within(cardOf('Merge train')).getByText('re-review · removed')).toBeDefined();
  });
});

describe('Human code review', () => {
  test('its switch sends the edit, and the facts that come back draw its branch', async () => {
    const controls = renderEditing('A6');
    expect(branchNodeIds()).toContain('ready-for-airlock');
    expect(branchNodeIds()).not.toContain('merge-before-human-code-review');
    await clickSettled(within(nodeOf('human-code-review')).getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 7, edits: [{ field: 'approval:merge', value: true }],
    }]);
    cleanup();
    renderEditing('A6-drawn-changes');
    expect(branchNodeIds()).toEqual(expect.arrayContaining(['merge-before-human-code-review', 'gates-review-again', 'human-code-review']));
    expect(branchNodeIds()).not.toContain('ready-for-airlock');
    expect(within(nodeOf('human-code-review')).getByRole('switch', { name: 'Human code review' }).getAttribute('aria-checked')).toBe('true');
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
      kind: 'gate-profile-start', setupId: 'S2', gateName: 'a11y', phase: 'merge',
    }]);
  });

  test('Ask the pipeline agent to check sends pipeline-check and turns to the agent\'s tab', async () => {
    const controls = renderEditing();
    await clickSettled(screen.getByRole('button', { name: 'Ask the pipeline agent to check' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-check', setupId: 'S2' }]);
    expect(screen.getByRole('tabpanel', { name: 'Chat with the pipeline agent' })).toBeDefined();
  });
});

describe('Discard', () => {
  test('sends pipeline-draft-discard and returns to #pipeline', async () => {
    window.location.hash = '#pipeline/edit';
    const controls = renderEditing();
    await clickSettled(within(screen.getByRole('region', { name: 'Pipeline changes' })).getByRole('button', { name: 'Discard' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-discard', setupId: 'S2' }]);
    expect(window.location.hash).toBe('#pipeline');
  });
});
