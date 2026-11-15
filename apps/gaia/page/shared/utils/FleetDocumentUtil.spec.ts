/**
 * What the page reads off a fleet document alike in every view. What matters: a tracker id the document holds no forge for finds none;
 * a forge read in full counts the entries it lists, and one read through its summary counts as its summary says, absent when it says
 * nothing, which is not zero.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_DEGRADED }                                   from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../../testing/fixtures/fleet-five-forges.ts';
import { FleetDocumentUtil }                                from './FleetDocumentUtil.ts';

describe('a forge by its tracker id', () => {
  test('is the document\'s forge with that id, and none for an id the document does not hold', () => {
    expect(FleetDocumentUtil.forgeOf(FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront)?.project).toBe('Example Storefront');
    expect(FleetDocumentUtil.forgeOf(FLEET_FIVE_FORGES, 'no-such-tracker')).toBeNull();
  });
});

describe('what of a forge waits on User', () => {
  test('counts the listed entries of a forge read in full', () => {
    const storefront = FleetDocumentUtil.forgeOf(FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront);
    if (storefront === null) throw new Error('The five-forge fixture holds no Example Storefront.');
    expect(FleetDocumentUtil.waitingCountOf({ ...storefront, attentionCount: 7 })).toBe(2);
  });

  test('takes the summary\'s count of a forge read through its summary, and none when the summary gives none', () => {
    const countsOnly = FLEET_DEGRADED.forges.find((candidate) => candidate.fidelity === 'counts-only');
    if (countsOnly === undefined) throw new Error('The degraded fixture holds no forge read through its summary.');
    expect(FleetDocumentUtil.waitingCountOf(countsOnly)).toBe(1);
    expect(FleetDocumentUtil.waitingCountOf({ ...countsOnly, attentionCount: null })).toBeNull();
  });
});
