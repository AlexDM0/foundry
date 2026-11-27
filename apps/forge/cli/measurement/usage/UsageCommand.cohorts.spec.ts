/**
 * What `usage` reports from the rows the fake agent plants: oldest first, `--since` splitting and labelling the cohorts, the breach figures, what
 * the request hands the adapter, and no rows as an answer, not a refusal. How the adapter reads transcripts is its own spec's.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import type { AgentAdapter }                                                   from '../../../src/lib/agent-launch/AgentAdapter.ts';
import type { SubagentUsage, SubagentUsageRequest }                            from '../../../src/lib/agent-launch/AgentTranscripts.ts';
import { PRODUCT_NAMES }                                                       from '../../../src/shared/constants/ProductNames.ts';
import { fakeAgentAdapter }                                                    from '../../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGit }                                                      from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                              from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                                           from '../../../src/testing/ToolGuard.ts';
import { runCommandLine }                                                      from '../../Main.ts';
import { createCapturedCommandContext }                                        from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository, createRecordedGitRepository } from '../../testing/InitializedScratchRepository.ts';
import { COMMON_FOLDER_AT_THE_ROOT }                                           from '../../testing/RecordedGitStages.ts';
import type { CohortSummary }                                                  from './utils/UsageCohortUtil.ts';

const FROZEN_NOW = new Date('2026-09-19T20:11:03Z');

const recordedGit = useRecordedGit();

/** The instant the planted cohort is split on: two agents ran before it and one after. */
const BOUNDARY = '2026-09-19T10:00:00Z';

const OVERSIZED_CACHE_READ_TOKENS = 400_000;

interface UsageDocument {
  transcriptFolder: string;
  agents:           Array<Record<string, unknown> & { agentIdentifier: string; bashEditScriptCount: number }>;
  cohorts:          { all: CohortSummary; before?: CohortSummary; after?: CohortSummary };
}

interface PlantedRow {
  session:               string;
  agent:                 string;
  startedAt:             string | null;
  brief:                 string;
  apiCallCount:          number;
  inputTokens:           number;
  outputTokens:          number;
  browserCallCount?:     number;
  cacheReadInputTokens?: number;
  oversizedTokens?:      number;
  shellEditScripts?:     number;
  verificationRuns?:     number;
}

function usageRowOf(planted: PlantedRow): SubagentUsage {
  const cacheReadInputTokens = planted.cacheReadInputTokens ?? 0;
  return {
    sessionIdentifier:           planted.session,
    agentIdentifier:             planted.agent,
    transcriptPath:              `/example/transcripts/${planted.session}/agent-${planted.agent}.jsonl`,
    startedAt:                   planted.startedAt,
    model:                       'example-model',
    apiCallCount:                planted.apiCallCount,
    inputTokens:                 planted.inputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens:    0,
    outputTokens:                planted.outputTokens,
    totalInputTokens:            planted.inputTokens + cacheReadInputTokens,
    endContextTokens:            0,
    oversizedContextTokens:      planted.oversizedTokens ?? 0,
    browserCallCount:            planted.browserCallCount ?? 0,
    shellEditScriptCount:        planted.shellEditScripts ?? 0,
    verificationRunCount:        planted.verificationRuns ?? 0,
    nestedInstructionCharacters: 0,
    briefExcerpt:                planted.brief,
  };
}

/** Planted newest first, so the oldest-first order the report shows is the command's own sort. */
const PLANTED_ROWS: readonly SubagentUsage[] = [
  usageRowOf({
    session: 'session-two', agent: 'gamma', startedAt: '2026-09-19T11:00:00.000Z', brief: 'Add the usage command', apiCallCount: 20, inputTokens: 40_000, outputTokens: 4_000
  }),
  usageRowOf({
    session:          'session-one',
    agent:            'beta',
    startedAt:        '2026-09-19T09:00:00.000Z',
    brief:            'Rename the export button',
    apiCallCount:     30,
    inputTokens:      90_000,
    outputTokens:     9_000,
    browserCallCount: 2,
  }),
  usageRowOf({
    session: 'session-one', agent: 'alpha', startedAt: '2026-09-19T08:00:00.000Z', brief: 'Read the layout module', apiCallCount: 10, inputTokens: 10_000, outputTokens: 1_000
  }),
];

