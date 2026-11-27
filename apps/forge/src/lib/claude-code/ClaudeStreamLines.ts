/**
 * The stream-json lines Claude Code reads and writes once a session runs: the events read from its stdout and each line Talos sends its
 * stdin, and how its lines tell a turn's end and how the session ended, apart from the command line that starts it, so a scripted session
 * speaking the same lines needs no launch plan of Claude's.
 */
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentPicture,
  SentLine
}                                 from '../agent-launch/AgentAdapter.ts';
import type {
  AgentLaunchPlan,
  PlanEndingPattern,
  PlanLineConditions,
  StandingReply
} from '../agent-launch/AgentLaunchPlan.ts';
import type { AgentQuestion } from '../agent-launch/AgentSessionEvent.ts';
import {
  claudeStreamEventsOf,
  QUESTION_TOOL_NAME,
  RECOMMENDED_LABEL_MARK,
  unmarkedLabelOf
} from './ClaudeStreamMapper.ts';

const INTERRUPT_REQUEST_ID = 'interrupt';
/** How an answer to a question of several choices joins the chosen labels, as forge's decisions join them. */
const CHOSEN_LABELS_SEPARATOR = ', ';

type JsonObject = Readonly<Record<string, unknown>>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** With pictures the content is a list of base64 image blocks, then one text block; without pictures the content is the plain text. */
function chatLineOf(text: string, pictures: readonly AgentPicture[] = []): string {
  if (pictures.length === 0) return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
  const content = [
    ...pictures.map((picture) => ({ type: 'image', source: { type: 'base64', media_type: picture.mediaType, data: picture.base64Data } })),
    { type: 'text', text },
  ];
  return JSON.stringify({ type: 'user', message: { role: 'user', content } });
}

/** Each label of an answer, the whole answer first, so a label that holds the separator is still one label. */
function answerWithLabelsMapped(answer: string, multiSelect: boolean, labelOf: (label: string) => string | null): string {
  const wholeLabel = labelOf(answer);
  if (wholeLabel !== null) return wholeLabel;
  if (!multiSelect) return answer;
  return answer.split(CHOSEN_LABELS_SEPARATOR).map((chosenLabel) => labelOf(chosenLabel) ?? chosenLabel).join(CHOSEN_LABELS_SEPARATOR);
}

function markedQuestionOf(question: AgentQuestion): JsonObject {
  return {
    question:    question.question,
    header:      question.header,
    multiSelect: question.multiSelect,
    options:     question.options.map((option) => ({ label: option.isRecommended ? `${option.label}${RECOMMENDED_LABEL_MARK}` : option.label, description: option.description })),
  };
}

/**
 * The questions are echoed as the session asked them, its mark on the recommended option's label included, and an answer that names a
 * recommended option names it marked, so the session reads the labels it asked with.
 */
function answerLineOf(requestId: string, questions: readonly AgentQuestion[], answers: Readonly<Record<string, string>>): string {
  const markedAnswers = Object.fromEntries(Object.entries(answers).map(([questionText, answer]) => {
    const question = questions.find((candidate) => candidate.question === questionText);
    if (question === undefined) return [questionText, answer];
    const markedLabelOf = (label: string): string | null => (
      question.options.some((option) => option.isRecommended && option.label === label) ? `${label}${RECOMMENDED_LABEL_MARK}` : null
    );
    return [questionText, answerWithLabelsMapped(answer, question.multiSelect, markedLabelOf)];
  }));
  return JSON.stringify({
    type:     'control_response',
    response: { subtype: 'success', request_id: requestId, response: { behavior: 'allow', updatedInput: { questions: questions.map(markedQuestionOf), answers: markedAnswers } } },
  });
}

function interruptLineOf(): string {
  return JSON.stringify({ type: 'control_request', request_id: INTERRUPT_REQUEST_ID, request: { subtype: 'interrupt' } });
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

function pictureOfBlock(block: JsonObject): AgentPicture | null {
  const source = objectAt(block, 'source');
  if (block['type'] !== 'image' || source?.['type'] !== 'base64' || typeof source['media_type'] !== 'string' || typeof source['data'] !== 'string') return null;
  return { mediaType: source['media_type'], base64Data: source['data'] };
}

/** The content list `chatLineOf` writes: image blocks, then one text block; any other list is no chat line of ours. */
function chatOfContent(content: unknown): Extract<SentLine, { act: 'chat' }> | null {
  if (typeof content === 'string') return { act: 'chat', text: content, pictures: [] };
  if (!Array.isArray(content) || content.length === 0) return null;
  const blocks = content.filter(isJsonObject);
  const textBlock = blocks.at(-1);
  if (blocks.length !== content.length || textBlock?.['type'] !== 'text' || typeof textBlock['text'] !== 'string') return null;
  const pictures = blocks.slice(0, -1).map(pictureOfBlock);
  if (!pictures.every((picture) => picture !== null)) return null;
  return { act: 'chat', text: textBlock['text'], pictures };
}

function echoedQuestionsOf(updatedInput: JsonObject | null): JsonObject[] {
  const questions = updatedInput?.['questions'];
  return Array.isArray(questions) ? questions.filter(isJsonObject) : [];
}

/** The marked labels of the echoed question's recommended options, each with its label as asked unmarked. */
function unmarkedLabelsOf(question: JsonObject | undefined): ReadonlyMap<string, string> {
  const options = question?.['options'];
  const labels = Array.isArray(options) ? options.filter(isJsonObject).map((option) => option['label']).filter((label) => typeof label === 'string') : [];
  return new Map(labels.flatMap((markedLabel) => {
    const unmarked = unmarkedLabelOf(markedLabel);
    return unmarked.isRecommended ? [[markedLabel, unmarked.label] as const] : [];
  }));
}

/** The inverse of `answerLineOf`: each answer label that is a marked label of the echoed questions reads back unmarked. */
function unmarkedAnswersOf(answers: Readonly<Record<string, string>>, echoedQuestions: readonly JsonObject[]): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(answers).map(([questionText, answer]) => {
    const question = echoedQuestions.find((candidate) => candidate['question'] === questionText);
    const unmarkedLabels = unmarkedLabelsOf(question);
    return [questionText, answerWithLabelsMapped(answer, question?.['multiSelect'] === true, (label) => unmarkedLabels.get(label) ?? null)];
  }));
}

