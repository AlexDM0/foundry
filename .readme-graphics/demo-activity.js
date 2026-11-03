// Writes a little session activity into the demo's Watcher event logs, as Claude-shaped assistant lines: the fake agent
// keeps working silently, so without this the Agents view shows only zeros and the Assistant and Intake transcripts stay
// blank. It runs only on the scratch tracker bridge-demo.sh passes it.
// Usage: bun demo-activity.js <data folder>
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LINES_BY_KIND = {
  assistant:       ['No incident is open: the board needs nothing from me now.'],
  'product-owner': ['A wish list needs an account to save it to. Should guests get one too?'],
  build:           ['Reading the ticket and its Brief.', 'The failing path is covered by a new test.', 'Fix is in; running the suite.'],
  review:          ['Starting from the Handoff.', 'Every Acceptance item holds so far.'],
};
const TOOL_CALLS_PER_TURN = 3;
const TOOL_INPUT = { description: 'Read the ticket' };
const INPUT_TOKENS_PER_TURN = 1800;
const OUTPUT_TOKENS_PER_TURN = 420;
const CACHED_TOKENS_PER_TURN = 21000;

const dataFolder = process.argv[2];
if (!dataFolder) throw new Error('usage: bun demo-activity.js <data folder>');
const kindByJobId = new Map();
for (const line of readFileSync(join(dataFolder, 'log.jsonl'), 'utf8').split('\n')) {
  if (!line.includes('"job-launched"')) continue;
  const record = JSON.parse(line);
  kindByJobId.set(record.jobId, record.fields.kind);
}

function assistantLine(jobId, turn, text) {
  const content = [{ type: 'text', text }];
  for (let i = 0; i < TOOL_CALLS_PER_TURN; i += 1) {
    content.push({ type: 'tool_use', id: `${jobId}-${turn}-${i}`, name: i === 0 ? 'Read' : 'Bash', input: TOOL_INPUT });
  }
  return JSON.stringify({
    type: 'assistant',
    parent_tool_use_id: null,
    message: {
      id: `${jobId}-${turn}`,
      model: 'fake-model',
      content,
      usage: {
        input_tokens: INPUT_TOKENS_PER_TURN,
        output_tokens: OUTPUT_TOKENS_PER_TURN,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: CACHED_TOKENS_PER_TURN,
      },
    },
  });
}

for (const jobId of readdirSync(join(dataFolder, 'jobs'))) {
  const eventLogPath = join(dataFolder, 'jobs', jobId, 'events-1.ndjson');
  const lines = LINES_BY_KIND[kindByJobId.get(jobId)];
  if (!lines || !existsSync(eventLogPath)) continue;
  let sequence = readFileSync(eventLogPath, 'utf8').trim().split('\n').length;
  lines.forEach((text, turn) => {
    sequence += 1;
    const entry = { sequence, origin: 'agent', line: assistantLine(jobId, turn, text), at: new Date().toISOString() };
    appendFileSync(eventLogPath, `${JSON.stringify(entry)}\n`);
  });
}