const BREACH_ROW = usageRowOf({
  session:              'session-breach',
  agent:                'delta',
  startedAt:            '2026-09-19T12:00:00.000Z',
  brief:                'Rewrite the layout module',
  apiCallCount:         1,
  inputTokens:          1_000,
  outputTokens:         10,
  cacheReadInputTokens: OVERSIZED_CACHE_READ_TOKENS,
  oversizedTokens:      OVERSIZED_CACHE_READ_TOKENS + 1_000,
  shellEditScripts:     2,
  verificationRuns:     1,
});

let repositoryDirectory = '';

/** The fake agent with `rows` planted, its usage read recording each request it is handed. */
function adapterAnswering(rows: readonly SubagentUsage[], requests: SubagentUsageRequest[] = []): AgentAdapter {
  const adapter = fakeAgentAdapter(undefined, undefined, { subagentUsages: rows });
  return {
    ...adapter,
    subagentUsagesOf: (request) => {
      requests.push(request);
      return adapter.subagentUsagesOf(request);
    },
  };
}

function contextAnswering(agentAdapter: AgentAdapter): ReturnType<typeof createCapturedCommandContext> {
  return { ...createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW }), agentAdapter };
}

async function run(
  commandLineArguments: readonly string[],
  agentAdapter: AgentAdapter = adapterAnswering(PLANTED_ROWS),
): Promise<ReturnType<typeof createCapturedCommandContext>> {
  const context  = contextAnswering(agentAdapter);
  const exitCode = await runCommandLine(commandLineArguments, context);
  expect(exitCode, `\`agent-progress ${commandLineArguments.join(' ')}\` failed: ${context.errorText()}`).toBe(0);
  return context;
}

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('usage-command', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

describeWhenGitIsRecorded('the report a reader sees', () => {
  test('lists every agent oldest first with its calls and its brief', async () => {
    const printed = (await run(['usage'])).outputText();
    const lines   = printed.split('\n');

    const briefOrder = ['Read the layout module', 'Rename the export button', 'Add the usage command']
      .map((brief) => lines.findIndex((line) => line.includes(brief)));

    expect(briefOrder.every((index) => index > 0)).toBe(true);
    expect([...briefOrder].sort((a, b) => a - b)).toEqual(briefOrder);
    expect(printed).toContain('started');
    expect(printed).toContain('brief');
  });

  test('ends with a cohort summary naming the median calls and the mean input', async () => {
    const printed = (await run(['usage'])).outputText();

    expect(printed).toContain('All: 3 agents, median 20 calls');
    // 10k, 90k and 40k of input, a mean of 46,667.
    expect(printed).toContain('mean input 46.7k');
  });

  test('--since labels the two sides with the instant it split on', async () => {
    const printed = (await run(['usage', '--since', BOUNDARY])).outputText();

    expect(printed).toContain('Before ');
    expect(printed).toContain('Since ');
    expect(printed).toContain('2 agents, median 20 calls');
    expect(printed).toContain('1 agent, median 20 calls');
  });

  /** A `--since` nobody can read is a refusal rather than a silent report of the whole cohort, which would answer a question that was not asked. */
  test('a --since that is not a time is refused at exit 1, naming what it would accept', async () => {
    const context  = contextAnswering(adapterAnswering(PLANTED_ROWS));
    const exitCode = await runCommandLine(['usage', '--since', 'last tuesday'], context);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('--since "last tuesday" is not a time');
    expect(context.outputText()).toBe('');
  });
});

describeWhenGitIsRecorded('the --json document', () => {
  test('carries the folder the adapter read, one entry per agent oldest first and the cohort', async () => {
    const document = JSON.parse((await run(['usage', '--transcripts', '/example/transcripts', '--json'])).outputText()) as UsageDocument;

    expect(document.transcriptFolder).toBe('/example/transcripts');
    expect(document.agents.map((agent) => agent.agentIdentifier)).toEqual(['alpha', 'beta', 'gamma']);
    expect(document.cohorts.all.transcriptCount).toBe(3);
    expect(document.cohorts.before).toBeUndefined();
    expect(document.cohorts.after).toBeUndefined();
  });

  test('each agent carries the row\'s keys in the order they were always printed, the shell edits as bashEditScriptCount', async () => {
    const document = JSON.parse((await run(['usage', '--json'])).outputText()) as UsageDocument;
    const [, beta] = document.agents;

    expect(Object.keys(beta ?? {})).toEqual([
      'apiCallCount',
      'inputTokens',
      'cacheReadInputTokens',
      'cacheCreationInputTokens',
      'outputTokens',
      'endContextTokens',
      'oversizedContextTokens',
      'startedAt',
      'model',
      'browserCallCount',
      'bashEditScriptCount',
      'verificationRunCount',
      'nestedInstructionCharacters',
      'briefExcerpt',
      'sessionIdentifier',
      'agentIdentifier',
      'transcriptPath',
      'totalInputTokens',
    ]);
    expect(beta).toMatchObject({
      sessionIdentifier: 'session-one',
      agentIdentifier:   'beta',
      startedAt:         '2026-09-19T09:00:00.000Z',
      apiCallCount:      30,
      browserCallCount:  2,
      briefExcerpt:      'Rename the export button',
      totalInputTokens:  90_000,
      transcriptPath:    '/example/transcripts/session-one/agent-beta.jsonl',
    });
  });

  test('--since adds a cohort for each side, split where it was told to', async () => {
    const document = JSON.parse((await run(['usage', '--since', BOUNDARY, '--json'])).outputText()) as UsageDocument;

    expect(document.cohorts.before?.transcriptCount).toBe(2);
    expect(document.cohorts.after?.transcriptCount).toBe(1);
    expect(document.cohorts.all.transcriptCount).toBe(3);
  });
});

/** The three figures that say a brief was breached: work done at a context the brief capped, files edited by shelling out, and the checks run. */
describeWhenGitIsRecorded('the figures a breach of the brief shows up in', () => {
  test('the row carries the oversized share as a whole percentage, the bash edit scripts and the verification runs', async () => {
    const printed = (await run(['usage'], adapterAnswering([BREACH_ROW]))).outputText();
    const [, row] = printed.split('\n');

    expect(printed).toContain('over 200k');
    expect(printed).toContain('bash edits');
    expect(printed).toContain('checks');
    expect(row).toContain('100%');
    expect(row?.includes('Rewrite the layout module')).toBe(true);
  });

  test('the cohort line reports the mean of each figure beside the ones it already had', async () => {
    const printed = (await run(['usage'], adapterAnswering([BREACH_ROW]))).outputText();

    expect(printed).toContain('mean 100% over 200k context');
    expect(printed).toContain('mean 2.0 bash edit scripts');
    expect(printed).toContain('mean 1.0 verification runs');
  });

  test('--json carries the oversized figure as a raw token count and the shell edits under their printed key', async () => {
    const document = JSON.parse((await run(['usage', '--json'], adapterAnswering([BREACH_ROW]))).outputText()) as UsageDocument;
    const [delta]  = document.agents;

    expect(delta?.['oversizedContextTokens']).toBe(OVERSIZED_CACHE_READ_TOKENS + 1_000);
    expect(delta?.bashEditScriptCount).toBe(2);
    expect(delta?.['verificationRunCount']).toBe(1);
  });
});

describeWhenGitIsRecorded('what the adapter is asked', () => {
  test('the --transcripts folder, the project root, the context\'s home and the figures\' bounds', async () => {
    const requests: SubagentUsageRequest[] = [];
    await run(['usage', '--transcripts', '/example/transcripts'], adapterAnswering(PLANTED_ROWS, requests));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      transcriptFolder:                '/example/transcripts',
      homeDirectory:                   join(repositoryDirectory, 'spec-home'),
      oversizedContextThresholdTokens: 200_000,
      briefExcerptCharacters:          80,
    });
    expect(typeof requests[0]?.projectRoot).toBe('string');
  });

  test('without --transcripts it asks for the agent\'s own folder, and names the folder the adapter answers', async () => {
    const requests: SubagentUsageRequest[] = [];
    const document = JSON.parse((await run(['usage', '--json'], adapterAnswering(PLANTED_ROWS, requests))).outputText()) as UsageDocument;

    expect(requests[0]?.transcriptFolder).toBeNull();
    expect(document.transcriptFolder.startsWith(join(repositoryDirectory, 'spec-home'))).toBe(true);
  });

  test('a transcript the adapter could not read is named on standard error and left out of the figures', async () => {
    const unreadingAdapter: AgentAdapter = {
      ...adapterAnswering(PLANTED_ROWS),
      subagentUsagesOf: (request) => {
        request.onUnreadableTranscript('/example/transcripts/agent-lost.jsonl');
        return { transcriptFolder: '/example/transcripts', usages: PLANTED_ROWS };
      },
    };
    const context = await run(['usage'], unreadingAdapter);

    expect(context.errorText()).toBe('The transcript at /example/transcripts/agent-lost.jsonl could not be read, so that agent is not in these figures.');
    expect(context.outputText()).toContain('All: 3 agents');
  });
});

