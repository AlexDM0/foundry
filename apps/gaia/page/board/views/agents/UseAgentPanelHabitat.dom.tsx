/**
 * `useAgentPanelHabitat` under the board's host of Flint, on rows marked `data-job-id`. It holds the order of a launch, which the model
 * specs cannot see: the job event, then the board event raising the agents in flight before Flint's next frame; Flint strikes the
 * launch's spark and the slots do not take its place.
 */
import { cleanup }                 from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import { useRef }                  from 'react';

import {
  elementOf,
  flintHabitatSceneOf,
  placeAt,
  type FlintHabitatScene
} from '../../testing/FlintHabitatScene.ts';
import type { PanelJob }             from './AgentPanelSpriteModel.ts';
import type { AgentPanelBoardFacts } from './UseAgentPanelHabitat.ts';
import { useAgentPanelHabitat }      from './UseAgentPanelHabitat.ts';

afterEach(cleanup);

const FRAME_MILLISECONDS = 16;
/** Long enough for the strike of `strike-spark` and the rail of `slots` to show. */
const WATCHED_MILLISECONDS = 900;

/** Only the fields the habitat reads of a job. */
function launchingJob(id: string): PanelJob {
  return {
    id, kind: 'build', state: 'launching', crashResumes: 0, interruption: null, stopRequest: null, airlockPhase: null, live: { silentSweeps: 0 },
  };
}

function boardOf(jobs: readonly PanelJob[], agentsInFlight: number): AgentPanelBoardFacts {
  return {
    jobs,
    endedJobs:   [],
    concurrency: {
      limit: 3, agentsInFlight, readyTicketIds: [], heldTicketIds: []
    },
    hephaestus: { state: 'serving', paused: false },
  };
}

function JobRows({ board }: { readonly board: AgentPanelBoardFacts }) {
  const viewElement = useRef<HTMLDivElement>(null);
  useAgentPanelHabitat(viewElement, board, null);
  return (
    <div className="example-agents" ref={viewElement} data-flint-workplace="">
      <table>
        <tbody>
          {board.jobs.map((job) => <tr key={job.id} data-job-id={job.id}><td data-column="job">{job.id}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function sceneOf(firstBoard: AgentPanelBoardFacts): FlintHabitatScene<AgentPanelBoardFacts> {
  return flintHabitatSceneOf<AgentPanelBoardFacts>({
    storedHabitatKind: 'agent-panel',
    viewOf:            (board) => <JobRows board={board} />,
    firstProps:        firstBoard,
    placeView:         () => placeAt(elementOf('.example-agents'), 100, 100, 800, 400),
  });
}

/** The highest opacity a prop of Flint showed with over the watched frames. */
function mostShownOf(scene: FlintHabitatScene<AgentPanelBoardFacts>, propName: string): number {
  let mostShown = 0;
  for (let elapsed = 0; elapsed < WATCHED_MILLISECONDS; elapsed += FRAME_MILLISECONDS) {
    scene.frames.advance(FRAME_MILLISECONDS);
    mostShown = Math.max(mostShown, Number(elementOf(`[data-flint-part="${propName}"]`).getAttribute('opacity') ?? '0'));
  }
  return mostShown;
}

test('a job that appears launching, then the board that raises the agents in flight, has Flint strike the spark, not the slots', () => {
  const scene = sceneOf(boardOf([], 0));
  scene.show(boardOf([launchingJob('J1')], 0));
  scene.show(boardOf([launchingJob('J1')], 1));
  const sparks = mostShownOf(scene, 'struckSparks');
  expect(sparks).toBeGreaterThan(0.5);
  expect(Number(elementOf('[data-flint-part="slotRail"]').getAttribute('opacity') ?? '0')).toBe(0);
});
