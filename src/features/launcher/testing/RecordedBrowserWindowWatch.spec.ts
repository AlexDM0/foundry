/**
 * The window-watch mock answers what the real browser recorded in each situation, and fails the spec where the real boundary would not
 * answer the same: a call with no recorded answer, a target list asked at a port no profile named, and a navigation to a window no listing
 * held.
 */
import { describe, expect, test } from 'bun:test';

import { recordedBrowserWindowWatch } from './RecordedBrowserWindowWatch.ts';

const PROFILE_FOLDER = '/Users/example/.gaia/browser-profile';

describe('the recorded browser window watch', () => {
  test('answers each situation as the real browser did, and lists the calls it answered', async () => {
    const watch = recordedBrowserWindowWatch('browser-starting');
    expect(await watch.debuggingPortIn(PROFILE_FOLDER)).toEqual({ verdict: 'not-written' });
    watch.enterSituation('window-open');
    const portAnswer = await watch.debuggingPortIn(PROFILE_FOLDER);
    if (portAnswer.verdict !== 'written') throw new Error('The recording names no port with the window open.');
    const targetsAnswer = await watch.pageTargetsAt(portAnswer.debuggingPort);
    if (targetsAnswer.verdict !== 'listed') throw new Error('The recording lists no window with the window open.');
    expect(targetsAnswer.pageTargets).toHaveLength(1);
    const [splashTarget] = targetsAnswer.pageTargets;
    if (splashTarget === undefined) throw new Error('The recording lists no window with the window open.');
    expect(await watch.navigate(splashTarget, 'http://127.0.0.1:4790/')).toEqual({ verdict: 'navigated' });
    watch.enterSituation('window-closed');
    expect(await watch.pageTargetsAt(portAnswer.debuggingPort)).toEqual({ verdict: 'listed', pageTargets: [] });
    watch.enterSituation('browser-ended');
    expect(await watch.pageTargetsAt(portAnswer.debuggingPort)).toEqual({ verdict: 'unreachable' });
    expect(watch.navigations()).toEqual(['http://127.0.0.1:4790/']);
    expect(watch.callsAnswered()).toEqual([
      'browser-starting: debugging port',
      'window-open: debugging port',
      'window-open: page targets',
      'window-open: navigate',
      'window-closed: page targets',
      'browser-ended: page targets',
    ]);
  });

  test('fails a call with no recorded answer in its situation', async () => {
    const watch = recordedBrowserWindowWatch('browser-starting');
    await watch.debuggingPortIn(PROFILE_FOLDER);
    watch.enterSituation('window-open');
    const portAnswer = await watch.debuggingPortIn(PROFILE_FOLDER);
    watch.enterSituation('browser-starting');
    await expect(watch.pageTargetsAt(portAnswer.verdict === 'written' ? portAnswer.debuggingPort : 0)).rejects.toThrow('No recorded answer for browser-starting: page targets');
  });

  test('fails a target list asked at a port no profile named, and a navigation to a window no listing held', async () => {
    const watch = recordedBrowserWindowWatch('window-open');
    await expect(watch.pageTargetsAt(1)).rejects.toThrow('which no profile named');
    const unlistedTarget = { targetId: 'unlisted', url: 'about:blank', debuggerAddress: 'ws://127.0.0.1:1/devtools/page/unlisted' };
    await expect(watch.navigate(unlistedTarget, 'http://127.0.0.1:4790/')).rejects.toThrow('which no listing held');
  });
});
