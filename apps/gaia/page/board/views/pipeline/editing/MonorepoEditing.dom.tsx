/**
 * Editing a pipeline over entities in a happy-dom document, against fake controls: a page per level beside the entity rail, the Changes
 * tab grouped by level with a copy's set undone in one press, the footer counting changes and levels, Apply grouping rows by level and the
 * tickets in flight by entity, and a refusal shown verbatim.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                                              from '../../../../@types/board/BoardDocument.ts';
import type { BoardRoute }                                                 from '../../../../shared/BoardRouter.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                from '../../../testing/FakeControls.ts';
import { onBoard }                                                         from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, withPipelineFacts } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                    from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const FORGE_ROUTE: BoardRoute = { tab: 'pipeline', item: 'forge' };

const DESIGN_SYSTEM_ROUTE: BoardRoute = { tab: 'pipeline', item: 'entity/design-system' };

const ENTITY_NAMED_BY_TICKETS_REFUSAL = 'The Apply would remove or rename entity root, and ticket #019 names it. Nothing was written. '
  + 'The product owner gives it another entity, or it lands; then apply again.';

/** The editing board with the draft also removing the root entity. */
function boardRemovingRoot(): BoardDocument {
  const board = pipelineBoardStateOf('mono-editing');
  const flow = board.pipeline.flow ?? null;
  if (flow === null) throw new Error('the fixture mono-editing has no flow');
  return withPipelineFacts(board, { flow: { ...flow, changeList: [...flow.changeList, { field: 'entity:root', changeKind: 'removed', editId: null }] } });
}

/** The editing board with its draft writing each ticket as a spec, then a plan, and its flow drawing that route's steps. */
function boardWritingSpecThenPlan(): BoardDocument {
  const board = pipelineBoardStateOf('mono-editing');
  const flow = board.pipeline.flow ?? null;
  const setup = board.pipeline.setup ?? null;
  const routeNodes = pipelineBoardStateOf('A2-spec-then-plan').pipeline.flow?.nodes.filter((node) => node.nodeId.includes('spec') || node.nodeId.includes('plan')) ?? [];
  if (flow === null || setup === null || setup.record.draft === null) throw new Error('the fixture mono-editing has no flow or no draft');
  const nodes = [...routeNodes, ...flow.nodes.filter((node) => node.nodeKind !== 'ticket-creation' && node.nodeKind !== 'human-ticket-review')];
  const draft = { ...setup.record.draft, ticketWriting: 'spec-then-plan' as const, approvals: { ...setup.record.draft.approvals, plan: false } };
  return withPipelineFacts(board, { flow: { ...flow, nodes }, setup: { ...setup, record: { ...setup.record, draft } } });
}

function renderEditing(route: BoardRoute = FORGE_ROUTE, board: BoardDocument = pipelineBoardStateOf('mono-editing')) {
  const controls = fakeControls();
  controls.render(onBoard(<PipelineView facts={board} route={route} {...pipelineViewServicesOf()} />));
  return controls;
}

function changesPanel(): HTMLElement {
  return screen.getByRole('tabpanel', { name: 'Changes' });
}

function footer(): HTMLElement {
  return screen.getByRole('region', { name: 'Pipeline changes' });
}

async function openApplyChanges(): Promise<HTMLElement> {
  await clickSettled(within(footer()).getByRole('button', { name: 'Apply 5 changes' }));
  return screen.getByRole('dialog', { name: 'Apply 5 changes?' });
}

