// P1: a question arrives as a control_request and a control_response answers it live, under a --json-schema session.
import { observedSession } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const COLOUR_SCHEMA = { type: 'object', properties: { colour: { type: 'string' } }, required: ['colour'] };

function answerOfQuestion(line) {
  if (line.request.tool_name !== 'AskUserQuestion') return null;
  const { input } = line.request;
  const answers = Object.fromEntries((input.questions ?? []).map((question) => [question.question, question.options?.at(-1)?.label ?? 'Blue']));
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: line.request_id, response: { behavior: 'allow', updatedInput: { ...input, answers } } },
  });
}

await probe({
  unknown: 'claude-p01-live-answer',
  needsClaudeProgram: true,
  observe: () => observedSession({
    cwd: scratchFolder(),
    extraArguments: ['--permission-mode', 'auto', '--permission-prompt-tool', 'stdio', '--json-schema', JSON.stringify(COLOUR_SCHEMA)],
    answerControlRequest: answerOfQuestion,
    prompts: ['Use the AskUserQuestion tool to ask the user to choose a colour, Red or Blue, then return the choice.'],
  }),
});
