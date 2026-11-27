/**
 * The fake agent, an adapter of the agent port as the Claude Code adapter is: its session, `src/testing/fake-agent/FakeAgentChild.ts`, plays
 * scripted steps of recorded `claude` stream-json lines, stdin waits, exits and crashes, so Hephaestus, Talos and crash specs drive a session
 * without a vendor. It replays that adapter's recorded wire, so it keeps its line mapping, capabilities and plan values.
 */
import { basename, join } from 'node:path';

import type { AgentAdapter }                                    from '../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                                 from '../lib/agent-launch/AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                              from '../lib/agent-launch/AgentLaunchRequest.ts';
import type { AgentQuestion }                                   from '../lib/agent-launch/AgentSessionEvent.ts';
import type { SubagentFacts, SubagentUsage }                    from '../lib/agent-launch/AgentTranscripts.ts';
import { claudeSessionWritablePathsOf }                         from '../lib/claude-code/ClaudeCodeAdapter.ts';
import { CLAUDE_CODE_INSTALLER }                                from '../lib/claude-code/ClaudeCodeInstaller.ts';
import { claudeConfigFolderOf }                                 from '../lib/claude-code/ClaudeConfigFolder.ts';
import { CLAUDE_CODE_BILLING_OPTIONS, CLAUDE_CODE_CREDENTIALS } from '../lib/claude-code/ClaudeCredentials.ts';
import { ClaudeHookInput }                                      from '../lib/claude-code/ClaudeHookInput.ts';
import { claudeProgramRepairOf }                                from '../lib/claude-code/ClaudeProgramRepair.ts';
import {
  CLAUDE_CODE_CAPABILITIES,
  CLAUDE_CODE_SESSION_ENDINGS,
  CLAUDE_CODE_STANDING_REPLIES,
  CLAUDE_STREAM_LINES
} from '../lib/claude-code/ClaudeStreamLines.ts';
import { transcriptFolderFor }                                from '../lib/claude-code/ClaudeTranscripts.ts';
import { CLAUDE_CODE_ATTRIBUTION_PATTERNS }                   from '../lib/claude-code/constants/ClaudeCodeAttribution.ts';
import { CLAUDE_CODE_CONFIGURATION_NAMES }                    from '../lib/claude-code/constants/ClaudeCodePaths.ts';
import { CLAUDE_CODE_DISPLAY_NAME, CLAUDE_CODE_PROMPT_FILLS } from '../lib/claude-code/constants/ClaudeCodePromptFills.ts';
import { recordedLineOf, recordedSessionOf }                  from './fake-agent/RecordedClaudeLines.ts';

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

/** A permission request for a tool other than the question tool, as the recorded question request with that tool named. */
export function fakePermissionRequestLine(requestId: string): string {
  return recordedLineOf(JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash' } }));
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
 * What a session Hephaestus launches under the fake-agent switch plays: it starts, reports nothing and exits. Its line stays a
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

/** As many as `CLAUDE_CODE_MAX_RETRIES=2` gave the recorded outage session. */
const FAKE_NETWORK_OUTAGE_RETRIES = 2;

/**
 * A session that starts, sees its requests fail until its retries are spent, and ends its turn on the recorded outage result; then it
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

/** Plans a session's own steps from its launch request; `null` plays the adapter's steps. */
export type FakeSessionPlanner = (request: AgentLaunchRequest) => readonly FakeAgentStep[] | null;

const PLANS_NO_SESSION: FakeSessionPlanner = () => null;

/**
 * What a spec plants for the two transcript reads. The fake writes no transcript, so unplanted it answers none, as Claude Code answers on
 * the scratch home a fake runs in, and it never reads the vendor's folder whatever the environment names.
 */
export interface FakeAgentTranscripts {
  readonly sessionSubagents?: readonly SubagentFacts[];
  readonly subagentUsages?:   readonly SubagentUsage[];
}

export function fakeAgentAdapter(
  steps: readonly FakeAgentStep[] = DEFAULT_FAKE_AGENT_STEPS,
  sessionPlanner: FakeSessionPlanner = PLANS_NO_SESSION,
  plantedTranscripts: FakeAgentTranscripts = {},
): AgentAdapter {
  return {
    vendor:                 FAKE_AGENT_VENDOR,
    displayName:            CLAUDE_CODE_DISPLAY_NAME,
    capabilities:           CLAUDE_CODE_CAPABILITIES,
    credentials:            CLAUDE_CODE_CREDENTIALS,
    billingOptions:         CLAUDE_CODE_BILLING_OPTIONS,
    sandboxDenyShape:       'path-rules',
    inheritedVariableNames: [],
    configurationNames:     CLAUDE_CODE_CONFIGURATION_NAMES,
    attributionPatterns:    CLAUDE_CODE_ATTRIBUTION_PATTERNS,
    installer:              CLAUDE_CODE_INSTALLER,
    promptFills:            CLAUDE_CODE_PROMPT_FILLS,
    credentialPathsOf:      (homeDirectory) => [join(homeDirectory, '.ssh')],
    // The fake's program is the runtime, which prints its own version.
    programFileName:        basename(process.execPath),
    vendorProgramFolders:   [],
    versionArguments:       ['--version'],
    versionOf:              (versionOutput) => (versionOutput.trim() === '' ? null : versionOutput.trim()),
    programRepairOf:        claudeProgramRepairOf,
    planOf(request: AgentLaunchRequest): AgentLaunchPlan {
      const scenarioPath = join(request.jobFilesDirectory, SCENARIO_FILE_NAME);
      const sessionSteps = sessionPlanner(request) ?? steps;
      return {
        argv:            [process.execPath, FAKE_AGENT_CHILD_PATH, scenarioPath],
        environment:     request.environment,
        files:           [{ path: scenarioPath, text: JSON.stringify(sessionSteps) }],
        // The fake prints Claude Code's lines, so a Talos of a scratch forge answers and recognises them by Claude Code's own rules.
        standingReplies: CLAUDE_CODE_STANDING_REPLIES,
        ...CLAUDE_CODE_SESSION_ENDINGS,
      };
    },
    sessionIdOf:        (scope, jobId) => `fake-${scope}-${jobId}`,
    ...CLAUDE_STREAM_LINES,
    sessionSubagentsOf: (_homeDirectory, _sessionId, talliedParentToolUseIds) => (plantedTranscripts.sessionSubagents ?? [])
      .filter((subagent) => !talliedParentToolUseIds.has(subagent.parentToolUseId)),
    // The folder Claude Code names for the project on a home with no folder variable; the fake only names it and reads nothing there.
    subagentUsagesOf: (request) => ({
      transcriptFolder: request.transcriptFolder ?? transcriptFolderFor(request.projectRoot, claudeConfigFolderOf(request.homeDirectory, undefined)),
      usages:           plantedTranscripts.subagentUsages ?? [],
    }),
    toolCallOf:             ClaudeHookInput.toolCallOf,
    toolCallDenialLineOf:   ClaudeHookInput.toolCallDenialLineOf,
    sessionWritablePathsOf: (homeDirectory) => claudeSessionWritablePathsOf(homeDirectory, claudeConfigFolderOf(homeDirectory, undefined)),
  };
}
