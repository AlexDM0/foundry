/**
 * The live flow's activity model. What matters: a node's chips are exactly the occupants the facts place on it, each linking to its
 * ticket or draft detail, a draft read as drafting and a ticket on the merge before review as catching up; the "Now" rows equal the
 * occupants in the facts' order, with a meter only on a step an agent runs; the "Earlier" lines keep the facts' order, cut the stamp only
 * when the page carries the slices, and leave out a record kind they have no line for.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineFlowFacts }   from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { pipelineBoardStateOf }     from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES } from '../../../testing/TimestampSlicesFixture.ts';
import { FlowActivityPanelModel }   from './FlowActivityPanelModel.ts';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

function liveFlow(): PipelineFlowFacts {
  const flow = pipelineBoardStateOf('A5').pipelineFlow ?? null;
  if (flow === null) throw new Error('A5 has no flow');
  return flow;
}

describe('occupantChipsOf', () => {
  test('a node shows the tickets and drafts the facts place on it, each linking to its detail', () => {
    const flow = liveFlow();
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'builder')).toEqual([
      {
        key: 'ticket-14', text: '14', href: '#kanban/ticket/14', state: 'in-progress'
      },
    ]);
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'ticket-creation')).toEqual([
      {
        key: 'draft-D3', text: 'D3 drafting', href: '#kanban/draft/D3', state: 'draft'
      },
    ]);
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'review')).toEqual([]);
  });

  test('a ticket on the merge before review is catching up with main', () => {
    expect(FlowActivityPanelModel.occupantChipsOf(liveFlow(), 'merge-before-review').map((chip) => chip.text)).toEqual(['15 · catching up']);
  });
});

describe('activityRowsOf', () => {
  test('the rows equal the occupants in order, with a meter only on a step an agent runs', () => {
    const flow = liveFlow();
    const rows = FlowActivityPanelModel.activityRowsOf(flow, EFFORTS, new Date('2026-11-12T12:00:00'));
    expect(rows.map((row) => row.idText)).toEqual(flow.occupants.map((occupant) => occupant.occupantId));
    expect(rows.map((row) => [row.stepText, row.status, row.meter === null, row.elapsed])).toEqual([
      ['Ticket creation', 'step', false, '20m'],
      ['Builder', 'step', false, '40m'],
      ['Merge main into the tree', 'check', true, '10m'],
      ['Gates · build', 'check', true, '2m'],
    ]);
    expect(rows[1]?.meter).toMatchObject({
      model: 'opus', effort: 'medium', level: 2, levelCount: 5
    });
  });

  test('an occupant on a node the flow does not draw has no row', () => {
    const flow = liveFlow();
    const stray = { ...flow, occupants: [...flow.occupants, { ...flow.occupants[0], nodeId: 'gone', occupantId: '99' } as (typeof flow.occupants)[number]] };
    expect(FlowActivityPanelModel.activityRowsOf(stray, EFFORTS, new Date()).map((row) => row.idText)).not.toContain('99');
  });

  test('the heading counts the rows', () => {
    expect(FlowActivityPanelModel.nowHeadingOf(1)).toBe('Now · 1 item');
    expect(FlowActivityPanelModel.nowHeadingOf(4)).toBe('Now · 4 items');
  });
});

describe('historyLinesOf', () => {
  const records = pipelineBoardStateOf('A5').pipelineHistory ?? [];

  test('the lines keep the facts\' order, cut each stamp to its clock and leave out a kind they have no line for', () => {
    const format = { todayCalendarDate: '2026-11-12', slices: EXAMPLE_TIMESTAMP_SLICES };
    expect(FlowActivityPanelModel.historyLinesOf(records, format).map((line) => [line.clock, line.text])).toEqual([
      ['10:31', 'Board resumed'],
      ['10:29', 'Gate browser-tests set to bun run test:browser'],
      ['10:28', 'Human ticket review turned on'],
    ]);
  });

  test('with no stamp slices a line shows no clock', () => {
    expect(FlowActivityPanelModel.historyLinesOf(records, null).every((line) => line.clock === null)).toBe(true);
  });
});
