/**
 * The launch file a Watcher reads after its claim: a well-formed one reads with later keys ignored, and each malformed field is a verdict
 * naming it, never a throw, so the Watcher can record why it spawned nothing.
 */
import { expect, test } from 'bun:test';

import { REAL_ENDPOINT_PRIMITIVES }                                 from './LocalEndpointFor.ts';
import { createPosixSocketEndpoint, MACOS_SOCKET_PATH_LIMIT_BYTES } from './PosixSocketEndpoint.ts';
import { watcherLaunchOf }                                          from './WatcherLaunch.ts';
import { WATCHER_PROTOCOL_VERSION }                                 from './constants/WatcherProtocol.ts';

const ENDPOINT = createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, MACOS_SOCKET_PATH_LIMIT_BYTES);

const WELL_FORMED = {
  kind:               'agent' as const,
  argv:               ['/bin/echo', 'hello'],
  environment:        { PATH: '/bin' },
  workingDirectory:   '/tmp',
  standingReplies:    [{ whenAllEqual: { type: 'control_request' }, whenNoneEqual: {}, replyTemplate: 'reply' }],
  protocolVersion:    WATCHER_PROTOCOL_VERSION,
  jobId:              'J-1',
  watcherCodeVersion: 'code-1',
  socketPath:         '/tmp/watchers/0123456789abcdef.sock',
  secretFilePath:     '/tmp/watchers/tracker-example/J-1-1.secret',
};

test('reads a well-formed launch file and leaves a key a later protocol adds unread', () => {
  expect(watcherLaunchOf(JSON.stringify({ ...WELL_FORMED, laterKey: 'later' }), ENDPOINT)).toEqual({ verdict: 'read', launch: WELL_FORMED });
});

test('reads the grace of the stop at the end when the launch file sets it', () => {
  const launch = { ...WELL_FORMED, treeStopAtEndGraceMilliseconds: 5000 };
  expect(watcherLaunchOf(JSON.stringify(launch), ENDPOINT)).toEqual({ verdict: 'read', launch });
});

test.each([
  ['not JSON', '{', 'not JSON'],
  ['a negative grace of the stop at the end', JSON.stringify({ ...WELL_FORMED, treeStopAtEndGraceMilliseconds: -1 }), 'treeStopAtEndGraceMilliseconds'],
  ['a list', '[]', 'not a JSON object'],
  ['an unknown kind', JSON.stringify({ ...WELL_FORMED, kind: 'daemon' }), 'kind'],
  ['an empty argv', JSON.stringify({ ...WELL_FORMED, argv: [] }), 'argv'],
  ['a numeric environment value', JSON.stringify({ ...WELL_FORMED, environment: { COUNT: 1 } }), 'environment'],
  ['no working directory', JSON.stringify({ ...WELL_FORMED, workingDirectory: null }), 'workingDirectory'],
  ['a rule with no template', JSON.stringify({ ...WELL_FORMED, standingReplies: [{ whenAllEqual: {}, whenNoneEqual: {} }] }), 'standingReplies'],
  ['a newer protocol', JSON.stringify({ ...WELL_FORMED, protocolVersion: WATCHER_PROTOCOL_VERSION + 1 }), 'protocolVersion'],
  ['a protocol below the supported ones', JSON.stringify({ ...WELL_FORMED, protocolVersion: 0 }), 'protocolVersion'],
  ['a protocol that is no number', JSON.stringify({ ...WELL_FORMED, protocolVersion: '2' }), 'protocolVersion'],
  ['no job id', JSON.stringify({ ...WELL_FORMED, jobId: '' }), 'jobId'],
  ['no Watcher code version', JSON.stringify({ ...WELL_FORMED, watcherCodeVersion: 1 }), 'watcherCodeVersion'],
  ['a relative socket path', JSON.stringify({ ...WELL_FORMED, socketPath: 'watchers/a.sock' }), 'socketPath'],
  ['a socket path of 104 bytes', JSON.stringify({ ...WELL_FORMED, socketPath: `/${'s'.repeat(103)}` }), 'socketPath'],
  ['a relative secret path', JSON.stringify({ ...WELL_FORMED, secretFilePath: 'J-1-1.secret' }), 'secretFilePath'],
])('refuses %s, naming it', (_title, launchText, namedInReason) => {
  const reading = watcherLaunchOf(launchText, ENDPOINT);
  expect(reading.verdict).toBe('unreadable');
  expect(reading.verdict === 'unreadable' ? reading.reason : '').toContain(namedInReason);
});
