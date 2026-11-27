/**
 * Maps one stdout line of a `claude -p --output-format stream-json` session to the launcher port's events. A line that is not JSON, or a
 * record the launcher port has no event for (hooks, summaries, thinking estimates), maps to none.
 */
import type {
  AgentQuestion,
  AgentQuestionOption,
  AgentResultFailure,
  AgentSessionEvent,
  AgentTurnUsage,
  AgentUsageTotals
} from '../agent-launch/AgentSessionEvent.ts';

type StreamRecord = Readonly<Record<string, unknown>>;

const INPUT_SUMMARY_CHARACTERS = 200;
const MILLISECONDS_PER_SECOND = 1000;
export const QUESTION_TOOL_NAME = 'AskUserQuestion';
/** The mark an asking session writes after the label of the option it recommends, as `answerLineOf` writes it back. */
export const RECOMMENDED_LABEL_MARK = ' (Recommended)';
const RECOMMENDED_LABEL_MARK_PATTERN = /\s*\(Recommended\)\s*$/u;
/** The windows of the plan whose length is known; any other window's length is `null`. */
const USAGE_WINDOW_LENGTH_HOURS: Readonly<Record<string, number>> = { five_hour: 5, seven_day: 168 };
/** The `subtype` of the result a session stopped at `--max-budget-usd` prints. */
const BUDGET_STOP_SUBTYPE = 'error_max_budget_usd';
const RATE_LIMITED_STATUS = 429;
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const AUTHENTICATION_REFUSED_STATUSES: readonly number[] = [UNAUTHORIZED_STATUS, FORBIDDEN_STATUS];

function isRecord(value: unknown): value is StreamRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldOf(record: StreamRecord | null, key: string): unknown {
  return record !== null && Object.hasOwn(record, key) ? record[key] : undefined;
}

function recordAt(record: StreamRecord | null, key: string): StreamRecord | null {
  const value = fieldOf(record, key);
  return isRecord(value) ? value : null;
}

function stringAt(record: StreamRecord | null, key: string): string {
  const value = fieldOf(record, key);
  return typeof value === 'string' ? value : '';
}

function nullableStringAt(record: StreamRecord | null, key: string): string | null {
  const value = fieldOf(record, key);
  return typeof value === 'string' ? value : null;
}

function numberAt(record: StreamRecord | null, key: string): number {
  const value = fieldOf(record, key);
  return typeof value === 'number' ? value : 0;
}

