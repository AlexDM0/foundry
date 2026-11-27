/**
 * A session's subagent transcripts tallied as the live facts tally the event log: a call repeated across a turn's lines counts once, a
 * half-written last line costs nothing, a subagent is keyed by its `.meta.json` parent call or else its agent id, and only this session's
 * transcripts are read, a workflow run's among them.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join }                                from 'node:path';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { claudeCodeAdapterFor }                           from './ClaudeCodeAdapter.ts';
import { ClaudeSessionSubagents }                         from './ClaudeSessionSubagents.ts';
import { transcriptFolderFor }                            from './ClaudeTranscripts.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

const WORKING_DIRECTORY = '/example/worktrees/ticket-1';

const NO_ACCESS_MODE = 0o000;

const SEARCH_ONLY_MODE = 0o100;

const OWNER_FULL_ACCESS_MODE = 0o700;

function transcriptLines(...lines: readonly object[]): string {
  return lines.map((line) => JSON.stringify(line)).join('\n');
}

function toolUseLine(messageId: string, toolUseId: string, toolName: string, timestamp: string): object {
  return { type: 'assistant', timestamp, message: { id: messageId, usage: { input_tokens: 7, output_tokens: 3 }, content: [{ type: 'tool_use', id: toolUseId, name: toolName }] } };
}

function toolResultLine(toolUseId: string): object {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: toolUseId }] } };
}

describe('ClaudeSessionSubagents.subagentFactsOfTranscript', () => {
  test('a call repeated across lines counts once, the newest call is the last, and it stops running when its result arrives', () => {
    const text = transcriptLines(
      toolUseLine('message-1', 'call-1', 'Read', '2026-10-29T13:00:01Z'),
      toolUseLine('message-1', 'call-1', 'Read', '2026-10-29T13:00:01Z'),
      toolResultLine('call-1'),
      toolUseLine('message-2', 'call-2', 'Bash', '2026-10-29T13:00:05Z'),
      toolResultLine('call-2'),
    );
    expect(ClaudeSessionSubagents.subagentFactsOfTranscript('parent-1', text, 'Example basket audit')).toEqual({
      parentToolUseId: 'parent-1',
      toolCalls:       2,
      lastToolCall:    { toolName: 'Bash', startedAt: '2026-10-29T13:00:05Z', running: false },
      tokens:          20,
      description:     'Example basket audit',
    });
  });

  test('a half-written last line and a transcript with no call read as what they hold', () => {
    const text = `${transcriptLines(toolUseLine('message-1', 'call-1', 'Read', '2026-10-29T13:00:01Z'))}\n{"type":"assis`;
    expect(ClaudeSessionSubagents.subagentFactsOfTranscript('parent-1', text, null).toolCalls).toBe(1);
    expect(ClaudeSessionSubagents.subagentFactsOfTranscript('parent-1', '', null)).toEqual({
      parentToolUseId: 'parent-1', toolCalls: 0, lastToolCall: null, tokens: 0, description: null
    });
  });
});

describe('ClaudeSessionSubagents.subagentFactsOf', () => {
  function sessionFolderUnderScratchConfigFolder(sessionId: string, workingDirectory = WORKING_DIRECTORY): { claudeConfigFolder: string; subagentsFolder: string } {
    const claudeConfigFolder = createScratchDirectory('claude-transcripts-config');
    scratchDirectories.push(claudeConfigFolder);
    return { claudeConfigFolder, subagentsFolder: join(transcriptFolderFor(workingDirectory, claudeConfigFolder), sessionId, 'subagents') };
  }

  function writeAgent(folder: string, agentId: string, parentToolUseId: string | null, description: string | null = null): void {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `agent-${agentId}.jsonl`), transcriptLines(toolUseLine(`${agentId}-message`, `${agentId}-call`, 'Grep', '2026-10-29T13:00:01Z')));
    const metadata = { ...parentToolUseId === null ? {} : { toolUseId: parentToolUseId }, ...description === null ? {} : { description } };
    if (Object.keys(metadata).length > 0) writeFileSync(join(folder, `agent-${agentId}.meta.json`), JSON.stringify(metadata));
  }

  test('reads this session\'s subagents and workflow agents, keyed by parent call or agent id, skipping the parent calls already tallied', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2');
    writeAgent(subagentsFolder, 'beta', null);
    writeAgent(subagentsFolder, 'gamma', 'call-4');
    writeAgent(join(subagentsFolder, 'workflows', 'run-1'), 'delta', 'call-5');
    writeAgent(join(subagentsFolder, '..', '..', 'session-2', 'subagents'), 'epsilon', 'call-6');
    const facts = ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set(['call-4']));
    expect(facts.map((subagent) => subagent.parentToolUseId)).toEqual(['call-2', 'beta', 'call-5']);
  });

  /** Both folders a scan would list refuse listing, so the session's own subagents still showing proves no other session was read. */
  test('reads only the job\'s own session folder, never listing the project folder or another session\'s', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2');
    const otherSessionSubagentsFolder = join(subagentsFolder, '..', '..', 'session-2', 'subagents');
    writeAgent(otherSessionSubagentsFolder, 'epsilon', 'call-6');
    const projectFolder = transcriptFolderFor(WORKING_DIRECTORY, claudeConfigFolder);
    chmodSync(otherSessionSubagentsFolder, NO_ACCESS_MODE);
    chmodSync(projectFolder, SEARCH_ONLY_MODE);
    try {
      const facts = ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set());
      expect(facts.map((subagent) => subagent.parentToolUseId)).toEqual(['call-2']);
    } finally {
      chmodSync(projectFolder, OWNER_FULL_ACCESS_MODE);
      chmodSync(otherSessionSubagentsFolder, OWNER_FULL_ACCESS_MODE);
    }
  });

  /** The harness names the project folder after the spelling the session started in, such as macOS's `/private/var` for `/var`. */
  test('finds the session by its id when the project folder holds another spelling of the working directory', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1', '/private/example/worktrees/ticket-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2');
    const facts = ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set());
    expect(facts.map((subagent) => subagent.parentToolUseId)).toEqual(['call-2']);
  });

  /** A resumed session that moved its working directory may leave one subagent in two project folders; it counts once. */
  test('a subagent found under two project folders of the session is listed once', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2');
    writeAgent(join(transcriptFolderFor('/example/sessions/J1', claudeConfigFolder), 'session-1', 'subagents'), 'alpha', 'call-2');
    const facts = ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set());
    expect(facts.map((subagent) => subagent.parentToolUseId)).toEqual(['call-2']);
  });

  test('a subagent reads its description from its .meta.json, and one whose .meta.json names none reads null', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2', 'Example checkout audit');
    writeAgent(subagentsFolder, 'beta', 'call-3');
    const facts = ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set());
    expect(facts.map((subagent) => [subagent.parentToolUseId, subagent.description])).toEqual([['call-2', 'Example checkout audit'], ['call-3', null]]);
  });

  test('the adapter answers them for a home through the config folder it was given, past the parent calls already tallied', () => {
    const { claudeConfigFolder, subagentsFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    writeAgent(subagentsFolder, 'alpha', 'call-2');
    writeAgent(subagentsFolder, 'beta', 'call-3');
    const adapter = claudeCodeAdapterFor('linux', (name) => (name === 'CLAUDE_CONFIG_DIR' ? claudeConfigFolder : undefined));
    const facts = adapter.sessionSubagentsOf('/example/home', 'session-1', new Set(['call-3']));
    expect(facts.map((subagent) => subagent.parentToolUseId)).toEqual(['call-2']);
  });

  test('a session that left no transcripts has no subagents', () => {
    const { claudeConfigFolder } = sessionFolderUnderScratchConfigFolder('session-1');
    expect(ClaudeSessionSubagents.subagentFactsOf(claudeConfigFolder, 'session-1', new Set())).toEqual([]);
  });
});
