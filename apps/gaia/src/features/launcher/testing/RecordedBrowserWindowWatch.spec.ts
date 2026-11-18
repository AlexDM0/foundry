/**
 * The window-watch mock answers what the real browser recorded in each situation, and fails the spec where the real boundary would not
 * answer the same: a call with no recorded answer, a call after the browser's channel has closed, and a navigation to a window no listing
 * held.
 */
import { describe, expect, test } from 'bun:test';

import type { ChildChannel }          from '../../../lib/process-run/ProcessRun.ts';
import { recordedBrowserWindowWatch } from './RecordedBrowserWindowWatch.ts';

interface ClosableChannel extends ChildChannel {
  readonly closeAndSettle: () => Promise<void>;
}

/** A channel that carries no text, as the recorded process-run hands a browser child: the mock reads only whether it is open. */
function channelThatCarriesNoText(): ClosableChannel {
  let markClosed: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });
  const refuse = (): never => {
    throw new Error('This channel carries no text.');
  };
  return {
    write:          refuse,
    onText:         refuse,
    closed,
    close:          () => markClosed(),
    closeAndSettle: async () => {
      markClosed();
      await closed;
    },
  };
}

describe('the recorded browser window watch', () => {
  test('answers each situation as the real browser did, and lists the calls it answered', async () => {
    const recorded = recordedBrowserWindowWatch('window-open');
    const watch = recorded.watchOver(channelThatCarriesNoText());
    const targetsAnswer = await watch.pageTargets();
    if (targetsAnswer.verdict !== 'listed') throw new Error('The recording lists no window with the window open.');
    expect(targetsAnswer.pageTargets).toHaveLength(1);
    const [splashTarget] = targetsAnswer.pageTargets;
    if (splashTarget === undefined) throw new Error('The recording lists no window with the window open.');
    expect(await watch.navigate(splashTarget, 'http://127.0.0.1:4790/')).toEqual({ verdict: 'navigated' });
    recorded.enterSituation('navigation-refused');
    expect(await watch.navigate(splashTarget, 'http://127.0.0.1:4790/')).toMatchObject({ verdict: 'refused' });
    recorded.enterSituation('other-window-left');
    expect(await watch.pageTargets()).toEqual({ verdict: 'listed', pageTargets: [{ targetId: expect.not.stringMatching(splashTarget.targetId), url: 'about:blank' }] });
    recorded.enterSituation('window-closed');
    expect(await watch.pageTargets()).toEqual({ verdict: 'listed', pageTargets: [] });
    recorded.enterSituation('browser-ended');
    expect(await watch.pageTargets()).toEqual({ verdict: 'unreachable' });
    expect(recorded.navigations()).toEqual(['http://127.0.0.1:4790/', 'http://127.0.0.1:4790/']);
    expect(recorded.callsAnswered()).toEqual([
      'window-open: page targets',
      'window-open: navigate',
      'navigation-refused: navigate',
      'other-window-left: page targets',
      'window-closed: page targets',
      'browser-ended: page targets',
    ]);
  });

  test('fails a call after the browser\'s channel has closed', async () => {
    const channel = channelThatCarriesNoText();
    const watch = recordedBrowserWindowWatch('window-open').watchOver(channel);
    await channel.closeAndSettle();
    await expect(watch.pageTargets()).rejects.toThrow('after its browser\'s channel had closed');
  });

  test('fails a navigation to a window no listing held', async () => {
    const watch = recordedBrowserWindowWatch('window-open').watchOver(channelThatCarriesNoText());
    await expect(watch.navigate({ targetId: 'unlisted', url: 'about:blank' }, 'http://127.0.0.1:4790/')).rejects.toThrow('which no listing held');
  });
});
