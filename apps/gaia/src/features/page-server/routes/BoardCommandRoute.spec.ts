/**
 * The board command route over Example Storefront's recorded command answers. What matters: a command is sent as the forge's command of
 * its kind, with the token as its bearer, and an applied one answers its outcome; a forge's refusal answers the forge's code, fields and
 * sentence unchanged, a command naming one included (decision 45), and a held launch answers install-held under 423; an unknown kind, a
 * malformed body and a body over its bound reach no forge; a forge that cannot be reached before the command goes is unreachable, and
 * one that gives no answer after it went leaves the outcome unknown; and the token is in no answer.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { BoardCommandMapUtil }                                                           from '../../../adapters/forge-api/utils/BoardCommandMapUtil.ts';
import { EXAMPLE_BOARD_COMMAND_DOCUMENTS, exampleBoardCommandOf }                        from '../../../adapters/page-api/testing/ExampleBoardCommandDocuments.ts';
import { recordedBoardAnswersOf, recordedHephaestusFetch, type RecordedHephaestusFetch } from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                                     from '../../../testing/ScratchRoot.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  boardAnswering,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  relaySourcesOver,
  stoppedForgeAnswering,
  type ExampleRelayForgeOptions,
} from '../testing/ExampleRelayForge.ts';
import { boardCommandAnswerFor } from './BoardCommandRoute.ts';

const COMMANDS_CALL_SHAPE = 'POST /api/v3/commands with bearer';
const COMMAND_BODY_BOUND_BYTES = 65_536;
const TICKET_HOLD = EXAMPLE_BOARD_COMMAND_DOCUMENTS['ticket-hold'];

let scratchFolder = '';
let tokenPath = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('board-command-route');
  tokenPath     = exampleTokenFileIn(scratchFolder);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

function sourcesOver(hephaestusFetch: RecordedHephaestusFetch, options: ExampleRelayForgeOptions = {}) {
  return relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), hephaestusFetch);
}

function commandRequestOf(body: string): Request {
  const headers = { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(body).length) };
  return new Request('http://127.0.0.1:4790/api/v1/forges/example-storefront-7c41/commands', { method: 'POST', body, headers });
}

interface CommandExchange {
  readonly status:   number;
  readonly document: unknown;
}

interface RecordedRefusal {
  readonly refusal: string;
  readonly fields:  unknown;
  readonly text:    string;
}

async function exchangeOf(body: string, hephaestusFetch: RecordedHephaestusFetch, options: ExampleRelayForgeOptions = {}): Promise<CommandExchange> {
  const answer = await boardCommandAnswerFor(commandRequestOf(body), STOREFRONT_TRACKER_ID, sourcesOver(hephaestusFetch, options), COMMAND_BODY_BOUND_BYTES);
  return { status: answer.status, document: await answer.json() };
}

function recordedRefusalOf(situation: 'board-command-refused' | 'board-command-unknown-kind' | 'board-install-held'): RecordedRefusal {
  const answer = recordedBoardAnswersOf(situation).find(({ callShape }) => callShape === COMMANDS_CALL_SHAPE)?.answer;
  if (answer?.verdict !== 'answered') throw new Error(`The ${situation} situation holds no answered command.`);
  return JSON.parse(answer.bodyText) as RecordedRefusal;
}

describe('a board command the forge answers', () => {
  test('is sent as the forge\'s command of its kind, with the token as its bearer, and answers its applied outcome', async () => {
    const hephaestusFetch = boardAnswering('board-command-applied');
    expect(await exchangeOf(JSON.stringify(TICKET_HOLD), hephaestusFetch)).toEqual({
      status:   200,
      document: {
        boardCommandAnswerVersion: 1, outcome: 'applied', applied: { outcome: 'done', startedJobId: null }, refusal: null,
      },
    });
    const [call] = hephaestusFetch.callsAnswered();
    expect([call?.callShape, call?.bearerToken, JSON.parse(call?.jsonBody ?? 'null')])
      .toEqual([COMMANDS_CALL_SHAPE, EXAMPLE_FORGE_TOKEN, JSON.parse(JSON.stringify(BoardCommandMapUtil.contractCommandOf(exampleBoardCommandOf(TICKET_HOLD))))]);
  });

  test('answers the job an applied intake started', async () => {
    const intakeAnswers = boardAnswering('intake-conversation', (callShape) => callShape === COMMANDS_CALL_SHAPE);
    const intake = await exchangeOf(JSON.stringify(EXAMPLE_BOARD_COMMAND_DOCUMENTS['intake-start']), intakeAnswers);
    expect(intake.document).toMatchObject({ outcome: 'applied', applied: { outcome: 'done', startedJobId: 'J4' } });
  });

  test('answers a forge\'s refusal with its code, fields and sentence unchanged, a command named included, under 409', async () => {
    const recorded = recordedRefusalOf('board-command-refused');
    expect(recorded.text).toContain('`forge ticket list`');
    expect(await exchangeOf(JSON.stringify(TICKET_HOLD), boardAnswering('board-command-refused'))).toEqual({
      status:   409,
      document: {
        boardCommandAnswerVersion: 1,
        outcome:                   'refused',
        applied:                   null,
        refusal:                   {
          refusedBy: 'forge', code: recorded.refusal, fields: recorded.fields, text: recorded.text
        },
      },
    });
  });

  test('answers a command the forge does not know as the forge\'s refusal too', async () => {
    const recorded = recordedRefusalOf('board-command-unknown-kind');
    const exchange = await exchangeOf(JSON.stringify(TICKET_HOLD), boardAnswering('board-command-unknown-kind'));
    expect([exchange.status, exchange.document]).toEqual([409, expect.objectContaining({
      outcome: 'refused',
      refusal: {
        refusedBy: 'forge', code: 'malformed-body', fields: {}, text: recorded.text
      }
    })]);
  });

  test('answers a launch held for an install change as install-held under 423, with the forge\'s sentence', async () => {
    const recorded = recordedRefusalOf('board-install-held');
    const exchange = await exchangeOf(JSON.stringify(TICKET_HOLD), boardAnswering('board-install-held', (callShape) => callShape === COMMANDS_CALL_SHAPE));
    expect([exchange.status, exchange.document]).toEqual([423, {
      boardCommandAnswerVersion: 1,
      outcome:                   'install-held',
      applied:                   null,
      refusal:                   {
        refusedBy: 'forge', code: 'launches-held-by-install-change', fields: {}, text: recorded.text
      },
    }]);
  });
});

describe('a board command Gaia does not send', () => {
  test('is refused as unknown-kind for a kind the page contract does not name, and the forge is asked nothing', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const exchange = await exchangeOf(JSON.stringify({ boardCommandVersion: 1, kind: 'ticket-unready', ticketId: '001' }), hephaestusFetch);
    expect([exchange.status, exchange.document, hephaestusFetch.callsAnswered()]).toEqual([400, {
      boardCommandAnswerVersion: 1,
      outcome:                   'refused',
      applied:                   null,
      refusal:                   { refusedBy: 'gaia', code: 'unknown-kind', text: 'Gaia does not know this kind of command.' },
    }, []]);
  });

  test('is refused as malformed-body for a body that is no command, and the forge is asked nothing', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const bodies = ['not json', JSON.stringify({ ...TICKET_HOLD, ticketId: 7 }), JSON.stringify({ ...TICKET_HOLD, boardCommandVersion: 2 })];
    const exchanges = await Promise.all(bodies.map((body) => exchangeOf(body, hephaestusFetch)));
    expect(exchanges.map((exchange) => [exchange.status, (exchange.document as { readonly refusal: { readonly code: string } }).refusal.code]))
      .toEqual([[400, 'malformed-body'], [400, 'malformed-body'], [400, 'malformed-body']]);
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
  });

  test('is refused as too-large for a body over its bound, unread, and the forge is asked nothing', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const request = commandRequestOf(JSON.stringify({ ...TICKET_HOLD, reason: 'x'.repeat(COMMAND_BODY_BOUND_BYTES) }));
    const answer = await boardCommandAnswerFor(request, STOREFRONT_TRACKER_ID, sourcesOver(hephaestusFetch), COMMAND_BODY_BOUND_BYTES);
    expect([answer.status, ((await answer.json()) as { readonly refusal: { readonly code: string } }).refusal.code, request.bodyUsed]).toEqual([413, 'too-large', false]);
    expect(hephaestusFetch.callsAnswered()).toEqual([]);
  });
});

describe('a board command that reaches no answer', () => {
  test('is unreachable when the watch could not reach the forge, and is never sent', async () => {
    const hephaestusFetch = recordedHephaestusFetch([]);
    const exchange = await exchangeOf(JSON.stringify(TICKET_HOLD), hephaestusFetch, { fidelity: 'unreachable' });
    expect([exchange.status, exchange.document, hephaestusFetch.callsAnswered()]).toEqual([502, {
      boardCommandAnswerVersion: 1,
      outcome:                   'unreachable',
      applied:                   null,
      refusal:                   { refusedBy: 'gaia', code: 'forge-unreachable', text: 'This forge does not answer.' },
    }, []]);
  });

  test('leaves the outcome unknown when it was sent and Hephaestus gave no answer', async () => {
    const exchange = await exchangeOf(JSON.stringify(TICKET_HOLD), stoppedForgeAnswering([COMMANDS_CALL_SHAPE]));
    expect([exchange.status, exchange.document])
      .toEqual([502, expect.objectContaining({ outcome: 'outcome-unknown', refusal: expect.objectContaining({ code: 'forge-unreachable' }) })]);
  });

  test('is refused as token-unreadable or token-rejected, and the token is in no answer', async () => {
    const unreadable = await exchangeOf(JSON.stringify(TICKET_HOLD), recordedHephaestusFetch([]), { tokenPath: null });
    expect([unreadable.status, unreadable.document])
      .toEqual([502, expect.objectContaining({ outcome: 'refused', refusal: expect.objectContaining({ code: 'token-unreadable' }) })]);
    const tokenRefused = recordedHephaestusFetch(recordedBoardAnswersOf('board-token-rejected').map(({ answer }) => ({ callShape: COMMANDS_CALL_SHAPE, answer })).slice(0, 1));
    const rejected = await exchangeOf(JSON.stringify(TICKET_HOLD), tokenRefused);
    expect([rejected.status, rejected.document]).toEqual([502, expect.objectContaining({ outcome: 'refused', refusal: expect.objectContaining({ code: 'token-rejected' }) })]);
    expect(JSON.stringify([unreadable, rejected])).not.toContain(EXAMPLE_FORGE_TOKEN);
  });
});
