/**
 * The adapter's `subagentUsagesOf` over constructed transcripts under a scratch home. What matters: a planted transcript's profile reaches
 * the port's row with its shell edits as `shellEditScriptCount` and its total input summed, a workflow run's agents are read beside a plain
 * one while its journal and each agent's `.meta.json` are not, a workflow agent's excerpt is the script's prompt, and without a folder the
 * project's own folder under the home's `.claude`, or under `CLAUDE_CONFIG_DIR` when the adapter was given one, is read and answered.
 */
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { SubagentUsageAnswer, SubagentUsageRequest } from '../agent-launch/AgentTranscripts.ts';
import { claudeCodeAdapterFor }                           from './ClaudeCodeAdapter.ts';
import { transcriptFolderFor }                            from './ClaudeTranscripts.ts';

const OVERSIZED_CONTEXT_THRESHOLD_TOKENS = 200_000;

const BRIEF_EXCERPT_CHARACTERS = 80;

const OVERSIZED_CACHE_READ_TOKENS = 400_000;

const NESTED_INSTRUCTIONS = '# CLAUDE.md\nThe rules of this folder.';

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = realpathSync(createScratchDirectory('claude-subagent-usages'));
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

interface ConstructedAgent {
  startedAt:        string;
  brief:            string;
  apiCallCount:     number;
  inputTokens:      number;
  outputTokens:     number;
  browserCallCount: number;
}

function transcriptTextFor(constructed: ConstructedAgent): string {
  const lines = [JSON.stringify({
    type:      'user',
    timestamp: constructed.startedAt,
    message:   {
      content: [
        { type: 'nested_memory', content: { path: 'lib/CLAUDE.md', content: NESTED_INSTRUCTIONS } },
        { type: 'text', text: constructed.brief },
      ],
    },
  })];
  for (let callIndex = 0; callIndex < constructed.apiCallCount; callIndex++) {
    const browserBlocks = callIndex < constructed.browserCallCount ? [{ type: 'tool_use', name: 'mcp__Claude_Browser__computer' }] : [];
    lines.push(JSON.stringify({
      type:      'assistant',
      timestamp: constructed.startedAt,
      message:   {
        id:      `msg_${callIndex}`,
        model:   'claude-opus-5',
        content: browserBlocks,
        usage:   { input_tokens: constructed.inputTokens, cache_read_input_tokens: 0, output_tokens: constructed.outputTokens },
      },
    }));
  }
  return `${lines.join('\n')}\n`;
}

function briefAgent(brief: string): ConstructedAgent {
  return {
    startedAt: '2026-09-19T08:00:00.000Z', brief, apiCallCount: 1, inputTokens: 100, outputTokens: 10, browserCallCount: 0
  };
}

function writeTranscript(subagentsFolder: string, agentIdentifier: string, text: string): void {
  mkdirSync(subagentsFolder, { recursive: true });
  writeFileSync(join(subagentsFolder, `agent-${agentIdentifier}.jsonl`), text);
}

function requestOf(transcriptFolder: string | null, homeDirectory = join(scratchDirectory, 'home')): SubagentUsageRequest {
  return {
    projectRoot:                     join(scratchDirectory, 'repository'),
    homeDirectory,
    transcriptFolder,
    oversizedContextThresholdTokens: OVERSIZED_CONTEXT_THRESHOLD_TOKENS,
    briefExcerptCharacters:          BRIEF_EXCERPT_CHARACTERS,
    onUnreadableTranscript:          (transcriptPath) => {
      throw new Error(`No planted transcript is unreadable, yet ${transcriptPath} was reported.`);
    },
  };
}

function usagesIn(transcriptFolder: string): SubagentUsageAnswer {
  return claudeCodeAdapterFor('linux').subagentUsagesOf(requestOf(transcriptFolder));
}

