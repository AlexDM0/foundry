/**
 * The research step's model. What matters: findings group by topic with their source paths and scripts become rows; a script that needs
 * a network or a service carries its note; a finding to recheck says so; the status lines follow the agent's state and the facts; Continue
 * is always a command, with attention only when the agent marked the research ready; Stop has nothing to stop once the agent stopped. In
 * monorepo mode the layout findings are their own list, never a card; the status line says that each entity has a session once one has
 * a part; Continue opens the next step the record walks, `entities` while it walks it.
 */
import { describe, expect, test }                                        from 'bun:test';
import type { BoardPipelineSetupDocument, BoardResearchFindingDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { EXAMPLE_NOT_LAUNCHED }                                          from '../../../testing/AgentFixture.ts';
import { PIPELINE_FIXTURE_NOW, pipelineBoardStateOf }                    from '../../../testing/PipelineFixture.ts';
import { AgentSessionModel }                                             from '../agent-panel/AgentSessionModel.ts';
import { ResearchStepModel }                                             from './ResearchStepModel.ts';

function researchSetup(): BoardPipelineSetupDocument {
  const { setup } = pipelineBoardStateOf('A1').pipeline;
  if (setup === null || setup === undefined) throw new Error('the fixture A1 has no setup');
  return setup;
}

function withRecord(setup: BoardPipelineSetupDocument, changes: Partial<BoardPipelineSetupDocument['record']>): BoardPipelineSetupDocument {
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
    const finding: BoardResearchFindingDocument = {
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
    expect(ResearchStepModel.statusLineOf({ setup, sessionState: 'running', agentLaunchedAt: '2026-11-12T09:27:20Z' }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · researching · snapshot of main at 1111111 · 2m 40s');
  });

  test('a stopped agent shows no time, and a ready research says it is done', () => {
    const stopped = { ...researchSetup(), agentJobState: null };
    expect(ResearchStepModel.statusLineOf({ setup: stopped, sessionState: 'stopped', agentLaunchedAt: '2026-11-12T09:27:20Z' }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · stopped · snapshot of main at 1111111');
    expect(ResearchStepModel.statusLineOf({ setup: researchSetup(), sessionState: 'running', agentLaunchedAt: null }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · research done · snapshot of main at 1111111');
  });

  test('the footer counts the scripts and the open research questions', () => {
    expect(ResearchStepModel.footerCountsOf(withRecord(researchSetup(), { readyToContinue: [] }))).toBe('2 scripts found · 1 open question');
    expect(ResearchStepModel.footerCountsOf(withRecord(researchSetup(), { questions: [] }))).toBe('2 scripts found');
  });

  test('the panel head and the footer pill say whether the agent researches, is done or stopped', () => {
    const statusOf = (setup: BoardPipelineSetupDocument) => ResearchStepModel.panelStatusOf(
      ResearchStepModel.researchStateOf(setup, AgentSessionModel.setupSessionStateOf(setup, [])),
    );
    expect(statusOf(withRecord(researchSetup(), { readyToContinue: [] }))).toEqual({ tone: 'working', text: 'Researching' });
    expect(statusOf(researchSetup())).toEqual({ tone: 'ready', text: 'Research done' });
    expect(statusOf({ ...researchSetup(), agentJobState: null })).toEqual({ tone: 'idle', text: 'Stopped' });
  });

  test('a job forge did not launch reads not launched, never researching, with no time since a launch it never had', () => {
    const setup = withRecord(researchSetup(), { readyToContinue: [] });
    const sessionState = AgentSessionModel.setupSessionStateOf(setup, [{ id: 'J4', notLaunched: EXAMPLE_NOT_LAUNCHED }]);
    expect(sessionState).toBe('not-launched');
    expect(ResearchStepModel.panelStatusOf(ResearchStepModel.researchStateOf(setup, sessionState))).toEqual({ tone: 'failed', text: 'Not launched' });
    expect(ResearchStepModel.statusLineOf({ setup, sessionState, agentLaunchedAt: '2026-11-12T09:27:20Z' }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · not launched · snapshot of main at 1111111');
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
      boardCommandVersion: 2, kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    });
    expect(ResearchStepModel.continueHasAttention(researching)).toBe(false);
    expect(ResearchStepModel.continueHasAttention(researchSetup())).toBe(true);
  });

  test('Stop stops the agent job, and has nothing to stop once it stopped', () => {
    expect(ResearchStepModel.stopCommandOf(researchSetup())).toEqual({
      boardCommandVersion: 2, kind: 'job-stop', jobId: 'J4', mode: 'stop'
    });
    expect(ResearchStepModel.stopCommandOf({ ...researchSetup(), agentJobState: null })).toBeNull();
  });
});

describe('monorepo mode', () => {
  const layoutFinding: BoardResearchFindingDocument = {
    findingId: 'F9', topic: 'layout', label: 'apps/web', value: 'Next.js', sourcePaths: ['package.json'], script: null, needsRecheck: false,
  };

  test('the layout findings are their own list, with their sources, and never a card', () => {
    const findings = [...researchSetup().record.findings, layoutFinding];
    expect(ResearchStepModel.layoutItemsOf(findings)).toEqual([{ findingId: 'F9', folder: 'apps/web', description: 'Next.js' }]);
    expect(ResearchStepModel.layoutSourcePathsOf(findings)).toEqual(['package.json']);
    expect(ResearchStepModel.findingSectionsOf(findings).map((section) => section.title)).toEqual(['Stack', 'Conventions']);
  });

  test('the status line says that each entity has a session once one has a part of the record', () => {
    const setup = withRecord(researchSetup(), {
      entities: {
        web: {
          agentJobId: 'J5', findings: [], questions: [], constitution: null, check: null,
        }
      }
    });
    expect(ResearchStepModel.statusLineOf({ setup, sessionState: 'running', agentLaunchedAt: null }, PIPELINE_FIXTURE_NOW))
      .toBe('Pipeline agent J4 · research done · one session per entity · snapshot of main at 1111111');
  });

  test('Continue opens the next step the record walks', () => {
    expect(ResearchStepModel.continueStepOf(['billing', 'research', 'entities', 'constitution', 'design', 'apply'])).toBe('entities');
    expect(ResearchStepModel.continueStepOf(['billing', 'research', 'constitution', 'design', 'apply'])).toBe('constitution');
  });
});
