/**
 * The live flow's activity aside in a happy-dom document, over the A5 fixture. What matters: the "Now" rows equal the occupants on the
 * flow, each a link to its ticket or draft, with a meter only on a step an agent runs; the "Earlier" list shows the worded records with
 * their clocks; Ask the pipeline agent sends `pipeline-agent-advise` and turns to the agent's tab, and a refusal leaves the tab as it was;
 * the head counts the working rows; on the smallest pipeline the About tab comes first.
 */
import { cleanup, screen, within } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                                              from '../../../../@types/board/BoardDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION }                from '../../../testing/FakeControls.ts';
import { onBoard }                                                         from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, withPipelineFacts } from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                        from '../../../testing/TimestampSlicesFixture.ts';
import { FlowActivityPanel }                                               from './FlowActivityPanel.tsx';

afterEach(cleanup);

function renderPanel(facts: BoardDocument = pipelineBoardStateOf('A5')) {
  const controls = fakeControls();
  const { clock } = pipelineViewServicesOf();
  controls.render(onBoard(<FlowActivityPanel facts={facts} stampFormat={{ todayCalendarDate: '2026-11-12', slices: EXAMPLE_TIMESTAMP_SLICES }} clock={clock} />));
  return controls;
}

describe('the activity aside', () => {
  test('the Now rows equal the occupants, each linking to its detail, with a meter only on an agent\'s step', () => {
    renderPanel();
    const panel = screen.getByRole('tabpanel', { name: 'On the flow' });
    expect(within(panel).getByRole('heading', { name: 'Now · 4 items' })).toBeDefined();
    const rows = [...panel.querySelectorAll<HTMLAnchorElement>('.design-system-activity-row')];
    expect(rows.map((row) => [row.querySelector('.design-system-activity-row-id')?.textContent, row.getAttribute('href')])).toEqual([
      ['D3', '#forge/example-tracker/kanban/draft/D3'],
      ['14', '#forge/example-tracker/kanban/ticket/14'],
      ['15', '#forge/example-tracker/kanban/ticket/15'],
      ['12', '#forge/example-tracker/kanban/ticket/12'],
    ]);
    expect(rows.map((row) => [row.dataset['status'], row.querySelector('.design-system-effort-meter') !== null])).toEqual([
      ['step', true],
      ['step', true],
      ['check', false],
      ['check', false],
    ]);
  });

  test('an empty flow says so', () => {
    const facts = pipelineBoardStateOf('A5');
    const { flow } = facts.pipeline;
    if (flow === null || flow === undefined) throw new Error('A5 has no flow');
    renderPanel(withPipelineFacts(facts, { flow: { ...flow, occupants: [] } }));
    expect(screen.getByRole('heading', { name: 'Now · 0 items' })).toBeDefined();
    expect(screen.getByText('Nothing is on the flow now.')).toBeDefined();
  });

  test('the Earlier list shows the worded records with their clocks', () => {
    renderPanel();
    const lines = [...document.querySelectorAll('.board-pipeline-activity-history-line')].map((line) => line.textContent);
    expect(lines).toEqual(['10:31Board resumed', '10:29Gate browser-tests set to bun run test:browser', '10:28Human ticket review turned on']);
  });

  test('Ask the pipeline agent sends the advise command and turns to the agent\'s tab', async () => {
    const controls = renderPanel();
    await clickSettled(screen.getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-agent-advise', entity: null }]);
    expect(screen.getByRole('tab', { name: 'Pipeline agent' }).getAttribute('aria-selected')).toBe('true');
  });

  test('the head names the flow tab with how many work', () => {
    renderPanel();
    const panel = screen.getByRole('complementary', { name: 'Activity' });
    expect(within(panel).getByRole('heading', { name: 'On the flow' })).toBeDefined();
    expect(within(panel).getByText('4 working')).toBeDefined();
  });

  test('on the smallest pipeline, About comes first and opens first', () => {
    const board = pipelineBoardStateOf('A5');
    const { flow } = board.pipeline;
    if (flow === null || flow === undefined) throw new Error('the fixture A5 has no flow');
    renderPanel(withPipelineFacts(board, { flow: { ...flow, nodes: flow.nodes.filter((node) => node.nodeKind !== 'review') } }));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['About', 'On the flow', 'Pipeline agent']);
    expect(screen.getByRole('tab', { name: 'About' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('The smallest pipeline')).toBeDefined();
  });

  test('a refused advise shows its refusal and stays on the flow tab', async () => {
    const controls = renderPanel();
    controls.answerNextWith({ verdict: 'refused', refusal: 'An update of the pipeline is open.' });
    await clickSettled(screen.getByRole('button', { name: 'Ask the pipeline agent' }));
    expect(screen.getByText('An update of the pipeline is open.')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'On the flow' }).getAttribute('aria-selected')).toBe('true');
  });
});
