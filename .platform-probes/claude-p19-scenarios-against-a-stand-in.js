// P19: the stream-json lines of the sessions `src/testing/fake-agent/` plays, against a local stand-in for the Messages
// API: a turn that asks a question and ends with a structured result, a resume, a user line written mid-turn, and a
// session killed mid-turn. The stand-in scripts only the model's replies; every line is the program's own. It spends no
// quota: the session logs in with a dummy token and reaches only the stand-in.
import { recordWire, resultCountOf, startSession, toolCallsOf, waitingCommandOf } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const PROBE_LOGIN_VALUE = 'platform-probe-dummy-value';
const COLOUR_SCHEMA = { type: 'object', properties: { colour: { type: 'string' } }, required: ['colour'] };
const QUESTION = { question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: 'Red.' }, { label: 'Blue', description: 'Blue.' }] };
const MID_TURN_TOOL_SECONDS = 5;
const CRASH_TOOL_SECONDS = 60;
const TOOL_RUNNING_MILLISECONDS = 1000;
const TURN_WAIT_MILLISECONDS = 60_000;
const PROMPTS = {
  ask: 'SCENARIO-ASK: ask which colour, then return it.',
  remember: 'SCENARIO-REMEMBER: remember the word cobalt.',
  recall: 'SCENARIO-RECALL: return the word you were asked to remember.',
  midTurn: 'SCENARIO-MID-TURN: run the waiting command.',
  midTurnLine: 'SCENARIO-MID-TURN-LINE: also reply with the word SECOND.',
  crash: 'SCENARIO-CRASH: run the long waiting command.',
};

function textOf(content) {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).map((block) => block.text ?? (typeof block.content === 'string' ? block.content : '')).join('\n');
}

function toolResultCountOf(messages) {
  return messages.flatMap((message) => (Array.isArray(message.content) ? message.content : [])).filter((block) => block.type === 'tool_result').length;
}

const textReply = (text) => ({ stopReason: 'end_turn', block: { type: 'text', text } });
const toolReply = (name, input) => ({ stopReason: 'tool_use', block: { type: 'tool_use', id: `toolu_probe_${crypto.randomUUID().slice(0, 8)}`, name, input } });

/** The model's next reply in each scenario, from the first prompt of the conversation and how many tool results it holds. */
function replyOf(body) {
  const messages = body.messages ?? [];
  const toolNames = (body.tools ?? []).map((tool) => tool.name);
  if (toolNames.length === 0) return textReply('ok');
  const conversation = messages.map((message) => textOf(message.content)).join('\n');
  const toolResults = toolResultCountOf(messages);
  const structuredOutputTool = toolNames.find((name) => name.includes('StructuredOutput'));
  if (conversation.includes('SCENARIO-ASK')) {
    if (toolResults === 0) return toolReply('AskUserQuestion', { questions: [QUESTION] });
    if (toolResults === 1 && structuredOutputTool !== undefined) return toolReply(structuredOutputTool, { colour: 'Blue' });
    return textReply('Blue');
  }
  if (conversation.includes('SCENARIO-RECALL')) return textReply('cobalt');
  if (conversation.includes('SCENARIO-MID-TURN')) {
    if (toolResults === 0) return toolReply('Bash', { command: waitingCommandOf(MID_TURN_TOOL_SECONDS), description: 'Wait' });
    return textReply(conversation.includes('SCENARIO-MID-TURN-LINE') ? 'FIRST SECOND' : 'FIRST');
  }
  if (conversation.includes('SCENARIO-CRASH')) return toolReply('Bash', { command: waitingCommandOf(CRASH_TOOL_SECONDS), description: 'Wait' });
  return textReply('ok');
}

