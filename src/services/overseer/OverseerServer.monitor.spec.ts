/**
 * The monitor's routes and the identity, answered by the server's request handler on requests built in memory: no socket is bound. What
 * matters: the identity carries its own version and the contracts this program serves; `GET /api/monitor` answers the snapshot only with the
 * token, and a 401, a 403 or a read's 500 answers its refusal with the routes' sentence; `GET /api/monitor/events` starts with the whole
 * newest snapshot, sends a later one only when it changed, carries `monitorVersion` in every event, and ends when the server closes its
 * streams, as a Baton pass does.
 */
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { MonitorSnapshot }                                             from '../../shared/monitor/@types/MonitorSnapshot.ts';
import { MonitorStream }                                                    from './MonitorStream.ts';
import { OverseerServer, type OverseerRequestHandler, type OverseerRoutes } from './OverseerServer.ts';

const PORT = 4100;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TOKEN = 'example-token';
const TOKEN_HEADERS = { host: `127.0.0.1:${PORT}`, authorization: `Bearer ${TOKEN}` };
/** Longer than any case runs, so no `: ping` reaches a stream the case reads. */
const QUIET_HEARTBEAT_MILLISECONDS = 600_000;

function snapshotWith(openIncidents: number): MonitorSnapshot {
  return { monitorVersion: 1, openIncidents } as unknown as MonitorSnapshot;
}

const openHandlers: OverseerRequestHandler[] = [];

function handlerOf(monitorStream: MonitorStream | null, monitor: OverseerRoutes['monitor'] = () => ({ status: 200, body: snapshotWith(0) })): OverseerRequestHandler {
  const routes = {
    token:         () => TOKEN,
    started:       () => true,
    monitor,
    monitorStream: () => monitorStream,
    refusalTextOf: (refusal) => `Example sentence for ${refusal}`,
    frameOrigins:  () => [],
  } as Partial<OverseerRoutes> as OverseerRoutes;
  const handler = OverseerServer.requestHandlerOf({
    portChoice: { kind: 'given', port: PORT },
    identity:   {
      trackerId: 'tracker-example', project: 'Example Agency', codeVersion: 'code-example', installVersion: 17, processId: 4242
    },
    routes,
    now:                   () => new Date('2026-11-12T12:00:00Z'),
    heartbeatMilliseconds: QUIET_HEARTBEAT_MILLISECONDS,
  } as Parameters<typeof OverseerServer.requestHandlerOf>[0]);
  openHandlers.push(handler);
  return handler;
}

afterEach(() => {
  for (const handler of openHandlers.splice(0)) handler.closeEveryStream();
});

function get(path: string, headers: Record<string, string> = TOKEN_HEADERS): Request {
  return new Request(`${ORIGIN}${path}`, { headers });
}

/** The next event the stream sends, decoded, or `null` once the stream ended. */
async function nextEventOf(reader: Pick<ReadableStreamDefaultReader<Uint8Array>, 'read'>): Promise<{ kind: string; data: unknown } | null> {
  const read = await reader.read();
  if (read.done) return null;
  const text = new TextDecoder().decode(read.value);
  const kind = /^event: (.+)$/m.exec(text)?.[1] ?? '';
  const data = /^data: (.+)$/m.exec(text)?.[1] ?? 'null';
  return { kind, data: JSON.parse(data) };
}

describe('the identity', () => {
  test('carries identityVersion 1 and the contracts this program serves', async () => {
    const answer = await handlerOf(null).answer(get('/api/identity', { host: `127.0.0.1:${PORT}` }), PORT);
    expect(await answer.json()).toMatchObject({ identityVersion: 1, contracts: { summary: 1, monitor: 1, control: 1 } });
  });
});

describe('GET /api/monitor', () => {
  test('answers the snapshot with the token, and 401 with the refusal\'s sentence without it', async () => {
    const handler = handlerOf(null);
    const answered = await handler.answer(get('/api/monitor'), PORT);
    expect([answered.status, await answered.json()]).toEqual([200, snapshotWith(0)]);
    const refused = await handler.answer(get('/api/monitor', { host: `127.0.0.1:${PORT}` }), PORT);
    expect([refused.status, await refused.json()]).toEqual([401, { refusal: 'unauthorized', text: 'Example sentence for unauthorized' }]);
  });

  test('a read that throws, as on a malformed board file, is refused 500 with the refusal\'s sentence', async () => {
    const handler = handlerOf(null, () => {
      throw new Error('Example malformed progress.json');
    });
    const refused = await handler.answer(get('/api/monitor'), PORT);
    expect([refused.status, await refused.json()]).toEqual([500, { refusal: 'read-failed', text: 'Example sentence for read-failed' }]);
  });

  test('a foreign Host is refused 403 with the refusal\'s sentence', async () => {
    const refused = await handlerOf(null).answer(get('/api/monitor', { ...TOKEN_HEADERS, host: `example.com:${PORT}` }), PORT);
    expect([refused.status, await refused.json()]).toEqual([403, { refusal: 'forbidden', text: 'Example sentence for forbidden' }]);
  });
});

describe('GET /api/monitor/events', () => {
  test('answers 404 not-ready before the first snapshot was published', async () => {
    const answer = await handlerOf(MonitorStream.createMonitorStream()).answer(get('/api/monitor/events'), PORT);
    expect([answer.status, await answer.json()]).toEqual([404, { refusal: 'not-ready' }]);
  });

  test('starts with the whole newest snapshot, sends a later one only when it changed, and holds the stream open', async () => {
    const monitorStream = MonitorStream.createMonitorStream();
    monitorStream.publish(snapshotWith(1));
    let heldOpen = false;
    const answer = await handlerOf(monitorStream).answer(get('/api/monitor/events'), PORT, () => {
      heldOpen = true;
    });
    expect([answer.status, answer.headers.get('content-type'), heldOpen]).toEqual([200, 'text/event-stream', true]);
    const reader = answer.body?.getReader();
    if (reader === undefined) throw new Error('the stream has a body');
    expect(await nextEventOf(reader)).toEqual({ kind: 'monitor', data: snapshotWith(1) });
    monitorStream.publish(snapshotWith(1));
    monitorStream.publish(snapshotWith(2));
    expect(await nextEventOf(reader)).toEqual({ kind: 'monitor', data: snapshotWith(2) });
  });

  test('ends when the server closes its streams, as a Baton pass does', async () => {
    const monitorStream = MonitorStream.createMonitorStream();
    monitorStream.publish(snapshotWith(1));
    const handler = handlerOf(monitorStream);
    const reader = (await handler.answer(get('/api/monitor/events'), PORT)).body?.getReader();
    if (reader === undefined) throw new Error('the stream has a body');
    expect((await nextEventOf(reader))?.kind).toBe('monitor');
    handler.closeEveryStream();
    expect(await nextEventOf(reader)).toBeNull();
  });
});
