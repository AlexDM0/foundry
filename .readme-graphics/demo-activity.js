// Writes session activity into the demo's Watcher event logs, as Claude-shaped lines: the fake agent keeps working
// silently, so without this the Agents view shows only zeros and the Assistant and Intake chats stay blank. It runs only
// on the scratch tracker bridge-demo.sh passes it, after the Watchers wrote User's messages: a Watcher numbers its lines
// from its own count, so a line it wrote after these would take a number one of them holds.
// Builders get subagents (one done, the others running) and the builder of #008 asks a question; the product owner closes
// one turn and asks two questions in the next; the Assistant works on, with User's message still waiting for its turn.
// Usage: bun demo-activity.js <data folder>
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TURNS_BY_KIND = {
  assistant:       [{ text: 'No incident is open; reading the board for anything that waits on User.', tools: ['Bash', 'Read', 'Bash'] }],
  'product-owner': [
    { text: 'Reading the request, the sketch and the product pages it names.', tools: ['Read', 'Grep', 'Read'], answered: true, endsTurn: true },
    { text: 'A wish list needs an account to save it to, and the sketch puts a heart on every card.', tools: ['Read'] },
  ],
  build:           [
    { text: 'Reading the ticket and its Brief.', tools: ['Read', 'Bash', 'Bash'] },
    { text: 'The failing path is covered by a new test.', tools: ['Read', 'Bash', 'Bash'] },
    { text: 'Fix is in; running the suite.', tools: ['Read', 'Bash', 'Bash'] },
  ],
  review:          [
    { text: 'Starting from the Handoff.', tools: ['Read', 'Bash', 'Bash'] },
    { text: 'Every Acceptance item holds so far.', tools: ['Read', 'Bash', 'Bash'] },
  ],
};
// Subagents a builder spawned, by the ticket it builds: a done one has its spawning call answered.
const SUBAGENTS_BY_TICKET = {
  '001': [{ description: 'Find where the gift card is applied', tools: ['Grep', 'Read'], done: true }, { description: 'Run the checkout tests', tools: ['Bash'], done: false }],
  '004': [{ description: 'Find hard-coded colours on the account pages', tools: ['Grep', 'Grep', 'Read'], done: false }],
  '008': [{ description: 'Read how reset links are signed', tools: ['Read', 'Grep'], done: true }],
};
// What a job asks User after its turns, by the ticket it builds or the kind of session it is.
const QUESTIONS = {
  '008': [{
    question: 'How long should a password reset link stay valid?',
    header: 'Link lifetime',
    options: [{ label: '15 minutes', description: 'Short, as the security review asked.' }, { label: 'One hour', description: 'Kinder to slow mail.' }],
  }],
  'product-owner': [
    { question: 'Should guests get a wish list too?', header: 'Guests', options: [{ label: 'Account only', description: 'Guests are asked to sign in first.' }, { label: 'Guests too', description: 'Kept in the browser until they sign in.' }] },
    { question: 'Where does the heart go?', header: 'Placement', options: [{ label: 'On every product card', description: 'As in the sketch.' }, { label: 'On the product page only', description: 'Cards stay as they are.' }] },
  ],
};
const TOOL_INPUT_BY_NAME = {
  Read: { file_path: 'src/checkout/Basket.ts' },
  Grep: { pattern: 'giftCard', path: 'src' },
  Bash: { command: 'bun test' },
};
const INPUT_TOKENS_PER_TURN = 1800;
const OUTPUT_TOKENS_PER_TURN = 420;
const CACHED_TOKENS_PER_TURN = 21000;

const dataFolder = process.argv[2];
if (!dataFolder) throw new Error('usage: bun demo-activity.js <data folder>');
const launchById = new Map();
for (const line of readFileSync(join(dataFolder, 'log.jsonl'), 'utf8').split('\n')) {
  if (!line.includes('"job-launched"')) continue;
  const record = JSON.parse(line);
  launchById.set(record.jobId, record.fields);
}

function usage() {
  return { input_tokens: INPUT_TOKENS_PER_TURN, output_tokens: OUTPUT_TOKENS_PER_TURN, cache_creation_input_tokens: 0, cache_read_input_tokens: CACHED_TOKENS_PER_TURN };
}

function assistantLine(messageId, parentToolUseId, text, toolCalls) {
  const content = [...(text === '' ? [] : [{ type: 'text', text }]), ...toolCalls.map(({ id, name, input }) => ({ type: 'tool_use', id, name, input }))];
  return { type: 'assistant', parent_tool_use_id: parentToolUseId, message: { id: messageId, model: 'fake-model', content, usage: usage() } };
}

function toolResultLine(toolUseId, parentToolUseId) {
  return { type: 'user', parent_tool_use_id: parentToolUseId, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }] } };
}

function resultLine() {
  return { type: 'result', subtype: 'success', is_error: false, result: '', total_cost_usd: 0, usage: usage(), permission_denials: [] };
}

function questionLine(requestId, questions) {
  return { type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions }, tool_use_id: `${requestId}-tool` } };
}

/** The lines of one job, in the order the session would print them. */
function linesOf(jobId, launch) {
  const sessionKey = launch.kind === 'build' || launch.kind === 'review' ? launch.ticketIds[0] : launch.kind;
  const lines = [];
  (TURNS_BY_KIND[launch.kind] ?? []).forEach(({ text, tools, answered = false, endsTurn = false }, turn) => {
    const toolCalls = tools.map((name, i) => ({ id: `${jobId}-${turn}-${i}`, name, input: TOOL_INPUT_BY_NAME[name] }));
    lines.push(assistantLine(`${jobId}-${turn}`, null, text, toolCalls));
    if (answered) for (const { id } of toolCalls) lines.push(toolResultLine(id, null));
    if (endsTurn) lines.push(resultLine());
  });
  (SUBAGENTS_BY_TICKET[sessionKey] ?? []).forEach(({ description, tools, done }, subagent) => {
    const spawningCallId = `${jobId}-agent-${subagent}`;
    lines.push(assistantLine(`${jobId}-spawn-${subagent}`, null, '', [{ id: spawningCallId, name: 'Agent', input: { description } }]));
    tools.forEach((name, i) => {
      lines.push(assistantLine(`${spawningCallId}-${i}`, spawningCallId, '', [{ id: `${spawningCallId}-call-${i}`, name, input: TOOL_INPUT_BY_NAME[name] }]));
    });
    if (done) lines.push(toolResultLine(spawningCallId, null));
  });
  const questions = QUESTIONS[sessionKey];
  if (questions !== undefined) lines.push(questionLine(`${jobId}-question`, questions));
  return lines;
}

for (const jobId of readdirSync(join(dataFolder, 'jobs'))) {
  const eventLogPath = join(dataFolder, 'jobs', jobId, 'events-1.ndjson');
  const launch = launchById.get(jobId);
  if (launch === undefined || !existsSync(eventLogPath)) continue;
  const loggedSequences = readFileSync(eventLogPath, 'utf8').trim().split('\n').map((logged) => JSON.parse(logged).sequence);
  let sequence = Math.max(...loggedSequences) + 1;
  for (const line of linesOf(jobId, launch)) {
    appendFileSync(eventLogPath, `${JSON.stringify({ sequence, origin: 'agent', line: JSON.stringify(line), at: new Date().toISOString() })}\n`);
    sequence += 1;
  }
}
