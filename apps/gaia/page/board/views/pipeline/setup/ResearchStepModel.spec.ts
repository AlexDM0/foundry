/**
 * The research step's model: findings by topic, scripts with their notes, the status lines, Continue and Stop, and in monorepo mode the layout
 * findings apart and Continue to `entities`.
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
  test('the layers come in research order, each with its source paths and its progress', () => {
    const layers = ResearchStepModel.layersOf(researchSetup().record.findings, true);
    expect(layers.map((layer) => [layer.title, layer.progress, layer.progressText, layer.sourcePaths])).toEqual([
      ['Stack', 'found', '1 found', ['tsconfig.json']],
      ['Scripts', 'reading', '2 found · reading', ['package.json']],
      ['Conventions', 'found', '1 found', ['CONTRIBUTING.md']],
      ['Continuous integration', 'waiting', 'Not reached yet', []],
      ['Notes', 'waiting', 'Not reached yet', []],
    ]);
  });

  test('once the agent no longer researches, no layer is read and an empty one found nothing', () => {
    const layers = ResearchStepModel.layersOf(researchSetup().record.findings, false);
    expect(layers.map((layer) => layer.progress)).toEqual(['found', 'found', 'found', 'none-found', 'none-found']);
  });

  test('the layout is no layer, and a script filed under another topic is a script', () => {
    const findings: BoardResearchFindingDocument[] = [
      {
        findingId: 'F8', topic: 'layout', label: 'apps/web', value: 'Next.js', sourcePaths: ['apps/web/package.json'], script: null, needsRecheck: false,
      },
      {
        findingId:   'F9',
        topic:       'note',
        label:       'lint',
        value:       null,
        sourcePaths: ['package.json'],
        script:      {
          name: 'lint', run: 'bun run lint', meaning: 'Lints.', gateCandidate: 'gate', needs: [],
        },
        needsRecheck: false,
      },
    ];
    expect(ResearchStepModel.layersOf(findings, true).map((layer) => layer.progress)).toEqual(['waiting', 'reading', 'waiting', 'waiting', 'waiting']);
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

  test('the panel head says whether the agent researches, is done or stopped', () => {
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
    expect(ResearchStepModel.headingOf('Example Agency')).toBe('What Example Agency is made of');
    expect(ResearchStepModel.headingOf('')).toBe('What the repository is made of');
  });
});

describe('the commands', () => {
  test('Continue is a command while the agent still researches, with attention only once it marked the research ready', () => {
    const researching = withRecord(researchSetup(), { readyToContinue: [] });
    expect(ResearchStepModel.continueCommandOf(researching)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    });
    expect(ResearchStepModel.continueHasAttention(researching)).toBe(false);
    expect(ResearchStepModel.continueHasAttention(researchSetup())).toBe(true);
  });

  test('Stop stops the agent job, and has nothing to stop once it stopped', () => {
    expect(ResearchStepModel.stopCommandOf(researchSetup())).toEqual({
      boardCommandVersion: 3, kind: 'job-stop', jobId: 'J4', mode: 'stop'
    });
    expect(ResearchStepModel.stopCommandOf({ ...researchSetup(), agentJobState: null })).toBeNull();
  });
});

describe('monorepo mode', () => {
  const layoutFinding: BoardResearchFindingDocument = {
    findingId: 'F9', topic: 'layout', label: 'apps/web', value: 'Next.js', sourcePaths: ['package.json'], script: null, needsRecheck: false,
  };

  test('the layout findings are their own list, with their sources, and never a layer', () => {
    const findings = [...researchSetup().record.findings, layoutFinding];
    expect(ResearchStepModel.layoutItemsOf(findings)).toEqual([{ findingId: 'F9', folder: 'apps/web', description: 'Next.js' }]);
    expect(ResearchStepModel.layoutSourcePathsOf(findings)).toEqual(['package.json']);
    expect(ResearchStepModel.layersOf(findings, false)).toEqual(ResearchStepModel.layersOf(researchSetup().record.findings, false));
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