function streamEventsOf(model, { stopReason, block }) {
  const startedBlock = block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} };
  const delta = block.type === 'text' ? { type: 'text_delta', text: block.text } : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) };
  return [
    ['message_start', { type: 'message_start', message: { id: `msg_probe_${crypto.randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: startedBlock }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
}

function messagesStandIn(requests) {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(`${request.method} ${path}`);
      if (!path.startsWith('/v1/messages') || path.includes('count_tokens')) return new Response('{}', { status: 404 });
      const body = await request.json();
      const events = streamEventsOf(body.model ?? 'claude-haiku', replyOf(body));
      return new Response(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    },
  });
}

function environmentWithout(prefixes) {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix))));
}

function answerOfQuestion(line) {
  if (line.request.tool_name !== 'AskUserQuestion') return null;
  const { input } = line.request;
  const answers = Object.fromEntries((input.questions ?? []).map((question) => [question.question, question.options?.at(-1)?.label ?? 'Blue']));
  return JSON.stringify({
    type: 'control_response',
    response: { subtype: 'success', request_id: line.request_id, response: { behavior: 'allow', updatedInput: { ...input, answers } } },
  });
}

async function recordedSession(scenario, standIn, { extraArguments = [], cwd = scratchFolder(), drive }) {
  const session = startSession({
    cwd,
    environment: { ...environmentWithout(['CLAUDE', 'ANTHROPIC']), ANTHROPIC_BASE_URL: `http://127.0.0.1:${standIn.port}`, CLAUDE_CODE_OAUTH_TOKEN: PROBE_LOGIN_VALUE },
    extraArguments: ['--setting-sources', 'project', '--permission-prompt-tool', 'stdio', '--allowedTools', 'Bash', ...extraArguments],
    answerControlRequest: answerOfQuestion,
  });
  await drive(session);
  session.closeInput();
  const ending = await session.finish();
  recordWire(scenario, session.wire, ending);
  return { ...ending, lineTypes: session.lines.map((line) => (line.subtype === undefined ? line.type : `${line.type}/${line.subtype}`)) };
}

const oneTurn = (prompt) => async (session) => {
  session.writeUserLine(prompt);
  await session.waitUntil((lines) => resultCountOf(lines) > 0, TURN_WAIT_MILLISECONDS);
};

const bashStarted = (lines) => toolCallsOf(lines).some((call) => call.name === 'Bash') || resultCountOf(lines) > 0;

await probe({
  unknown: 'claude-p19-scenarios-against-a-stand-in',
  needsClaudeProgram: true,
  observe: async () => {
    const requests = [];
    const standIn = messagesStandIn(requests);
    const resumedFolder = scratchFolder();
    const sessionId = crypto.randomUUID();
    try {
      return {
        turnThatEnds: await recordedSession('turn-that-ends', standIn, { extraArguments: ['--json-schema', JSON.stringify(COLOUR_SCHEMA)], drive: oneTurn(PROMPTS.ask) }),
        remembered: await recordedSession('resumed-earlier-session', standIn, { cwd: resumedFolder, extraArguments: ['--session-id', sessionId], drive: oneTurn(PROMPTS.remember) }),
        resume: await recordedSession('resume', standIn, { cwd: resumedFolder, extraArguments: ['--resume', sessionId], drive: oneTurn(PROMPTS.recall) }),
        midTurnLine: await recordedSession('mid-turn-line', standIn, {
          drive: async (session) => {
            session.writeUserLine(PROMPTS.midTurn);
            await session.waitUntil(bashStarted, TURN_WAIT_MILLISECONDS);
            session.writeUserLine(PROMPTS.midTurnLine);
            await session.waitUntil((lines) => resultCountOf(lines) > 0, TURN_WAIT_MILLISECONDS);
          },
        }),
        crash: await recordedSession('crash', standIn, {
          drive: async (session) => {
            session.writeUserLine(PROMPTS.crash);
            await session.waitUntil(bashStarted, TURN_WAIT_MILLISECONDS);
            await Bun.sleep(TOOL_RUNNING_MILLISECONDS);
            process.kill(session.pid, 'SIGKILL');
          },
        }),
        requests,
      };
    } finally {
      standIn.stop(true);
    }
  },
});