describe('the profile of a planted transcript', () => {
  test('carries the transcript\'s figures, its identifiers and its path, with the total input summed', () => {
    const transcriptFolder = join(scratchDirectory, 'transcripts');
    const subagentsFolder  = join(transcriptFolder, 'session-one', 'subagents');
    writeTranscript(subagentsFolder, 'beta', transcriptTextFor({
      startedAt: '2026-09-19T09:00:00.000Z', brief: 'Rename the export button', apiCallCount: 30, inputTokens: 3_000, outputTokens: 300, browserCallCount: 2
    }));

    const answer = usagesIn(transcriptFolder);

    expect(answer.transcriptFolder).toBe(transcriptFolder);
    expect(answer.usages).toEqual([{
      sessionIdentifier:           'session-one',
      agentIdentifier:             'beta',
      transcriptPath:              join(subagentsFolder, 'agent-beta.jsonl'),
      startedAt:                   '2026-09-19T09:00:00.000Z',
      model:                       'claude-opus-5',
      apiCallCount:                30,
      inputTokens:                 90_000,
      cacheReadInputTokens:        0,
      cacheCreationInputTokens:    0,
      outputTokens:                9_000,
      totalInputTokens:            90_000,
      endContextTokens:            3_000,
      oversizedContextTokens:      0,
      browserCallCount:            2,
      shellEditScriptCount:        0,
      verificationRunCount:        0,
      nestedInstructionCharacters: NESTED_INSTRUCTIONS.length,
      briefExcerpt:                'Rename the export button',
    }]);
  });

  test('an agent that shelled out its edits and checks counts them, and its oversized context as a raw token count', () => {
    const transcriptFolder = join(scratchDirectory, 'breach-transcripts');
    writeTranscript(join(transcriptFolder, 'session-breach', 'subagents'), 'delta', [
      JSON.stringify({ type: 'user', timestamp: '2026-09-19T12:00:00.000Z', message: { content: 'Rewrite the layout module' } }),
      JSON.stringify({
        type:    'assistant',
        message: {
          id:      'msg_one',
          model:   'claude-opus-5',
          content: [
            { type: 'tool_use', name: 'Bash', input: { command: 'cat <<EOF > lib/Thing.ts\nexport const thing = 1;\nEOF' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'sed -i \'\' s/one/two/ lib/Thing.ts' } },
            { type: 'tool_use', name: 'Bash', input: { command: 'bun test && bun run lint' } },
          ],
          usage: { input_tokens: 1_000, cache_read_input_tokens: OVERSIZED_CACHE_READ_TOKENS, output_tokens: 10 },
        },
      }),
    ].join('\n'));

    const [delta] = usagesIn(transcriptFolder).usages;

    expect(delta).toMatchObject({
      shellEditScriptCount:   2,
      verificationRunCount:   1,
      oversizedContextTokens: OVERSIZED_CACHE_READ_TOKENS + 1_000,
      totalInputTokens:       OVERSIZED_CACHE_READ_TOKENS + 1_000,
      briefExcerpt:           'Rewrite the layout module',
    });
  });
});

