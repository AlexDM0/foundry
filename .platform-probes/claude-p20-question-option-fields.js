// P20: an AskUserQuestion call whose options carry keys beside `label` and `description`: whether the call is refused,
// and which option keys the `can_use_tool` request still holds.
import { observedSession } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const EXTRA_OPTION_KEYS = ['touches', 'tradeOff', 'acceptanceEffect'];

const QUESTION_INPUT = {
  questions: [{
    question: 'Which storage should the cache use?',
    header: 'Storage',
    multiSelect: false,
    options: [
      { label: 'Memory', description: 'Keep the cache in memory.', touches: ['src/Cache.ts'], tradeOff: 'Fast, but lost on restart.', acceptanceEffect: 'A2 fails' },
      { label: 'Disk', description: 'Keep the cache in a file.', touches: ['src/Cache.ts', 'src/CacheFile.ts'], tradeOff: 'Survives a restart, but slower.', acceptanceEffect: 'A2 passes' },
    ],
  }],
};

const optionKeysOf = (input) => (input?.questions ?? []).map((question) => (question.options ?? []).map((option) => Object.keys(option)));

function answerOfQuestion(line) {
  if (line.request.tool_name !== 'AskUserQuestion') return null;
  const { input } = line.request;
  const answers = Object.fromEntries((input.questions ?? []).map((question) => [question.question, question.options?.at(-1)?.label ?? 'Disk']));
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: line.request_id, response: { behavior: 'allow', updatedInput: { ...input, answers } } },
  });
}

await probe({
  unknown: 'claude-p20-question-option-fields',
  needsClaudeProgram: true,
  observe: async () => {
    const session = await observedSession({
      cwd: scratchFolder(),
      extraArguments: ['--permission-mode', 'auto', '--permission-prompt-tool', 'stdio'],
      answerControlRequest: answerOfQuestion,
      prompts: [[
        'Call the AskUserQuestion tool exactly once, with exactly this JSON as its input, every key kept as written, including',
        `the option keys ${EXTRA_OPTION_KEYS.join(', ')}. Then reply with the label the user chose.`,
        JSON.stringify(QUESTION_INPUT),
      ].join('\n')],
    });
    const questionRequests = (session.controlRequests ?? []).filter((request) => request.tool_name === 'AskUserQuestion');
    return {
      extraOptionKeysAsked: EXTRA_OPTION_KEYS,
      optionKeysInControlRequests: questionRequests.map((request) => optionKeysOf(request.input)),
      ...session,
    };
  },
});
