/**
 * The live flow's activity model. What matters: a node's chips are exactly the occupants the facts place on it, each linking to its
 * ticket or draft detail, a draft read as drafting and a ticket on the merge before review as catching up; the "Now" rows equal the
 * occupants in the facts' order, with a meter only on a step an agent runs, and a row the crossing namer names ends with its crossing;
 * the panel head counts the working rows; a ticket in flight is a chip linking to its detail; a gate profile is a row only while queued
 * or running, naming its entity when it has one; the "Earlier" lines keep the facts' order and cut the stamp only when the page carries
 * the slices.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardGateProfileRunDocument, BoardPipelineFlowDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { pipelineBoardStateOf }                                        from '../../../testing/PipelineFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                                    from '../../../testing/TimestampSlicesFixture.ts';
import type { FlowWording }                                            from '../flow/PipelineFlowModel.ts';
import { FlowActivityPanelModel }                                      from './FlowActivityPanelModel.ts';

const WORDING: FlowWording = { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], reworkThresholdLines: 750 };

function liveFlow(): BoardPipelineFlowDocument {
  const { flow } = pipelineBoardStateOf('A5').pipeline;
  if (flow === null) throw new Error('A5 has no flow');
  return flow;
}

describe('occupantChipsOf', () => {
  test('a node shows the tickets and drafts the facts place on it, each linking to its detail', () => {
    const flow = liveFlow();
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'builder')).toEqual([
      {
        key: 'ticket-14', text: '14', route: { tab: 'kanban', item: 'ticket/14' }, state: 'in-progress'
      },
    ]);
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'ticket-creation')).toEqual([
      {
        key: 'draft-D3', text: 'D3 drafting', route: { tab: 'kanban', item: 'draft/D3' }, state: 'draft'
      },
    ]);
    expect(FlowActivityPanelModel.occupantChipsOf(flow, 'review')).toEqual([]);
  });

  test('a ticket on the merge before review is catching up with main', () => {
    expect(FlowActivityPanelModel.occupantChipsOf(liveFlow(), 'merge-before-review').map((chip) => chip.text)).toEqual(['15 · catching up']);
  });
});

describe('inFlightChipsOf', () => {
  test('a ticket in flight is a chip in the in-progress colours that links to its detail, in the facts\' order', () => {
    expect(FlowActivityPanelModel.inFlightChipsOf(['14', '9'])).toEqual([
      {
        key: 'ticket-14', text: '14', route: { tab: 'kanban', item: 'ticket/14' }, state: 'in-progress'
      },
      {
        key: 'ticket-9', text: '9', route: { tab: 'kanban', item: 'ticket/9' }, state: 'in-progress'
      },
    ]);
  });
});

describe('activityRowsOf', () => {
  test('the rows equal the occupants in order, with a meter only on a step an agent runs', () => {
    const flow = liveFlow();
    const rows = FlowActivityPanelModel.activityRowsOf(flow, WORDING, new Date('2026-11-12T12:00:00'));
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
    expect(FlowActivityPanelModel.activityRowsOf(stray, WORDING, new Date()).map((row) => row.idText)).not.toContain('99');
  });

  test('a row the crossing namer names ends its step with the crossing, and only that row', () => {
    const flow = liveFlow();
    const crossedTicketId = flow.occupants[1]?.occupantId;
    const rows = FlowActivityPanelModel.activityRowsOf(flow, WORDING, new Date('2026-11-12T12:00:00'), null, (occupant) => (
      occupant.occupantId === crossedTicketId ? 'Package build of a crossing from web' : null
    ));
    expect(rows.map((row) => row.stepText)).toEqual([
      'Ticket creation', 'Builder · Package build of a crossing from web', 'Merge main into the tree', 'Gates · build',
    ]);
  });

  test('the heading counts the rows', () => {
    expect(FlowActivityPanelModel.nowHeadingOf(1)).toBe('Now · 1 item');
    expect(FlowActivityPanelModel.nowHeadingOf(4)).toBe('Now · 4 items');
  });

  test('the panel head says how many work, quietly when none does, and how many builds run at a time', () => {
    expect(FlowActivityPanelModel.flowStatusOf(4)).toEqual({ tone: 'working', text: '4 working' });
    expect(FlowActivityPanelModel.flowStatusOf(0)).toEqual({ tone: 'idle', text: 'Nothing running' });
    expect(FlowActivityPanelModel.buildsAtATimeTextOf(1)).toBe('1 build at a time');
    expect(FlowActivityPanelModel.buildsAtATimeTextOf(2)).toBe('2 builds at a time');
  });
});

describe('historyLinesOf', () => {
  const records = pipelineBoardStateOf('A5').pipeline.history;

  test('the lines keep the facts\' order and cut each stamp to its clock', () => {
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

describe('profileActivityRowsOf', () => {
  test('only a queued or running profile is a row, naming its entity and linking to its level', () => {
    const runs: readonly BoardGateProfileRunDocument[] = [
      {
        profileRunId: 'P1', entity: 'web', gateName: 'typecheck', phase: 'build', state: 'running', elapsedMilliseconds: 6000, cacheReport: null,
      },
      {
        profileRunId: 'P2', entity: null, gateName: 'lint', phase: 'review', state: 'queued', elapsedMilliseconds: null, cacheReport: null,
      },
      {
        profileRunId: 'P3', entity: 'web', gateName: 'test', phase: 'build', state: 'passed', elapsedMilliseconds: 9000, cacheReport: 'miss',
      },
    ];
    expect(FlowActivityPanelModel.profileActivityRowsOf(runs)).toEqual([
      {
        key:      'profile-P1',
        route:    { tab: 'pipeline', item: 'entity/web' },
        status:   'check',
        idText:   'Profile',
        stepText: 'web · profiling typecheck · Build phase',
        meter:    null,
        elapsed:  '6s',
      },
      {
        key: 'profile-P2', route: { tab: 'pipeline', item: 'forge' }, status: 'check', idText: 'Profile', stepText: 'profiling lint · Review phase', meter: null, elapsed: '',
      },
    ]);
  });
});
