/**
 * The frame session route over recorded and authored Overseer answers. What matters: the answer holds the Bridge's address with
 * `?embedded=gaia` and the forge's one-time code; the token travels only as the bearer of the one request and reaches no answer and no
 * log line in any outcome; a forge with no embed channel Gaia knows answers `not-supported` and is asked for nothing; and every other way
 * a code is not given ends in its own outcome.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import type { FrameSessionAnswerDocument }   from '../../../../page/@types/FrameSessionDocument.ts';
import type { RegisteredForge }              from '../../../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }              from '../../../adapters/forge-registry/RegistryFile.ts';
import { forgeClientOf }                     from '../../../lib/forge-client/ForgeClient.ts';
import { WatchReadingUtil }                  from '../../../services/utils/WatchReadingUtil.ts';
import type { ForgeContracts, ForgeReading } from '../../../shared/@types/ForgeReading.ts';
import {
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  type OverseerSituation,
  type RecordedOverseerFetch,
} from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../../../testing/ScratchRoot.ts';

import { frameSessionAnswerFor, trackerIdOfFrameSessionPath, type FrameSessionSources } from './FrameSessionRoute.ts';

const STOREFRONT_TRACKER_ID = 'example-storefront-7c41';
const STOREFRONT_URL = 'http://127.0.0.1:4951/';
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';
const SESSION_CODES_CALL_SHAPE = 'POST /api/session-codes with bearer';

const EVERY_CONTRACT: ForgeContracts = {
  summary: 1, monitor: 1, control: 1, embed: 1,
};

const CONSOLE_METHOD_NAMES = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

let scratchFolder = '';
let tokenPath = '';

beforeEach(() => {
  scratchFolder = createScratchDirectory('frame-session');
  tokenPath     = join(scratchFolder, 'token');
  writeFileSync(tokenPath, `${EXAMPLE_TOKEN}\n`);
});

afterEach(() => {
  removeScratchPath(scratchFolder);
});

interface ForgeOptions {
  readonly fidelity?:  ForgeReading['fidelity'];
  readonly contracts?: ForgeContracts;
  readonly tokenPath?: string | null;
}

interface ExampleForge {
  readonly entry:   RegisteredForge;
  readonly reading: ForgeReading;
}

/** A registered forge and the reading the forge watch would hold of it; a dormant forge has no Overseer in the registry. */
function exampleForgeOf(forgeOptions: ForgeOptions = {}): ExampleForge {
  const fidelity = forgeOptions.fidelity ?? 'full';
  const entry: RegisteredForge = {
    trackerId: STOREFRONT_TRACKER_ID,
    project:   'Example Storefront',
    root:      join(scratchFolder, 'example-storefront'),
    program:   null,
    overseer:  fidelity === 'dormant' ? null : {
      url:       STOREFRONT_URL,
      processId: 48_107,
      startedAt: '2026-11-12T09:12:00.000Z',
      tokenPath: forgeOptions.tokenPath === undefined ? tokenPath : forgeOptions.tokenPath,
    },
  };
  const dormantReading = WatchReadingUtil.dormantReadingOf(entry, null);
  if (fidelity === 'dormant') return { entry, reading: dormantReading };
  const reading: ForgeReading = {
    ...dormantReading,
    fidelity,
    condition: fidelity === 'unreachable' ? 'unreachable' : 'live',
    url:       STOREFRONT_URL,
    contracts: forgeOptions.contracts ?? EVERY_CONTRACT,
  };
  return { entry, reading };
}

function sourcesOver(forge: ExampleForge, overseerFetch: RecordedOverseerFetch, registry?: RegistryReading): FrameSessionSources {
  const registryReading: RegistryReading = registry ?? { verdict: 'readable', forges: [forge.entry], leftOutEntries: [] };
  return {
    readRegistry: async () => registryReading,
    readings:     () => [forge.reading],
    forgeClient:  forgeClientOf({ overseerFetch }),
  };
}

function overseerAnswering(situation: OverseerSituation): RecordedOverseerFetch {
  return recordedOverseerFetch(recordedOverseerAnswersOf(situation).filter((answer) => answer.callShape === SESSION_CODES_CALL_SHAPE));
}

/** The session code the authored Overseer answer holds, read from the recording itself. */
function recordedSessionCode(): string {
  const [recorded] = recordedOverseerAnswersOf('serving-every-contract').filter((answer) => answer.callShape === SESSION_CODES_CALL_SHAPE);
  if (recorded?.answer.verdict !== 'answered') throw new Error('The serving-every-contract situation holds no answered session code.');
  return (JSON.parse(recorded.answer.bodyText) as { code: string }).code;
}

