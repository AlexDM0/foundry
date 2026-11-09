/**
 * The launcher `open` hands the URL to is chosen from the context's platform, never the test runner's, so every
 * branch is pinned on any machine: macOS has `open`, Windows the protocol handler by absolute path under the system
 * folder, and every other platform `xdg-open`. The Windows row matters most: a bare program name would be searched
 * for from the working directory, and a shell would split a URL at its `&`.
 */
import { win32 }                  from 'node:path';
import { describe, expect, test } from 'bun:test';

import { openerFor } from './OpenerFor.ts';

const FAKE_SYSTEM_FOLDER = 'D:\\Example\\System32';
const URL_WITH_AMPERSAND = 'http://127.0.0.1:4100/?tab=board&view=list#session=example';

const refuseSystemFolder = (): string => {
  throw new Error('the system folder is read only on Windows');
};

describe('openerFor', () => {
  test('macOS opens the URL with `open`, detached, without reading the system folder', () => {
    expect(openerFor('darwin', refuseSystemFolder)).toEqual({ commandLine: ['open'], detach: true });
  });

  test('Linux and every other platform open the URL with `xdg-open`, detached, without reading the system folder', () => {
    expect(openerFor('linux', refuseSystemFolder)).toEqual({ commandLine: ['xdg-open'], detach: true });
    expect(openerFor('freebsd', refuseSystemFolder)).toEqual({ commandLine: ['xdg-open'], detach: true });
  });

  test('Windows opens the URL through rundll32 by absolute path under the system folder, detached, the URL one argument with its `&` unchanged', () => {
    const opener = openerFor('win32', () => FAKE_SYSTEM_FOLDER);
    const commandLine = [...opener.commandLine, URL_WITH_AMPERSAND];

    expect(commandLine).toEqual([`${FAKE_SYSTEM_FOLDER}\\rundll32.exe`, 'url.dll,FileProtocolHandler', URL_WITH_AMPERSAND]);
    expect(win32.isAbsolute(opener.commandLine[0] ?? '')).toBe(true);
    expect(opener.detach).toBe(true);
  });
});