/** A workflow writes its agents under `subagents/workflows/<runId>/`, beside a journal and each agent's metadata; only the agents are costs. */
describe('a workflow run\'s subagents', () => {
  test('are read beside a plain subagent, and neither the journal nor the .meta.json beside an agent is read as one', () => {
    const transcriptFolder = join(scratchDirectory, 'mixed-transcripts');
    const subagentsFolder  = join(transcriptFolder, 'session-workflow', 'subagents');
    const runFolder        = join(subagentsFolder, 'workflows', 'run-example');
    writeTranscript(subagentsFolder, 'plain', transcriptTextFor(briefAgent('Brief for plain')));
    writeTranscript(runFolder, 'first', transcriptTextFor(briefAgent('Brief for first')));
    writeTranscript(runFolder, 'second', transcriptTextFor(briefAgent('Brief for second')));
    writeFileSync(join(runFolder, 'agent-first.meta.json'), '{"agentType":"general-purpose","description":"Example audit"}\n');
    writeFileSync(join(runFolder, 'journal.jsonl'), transcriptTextFor(briefAgent('Brief for journal')));

    const { usages } = usagesIn(transcriptFolder);

    expect(usages.map((usage) => usage.agentIdentifier).sort()).toEqual(['first', 'plain', 'second']);
    expect(usages.every((usage) => usage.sessionIdentifier === 'session-workflow')).toBe(true);
  });

  /** A workflow agent's first turn is the harness relaying the session user's words; the row must name the script's prompt instead. */
  test('a workflow agent\'s excerpt begins with the script\'s prompt, while a plain agent\'s is its brief', () => {
    const transcriptFolder = join(scratchDirectory, 'workflow-transcripts');
    const subagentsFolder  = join(transcriptFolder, 'session-workflow', 'subagents');
    const plainUserLine = (text: string): string => JSON.stringify({ type: 'user', timestamp: '2026-09-19T08:00:00.000Z', message: { role: 'user', content: text } });
    writeTranscript(join(subagentsFolder, 'workflows', 'run-example'), 'builder', `${[
      plainUserLine('[Workflow harness — user request] The harness relays, verbatim and indented below, the user request.\n  Yes'),
      plainUserLine('[Workflow harness — computed task] The task text below was computed at runtime. The computed task text follows:\n'
        + '  agent-progress ticket: 042\n  Worktree: /tmp/example   Branch: ticket-042\n  You build ticket #042 for the agent-progress dispatcher, alone.'),
      JSON.stringify({
        type:    'assistant',
        message: {
          id: 'msg_0', model: 'claude-opus-5', content: [], usage: { input_tokens: 100, output_tokens: 10 }
        }
      }),
    ].join('\n')}\n`);
    writeTranscript(subagentsFolder, 'plain', transcriptTextFor(briefAgent('Rename the export button')));

    const excerptsById = Object.fromEntries(usagesIn(transcriptFolder).usages.map((usage) => [usage.agentIdentifier, usage.briefExcerpt]));

    expect(excerptsById['builder']).toBe('agent-progress ticket: 042 Worktree: /tmp/example Branch: ticket-042 You build t');
    expect(excerptsById['plain']).toBe('Rename the export button');
  });
});

describe('without a folder in the request', () => {
  test('reads the project\'s folder under the home\'s .claude and answers it', () => {
    const homeDirectory    = join(scratchDirectory, 'home');
    const projectFolder    = transcriptFolderFor(join(scratchDirectory, 'repository'), join(homeDirectory, '.claude'));
    writeTranscript(join(projectFolder, 'session-home', 'subagents'), 'delta', transcriptTextFor(briefAgent('Read the home folder')));

    const answer = claudeCodeAdapterFor('linux').subagentUsagesOf(requestOf(null, homeDirectory));

    expect(answer.transcriptFolder).toBe(projectFolder);
    expect(answer.usages.map((usage) => usage.agentIdentifier)).toEqual(['delta']);
  });

  test('reads the project\'s folder under the config folder the adapter was given, as CLAUDE_CONFIG_DIR sets it', () => {
    const configFolder  = join(scratchDirectory, 'example-claude-config');
    const projectFolder = transcriptFolderFor(join(scratchDirectory, 'repository'), configFolder);
    writeTranscript(join(projectFolder, 'session-config', 'subagents'), 'epsilon', transcriptTextFor(briefAgent('Read the config folder')));

    const answer = claudeCodeAdapterFor('linux', (name) => (name === 'CLAUDE_CONFIG_DIR' ? configFolder : undefined)).subagentUsagesOf(requestOf(null));

    expect(answer.transcriptFolder).toBe(projectFolder);
    expect(answer.usages.map((usage) => usage.agentIdentifier)).toEqual(['epsilon']);
  });

  test('a project nobody ran an agent in answers its folder and no row', () => {
    const answer = claudeCodeAdapterFor('linux').subagentUsagesOf(requestOf(null));

    expect(answer.transcriptFolder).toBe(transcriptFolderFor(join(scratchDirectory, 'repository'), join(scratchDirectory, 'home', '.claude')));
    expect(answer.usages).toEqual([]);
  });
});
