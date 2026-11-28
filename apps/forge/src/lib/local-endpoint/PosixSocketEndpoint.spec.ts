/**
 * The socket path's contract: the first 16 hex digits of sha256 over scope, name and instance joined by newlines, in the socket
 * folder, the same at every call, fitting the 104 bytes macOS keeps with a realistic home; and the fit table per system, whose
 * boundary counts the zero byte.
 */
import { expect, test } from 'bun:test';

import { REAL_ENDPOINT_PRIMITIVES }                                                                from './LocalEndpointFor.ts';
import { createPosixSocketEndpoint, LINUX_SOCKET_PATH_LIMIT_BYTES, MACOS_SOCKET_PATH_LIMIT_BYTES } from './PosixSocketEndpoint.ts';

const SOCKET_FOLDER = '/Users/alex.example/.forge-monitor/private';

const { endpointFits: socketPathFits, endpointOf } = createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, MACOS_SOCKET_PATH_LIMIT_BYTES);
const linuxEndpoint = createPosixSocketEndpoint(REAL_ENDPOINT_PRIMITIVES, LINUX_SOCKET_PATH_LIMIT_BYTES);

function socketPathOf(socketFolder: string, scope: string, name: string, instance: number): string {
  return endpointOf({
    socketFolder, scope, name, instance
  });
}

test('names the socket by the first 16 hex of sha256(scope, name, instance) in the socket folder', () => {
  // Computed by `printf 'scope-example\nJ-1\n1' | shasum -a 256 | cut -c1-16`.
  const digest = new Bun.CryptoHasher('sha256').update('scope-example\nJ-1\n1').digest('hex').slice(0, 16);
  expect(socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-1', 1)).toBe(`${SOCKET_FOLDER}/${digest}.sock`);
  expect(socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-1', 2)).not.toBe(socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-1', 1));
});

test('fits the limit under a realistic home', () => {
  const socketPath = socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-123', 7);
  expect(Buffer.byteLength(socketPath)).toBeLessThan(MACOS_SOCKET_PATH_LIMIT_BYTES);
  expect(socketPathFits(socketPath)).toBe(true);
});

test('one instance answers the same path at every call', () => {
  expect(socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-1', 1)).toBe(socketPathOf(SOCKET_FOLDER, 'scope-example', 'J-1', 1));
});

test('a path one byte short of the limit fits, and one of the limit does not', () => {
  expect(socketPathFits(`/${'s'.repeat(MACOS_SOCKET_PATH_LIMIT_BYTES - 2)}`)).toBe(true);
  expect(socketPathFits(`/${'s'.repeat(MACOS_SOCKET_PATH_LIMIT_BYTES - 1)}`)).toBe(false);
});

test.each([
  [103, true, true],
  [104, false, true],
  [105, false, true],
  [106, false, true],
  [107, false, true],
  [108, false, false],
])('a path of %i bytes fits on macOS: %p, on Linux: %p', (bytes, fitsOnMacos, fitsOnLinux) => {
  const socketPath = `/${'s'.repeat(bytes - 1)}`;
  expect(socketPathFits(socketPath)).toBe(fitsOnMacos);
  expect(linuxEndpoint.endpointFits(socketPath)).toBe(fitsOnLinux);
});