describe('the page of a level', () => {
  test('the forge level stands beside the rail, and the footer counts the changes and the levels they are in', () => {
    renderEditing();
    expect(screen.getByRole('heading', { name: 'Forge' })).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Pipeline levels' })).toBeDefined();
    expect(within(footer()).getByText('4 changes in 3 levels · version 1 → 2')).toBeDefined();
    expect(within(footer()).getByText('The board keeps running on version 1 until Apply.')).toBeDefined();
  });

  test('the forge level offers how a ticket is written, and in a spec, then a plan, its two writing steps and their reviews', async () => {
    const controls = renderEditing(FORGE_ROUTE, boardWritingSpecThenPlan());
    const ticketPhase = screen.getByRole('region', { name: 'Ticket phase' });
    const choice = within(ticketPhase).getByRole('group', { name: 'How a ticket is written' });
    expect(within(choice).getByRole('button', { name: 'Spec, then plan' }).getAttribute('aria-pressed')).toBe('true');
    expect([...ticketPhase.querySelectorAll<HTMLElement>('[data-step-node-id]')].map((step) => step.dataset['stepNodeId'])).toEqual(['spec-writing', 'plan-writing']);
    expect(within(ticketPhase).queryByRole('switch', { name: 'Human ticket review' })).toBeNull();
    expect(within(ticketPhase).getByRole('switch', { name: 'Human spec review' }).getAttribute('aria-checked')).toBe('true');
    await clickSettled(within(ticketPhase).getByRole('switch', { name: 'Human plan review' }));
    await clickSettled(within(choice).getByRole('button', { name: 'One ticket' }));
    expect(controls.sent).toMatchObject([
      { kind: 'pipeline-draft-edit', edits: [{ target: 'approval', approval: 'plan', value: true }] },
      { kind: 'pipeline-draft-edit', edits: [{ target: 'ticket-writing', value: null }] },
    ]);
  });

  test('an entity\'s level names the entity, and its agent tab is that entity\'s session', async () => {
    renderEditing(DESIGN_SYSTEM_ROUTE);
    expect(screen.getByRole('heading', { name: 'design-system' })).toBeDefined();
    expect(screen.getByText('The Example Agency components. Changes show on the steps and gates. The board runs on version 1 until you apply.')).toBeDefined();
    await clickSettled(screen.getByRole('tab', { name: 'Pipeline agent' }));
    expect(screen.getByText('Pipeline agent · design-system')).toBeDefined();
  });
});

describe('the Changes tab', () => {
  test('groups every level\'s changes, the forge first, each with its count, and names the entities the check covers', () => {
    renderEditing(DESIGN_SYSTEM_ROUTE);
    expect(screen.getByText('Version 1 → 2 · by level')).toBeDefined();
    const heads = within(changesPanel()).getAllByRole('button', { name: /, \d+ changes?$/u }).map((head) => head.getAttribute('aria-label'));
    expect(heads).toEqual(['Forge, 1 change', 'web, 1 change', 'design-system, 2 changes']);
    expect(within(changesPanel()).getByText('The check covers web and design-system: the entities this draft touches.')).toBeDefined();
  });

  test('a copy\'s set undoes with one press, and each of its edits still undoes alone', async () => {
    const controls = renderEditing();
    const group = within(changesPanel()).getByRole('region', { name: 'design-system changes' });
    await clickSettled(within(group).getByRole('button', { name: 'Undo all 2: Copied gates from web' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'E3', wholeBatch: true
    }]);
    await clickSettled(within(group).getByRole('button', { name: 'Show the 2 edits' }));
    await clickSettled(within(group).getByRole('button', { name: 'Undo the change to Build gates' }));
    expect(controls.sent.at(-1)).toEqual({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'E4', wholeBatch: false
    });
  });
});

describe('Apply changes', () => {
  test('groups its rows by level, a copy\'s set as one row, and the tickets in flight by entity, a crossing under its package', async () => {
    renderEditing(FORGE_ROUTE, boardRemovingRoot());
    const dialog = await openApplyChanges();
    const rowsOf = (levelName: string): string[] => {
      const level = within(dialog).getByRole('region', { name: `${levelName} changes` });
      return within(level).getAllByRole('listitem').map((row) => row.textContent);
    };
    expect(rowsOf('Forge')).toEqual(['Human code review switch · changed']);
    expect(rowsOf('web')).toEqual(['typecheck gate · changed']);
    expect(rowsOf('design-system')).toEqual(['Copied gates from web2 edits']);
    expect(rowsOf('root')).toEqual(['root entity · removed']);
    const ticketsIn = (entity: string): (string | null)[] => {
      const tickets = within(dialog).getByRole('list', { name: `Tickets in flight in ${entity}` });
      return within(tickets).getAllByRole('listitem').map((ticket) => ticket.textContent);
    };
    expect(ticketsIn('web')).toEqual(['21']);
    expect(ticketsIn('design-system')).toEqual(['22crossing from web']);
    expect(within(dialog).queryByRole('list', { name: 'Tickets in flight' })).toBeNull();
  });

  test('removing an entity that a ticket names is refused in Hephaestus\'s words, verbatim', async () => {
    const controls = renderEditing(FORGE_ROUTE, boardRemovingRoot());
    const dialog = await openApplyChanges();
    controls.answerNextWith({ verdict: 'refused', refusal: ENTITY_NAMED_BY_TICKETS_REFUSAL });
    await clickSettled(within(dialog).getByRole('button', { name: 'Apply 5 changes' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-apply', setupId: 'S2', draftRevision: 4, resumesBoard: false
    }]);
    expect(within(dialog).getByRole('status').textContent).toBe(ENTITY_NAMED_BY_TICKETS_REFUSAL);
  });
});