interface FrameSessionExchange {
  readonly status:   number;
  readonly document: FrameSessionAnswerDocument;
}

async function exchangeOf(sources: FrameSessionSources): Promise<FrameSessionExchange> {
  const answer = await frameSessionAnswerFor(STOREFRONT_TRACKER_ID, sources);
  return { status: answer.status, document: await answer.json() as FrameSessionAnswerDocument };
}

describe('a forge that serves the embed channel', () => {
  test('answers the Bridge\'s address with ?embedded=gaia and the forge\'s one-time code in its fragment', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf(), overseerAnswering('serving-every-contract')));
    expect(exchange.status).toBe(200);
    expect(exchange.document).toEqual({
      frameSessionVersion: 1,
      outcome:             'done',
      frameUrl:            `${STOREFRONT_URL}?embedded=gaia#session=${recordedSessionCode()}`,
      refusal:             null,
      text:                null,
    });
  });

  test('asks the Overseer the registry names for one code, with the token as the bearer and no body', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    await exchangeOf(sourcesOver(exampleForgeOf(), overseerFetch));
    expect(overseerFetch.callsAnswered()).toEqual([{ callShape: SESSION_CODES_CALL_SHAPE, bearerToken: EXAMPLE_TOKEN, jsonBody: null }]);
  });

  test('reads the token file again at each request, since the Overseer writes a fresh one at each start', async () => {
    const overseerFetch = overseerAnswering('serving-every-contract');
    const sources = sourcesOver(exampleForgeOf(), overseerFetch);
    await exchangeOf(sources);
    writeFileSync(tokenPath, 'example-token-after-a-restart\n');
    await exchangeOf(sources);
    expect(overseerFetch.callsAnswered().map((call) => call.bearerToken)).toEqual([EXAMPLE_TOKEN, 'example-token-after-a-restart']);
  });

  test('marks the answer as never to be stored, since its code is spent once', async () => {
    const answer = await frameSessionAnswerFor(STOREFRONT_TRACKER_ID, sourcesOver(exampleForgeOf(), overseerAnswering('serving-every-contract')));
    expect(answer.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the token', () => {
  const EVERY_OUTCOME: readonly { readonly name: string; readonly forge: () => ExampleForge; readonly situation: OverseerSituation }[] = [
    { name: 'done', forge: () => exampleForgeOf(), situation: 'serving-every-contract' },
    { name: 'unreachable', forge: () => exampleForgeOf(), situation: 'stopped' },
    { name: 'refused', forge: () => exampleForgeOf(), situation: 'token-rejected' },
    { name: 'not-supported by its answer', forge: () => exampleForgeOf(), situation: 'port-held-by-another-program' },
    { name: 'not-supported by its contracts', forge: () => exampleForgeOf({ contracts: { ...EVERY_CONTRACT, embed: null } }), situation: 'serving-every-contract' },
  ];

  for (const outcome of EVERY_OUTCOME) {
    test(`is in no part of the answer and no log line when the outcome is ${outcome.name}`, async () => {
      const consoleSpies = CONSOLE_METHOD_NAMES.map((methodName) => spyOn(console, methodName));
      let answerText = '';
      let loggedText = '';
      try {
        const answer = await frameSessionAnswerFor(STOREFRONT_TRACKER_ID, sourcesOver(outcome.forge(), overseerAnswering(outcome.situation)));
        answerText = `${[...answer.headers.entries()].flat().join('\n')}\n${await answer.text()}`;
        // Read before the restore, which empties a spy's calls; inspected so a token inside a logged object is seen too.
        loggedText = consoleSpies.flatMap((consoleSpy) => consoleSpy.mock.calls.flat().map((argument) => Bun.inspect(argument))).join('\n');
      } finally {
        for (const consoleSpy of consoleSpies) consoleSpy.mockRestore();
      }
      expect(answerText).not.toContain(EXAMPLE_TOKEN);
      expect(loggedText).not.toContain(EXAMPLE_TOKEN);
    });
  }
});

describe('a forge with no embed channel Gaia knows', () => {
  test('answers not-supported for a forge whose contracts name no embed channel, and asks it for nothing', async () => {
    const overseerFetch = recordedOverseerFetch([]);
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf({ contracts: { ...EVERY_CONTRACT, embed: null } }), overseerFetch));
    expect(exchange.status).toBe(501);
    expect(exchange.document).toEqual({
      frameSessionVersion: 1, outcome: 'not-supported', frameUrl: null, refusal: null, text: null,
    });
    expect(overseerFetch.callsAnswered()).toEqual([]);
  });

  test('answers not-supported for a forge read only through its counts, which names no contracts', async () => {
    const noContracts: ForgeContracts = {
      summary: null, monitor: null, control: null, embed: null,
    };
    const forge = exampleForgeOf({ fidelity: 'counts-only', contracts: noContracts });
    expect((await exchangeOf(sourcesOver(forge, recordedOverseerFetch([])))).document.outcome).toBe('not-supported');
  });

  test('answers not-supported for an embed channel newer than this Gaia knows', async () => {
    const forge = exampleForgeOf({ contracts: { ...EVERY_CONTRACT, embed: 2 } });
    expect((await exchangeOf(sourcesOver(forge, recordedOverseerFetch([])))).document.outcome).toBe('not-supported');
  });

  test('answers not-supported when another program at the forge\'s address answers no code', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf(), overseerAnswering('port-held-by-another-program')));
    expect(exchange.document.outcome).toBe('not-supported');
  });
});

