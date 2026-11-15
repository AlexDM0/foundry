/**
 * `useTimelineHabitat` under the Bridge's host of Flint, on chart rows marked `data-task-id` with bars marked `data-bar-kind` as the
 * Progress chart marks them. What matters: the view is the `timeline` habitat; a ticket that starts has Flint lay the bar along the last
 * shown bar of its own row, which is given and the hidden one passed over; and a ticket whose row is not shown has Flint lay a bar where it
 * stands.
 */
import { cleanup } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useRef } from 'react';

import type { ProgressBoardState } from '../../@types/ProgressBoardState.ts';
import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../../testing/FlintHabitatScene.ts';
import { useTimelineHabitat } from './UseTimelineHabitat.ts';

afterEach(cleanup);

/** Only the fields the habitat reads; a chart reads many more. */
function boardOf(status: string, ownRowPosition: number | null): ProgressBoardState {
  return {
    page: {
      tickets: [{ id: '001', status }],
      payload: {
        progress:   { tasks: [{ id: 6 }, { id: 7 }] },
        boardFacts: { tickets: [{ ticketId: '001', ownRowPosition }] },
      },
    },
  } as unknown as ProgressBoardState;
}

function ChartRows({ boardState }: { readonly boardState: ProgressBoardState }) {
  const viewElement = useRef<HTMLDivElement>(null);
  useTimelineHabitat(viewElement, boardState);
  return (
    <div className="example-chart" ref={viewElement} data-flint-workplace="">
      <div data-task-id="7">
        <div className="example-shown-bar" data-bar-kind="segment" />
        <div data-bar-kind="plain" hidden />
      </div>
    </div>
  );
}

function sceneOfChart(): FlintHabitatScene<ProgressBoardState> {
  return flintHabitatSceneOf<ProgressBoardState>({
    storedHabitatKind: 'timeline',
    viewOf:            (boardState) => <ChartRows boardState={boardState} />,
    firstProps:        boardOf('pending', 1),
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
