/**
 * The stream-json lines Claude Code reads and writes once a session runs: the events read from its stdout and each line a Watcher sends its
 * stdin, apart from the command line that starts it, so a scripted session speaking the same lines needs no launch plan of Claude's.
 */
import type { AgentAdapter, AgentCapabilities, SentLine } from '../agent-launch/AgentAdapter.ts';
import type { AgentQuestion }                             from '../agent-launch/AgentSessionEvent.ts';
import { claudeStreamEventsOf }                           from './ClaudeStreamMapper.ts';

const INTERRUPT_REQUEST_ID = 'interrupt';

function chatLineOf(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

/** The tool's input is echoed whole beside the answers, as the session's own question carried it. */
function answerLineOf(requestId: string, questions: readonly AgentQuestion[], answers: Readonly<Record<string, string>>): string {
  return JSON.stringify({
    type:     'control_response',
    response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: { questions, answers } } },
  });
}

function interruptLineOf(): string {
  return JSON.stringify({ type: 'control_request', request_id: INTERRUPT_REQUEST_ID, request: { subtype: 'interrupt' } });
}

type JsonObject = Readonly<Record<string, unknown>>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectAt(value: unknown, key: string): JsonObject | null {
  if (!isJsonObject(value)) return null;
  const inner = value[key];
  return isJsonObject(inner) ? inner : null;
}

function textAnswersOf(value: JsonObject | null): Readonly<Record<string, string>> | null {
  if (value === null || !Object.values(value).every((answer) => typeof answer === 'string')) return null;
  return value as Readonly<Record<string, string>>;
}

function parsedLineOf(line: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sentLineOf(line: string): SentLine | null {
  const parsed = parsedLineOf(line);
  if (parsed === null) return null;
  const message = objectAt(parsed, 'message');
  if (parsed['type'] === 'user' && message?.['role'] === 'user' && typeof message['content'] === 'string') return { act: 'chat', text: message['content'] };
  const response = objectAt(parsed, 'response');
  const answers  = textAnswersOf(objectAt(objectAt(objectAt(response, 'response'), 'updatedInput'), 'answers'));
  if (parsed['type'] === 'control_response' && response?.['subtype'] === 'success' && typeof response['request_id'] === 'string' && answers !== null) {
    return { act: 'answer', requestId: response['request_id'], answers };
  }
  if (parsed['type'] === 'control_request' && objectAt(parsed, 'request')?.['subtype'] === 'interrupt') return { act: 'interrupt' };
  return null;
}

export const CLAUDE_CODE_CAPABILITIES: AgentCapabilities = Object.freeze({
  chatTurns: true, questions: true, resume: true, reportChannel: 'schema', usage: 'tokens'
});

export const CLAUDE_STREAM_LINES: Pick<AgentAdapter, 'eventsOf' | 'chatLineOf' | 'answerLineOf' | 'interruptLineOf' | 'sentLineOf'> = Object.freeze({
  eventsOf: claudeStreamEventsOf,
  chatLineOf,
  answerLineOf,
  interruptLineOf,
  sentLineOf,
});
