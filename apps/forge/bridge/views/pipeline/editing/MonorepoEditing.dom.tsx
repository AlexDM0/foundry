/**
 * Editing a pipeline over entities (MonoEditing, MonoApplyChanges) in a happy-dom document, through the Pipeline view against fake
 * controls. What matters: each level is its own page beside the entity rail, the forge's or the entity's; the Changes tab groups every
 * level's changes, the forge first, each with its count, and names the entities the check covers; a copy's set undoes with one press as
 * `pipeline-draft-undo` with `wholeBatch`, while each of its edits still undoes alone; the footer counts the changes and the levels they
 * are in; the agent's tab is the session of the level shown; Apply changes groups its rows by level, a copy's set as one row, and keeps
 * the tickets in flight one list; and the refusal of removing an entity that a ticket names shows verbatim.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardStateDocument }                      from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                             from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                   from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                 from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

const FORGE_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'forge' };

const DESIGN_SYSTEM_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'entity/design-system' };

const ENTITY_NAMED_BY_TICKETS_REFUSAL = 'The Apply would remove or rename entity root, and ticket #019 names it. Nothing was written. '
  + 'The product owner gives it another entity, or it lands; then apply again.';

/** The editing board with the draft also removing the root entity. */
function boardRemovingRoot(): BoardStateDocument {
  const board = pipelineBoardStateOf('mono-editing');
  const flow = board.pipelineFlow ?? null;
  if (flow === null) throw new Error('the fixture mono-editing has no flow');
  return { ...board, pipelineFlow: { ...flow, changeList: [...flow.changeList, { field: 'entity:root', changeKind: 'removed', editId: null }] } };
}

function renderEditing(route: BridgeRoute = FORGE_ROUTE, board: BoardStateDocument = pipelineBoardStateOf('mono-editing')) {
  const controls = fakeControls();
  controls.render(<PipelineView facts={board} route={route} {...pipelineViewServicesOf()} />);
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
      kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'E3', wholeBatch: true
    }]);
    await clickSettled(within(group).getByRole('button', { name: 'Show the 2 edits' }));
    await clickSettled(within(group).getByRole('button', { name: 'Undo the change to Build gates' }));
    expect(controls.sent.at(-1)).toEqual({ kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'E4' });
  });
});

describe('Apply changes', () => {
  test('groups its rows by level, a copy\'s set as one row, and keeps the tickets in flight one list', async () => {
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
    const tickets = within(dialog).getByRole('list', { name: 'Tickets in flight' });
    expect(within(tickets).getAllByRole('listitem').map((ticket) => ticket.textContent)).toEqual(['21', '22']);
  });

  test('removing an entity that a ticket names is refused in the Overseer\'s words, verbatim', async () => {
    const controls = renderEditing(FORGE_ROUTE, boardRemovingRoot());
    const dialog = await openApplyChanges();
    controls.answerNextWith({ verdict: 'refused', refusal: ENTITY_NAMED_BY_TICKETS_REFUSAL });
    await clickSettled(within(dialog).getByRole('button', { name: 'Apply 5 changes' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-apply', setupId: 'S2', draftRevision: 4, resumesBoard: false
    }]);
    expect(within(dialog).getByRole('status').textContent).toBe(ENTITY_NAMED_BY_TICKETS_REFUSAL);
  });
});