function nullableNumberAt(record: StreamRecord | null, key: string): number | null {
  const value = fieldOf(record, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function arrayAt(record: StreamRecord | null, key: string): readonly unknown[] {
  const value = fieldOf(record, key);
  return Array.isArray(value) ? value : [];
}

function recordsAt(record: StreamRecord | null, key: string): StreamRecord[] {
  return arrayAt(record, key).filter(isRecord);
}

function parsedRecordOf(line: string): StreamRecord | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function turnUsageOf(usage: StreamRecord | null): AgentTurnUsage | null {
  if (usage === null) return null;
  return {
    inputTokens:              numberAt(usage, 'input_tokens'),
    outputTokens:             numberAt(usage, 'output_tokens'),
    cacheCreationInputTokens: numberAt(usage, 'cache_creation_input_tokens'),
    cacheReadInputTokens:     numberAt(usage, 'cache_read_input_tokens'),
  };
}

function startedEventsOf(record: StreamRecord): AgentSessionEvent[] {
  if (stringAt(record, 'subtype') !== 'init') return [];
  return [{
    kind:          'started',
    sessionId:     stringAt(record, 'session_id'),
    vendorVersion: stringAt(record, 'claude_code_version'),
    model:         stringAt(record, 'model'),
    tools:         arrayAt(record, 'tools').filter((tool): tool is string => typeof tool === 'string'),
  }];
}

function inputSummaryOf(input: unknown): string {
  return (JSON.stringify(input) ?? '').slice(0, INPUT_SUMMARY_CHARACTERS);
}

function assistantEventsOf(record: StreamRecord): AgentSessionEvent[] {
  const message = recordAt(record, 'message');
  const parentToolUseId = nullableStringAt(record, 'parent_tool_use_id');
  const contents = recordsAt(message, 'content');
  const turn: AgentSessionEvent = {
    kind:      'assistant-turn',
    messageId: stringAt(message, 'id'),
    parentToolUseId,
    model:     stringAt(message, 'model'),
    usage:     turnUsageOf(recordAt(message, 'usage')),
    text:      contents.filter((content) => stringAt(content, 'type') === 'text').map((content) => stringAt(content, 'text')).join('\n'),
  };
  const toolCalls = contents
    .filter((content) => stringAt(content, 'type') === 'tool_use')
    .map((content): AgentSessionEvent => ({
      kind:         'tool-call',
      toolUseId:    stringAt(content, 'id'),
      toolName:     stringAt(content, 'name'),
      inputSummary: inputSummaryOf(fieldOf(content, 'input')),
      description:  nullableStringAt(recordAt(content, 'input'), 'description'),
      parentToolUseId,
      asksUser:     stringAt(content, 'name') === QUESTION_TOOL_NAME,
    }));
  return [turn, ...toolCalls];
}

function toolResultEventsOf(record: StreamRecord): AgentSessionEvent[] {
  const parentToolUseId = nullableStringAt(record, 'parent_tool_use_id');
  return recordsAt(recordAt(record, 'message'), 'content')
    .filter((content) => stringAt(content, 'type') === 'tool_result')
    .map((content): AgentSessionEvent => ({
      kind: 'tool-result', toolUseId: stringAt(content, 'tool_use_id'), parentToolUseId, isError: fieldOf(content, 'is_error') === true
    }));
}

/** A mark only at the label's end counts: one inside the label is the agent's words. */
export function unmarkedLabelOf(markedLabel: string): { label: string; isRecommended: boolean } {
  const isRecommended = RECOMMENDED_LABEL_MARK_PATTERN.test(markedLabel);
  return { label: isRecommended ? markedLabel.replace(RECOMMENDED_LABEL_MARK_PATTERN, '') : markedLabel, isRecommended };
}

function questionOptionOf(option: StreamRecord): AgentQuestionOption {
  const askedLabel               = stringAt(option, 'label');
  const { label, isRecommended } = unmarkedLabelOf(askedLabel);
  const description              = stringAt(option, 'description');
  return {
    label, description, isRecommended, ...(isRecommended ? { askedLabel } : {})
  };
}

function questionOf(question: StreamRecord): AgentQuestion {
  return {
    question:    stringAt(question, 'question'),
    header:      stringAt(question, 'header'),
    multiSelect: fieldOf(question, 'multiSelect') === true,
    options:     recordsAt(question, 'options').map(questionOptionOf),
  };
}

function usageWindowLengthHoursOf(window: string): number | null {
  return Object.hasOwn(USAGE_WINDOW_LENGTH_HOURS, window) ? USAGE_WINDOW_LENGTH_HOURS[window] ?? null : null;
}

/** Only a question surfaces: every other permission request is answered by the plan's standing reply and counted at the result. */
function controlRequestEventsOf(record: StreamRecord): AgentSessionEvent[] {
  const request = recordAt(record, 'request');
  if (stringAt(request, 'subtype') !== 'can_use_tool' || stringAt(request, 'tool_name') !== QUESTION_TOOL_NAME) return [];
  return [{ kind: 'question', requestId: stringAt(record, 'request_id'), questions: recordsAt(recordAt(request, 'input'), 'questions').map(questionOf) }];
}

/** `null` for a reset that is missing, not a positive number, or past what a date holds: never epoch 0, which would hold nothing. */
function resetStampOf(record: StreamRecord | null): string | null {
  const epochSeconds = nullableNumberAt(record, 'resetsAt');
  if (epochSeconds === null || epochSeconds <= 0) return null;
  const reset = new Date(epochSeconds * MILLISECONDS_PER_SECOND);
  return Number.isNaN(reset.getTime()) ? null : reset.toISOString();
}

/** A window `unifiedWindows` lacks but `rateLimitType` names is read from the top-level fields, as an event without the list carries it. */
function namedWindowEventOf(information: StreamRecord, window: string, requestsRefused: boolean): AgentSessionEvent {
  return {
    kind:        'usage-window',
    window,
    lengthHours: usageWindowLengthHoursOf(window),
    utilization: numberAt(information, 'utilization'),
    resetsAt:    resetStampOf(information),
    status:      stringAt(information, 'status'),
    requestsRefused,
  };
}

/**
 * One event per window the event reports. Only the top-level status refuses requests, and only on the window `rateLimitType` names: a
 * rejected window under allowed overage stays a warning.
 */
function usageWindowEventsOf(record: StreamRecord): AgentSessionEvent[] {
  const information = recordAt(record, 'rate_limit_info');
  if (information === null) return [];
  const namedWindow = stringAt(information, 'rateLimitType');
  const topLevelRefuses = stringAt(information, 'status') === 'rejected';
  const unifiedWindows = recordAt(information, 'unifiedWindows') ?? {};
  const listedEvents = Object.entries(unifiedWindows)
    .filter((entry): entry is [string, StreamRecord] => isRecord(entry[1]))
    .map(([window, windowInformation]): AgentSessionEvent => ({
      kind:            'usage-window',
      window,
      lengthHours:     usageWindowLengthHoursOf(window),
      utilization:     numberAt(windowInformation, 'utilization'),
      resetsAt:        resetStampOf(windowInformation),
      status:          stringAt(windowInformation, 'status'),
      requestsRefused: topLevelRefuses && window === namedWindow,
    }));
  const namedWindowIsListed = listedEvents.some((event) => event.kind === 'usage-window' && event.window === namedWindow);
  const namedWindowIsMissing = !namedWindowIsListed && (namedWindow !== '' || topLevelRefuses);
  return namedWindowIsMissing ? [...listedEvents, namedWindowEventOf(information, namedWindow, topLevelRefuses)] : listedEvents;
}

function usageTotalsOf(modelUsage: StreamRecord | null): AgentUsageTotals | null {
  if (modelUsage === null) return null;
  const byModel: Record<string, AgentTurnUsage> = {};
  for (const [model, usage] of Object.entries(modelUsage)) {
    if (!isRecord(usage)) continue;
    byModel[model] = {
      inputTokens:              numberAt(usage, 'inputTokens'),
      outputTokens:             numberAt(usage, 'outputTokens'),
      cacheCreationInputTokens: numberAt(usage, 'cacheCreationInputTokens'),
      cacheReadInputTokens:     numberAt(usage, 'cacheReadInputTokens'),
    };
  }
  return { byModel };
}

/** The context the last API call of the turn read: its input, cache creation and cache read tokens. */
function contextTokensOf(usage: StreamRecord | null): number | null {
  const lastIteration = recordsAt(usage, 'iterations').at(-1);
  if (lastIteration === undefined) return null;
  return numberAt(lastIteration, 'input_tokens') + numberAt(lastIteration, 'cache_creation_input_tokens') + numberAt(lastIteration, 'cache_read_input_tokens');
}

/** An `is_error` result with `api_error_status` 429 is the limit whatever its `subtype`; a refused key answers 401 or 403. */
function failureOf(record: StreamRecord, isError: boolean): AgentResultFailure | null {
  const httpStatus = nullableNumberAt(record, 'api_error_status');
  const text = stringAt(record, 'result');
  if (stringAt(record, 'subtype') === BUDGET_STOP_SUBTYPE) return { kind: 'budget-reached', httpStatus, text };
  if (!isError || httpStatus === null) return null;
  if (httpStatus === RATE_LIMITED_STATUS) return { kind: 'rate-limited', httpStatus, text };
  return AUTHENTICATION_REFUSED_STATUSES.includes(httpStatus) ? { kind: 'authentication-failed', httpStatus, text } : null;
}

function resultEventsOf(record: StreamRecord): AgentSessionEvent[] {
  const denials = recordsAt(record, 'permission_denials')
    .map((denial): AgentSessionEvent => ({ kind: 'permission-denied', toolName: stringAt(denial, 'tool_name') }));
  const structuredOutput = fieldOf(record, 'structured_output');
  const isError = fieldOf(record, 'is_error') === true || stringAt(record, 'subtype') !== 'success';
  return [...denials, {
    kind:             'result',
    isError,
    structuredReport: structuredOutput ?? null,
    usageTotals:      usageTotalsOf(recordAt(record, 'modelUsage')),
    contextTokens:    contextTokensOf(recordAt(record, 'usage')),
    costUsd:          nullableNumberAt(record, 'total_cost_usd'),
    failure:          failureOf(record, isError),
  }];
}

const EVENTS_OF_RECORD_TYPE: Readonly<Record<string, (record: StreamRecord) => AgentSessionEvent[]>> = {
  system:           startedEventsOf,
  assistant:        assistantEventsOf,
  user:             toolResultEventsOf,
  control_request:  controlRequestEventsOf,
  rate_limit_event: usageWindowEventsOf,
  result:           resultEventsOf,
};

export function claudeStreamEventsOf(line: string): readonly AgentSessionEvent[] {
  const record = parsedRecordOf(line);
  const type = stringAt(record, 'type');
  if (record === null || !Object.hasOwn(EVENTS_OF_RECORD_TYPE, type)) return [];
  return EVENTS_OF_RECORD_TYPE[type]?.(record) ?? [];
}
