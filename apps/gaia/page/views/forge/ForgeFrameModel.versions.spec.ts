/**
 * A forge in place at each version this Gaia, built for forge 3.1, meets (the Versions boards' U3). What matters: a forge Gaia cannot talk
 * to, newer or older, gets the versions notice and pair in place of the Bridge, so no frame session is asked; its bar shows the condition
 * of its verdict, a line that names its version and the whole sentence in its title, no brain and no control Gaia would send, only those
 * controls disabled with a title naming both versions; an older forge, also one that states no version, offers Update forge, whose steps
 * follow the forge's command state and whose refusal shows in the bar rather than under it; an ahead forge keeps its condition, every
 * control and its brain, its line ending in a quiet version clause; a current forge's bar names no version.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandState }                                                             from '../../api/CommandSender.ts';
import type { ClockReading }                                                             from '../../shared/@types/ClockReading.ts';
import { FLEET_FIXTURES_READ_AT }                                                        from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_STATING_NO_VERSION, FLEET_VERSIONS_TRACKER_IDS } from '../../testing/fixtures/fleet-versions.ts';
import { ForgeFrameModel }                                                               from './ForgeFrameModel.ts';

const TRACKER_IDS = FLEET_VERSIONS_TRACKER_IDS;

const CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const IDLE: CommandState = { onItsWay: null, failure: null, restartPending: false };

function contentOf(trackerId: string, fleetDocument = FLEET_VERSIONS) {
  return ForgeFrameModel.forgeFrameContentOf(trackerId, fleetDocument, CLOCK);
}

function barOf(trackerId: string, fleetDocument = FLEET_VERSIONS) {
  const { bar } = contentOf(trackerId, fleetDocument);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function lineTextOf(trackerId: string, fleetDocument = FLEET_VERSIONS): string {
  return barOf(trackerId, fleetDocument).status.line.map((segment) => segment.text).join('');
}

describe('the frame area of a forge Gaia cannot talk to', () => {
  test('holds the newer notice and the versions pair instead of the Bridge', () => {
    const { area } = contentOf(TRACKER_IDS.analyticsSandbox);
    if (area.kind !== 'cannot-talk') throw new Error(`Analytics Sandbox shows ${area.kind}.`);
    expect(area.verdict).toBe('newer');
    expect(area.notice.word).toBe('Newer than this Gaia.');
    expect(area.notice.heading).toBe('This Gaia cannot show Analytics Sandbox in place');
    expect(area.pair.forgeName).toBe('Analytics Sandbox');
    expect(area.pair.verdict).toBe('newer');
  });

  test('holds the older notice, also for a forge that states no version', () => {
    const older = contentOf(TRACKER_IDS.exampleBilling).area;
    const statesNoVersion = contentOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION).area;
    if (older.kind !== 'cannot-talk' || statesNoVersion.kind !== 'cannot-talk') throw new Error('An older forge frames something else.');
    expect(older.notice.heading).toBe('Example Billing is older than this Gaia');
    expect(older.notice.sentence).toContain('and Example Billing is 1.8.');
    expect(statesNoVersion.verdict).toBe('older');
    expect(statesNoVersion.notice.sentence).toContain('and Example Docs states no version.');
  });

  test('frames the Bridge of an ahead forge, which Gaia reads in full', () => {
    expect(contentOf(TRACKER_IDS.exampleStorefront).area.kind).toBe('frame');
  });
});

describe('the bar at each verdict', () => {
  test('of a newer forge reads "Not readable", names its version in the line and both in the title, and offers no brain', () => {
    const bar = barOf(TRACKER_IDS.analyticsSandbox);
    expect(bar.status.word).toBe('Not readable');
    expect(lineTextOf(TRACKER_IDS.analyticsSandbox)).toBe('forge 4.1 · newer than this Gaia, built for 3.1');
    expect(bar.status.line.filter((segment) => segment.look === 'version').map((segment) => segment.text)).toEqual(['4.1', '3.1']);
    expect(bar.status.text).toBe('Analytics Sandbox is forge 4.1 and serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1, so they cannot talk.');
    expect(bar.brain).toBeNull();
    expect(bar.pauseOrUnpause).toBeNull();
    expect(bar.stop).toBeNull();
    expect(bar.cannotTalk).toEqual({
      verdict:            'newer',
      unsentControls:     ['Pause', 'Stop'],
      unsentControlTitle: 'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
    });
  });

  test('of an older forge reads "Needs update" by the outdated dot and leaves only Stop unsent beside Update forge', () => {
    const bar = barOf(TRACKER_IDS.exampleBilling);
    expect(bar.status.condition).toBe('outdated');
    expect(bar.status.word).toBe('Needs update');
    expect(lineTextOf(TRACKER_IDS.exampleBilling)).toBe('forge 1.8 · older than this Gaia, built for 3.1');
    expect(bar.status.text).toBe('Example Billing is forge 1.8; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated.');
    expect(bar.cannotTalk).toEqual({
      verdict:            'older',
      unsentControls:     ['Stop'],
      unsentControlTitle: 'Example Billing is forge 1.8; this Gaia is built for forge 3.1.',
    });
  });

  test('of a forge that states no version is older and says so', () => {
    expect(lineTextOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION)).toBe('states no version · older than this Gaia');
    expect(barOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION).cannotTalk?.verdict).toBe('older');
  });

  test('of an ahead forge keeps its condition, controls and brain, and ends its line with the quiet version clause', () => {
    const bar = barOf(TRACKER_IDS.exampleStorefront);
    expect(bar.status.word).toBe('Live');
    expect(lineTextOf(TRACKER_IDS.exampleStorefront)).toBe('4 / 5 agents · 2 wait on you · forge 3.4, its newest parts only in its Bridge');
    expect(bar.status.text).toStartWith('Example Storefront is forge 3.4; this Gaia is built for 3.1.');
    expect(bar.cannotTalk).toBeNull();
    expect(bar.pauseOrUnpause?.label).toBe('Pause');
    expect(bar.stop).not.toBeNull();
    expect(bar.brain).not.toBeNull();
  });

  test('of a current forge names no version', () => {
    expect(lineTextOf(TRACKER_IDS.invoiceService)).not.toContain('forge 3.1');
    expect(barOf(TRACKER_IDS.invoiceService).cannotTalk).toBeNull();
  });
});

describe('Update forge in the bar of an older forge', () => {
  const refused: CommandState = {
    ...IDLE,
    failure: {
      kind:   'forge-update',
      result: {
        verdict: 'answered',
        answer:  {
          answerVersion: 3, outcome: 'refused', refusal: 'repository-busy', text: 'Another forge command holds the repository.'
        }
      },
    },
  };

  test('is idle, pending while on its way, and done while the restart it left is pending', () => {
    expect(ForgeFrameModel.updateStepOf(IDLE)).toEqual({ step: 'idle' });
    expect(ForgeFrameModel.updateStepOf({ ...IDLE, onItsWay: 'forge-update' })).toEqual({ step: 'pending' });
    expect(ForgeFrameModel.updateStepOf({ ...IDLE, restartPending: true })).toEqual({ step: 'done' });
  });

  test('a refusal carries the forge\'s code and sentence and its whole sentence for the title', () => {
    expect(ForgeFrameModel.updateStepOf(refused)).toEqual({
      step:          'refused',
      lead:          'The forge refused Update: ',
      code:          'repository-busy',
      sentence:      'Another forge command holds the repository.',
      wholeSentence: 'The forge refused Update: repository-busy. Another forge command holds the repository.',
    });
  });

  test('a refused update shows in the bar and not under it as well, while any other refusal still shows under it', () => {
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleBilling, refused.failure, true)).toBeNull();
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleBilling, refused.failure, false)?.commandLabel).toBe('Update forge');
    expect(ForgeFrameModel.barRefusalOf(TRACKER_IDS.exampleBilling, { kind: 'forge-open-in-browser', result: { verdict: 'server-unreachable' } }, true))
      .not.toBeNull();
  });
});
