/**
 * The addresses of a launch against their own contract: the splash carries Gaia's address and theme in its query and its step in the
 * fragment, so a move between steps stays within the page, and leaves out counts Gaia did not report; the page address carries the code
 * in the fragment only; the browser's arguments are PLAN 9.2's; the dialog's message is an argument, never script; and the window of the
 * splash is the one at the splash's file, or the only one listed.
 */
import { describe, expect, test } from 'bun:test';

import type { PageTarget } from '../BrowserWindowWatch.ts';

import { LaunchAddressUtil } from './LaunchAddressUtil.ts';

const SPLASH_PAGE_PATH = '/Users/example/gaia/resources/page/loading.html';
const SPLASH_ADDRESS = 'file:///Users/example/gaia/resources/page/loading.html?address=127.0.0.1%3A4790&theme=dark';

function pageTargetAt(url: string, targetId = 'example-target'): PageTarget {
  return { targetId, url };
}

describe('the splash address', () => {
  test('is the splash file with Gaia\'s address and the theme in its query', () => {
    expect(LaunchAddressUtil.splashAddressOf(SPLASH_PAGE_PATH, 4790, 'dark')).toBe(SPLASH_ADDRESS);
  });

  test('carries a step and the forge counts in its fragment, and leaves out counts Gaia did not report', () => {
    expect(LaunchAddressUtil.splashStepAddressOf(SPLASH_ADDRESS, 'looking', { forgesRegistered: 5, forgesAnswered: 3 }))
      .toBe(`${SPLASH_ADDRESS}#step=looking&answered=3&registered=5`);
    expect(LaunchAddressUtil.splashStepAddressOf(SPLASH_ADDRESS, 'opening', null)).toBe(`${SPLASH_ADDRESS}#step=opening`);
  });
});

describe('the page address', () => {
  test('is Gaia\'s page on 127.0.0.1 with the session code in its fragment', () => {
    expect(LaunchAddressUtil.pageAddressOf(4790, 'abc123')).toBe('http://127.0.0.1:4790/#session=abc123');
  });
});

describe('the browser arguments', () => {
  test('open an app window at the address on Gaia\'s profile, at the artboards\' size, reporting its windows over a debugging pipe and on no port', () => {
    expect(LaunchAddressUtil.browserArgumentsOf('http://127.0.0.1:4790/', '/Users/example/.gaia/browser-profile')).toEqual([
      '--app=http://127.0.0.1:4790/',
      '--user-data-dir=/Users/example/.gaia/browser-profile',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,1016',
      '--remote-debugging-pipe',
    ]);
  });
});

describe('the dialog', () => {
  test('runs osascript with the message as an argument after the script', () => {
    const message = 'A message with "quotes" and an end of script: end run';
    expect(LaunchAddressUtil.dialogRunOf(message)).toEqual({
      program:          '/usr/bin/osascript',
      programArguments: ['-e', 'on run argv', '-e', 'display alert (item 1 of argv) message (item 2 of argv) as critical', '-e', 'end run', 'Gaia', message],
    });
  });
});

describe('the splash\'s window', () => {
  test('is the listed window at the splash\'s file, whatever its step', () => {
    const splashTarget = pageTargetAt(`${SPLASH_ADDRESS}#step=looking`, 'splash');
    expect(LaunchAddressUtil.splashTargetAmong([pageTargetAt('http://127.0.0.1:4790/', 'page'), splashTarget], SPLASH_ADDRESS)).toEqual(splashTarget);
  });

  test('is the only window listed when none is at the splash\'s file, and none when several are', () => {
    const onlyTarget = pageTargetAt('http://127.0.0.1:59102/resources/page/loading.html');
    expect(LaunchAddressUtil.splashTargetAmong([onlyTarget], SPLASH_ADDRESS)).toEqual(onlyTarget);
    expect(LaunchAddressUtil.splashTargetAmong([pageTargetAt('http://127.0.0.1:4790/', 'one'), pageTargetAt('about:blank', 'two')], SPLASH_ADDRESS)).toBeNull();
    expect(LaunchAddressUtil.splashTargetAmong([], SPLASH_ADDRESS)).toBeNull();
  });
});
