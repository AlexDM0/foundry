/**
 * The research step's model. What matters: findings group by topic with their source paths and scripts become rows; a script that needs
 * a network or a service carries its note; a finding to recheck says so; the status lines follow the agent's state and the facts; Continue
 * is always a command, with attention only when the agent marked the research ready; Stop has nothing to stop once the agent stopped.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineSetupFacts }                    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ResearchFinding }                       from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import { PIPELINE_FIXTURE_NOW, pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { ResearchStepModel }                          from './ResearchStepModel.ts';

function researchSetup(): PipelineSetupFacts {
  const setup = pipelineBoardStateOf('A1').pipelineSetup;
  if (setup === null || setup === undefined) throw new Error('the fixture A1 has no setup');
  return setup;
}

function withRecord(setup: PipelineSetupFacts, changes: Partial<PipelineSetupFacts['record']>): PipelineSetupFacts {
  return { ...setup, record: { ...setup.record, ...changes } };
}

describe('the findings', () => {
  test('group by topic in the drawn order, each section with its source paths', () => {
    const sections = ResearchStepModel.findingSectionsOf(researchSetup().record.findings);
    expect(sections.map((section) => [section.title, section.sourcePaths])).toEqual([
      ['Stack', ['tsconfig.json']],
      ['Conventions', ['CONTRIBUTING.md']],
    ]);
  });

  test('scripts are rows, and a script that needs a network or a service carries its note', () => {
    const rows = ResearchStepModel.scriptRowsOf(researchSetup().record.findings);
    expect(rows.map((row) => [row.name, row.run, row.needsNote])).toEqual([
      ['typecheck', 'bun run typecheck', null],
      ['browser-tests', 'bun run test:browser', 'Needs network'],
    ]);
  });

  test('several needs read as one note, and a script that is no gate says so', () => {
    const finding: ResearchFinding = {
      findingId:   'F9',
      topic:       'scripts',
      label:       'e2e',
      value:       null,
      sourcePaths: ['package.json'],
      script:      {
        name: 'e2e', run: 'playwright test', meaning: 'Example browser tests.', gateCandidate: 'not-a-gate', needs: ['network', 'a registry', 'Postgres'],
      },
      needsRecheck: true,
    };
    const [row] = ResearchStepModel.scriptRowsOf([finding]);
    expect(row?.needsNote).toBe('Needs network, a registry and Postgres');
    expect(row?.notAGate).toBe(true);
    expect(row?.recheck).toBe(true);
  });

  test('the scripts head names where they were found and counts them', () => {
    const { findings } = researchSetup().record;
    expect(ResearchStepModel.scriptsSourceTextOf(findings)).toBe('found in package.json; none is run here');
    expect(ResearchStepModel.scriptCountTextOf(findings)).toBe('2 found');
  });
});

describe('the status lines', () => {
  test('the line over the page names the agent, its state, the snapshot and the time since its launch', () => {
    const setup = withRecord(researchSetup(), { readyToContinue: [] });
    expect(ResearchStepModel.statusLineOf({ setup, agentLaunchedAt: '2026-11-12T09:27:20Z' }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · researching · snapshot of main at 1111111 · 2m 40s');
  });

  test('a stopped agent shows no time, and a ready research says it is done', () => {
    expect(ResearchStepModel.statusLineOf({ setup: { ...researchSetup(), agentJobState: null }, agentLaunchedAt: '2026-11-12T09:27:20Z' }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · stopped · snapshot of main at 1111111');
    expect(ResearchStepModel.statusLineOf({ setup: researchSetup(), agentLaunchedAt: null }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · research done · snapshot of main at 1111111');
  });

  test('the footer counts the scripts and the open research questions', () => {
    expect(ResearchStepModel.footerStatusOf(withRecord(researchSetup(), { readyToContinue: [] }))).toBe('Researching · 2 scripts found · 1 open question');
    expect(ResearchStepModel.footerStatusOf(withRecord(researchSetup(), { questions: [] }))).toBe('Research done · 2 scripts found');
  });

  test('the heading names the project', () => {
    expect(ResearchStepModel.headingOf('Example Agency')).toBe('Getting to know Example Agency');
    expect(ResearchStepModel.headingOf('')).toBe('Getting to know the repository');
  });
});

describe('the commands', () => {
  test('Continue is a command while the agent still researches, with attention only once it marked the research ready', () => {
    const researching = withRecord(researchSetup(), { readyToContinue: [] });
    expect(ResearchStepModel.continueCommandOf(researching)).toEqual({
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    });
    expect(ResearchStepModel.continueHasAttention(researching)).toBe(false);
    expect(ResearchStepModel.continueHasAttention(researchSetup())).toBe(true);
  });

  test('Stop stops the agent job, and has nothing to stop once it stopped', () => {
    expect(ResearchStepModel.stopCommandOf(researchSetup())).toEqual({ kind: 'job-stop', jobId: 'J4', mode: 'stop' });
    expect(ResearchStepModel.stopCommandOf({ ...researchSetup(), agentJobState: null })).toBeNull();
  });
});
