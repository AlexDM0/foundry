/**
 * A launcher-port adapter whose session is the fake child `src/testing/fake-agent/FakeAgentChild.ts`: it plays a scripted list of
 * steps, printing recorded `claude` stream-json lines (`src/testing/fake-agent/RecordedClaudeLines.ts`), waiting for stdin lines, exiting
 * or crashing, so Overseer, Watcher and crash specs drive a session without a vendor. Its lines are read and written as the Claude
 * adapter's.
 */
import { join } from 'node:path';

import type { AgentAdapter }                                                          from '../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                                                       from '../lib/agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                                                    from '../lib/agent-launch/AgentLaunchRequest.ts';
import type { AgentQuestion }                                                         from '../lib/agent-launch/AgentSessionEvent.ts';
import { CLAUDE_CODE_CAPABILITIES, CLAUDE_CODE_SESSION_ENDINGS, CLAUDE_STREAM_LINES } from '../lib/claude-code/ClaudeStreamLines.ts';
import { recordedLineOf, recordedSessionOf }                                          from './fake-agent/RecordedClaudeLines.ts';

export type FakeAgentStep =
  /** A selector of a recorded line, printed filled with its values; `{{HEAD}}` becomes the working directory's HEAD commit. */
  | { readonly kind: 'print'; readonly line: string }
  /** Runs `/bin/sh -c <command>` in the working directory, as a session's tool call would. */
  | { readonly kind: 'shell'; readonly command: string }
  /** Waits for the next stdin line; a closed stdin ends the session at exit 0. */
  | { readonly kind: 'await-line' }
  | { readonly kind: 'exit'; readonly code: number }
  | { readonly kind: 'crash' };

export const FAKE_AGENT_CHILD_PATH = join(import.meta.dir, 'fake-agent', 'FakeAgentChild.ts');

const SCENARIO_FILE_NAME = 'fake-agent-scenario.json';

export function fakeStartedLineSelectorOf(sessionId: string): string {
  return JSON.stringify({ type: 'system', subtype: 'init', session_id: sessionId });
}

/** Each `fake…Line` is the recorded line it names, read from this OS's recording when it is called, and throws when there is none. */
export function fakeStartedLine(sessionId: string): string {
  return recordedLineOf(fakeStartedLineSelectorOf(sessionId));
}

export function fakeQuestionLine(requestId: string, questions: readonly AgentQuestion[]): string {
  const request = { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions } };
  return recordedLineOf(JSON.stringify({ type: 'control_request', request_id: requestId, request }));
}

export function fakeResultLine(structuredReport: unknown): string {
  return recordedLineOf(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, structured_output: structuredReport, permission_denials: []
  }));
}

/** The result the real `claude` printed for a turn whose request a rejected usage limit refused: an error, its subtype `success`. */
export function fakeRateLimitedResultLine(): string {
  const resultLine = recordedSessionOf('rate-limit-rejected').wire
    .filter((entry) => entry.from === 'stdout')
    .map((entry) => entry.line)
    .find((line) => (JSON.parse(line) as { type?: unknown }).type === 'result');
  if (resultLine === undefined) throw new Error('The recorded rate-limit-rejected session holds no result line.');
  return resultLine;
}

export const FAKE_HEAD_PLACEHOLDER = '{{HEAD}}';

/** A turn of text only, so the turn calls no tool. */
export function fakeAssistantTurnLine(messageId: string): string {
  return recordedLineOf(JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { id: messageId, content: [] } }));
}

export const FAKE_AGENT_VENDOR = 'fake-agent';

/**
 * What a session the Overseer launches under the fake-agent switch plays: it starts, reports nothing and exits. Its line stays a
 * selector, which the child fills from the recording, so loading this file reads no recording.
 */
export const DEFAULT_FAKE_AGENT_STEPS: readonly FakeAgentStep[] = Object.freeze([
  { kind: 'print', line: fakeStartedLineSelectorOf('fake-session') },
  { kind: 'exit', code: 0 },
]);

/** A session that starts and keeps working until its stdin closes, so a board shown with it has its agents running. */
export const WORKING_FAKE_AGENT_STEPS: readonly FakeAgentStep[] = Object.freeze([
  { kind: 'print', line: fakeStartedLineSelectorOf('fake-session') },
  { kind: 'await-line' },
]);

/** As many as `CLAUDE_CODE_MAX_RETRIES=2` gave the recorded outage session B of P23. */
const FAKE_NETWORK_OUTAGE_RETRIES = 2;

