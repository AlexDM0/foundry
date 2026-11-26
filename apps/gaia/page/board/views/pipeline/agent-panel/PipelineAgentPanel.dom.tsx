/**
 * The pipeline agent panel at a level of monorepo mode, in a happy-dom document against fake controls. What matters: single mode follows
 * the record's one session and shows no level line; at an entity the panel follows that entity's session alone, shows its questions and
 * messages its job with no picture, as it offers none, and never mixes in the forge's or another entity's thread; at the forge the
 * entities' questions stay out of the thread and a line counts them with a link to each entity's level. The agent strip's Flint slot is
 * a strip's 60 by 50 px, and Flint lives in it.
 */
import {
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BoardRouter }                     from '../../../../shared/BoardRouter.ts';
import { FLINT_SLOT_CUES }                 from '../../../flint/FlintSlotCues.ts';
import { FLINT_SLOT_HABITATS }             from '../../../flint/FlintSlotHabitats.ts';
import { FIXTURE_TRACKER_ID }              from '../../../testing/BoardStateFixture.ts';
import {
  clickSettled,
  fakeControls,
  fakeTranscripts,
  SENT_COMMAND_VERSION
} from '../../../testing/FakeControls.ts';
import { flintHabitatSceneOf, placeAt }                        from '../../../testing/FlintHabitatScene.ts';
import { onBoard }                                             from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf }                                from '../../../testing/PipelineFixture.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { AgentStrip, PIPELINE_AGENT_FLINT_LABEL }              from './AgentStrip.tsx';
import { PipelineAgentPanel }                                  from './PipelineAgentPanel.tsx';
import type { AgentStripView }                                 from './PipelineAgentPanelModel.ts';

afterEach(cleanup);

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

const WEB_QUESTION_EYEBROW = 'Question · gate unit-tests';

function monorepoSetup(): BoardPipelineSetupDocument {
  const { setup } = pipelineBoardStateOf('mono-design').pipeline;
  if (setup === undefined || setup === null) throw new Error('the fixture mono-design has no setup');
  return setup;
}

function renderPanel(level: PipelineLevel | null) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  controls.render(onBoard(
    <PipelineAgentPanel
      setup={monorepoSetup()}
      step="design"
      followTranscript={transcripts.follow}
      todayCalendarDate="2026-11-12"
      composerPlaceholder="Ask for a change, or ask why"
      jobs={[]}
      levelShown={level === null ? null : { level, hrefOf: (other) => BoardRouter.fragmentOf(FIXTURE_TRACKER_ID, PipelineLevelModel.routeAtLevel(other, 'setup/design')) }}
    />
  ));
  return { controls, transcripts };
}

describe('the panel at a level', () => {
  test('single mode follows the record\'s one session and shows no level line', () => {
    const { transcripts } = renderPanel(null);
    expect(transcripts.followedJobs()).toEqual(['J4']);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText(WEB_QUESTION_EYEBROW)).toBeNull();
  });

  test('an entity follows its own session alone, shows its own question and messages its own job', async () => {
    const { controls, transcripts } = renderPanel(WEB_LEVEL);
    expect(transcripts.followedJobs()).toEqual(['J5']);
    expect(screen.getByText(WEB_QUESTION_EYEBROW)).toBeDefined();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByLabelText('Attach pictures')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the pipeline agent' }), { target: { value: 'Example: keep the unit tests.' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'job-message', jobId: 'J5', text: 'Example: keep the unit tests.', pictures: [], incidentId: null
    }]);
  });

  test('the forge keeps the entities\' questions out of its thread and links each asking entity', () => {
    const { transcripts } = renderPanel(FORGE_LEVEL);
    expect(transcripts.followedJobs()).toEqual(['J4']);
    expect(screen.queryByText(WEB_QUESTION_EYEBROW)).toBeNull();
    const line = screen.getByRole('status');
    expect(line.textContent).toBe('1 question in an entitywebEach stays in its own thread');
    expect(within(line).getByRole('link', { name: 'web' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/entity/web/setup/design');
  });
});

describe('the agent strip', () => {
  test('Flint\'s slot is a strip\'s 60 by 50 px, and Flint lives in it', () => {
    const strip: AgentStripView = { text: 'Proposal ready', flintHabitat: FLINT_SLOT_HABITATS.pipelineDesign, flintCue: FLINT_SLOT_CUES.AGENT_IS_DONE };
    const scene = flintHabitatSceneOf<AgentStripView>({
      storedHabitatKind: 'pipeline-design-slot',
      viewOf:            (shown) => onBoard(<AgentStrip strip={shown} />),
      firstProps:        strip,
      placeView:         () => placeAt(screen.getByRole('img', { name: PIPELINE_AGENT_FLINT_LABEL }), 100, 100, 50, 50),
    });
    expect(screen.getByRole('img', { name: PIPELINE_AGENT_FLINT_LABEL }).getAttribute('data-size')).toBe('60x50');
    expect(scene.handle.livesIn()).toBe('pipeline-design-slot');
  });
});
