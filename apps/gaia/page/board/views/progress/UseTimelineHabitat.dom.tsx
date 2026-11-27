/**
 * `useTimelineHabitat` on chart rows marked as the Progress chart marks them: a ticket that starts has Flint lay the last shown bar of its own row,
 * or a bar where Flint stands when its row is hidden.
 */
import { cleanup } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useRef } from 'react';

import type { BoardDocument }     from '../../../@types/board/BoardDocument.ts';
import type { BoardTicketStatus } from '../../../@types/board/BoardVocabulary.ts';
import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../../testing/FlintHabitatScene.ts';
import { exampleProgressBoard, exampleProgressTask, exampleProgressTicket } from '../../testing/ProgressBoardFixture.ts';
import { useTimelineHabitat }                                               from './UseTimelineHabitat.ts';

afterEach(cleanup);

const CHART_TASK_IDS = [6, 7];

function boardOf(status: BoardTicketStatus, ownRowPosition: number | null): BoardDocument {
  const ownTaskId = ownRowPosition === null ? undefined : CHART_TASK_IDS[ownRowPosition];
  return exampleProgressBoard({
    tasks:      CHART_TASK_IDS.map((taskId) => exampleProgressTask(taskId)),
    tickets:    [exampleProgressTicket('001', { status })],
    ticketRows: { '001': ownTaskId === undefined ? {} : { ownTaskId } },
  });
}

function ChartRows({ board }: { readonly board: BoardDocument }) {
  const viewElement = useRef<HTMLDivElement>(null);
  useTimelineHabitat(viewElement, board);
  return (
    <div className="example-chart" ref={viewElement} data-flint-workplace="">
      <div data-task-id="7">
        <div className="example-shown-bar" data-bar-kind="segment" />
        <div data-bar-kind="plain" hidden />
      </div>
    </div>
  );
}

function sceneOfChart(): FlintHabitatScene<BoardDocument> {
  return flintHabitatSceneOf<BoardDocument>({
    storedHabitatKind: 'timeline',
    viewOf:            (board) => <ChartRows board={board} />,
    firstProps:        boardOf('committed', 1),
    placeView:         () => {
      placeAt(elementOf('.example-chart'), 100, 100, 800, 400);
      placeAt(elementOf('.example-shown-bar'), 300, 160, 300, 12);
    },
  });
}

test('the view is the timeline habitat', () => {
  sceneOfChart();
  expect(elementOf('.example-chart').getAttribute('data-sprite-habitat')).toBe('timeline');
});

describe('a ticket that starts', () => {
  test('has Flint lay the bar along the shown bar of its own row', () => {
    const scene = sceneOfChart();
    scene.show(boardOf('in-progress', 1));
    expect(scene.performed).toEqual([['lay-bar-along', elementOf('.example-shown-bar')]]);
  });

  test('whose row is not shown has Flint lay a bar where it stands', () => {
    const scene = sceneOfChart();
    expect(scene.cuesReceived(() => scene.show(boardOf('in-progress', 0)))).toEqual(['started-bar-is-not-shown']);
    expect(scene.performed).toEqual([]);
  });
});