function sentLineOf(line: string): SentLine | null {
  const parsed = parsedLineOf(line);
  if (parsed === null) return null;
  const message = objectAt(parsed, 'message');
  if (parsed['type'] === 'user' && message?.['role'] === 'user') return chatOfContent(message['content']);
  const response     = objectAt(parsed, 'response');
  const updatedInput = objectAt(objectAt(response, 'response'), 'updatedInput');
  const answers      = textAnswersOf(objectAt(updatedInput, 'answers'));
  if (parsed['type'] === 'control_response' && response?.['subtype'] === 'success' && typeof response['request_id'] === 'string' && answers !== null) {
    return { act: 'answer', requestId: response['request_id'], answers: unmarkedAnswersOf(answers, echoedQuestionsOf(updatedInput)) };
  }
  if (parsed['type'] === 'control_request' && objectAt(parsed, 'request')?.['subtype'] === 'interrupt') return { act: 'interrupt' };
  return null;
}

export const CLAUDE_CODE_CAPABILITIES: AgentCapabilities = Object.freeze({
  chatTurns:                  true,
  questions:                  true,
  resume:                     true,
  reportChannel:              'schema',
  usage:                      'tokens',
  pictures:                   true,
  // A live session takes the answer as the `control_response` allow with `updatedInput.answers`, so it needs no stop and resume.
  takesLiveAnswers:           true,
  // `--resume` finds a session by the project folder it started in.
  resumeFindsSessionByFolder: true,
  // Its sandbox applies the profile's write roots, denies and network domains, rendered into the session's settings.
  ownConfinement:             'applies-the-profile',
});

/** A skill runs from a slash command that names it, its arguments after a space. */
function claudeInstructionBundleLineOf(bundleName: string, argumentsText: string): string {
  return `/${bundleName} ${argumentsText}`.trim();
}

type ClaudeStreamLineMembers = 'eventsOf' | 'chatLineOf' | 'answerLineOf' | 'interruptLineOf' | 'sentLineOf' | 'instructionBundleLineOf';

export const CLAUDE_STREAM_LINES: Pick<AgentAdapter, ClaudeStreamLineMembers> = Object.freeze({
  eventsOf:                claudeStreamEventsOf,
  chatLineOf,
  answerLineOf,
  interruptLineOf,
  sentLineOf,
  instructionBundleLineOf: claudeInstructionBundleLineOf,
});

/** Every turn of a stream-json session ends on one `result` line. */
const CLOSING_LINE: PlanLineConditions = { allOf: [{ test: 'equals', path: 'type', value: 'result' }], anyOf: [], noneOf: [] };

const SERVER_ERROR_STATUS_LEAST = 500;
const SERVER_ERROR_STATUS_MOST = 599;

/**
 * A session whose own retries ran out on an unreachable host or a provider overload (P23), told by the closing line's fields and at least
 * one `api_retry` line before it, never by its text. The overload's 5xx status is not recorded yet: it rests on the 429 result's shape.
 */
const NETWORK_OUTAGE_ENDING: PlanEndingPattern = {
  name:               'network-outage',
  closingLineMatches: {
    allOf: [
      { test: 'equals', path: 'type', value: 'result' },
      { test: 'equals', path: 'is_error', value: true },
      { test: 'equals', path: 'terminal_reason', value: 'api_error' },
    ],
    anyOf: [
      { test: 'equals', path: 'api_error', value: 'connection_failed' },
      {
        test: 'number-between', path: 'api_error_status', least: SERVER_ERROR_STATUS_LEAST, most: SERVER_ERROR_STATUS_MOST
      },
    ],
    noneOf: [],
  },
  countedLineMatches: {
    allOf:  [{ test: 'equals', path: 'type', value: 'system' }, { test: 'equals', path: 'subtype', value: 'api_retry' }],
    anyOf:  [],
    noneOf: [],
  },
  minimumCountedLines: 1,
};

const STANDING_DENIAL_MESSAGE = 'Permission requests are not answered for this session; work within the tools and paths already allowed.';

/** Every permission request but a question is denied while nobody watches; a question waits for the caller. */
export const CLAUDE_CODE_STANDING_REPLIES: readonly StandingReply[] = Object.freeze([{
  whenAllEqual:  { 'type': 'control_request', 'request.subtype': 'can_use_tool' },
  whenNoneEqual: { 'request.tool_name': QUESTION_TOOL_NAME },
  replyTemplate: JSON.stringify({
    type:     'control_response',
    response: { subtype: 'success', request_id: '{{request-identifier}}', response: { behavior: 'deny', message: STANDING_DENIAL_MESSAGE } },
  }),
  requestIdentifierPath: 'request_id',
}]);

/** How a Claude Code session's turn ends, how it ended, and how it is wound down: a closed stdin ends it once its turn is done. */
export const CLAUDE_CODE_SESSION_ENDINGS: Pick<AgentLaunchPlan, 'closingLine' | 'endingPatterns' | 'quitAtTurnEnd'> = {
  closingLine:    CLOSING_LINE,
  endingPatterns: [NETWORK_OUTAGE_ENDING],
  quitAtTurnEnd:  { act: 'close-input' },
};
