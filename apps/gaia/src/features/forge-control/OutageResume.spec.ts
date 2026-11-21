/**
 * The fleet's one resume of the jobs a network outage stopped, against its own contract and the verdicts each forge's send answers. What
 * matters: two forges with outage endings and one not answering give two `resumed` and one `not-reached`, and the one not answering is sent
 * nothing; a forge's refusal keeps its sentence; with nothing waiting every forge answers `nothing-to-do`; a forge Gaia could not send it
 * to is `not-reached`; and the forges are sent the resume one after another, never two at once, with no second try.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandVerdict }                  from '../../shared/@types/CommandVerdict.ts';
import { OutageResume, type OutageResumeForge } from './OutageResume.ts';

const STOREFRONT: OutageResumeForge = { trackerId: 'example-storefront-7c41', apiAnswers: true, outageEndings: 2 };
const INVOICE_SERVICE: OutageResumeForge = { trackerId: 'invoice-service-2b9e', apiAnswers: true, outageEndings: 1 };
const DESIGN_SYSTEM_DOWN: OutageResumeForge = { trackerId: 'design-system-91c2', apiAnswers: false, outageEndings: 0 };

const FORGE_REFUSAL_SENTENCE = 'Hephaestus is held by an install change.';

/** A sender answering each forge's verdict by its tracker id, which records the order of the sends and how many were on their way at once. */
function senderAnswering(verdictsByTrackerId: Readonly<Record<string, CommandVerdict>>) {
  const sentTo: string[] = [];
  let sendsOnTheirWay = 0;
  let mostSendsAtOnce = 0;
  const send = async (trackerId: string): Promise<CommandVerdict> => {
    sentTo.push(trackerId);
    sendsOnTheirWay += 1;
    mostSendsAtOnce = Math.max(mostSendsAtOnce, sendsOnTheirWay);
    await Promise.resolve();
    sendsOnTheirWay -= 1;
    return verdictsByTrackerId[trackerId] ?? { verdict: 'unreachable' };
  };
  return { send, sentTo, mostSendsAtOnce: () => mostSendsAtOnce };
}

describe('resumeAll', () => {
  test('two forges with outage endings and one not answering give two resumed, with their counts, and one not reached', async () => {
    const sender = senderAnswering({ [STOREFRONT.trackerId]: { verdict: 'done' }, [INVOICE_SERVICE.trackerId]: { verdict: 'done' } });
    expect(await OutageResume.resumeAll([STOREFRONT, INVOICE_SERVICE, DESIGN_SYSTEM_DOWN], sender.send)).toEqual([
      {
        trackerId: STOREFRONT.trackerId, outcome: 'resumed', resumedCount: 2, refusalText: null
      },
      {
        trackerId: INVOICE_SERVICE.trackerId, outcome: 'resumed', resumedCount: 1, refusalText: null
      },
      {
        trackerId: DESIGN_SYSTEM_DOWN.trackerId, outcome: 'not-reached', resumedCount: 0, refusalText: null
      },
    ]);
    expect(sender.sentTo).toEqual([STOREFRONT.trackerId, INVOICE_SERVICE.trackerId]);
  });

  test('keeps a forge\'s refusal with its own sentence', async () => {
    const refused: CommandVerdict = {
      verdict: 'refused', refusedBy: 'forge', refusal: 'hephaestus-held', text: FORGE_REFUSAL_SENTENCE
    };
    const sender = senderAnswering({ [STOREFRONT.trackerId]: refused });
    expect(await OutageResume.resumeAll([STOREFRONT], sender.send)).toEqual([{
      trackerId: STOREFRONT.trackerId, outcome: 'refused', resumedCount: 0, refusalText: FORGE_REFUSAL_SENTENCE
    }]);
  });

  test('with nothing waiting, every forge answers nothing to do', async () => {
    const sender = senderAnswering({ [STOREFRONT.trackerId]: { verdict: 'nothing-to-do' }, [INVOICE_SERVICE.trackerId]: { verdict: 'nothing-to-do' } });
    const answers = await OutageResume.resumeAll([{ ...STOREFRONT, outageEndings: 0 }, { ...INVOICE_SERVICE, outageEndings: 0 }], sender.send);
    expect(answers.map(({ outcome }) => outcome)).toEqual(['nothing-to-do', 'nothing-to-do']);
  });

  test('a forge that gives no answer, refuses Gaia\'s token or speaks a control contract Gaia does not know is not reached', async () => {
    for (const verdict of [{ verdict: 'unreachable' }, { verdict: 'refused', refusedBy: 'gaia', refusal: 'token-rejected' }, { verdict: 'not-supported' }] as const) {
      const sender = senderAnswering({ [STOREFRONT.trackerId]: verdict });
      expect(await OutageResume.resumeAll([STOREFRONT], sender.send)).toEqual([{
        trackerId: STOREFRONT.trackerId, outcome: 'not-reached', resumedCount: 0, refusalText: null
      }]);
      expect(sender.sentTo).toEqual([STOREFRONT.trackerId]);
    }
  });

  test('sends the forges one after another, never two at once', async () => {
    const sender = senderAnswering({ [STOREFRONT.trackerId]: { verdict: 'done' }, [INVOICE_SERVICE.trackerId]: { verdict: 'done' } });
    await OutageResume.resumeAll([STOREFRONT, INVOICE_SERVICE], sender.send);
    expect(sender.mostSendsAtOnce()).toBe(1);
  });
});