describe('a forge that gives no code', () => {
  test('answers unreachable for a dormant forge, and asks nothing', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf({ fidelity: 'dormant' }), recordedOverseerFetch([])));
    expect(exchange.status).toBe(502);
    expect(exchange.document.outcome).toBe('unreachable');
  });

  test('answers unreachable for a forge the watch could not reach, and asks nothing', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf({ fidelity: 'unreachable' }), recordedOverseerFetch([])));
    expect(exchange.document.outcome).toBe('unreachable');
  });

  test('answers unreachable when the Overseer stopped since the watch last read it', async () => {
    expect((await exchangeOf(sourcesOver(exampleForgeOf(), overseerAnswering('stopped')))).document.outcome).toBe('unreachable');
  });

  test('refuses with token-rejected when the Overseer refuses the token', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf(), overseerAnswering('token-rejected')));
    expect(exchange.status).toBe(409);
    expect(exchange.document).toEqual({
      frameSessionVersion: 1, outcome: 'refused', frameUrl: null, refusal: 'token-rejected', text: null,
    });
  });

  test('refuses with token-unreadable when the token file is gone, and asks nothing', async () => {
    const forge = exampleForgeOf({ tokenPath: join(scratchFolder, 'absent-token') });
    expect((await exchangeOf(sourcesOver(forge, recordedOverseerFetch([])))).document.refusal).toBe('token-unreadable');
  });

  test('refuses with token-unreadable when the registry names no token file', async () => {
    const forge = exampleForgeOf({ tokenPath: null });
    expect((await exchangeOf(sourcesOver(forge, recordedOverseerFetch([])))).document.refusal).toBe('token-unreadable');
  });

  test('refuses with forge-not-registered when the registry names no such forge', async () => {
    const forge = exampleForgeOf();
    const exchange = await exchangeOf(sourcesOver(forge, recordedOverseerFetch([]), { verdict: 'readable', forges: [], leftOutEntries: [] }));
    expect(exchange.document.refusal).toBe('forge-not-registered');
  });

  test('refuses with forge-not-registered when the registry cannot be read', async () => {
    const exchange = await exchangeOf(sourcesOver(exampleForgeOf(), recordedOverseerFetch([]), { verdict: 'absent' }));
    expect(exchange.document.refusal).toBe('forge-not-registered');
  });
});

describe('the path', () => {
  test('names the tracker id between /api/forges/ and /frame-session', () => {
    expect(trackerIdOfFrameSessionPath(`/api/forges/${STOREFRONT_TRACKER_ID}/frame-session`)).toBe(STOREFRONT_TRACKER_ID);
  });

  test('decodes a tracker id the page encoded', () => {
    expect(trackerIdOfFrameSessionPath('/api/forges/example%20storefront/frame-session')).toBe('example storefront');
  });

  test('names nothing for another path, an empty id, an id across folders or an encoding that does not decode', () => {
    expect(trackerIdOfFrameSessionPath('/api/forges/example-storefront-7c41')).toBeNull();
    expect(trackerIdOfFrameSessionPath('/api/forges//frame-session')).toBeNull();
    expect(trackerIdOfFrameSessionPath('/api/forges/example/storefront/frame-session')).toBeNull();
    expect(trackerIdOfFrameSessionPath('/api/forges/example%E0%A4%A/frame-session')).toBeNull();
  });
});