/**
 * A session that starts, sees its requests fail until its retries are spent, and ends its turn on the outage result P23 recorded; then it
 * waits, as a session does, until its stdin closes. Its retry lines need the recording's `network-outage` session.
 */
export const NETWORK_OUTAGE_FAKE_AGENT_STEPS: readonly FakeAgentStep[] = Object.freeze([
  { kind: 'print', line: fakeStartedLineSelectorOf('fake-session') },
  ...Array.from({ length: FAKE_NETWORK_OUTAGE_RETRIES }, (_unused, index) => ({
    kind: 'print',
    line: JSON.stringify({
      type: 'system', subtype: 'api_retry', attempt: index + 1, max_retries: FAKE_NETWORK_OUTAGE_RETRIES
    }),
  } as const)),
  {
    kind: 'print',
    line: JSON.stringify({
      type: 'result', subtype: 'success', is_error: true, api_error: 'connection_failed', api_error_status: null, terminal_reason: 'api_error'
    }),
  },
  { kind: 'await-line' },
]);

/** The move every fake brain turn answers: on Flint's own lists, as the Bridge's digest names them. */
export const FAKE_FLINT_BRAIN_ANSWER = Object.freeze({ intent: 'wave', emote: 'happy' });

/** Turns enough for a whole brain run, one ask per interval. */
const FAKE_FLINT_BRAIN_TURNS = 40;

function fakeFlintBrainTurnStepsOf(turn: number): FakeAgentStep[] {
  return [
    { kind: 'await-line' },
    ...turn === 1 ? [{ kind: 'print', line: fakeStartedLineSelectorOf('fake-flint-brain') } as const] : [],
    { kind: 'print', line: JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { id: `msg_fake_flint_brain_${turn}`, content: [] } }) },
    {
      kind: 'print',
      line: JSON.stringify({
        type: 'result', subtype: 'success', is_error: false, structured_output: FAKE_FLINT_BRAIN_ANSWER, permission_denials: []
      }),
    },
  ];
}

/**
 * What a session with no tool plays under the fake-agent switch, as Flint's brain is one: each line it takes is an ask, answered by one
 * model call and a result naming `FAKE_FLINT_BRAIN_ANSWER`, until its stdin closes.
 */
export const FLINT_BRAIN_FAKE_AGENT_STEPS: readonly FakeAgentStep[] = Object.freeze([
  ...Array.from({ length: FAKE_FLINT_BRAIN_TURNS }, (_unused, index) => fakeFlintBrainTurnStepsOf(index + 1)).flat(),
  { kind: 'await-line' },
]);

/** Plans a session's own steps from its launch request; `null` plays the adapter's steps. */
export type FakeSessionPlanner = (request: AgentLaunchRequest) => readonly FakeAgentStep[] | null;

const PLANS_NO_SESSION: FakeSessionPlanner = () => null;

export function fakeAgentAdapter(steps: readonly FakeAgentStep[] = DEFAULT_FAKE_AGENT_STEPS, sessionPlanner: FakeSessionPlanner = PLANS_NO_SESSION): AgentAdapter {
  return {
    vendor:                 FAKE_AGENT_VENDOR,
    capabilities:           CLAUDE_CODE_CAPABILITIES,
    sandboxDenyShape:       'path-rules',
    inheritedVariableNames: [],
    credentialPathsOf:      (homeDirectory) => [join(homeDirectory, '.ssh')],
    programPathOf:          () => ({ verdict: 'found', path: process.execPath }),
    planOf(request: AgentLaunchRequest): AgentLaunchPlan {
      const scenarioPath = join(request.jobFilesDirectory, SCENARIO_FILE_NAME);
      // Some specs hand a request with no profile, so its absence reads as a session with tools.
      const profile = request.profile as AgentLaunchRequest['profile'] | undefined;
      const sessionSteps = profile?.availableTools === 'none' ? FLINT_BRAIN_FAKE_AGENT_STEPS : sessionPlanner(request) ?? steps;
      return {
        argv:            [process.execPath, FAKE_AGENT_CHILD_PATH, scenarioPath],
        environment:     request.environment,
        files:           [{ path: scenarioPath, text: JSON.stringify(sessionSteps) }],
        standingReplies: [],
        // The fake prints Claude Code's lines, so a Talos of a scratch forge recognises their endings by Claude Code's own patterns.
        ...CLAUDE_CODE_SESSION_ENDINGS,
      };
    },
    sessionIdOf: (scope, jobId) => `fake-${scope}-${jobId}`,
    ...CLAUDE_STREAM_LINES,
  };
}
