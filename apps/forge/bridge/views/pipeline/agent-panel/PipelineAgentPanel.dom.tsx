/**
 * The pipeline agent panel at a level of monorepo mode, in a happy-dom document against fake controls. What matters: single mode follows
 * the record's one session and shows no level line; at an entity the panel follows that entity's session alone, shows its questions and
 * messages its job, and never mixes in the forge's or another entity's thread; at the forge the entities' questions stay out of the thread
 * and a line counts them with a link to each entity's level.
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

import type { PipelineSetupFacts }                             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { clickSettled, fakeControls, fakeTranscripts }         from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf }                                from '../../../testing/PipelineFixture.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { PipelineAgentPanel }                                  from './PipelineAgentPanel.tsx';

afterEach(cleanup);

const WEB_LEVEL = PipelineLevelModel.entityLevelOf('web');

const WEB_QUESTION_EYEBROW = 'Question · gate unit-tests';

function monorepoSetup(): PipelineSetupFacts {
  const setup = pipelineBoardStateOf('mono-design').pipelineSetup;
  if (setup === undefined || setup === null) throw new Error('the fixture mono-design has no setup');
  return setup;
}

function renderPanel(level: PipelineLevel | null) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  controls.render(
    <PipelineAgentPanel
      setup={monorepoSetup()}
      step="design"
      followTranscript={transcripts.follow}
      todayCalendarDate="2026-11-12"
      composerPlaceholder="Ask for a change, or ask why"
      levelShown={level === null ? null : { level, hrefOf: (other) => PipelineLevelModel.fragmentAtLevel(other, 'setup/design') }}
    />
  );
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
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the pipeline agent' }), { target: { value: 'Example: keep the unit tests.' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J5', text: 'Example: keep the unit tests.' }]);
  });

  test('the forge keeps the entities\' questions out of its thread and links each asking entity', () => {
    const { transcripts } = renderPanel(FORGE_LEVEL);
    expect(transcripts.followedJobs()).toEqual(['J4']);
    expect(screen.queryByText(WEB_QUESTION_EYEBROW)).toBeNull();
    const line = screen.getByRole('status');
    expect(line.textContent).toBe('1 question in an entitywebEach stays in its own thread');
    expect(within(line).getByRole('link', { name: 'web' }).getAttribute('href')).toBe('#pipeline/entity/web/setup/design');
  });
});
