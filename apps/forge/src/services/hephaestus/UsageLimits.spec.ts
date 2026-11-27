/**
 * The pure parts of the usage-limit handling: only a top-level refusal counts, a past reset holds for the backoff, the latest reset wins and
 * a marker never moves earlier, since another board may have met a longer limit; the scheduled wake never overflows the timer, and each
 * reported window shows as a whole percent but under API billing.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';
import { UsageMarkerFile }                                from '../../adapters/usage-marker/UsageMarkerFile.ts';
import type { UsageWindowsReading }                       from '../../adapters/usage-marker/UsageWindowsFile.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { UsageLimits }                                    from './UsageLimits.ts';

const WINDOW_EVENT = {
  kind: 'usage-window', window: 'five_hour', lengthHours: 5, utilization: 1, resetsAt: '2026-11-01T22:00:00.000Z', status: 'rejected'
} as const;

describe('refusalOf', () => {
  const REFUSED_AT = '2026-11-01T20:00:00.000Z';

  test('a refusing window event is a hit with its window and reset', () => {
    expect(UsageLimits.refusalOf({ ...WINDOW_EVENT, requestsRefused: true }, REFUSED_AT))
      .toEqual({ window: 'five_hour', resetsAt: '2026-11-01T22:00:00.000Z' });
  });

  test('a refusal whose reset is not after the refusal, or unreadable, holds for the backoff, so the job is not resumed at once', () => {
    const backoffReset = '2026-11-01T20:01:00.000Z';
    for (const resetsAt of ['1970-01-01T00:00:00.000Z', REFUSED_AT, 'not a time']) {
      expect(UsageLimits.refusalOf({ ...WINDOW_EVENT, resetsAt, requestsRefused: true }, REFUSED_AT)).toEqual({ window: 'five_hour', resetsAt: backoffReset });
    }
  });

  test('a refusal whose vendor named no usable reset holds for the backoff', () => {
    expect(UsageLimits.refusalOf({ ...WINDOW_EVENT, resetsAt: null, requestsRefused: true }, REFUSED_AT))
      .toEqual({ window: 'five_hour', resetsAt: '2026-11-01T20:01:00.000Z' });
  });

  test('a warning, or any other event, is none', () => {
    expect(UsageLimits.refusalOf({ ...WINDOW_EVENT, status: 'allowed_warning', requestsRefused: false }, REFUSED_AT)).toBeNull();
    expect(UsageLimits.refusalOf({ kind: 'permission-denied', toolName: 'Bash' }, REFUSED_AT)).toBeNull();
  });
});

describe('usageResetsAtOf', () => {
  const marked = {
    verdict: 'read',
    marker:  {
      vendor: 'claude-code', window: 'seven_day', resetsAt: '2026-11-03T00:00:00.000Z', seenBy: { trackerId: 't', jobId: 'J1' }
    }
  } as const;

  test('is null with no marker and no hit, and the latest of both otherwise', () => {
    expect(UsageLimits.usageResetsAtOf({ verdict: 'absent' }, [])).toBeNull();
    expect(UsageLimits.usageResetsAtOf({ verdict: 'absent' }, [{ jobId: 'J2', window: 'five_hour', resetsAt: '2026-11-01T22:00:00.000Z' }])).toBe('2026-11-01T22:00:00.000Z');
    expect(UsageLimits.usageResetsAtOf(marked, [{ jobId: 'J2', window: 'five_hour', resetsAt: '2026-11-01T22:00:00.000Z' }])).toBe('2026-11-03T00:00:00.000Z');
    expect(UsageLimits.usageResetsAtOf({ verdict: 'malformed', reason: 'example' }, [])).toBeNull();
  });
});

describe('markHits', () => {
  let monitorFolder = '';

  beforeEach(() => {
    monitorFolder = createScratchDirectory('usage-limits');
  });

  afterEach(() => {
    removeScratchDirectory(monitorFolder);
  });

  test('writes the latest hit, and never moves a later marker earlier', () => {
    UsageLimits.markHits(monitorFolder, 'claude-code', 'example-tracker', [
      { jobId: 'J1', window: 'five_hour', resetsAt: '2026-11-01T22:00:00.000Z' },
      { jobId: 'J2', window: 'seven_day', resetsAt: '2026-11-03T00:00:00.000Z' },
    ]);
    UsageLimits.markHits(monitorFolder, 'claude-code', 'other-tracker', [{ jobId: 'J9', window: 'five_hour', resetsAt: '2026-11-02T00:00:00.000Z' }]);
    expect(UsageMarkerFile.read(monitorFolder)).toEqual({
      verdict: 'read',
      marker:  {
        vendor: 'claude-code', window: 'seven_day', resetsAt: '2026-11-03T00:00:00.000Z', seenBy: { trackerId: 'example-tracker', jobId: 'J2' }
      },
    });
  });

  test('writes nothing without a hit', () => {
    UsageLimits.markHits(monitorFolder, 'claude-code', 'example-tracker', []);
    expect(UsageMarkerFile.read(monitorFolder)).toEqual({ verdict: 'absent' });
  });
});

describe('millisecondsUntilReset', () => {
  const now = new Date('2026-11-01T21:00:00.000Z');

  test('is the time left, or null with no limit or once the reset passed', () => {
    expect(UsageLimits.millisecondsUntilReset('2026-11-01T21:00:01.000Z', now)).toBe(1000);
    expect(UsageLimits.millisecondsUntilReset('2026-11-01T21:00:00.000Z', now)).toBeNull();
    expect(UsageLimits.millisecondsUntilReset(null, now)).toBeNull();
  });

  test('a reset weeks away is capped at the longest delay a timer holds, so the wake never fires at once', () => {
    expect(UsageLimits.millisecondsUntilReset('2026-12-31T00:00:00.000Z', now)).toBe(2_147_483_647);
  });
});

describe('the usage windows', () => {
  const observation = {
    window: 'five_hour', lengthHours: 5, utilization: 0.19, resetsAt: '2026-11-01T22:00:00.000Z'
  };
  const windowsRead: UsageWindowsReading = {
    verdict: 'read',
    windows: [observation, {
      window: 'seven_day', lengthHours: 168, utilization: 0.461, resetsAt: '2026-11-04T09:00:00.000Z'
    }],
    storedText: '',
    document:   {}
  };

  test('every reported window is an observation, refused or not, and nothing else is one', () => {
    const refusedWindow = UsageLimits.windowObservationOf({ ...WINDOW_EVENT, requestsRefused: true }, false);
    expect(refusedWindow).toEqual({
      window: 'five_hour', lengthHours: 5, utilization: 1, resetsAt: '2026-11-01T22:00:00.000Z'
    });
    expect(UsageLimits.windowObservationOf({ ...WINDOW_EVENT, status: 'allowed', requestsRefused: false }, false)).not.toBeNull();
    expect(UsageLimits.windowObservationOf({ kind: 'permission-denied', toolName: 'Bash' }, false)).toBeNull();
  });

  test('a window whose vendor named no usable reset is no observation, since the stored windows hold a stamp', () => {
    expect(UsageLimits.windowObservationOf({ ...WINDOW_EVENT, resetsAt: null, requestsRefused: true }, false)).toBeNull();
  });

  test('under API billing no window is an observation', () => {
    expect(UsageLimits.windowObservationOf({ ...WINDOW_EVENT, requestsRefused: false }, true)).toBeNull();
  });

  test('the facts show only the windows seen, each as a whole percent, beside the marker', () => {
    expect(UsageLimits.usageFactsOf({ verdict: 'absent' }, windowsRead, false)).toEqual({
      resetsAt: null,
      window:   null,
      windows:  [
        {
          window: 'five_hour', lengthHours: 5, utilization: 19, resetsAt: '2026-11-01T22:00:00.000Z'
        },
        {
          window: 'seven_day', lengthHours: 168, utilization: 46, resetsAt: '2026-11-04T09:00:00.000Z'
        },
      ],
    });
  });

  test('no observation, a malformed file and API billing show no window', () => {
    expect(UsageLimits.usageFactsOf({ verdict: 'absent' }, { verdict: 'absent' }, false).windows).toEqual([]);
    expect(UsageLimits.usageFactsOf({ verdict: 'absent' }, { verdict: 'malformed', reason: 'example' }, false).windows).toEqual([]);
    expect(UsageLimits.usageFactsOf({ verdict: 'absent' }, windowsRead, true).windows).toEqual([]);
  });
});
