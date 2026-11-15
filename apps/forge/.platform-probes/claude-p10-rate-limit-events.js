// P10: rate_limit_event at a rejected limit, against a local stand-in for the Messages API. It spends no quota: the
// session logs in with a dummy token and reaches only the stand-in.
import { observedSession } from './support/claude-session.js';
import { probe } from './support/probe.js';
import { scratchFolder } from './support/scratch.js';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const WEEK_RESET_DAYS = 3;
const PROBE_LOGIN_VALUE = 'platform-probe-dummy-value';

function unifiedHeadersOf(scenario) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fiveHourReset = String(nowSeconds + SECONDS_PER_HOUR);
  const sevenDayReset = String(nowSeconds + SECONDS_PER_DAY * WEEK_RESET_DAYS);
  const shared = {
    'anthropic-ratelimit-unified-reset': fiveHourReset,
    'anthropic-ratelimit-unified-representative-claim': 'five_hour',
    'anthropic-ratelimit-unified-5h-status': 'rejected',
    'anthropic-ratelimit-unified-5h-utilization': '1.0',
    'anthropic-ratelimit-unified-5h-reset': fiveHourReset,
    'anthropic-ratelimit-unified-7d-reset': sevenDayReset,
  };
  if (scenario === 'rejected') {
    return {
      ...shared,
      'anthropic-ratelimit-unified-status': 'rejected',
      'anthropic-ratelimit-unified-overage-status': 'rejected',
      'anthropic-ratelimit-unified-overage-disabled-reason': 'out_of_credits',
      'anthropic-ratelimit-unified-7d-status': 'allowed',
      'anthropic-ratelimit-unified-7d-utilization': '0.62',
    };
  }
  return {
    ...shared,
    'anthropic-ratelimit-unified-status': 'allowed',
    'anthropic-ratelimit-unified-overage-status': 'allowed',
    'anthropic-ratelimit-unified-overage-in-use': 'true',
    'anthropic-ratelimit-unified-7d-status': 'allowed_warning',
    'anthropic-ratelimit-unified-7d-utilization': '0.91',
  };
}

const STREAM_EVENTS = [
  ['message_start', { type: 'message_start', message: { id: 'msg_probe', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'PROBE-OK' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
  ['message_stop', { type: 'message_stop' }],
];

function messagesStandIn(scenario, requests) {
  return Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(`${request.method} ${path}`);
      if (!path.startsWith('/v1/messages')) return new Response('{}', { status: 404 });
      const headers = unifiedHeadersOf(scenario);
      if (scenario === 'rejected') {
        const body = JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Probe: usage limit reached' } });
        return new Response(body, { status: 429, headers: { ...headers, 'content-type': 'application/json' } });
      }
      const body = STREAM_EVENTS.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
      return new Response(body, { status: 200, headers: { ...headers, 'content-type': 'text/event-stream' } });
    },
  });
}

function environmentWithout(prefixes) {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !prefixes.some((prefix) => key.startsWith(prefix))));
}

async function sessionAgainstStandIn(scenario, loginVariable, wireScenario) {
  const requests = [];
  const standIn = messagesStandIn(scenario, requests);
  const session = await observedSession({
    cwd: scratchFolder(),
    wireScenario,
    environment: {
      ...environmentWithout(['CLAUDE', 'ANTHROPIC']),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${standIn.port}`,
      [loginVariable]: PROBE_LOGIN_VALUE,
    },
    prompts: ['Reply with the single word ok.'],
  });
  standIn.stop(true);
  return { requests, ...session };
}

await probe({
  unknown: 'claude-p10-rate-limit-events',
  needsClaudeProgram: true,
  observe: async () => ({
    topLevelRejected: await sessionAgainstStandIn('rejected', 'CLAUDE_CODE_OAUTH_TOKEN', 'rate-limit-rejected'),
    windowRejectedUnderOverage: await sessionAgainstStandIn('window-rejected', 'CLAUDE_CODE_OAUTH_TOKEN', 'rate-limit-window-rejected'),
    apiKeyLoginRejected: await sessionAgainstStandIn('rejected', 'ANTHROPIC_API_KEY'),
  }),
});
