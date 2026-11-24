/**
 * The resume summary's model. What matters: each step carries the record's status and the summary the facts' counts give it, and a done
 * or recheck step reopens at its route; the current step carries the open questions and the pipeline agent's job; a pending Apply names
 * its commit, hold or refusal; Resume and Start over name the record; the main-moved note shows only while main moved; the footer counts
 * the done steps. In monorepo mode the entities step follows the research and counts the draft's entities with the root.
 */
import { describe, expect, test }                         from 'bun:test';
import type { BoardPipelineSetupDocument }                from '../../../../@types/board/BoardPipelineDocuments.ts';
import { entitiesStepBoardOf }                            from '../../../testing/EntitiesStepFixture.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { ResumeSummaryModel }                             from './ResumeSummaryModel.ts';

function setupOf(name: PipelineFixtureName): BoardPipelineSetupDocument {
  const { setup } = pipelineBoardStateOf(name).pipeline;
  if (setup === undefined || setup === null) throw new Error(`the fixture ${name} has no setup`);
  return setup;
}

function stepOf(setup: BoardPipelineSetupDocument, step: string) {
  const found = ResumeSummaryModel.resumeStepsOf(setup).find((candidate) => candidate.step === step);
  if (found === undefined) throw new Error(`no step ${step}`);
  return found;
}

describe('each step\'s row', () => {
  test('shows the status and summary from the facts, and Open on a done step', () => {
    expect(ResumeSummaryModel.resumeStepsOf(setupOf('A0b-running')).map((step) => [step.step, step.status, step.summary, step.openRoute?.item ?? null])).toEqual([
      ['billing', 'done', 'Subscription', 'setup/billing'],
      ['agent', 'done', 'This machine\'s program', 'setup/agent'],
      ['research', 'done', '1 stack item, 2 scripts, 1 question answered', 'setup/research'],
      ['constitution', 'done', 'Drafted · 4 sections, 6 rules', 'setup/constitution'],
      ['design', 'current', 'Proposal saved: 1 prepare step, 3 build gates, 3 review gates, 3 merge gates. 2 changes by User kept.', null],
      ['apply', 'upcoming', 'not yet', null],
    ]);
  });

  test('in monorepo mode the entities step follows the research and counts the draft\'s entities with the root', () => {
    const { setup } = entitiesStepBoardOf().pipeline;
    if (setup === undefined || setup === null) throw new Error('the entities board has a setup');
    expect(ResumeSummaryModel.resumeStepsOf(setup).map((step) => step.step)).toEqual(['billing', 'agent', 'research', 'entities', 'constitution', 'design', 'apply']);
    expect(stepOf(setup, 'entities')).toMatchObject({ status: 'current', summary: '6 entities: 2 apps, 3 packages and the root' });
    expect(ResumeSummaryModel.doneStepsTextOf(setup)).toBe('3 of 7 steps done');
  });

  test('a step that needs a recheck says so and reopens', () => {
    const constitution = stepOf(setupOf('A0b-recheck'), 'constitution');
    expect(constitution).toMatchObject({ status: 'recheck', recheck: true, openRoute: { tab: 'pipeline', item: 'setup/constitution' } });
    expect(stepOf(setupOf('A0b-recheck'), 'research')).toMatchObject({ status: 'current', recheck: false, openRoute: null });
  });

  test('a step not reached has no summary', () => {
    const setup = setupOf('A1');
    expect(stepOf(setup, 'constitution').summary).toBeNull();
    expect(stepOf(setup, 'design').summary).toBeNull();
  });

  test('the API billing names its cap', () => {
    const setup = setupOf('A0b-running');
    const withCap = { ...setup, record: { ...setup.record, billing: { mode: 'api', maximumBudgetDollars: 5 } } } as const;
    expect(stepOf(withCap, 'billing').summary).toBe('API key · cap $5 per launch');
  });
});

describe('the footer', () => {
  test('counts the steps done of the six', () => {
    expect(ResumeSummaryModel.doneStepsTextOf(setupOf('A0b-running'))).toBe('4 of 6 steps done');
  });
});

describe('the current step\'s chips', () => {
  test('name the open questions and the running pipeline agent', () => {
    const setup = setupOf('A0b-running');
    const withQuestion = { ...setup, openQuestionCount: 1 };
    expect(stepOf(withQuestion, 'design').chips).toEqual([
      { text: '1 question open', tone: 'question' },
      { text: 'Pipeline agent J4 running', tone: 'neutral' },
    ]);
  });

  test('a stopped pipeline agent resumes with its conversation', () => {
    expect(stepOf(setupOf('A0b-stopped'), 'design').chips).toEqual([{ text: 'Pipeline agent J4 stopped · resumes with its conversation', tone: 'neutral' }]);
    expect(ResumeSummaryModel.leadTextOf(setupOf('A0b-stopped'))).toBe('Every step was saved as it happened. Setup stopped during the pipeline design.');
  });
});

describe('a pending Apply', () => {
  test('names the constitution commit', () => {
    expect(stepOf(setupOf('A0b-apply-pending'), 'apply').summary).toBe('Committing CONSTITUTION.md to main');
  });

  test('names a hold with its reason and blocking files, and a refusal with its reason', () => {
    const setup = setupOf('A0b-apply-pending');
    const pending = setup.applyState;
    if (pending === null) throw new Error('the fixture has no pending Apply');
    const held: BoardPipelineSetupDocument = {
      ...setup,
      applyState: {
        ...pending, state: 'held', reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md']
      },
    };
    expect(stepOf(held, 'apply').summary).toBe('Held. Main has uncommitted changes to CONSTITUTION.md.');
    const refused: BoardPipelineSetupDocument = { ...setup, applyState: { ...pending, state: 'refused', reason: 'constitution-commit-unsigned' } };
    expect(stepOf(refused, 'apply').summary).toBe('Refused. Git could not sign the commit, and nothing commits unsigned.');
  });
});

describe('the commands and the note', () => {
  test('Resume and Start over name the record', () => {
    const setup = setupOf('A0b-running');
    expect(ResumeSummaryModel.resumeLabelOf(setup)).toBe('Resume pipeline design');
    expect(ResumeSummaryModel.resumeCommandOf(setup)).toEqual({ boardCommandVersion: 1, kind: 'pipeline-setup-resume', setupId: 'S1' });
    expect(ResumeSummaryModel.startOverCommandOf(setup)).toEqual({ boardCommandVersion: 1, kind: 'pipeline-setup-start-over', setupId: 'S1' });
  });

  test('the main-moved note shows only while main moved', () => {
    expect(ResumeSummaryModel.mainMovedTextOf(setupOf('A0b-running'))).toBeNull();
    expect(ResumeSummaryModel.mainMovedTextOf(setupOf('A0b-main-moved')))
      .toBe('Main moved 3 commits since the research. The pipeline agent rechecks the scripts when it resumes.');
  });
});
