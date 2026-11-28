/**
 * Gaia's checkout over git's and setup's recorded answers: each situation of a clone maps to its verdict, and a setup that exits 0 but
 * printed a failed step reads as failed.
 */
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import { repositoryRoot }                                                             from '../../testing/BoundaryRecordings.ts';
import { createGaiaCheckout, type GaiaCheckout }                                      from './GaiaCheckout.ts';
import { EXAMPLE_BUN_PROGRAM, recordedGaiaCheckoutRunOf, type GaiaCheckoutSituation } from './testing/RecordedGaiaCheckout.ts';

function checkoutIn(situation: GaiaCheckoutSituation): GaiaCheckout {
  return createGaiaCheckout({ processRun: recordedGaiaCheckoutRunOf(situation), checkoutFolder: join(repositoryRoot(), '..', '..'), bunProgram: EXAMPLE_BUN_PROGRAM });
}

describe('the reading of origin\'s main', () => {
  test('counts no commit for a clone at origin\'s main, and the commits a clone behind it lacks', async () => {
    expect(await checkoutIn('up-to-date').upstreamReading()).toEqual({ verdict: 'read', commitsBehind: 0 });
    const behind = await checkoutIn('behind').upstreamReading();
    expect(behind.verdict === 'read' && behind.commitsBehind > 0).toBe(true);
  });

  test('names an origin that does not answer, and a repository with no origin', async () => {
    expect(await checkoutIn('origin-unreachable').upstreamReading()).toEqual({ verdict: 'origin-unreachable' });
    expect(await checkoutIn('not-a-clone').upstreamReading()).toEqual({ verdict: 'not-a-clone' });
  });
});

describe('the fast-forward and the setup', () => {
  test('fast-forwards a clean clone and reads a setup that finished every step as set up', async () => {
    const checkout = checkoutIn('behind');
    await checkout.upstreamReading();
    expect(await checkout.fastForward()).toBe('fast-forwarded');
    expect(await checkout.forgeSetup()).toBe('set-up');
  });

  test('reads a setup that printed a failed step as failed, though it exited 0', async () => {
    const checkout = checkoutIn('setup-fails');
    await checkout.upstreamReading();
    await checkout.fastForward();
    expect(await checkout.forgeSetup()).toBe('setup-failed');
  });

  test('refuses a clone with local changes, and one with commits of its own', async () => {
    for (const situation of ['local-changes', 'diverged'] as const) {
      const checkout = checkoutIn(situation);
      await checkout.upstreamReading();
      expect(await checkout.fastForward()).toBe(situation);
    }
  });
});