describeWhenGitIsRecorded('a project with no subagent rows', () => {
  /** A repository that has never delegated anything is not a state the tool should complain about, so this is exit 0 and one sentence. */
  test('is one sentence at exit 0, naming the folder that was read', async () => {
    const printed = (await run(['usage', '--transcripts', '/example/no-transcripts-here'], adapterAnswering([]))).outputText();

    expect(printed).toContain('No subagent transcripts were found');
    expect(printed).toContain('/example/no-transcripts-here');
  });

  test('--json still answers a document, with no agents and an empty cohort', async () => {
    const document = JSON.parse((await run(['usage', '--transcripts', '/example/never-created', '--json'], adapterAnswering([]))).outputText()) as UsageDocument;

    expect(document.agents).toEqual([]);
    expect(document.cohorts.all.transcriptCount).toBe(0);
    expect(document.transcriptFolder).toBe('/example/never-created');
  });
});

describeWhenGitIsRecorded('what the command does not do', () => {
  test('it is refused outside a tracker, like every other command', async () => {
    const outsideDirectory = createRecordedGitRepository('usage-untracked');
    // The context's isolation check and the command each ask git for the repository root of the untracked repository.
    const { context, exitCode } = await recordedGit.playStage([COMMON_FOLDER_AT_THE_ROOT, COMMON_FOLDER_AT_THE_ROOT, COMMON_FOLDER_AT_THE_ROOT], async () => {
      const stagedContext = createCapturedCommandContext({ currentDirectory: outsideDirectory, now: () => FROZEN_NOW });
      return { context: stagedContext, exitCode: await runCommandLine(['usage', '--transcripts', '/example/transcripts'], stagedContext) };
    });

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain(`${PRODUCT_NAMES.PROGRAM} init`);
    removeScratchDirectory(outsideDirectory);
  });

  test('an unknown option is refused rather than ignored', async () => {
    const context  = contextAnswering(adapterAnswering(PLANTED_ROWS));
    const exitCode = await runCommandLine(['usage', '--sine', BOUNDARY], context);

    expect(exitCode).toBe(1);
    expect(context.errorText()).toContain('--sine');
  });
});
