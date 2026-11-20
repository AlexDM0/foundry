/**
 * The registry logic against its own contract, on an example server's registry. What matters: a raise of the minimum lists exactly the
 * entries no client at the new minimum needs, and keeps the rest; the guard names every entry the current minimum already lets go, so it
 * fails from the raise until the entry is removed; a client of a version calls the one endpoint version that serves it; a versioned path
 * names its entry by template, segment for segment, and a template is filled with its values encoded; and each other way a registry can
 * contradict itself or the server's versions is named.
 */
import { describe, expect, test } from 'bun:test';

import type { CompatibilityEntry, CompatibilityPathEntry, EndpointEntry } from '../@types/CompatibilityEntry.ts';
import type { SystemVersion, VersionsDocument }                           from '../@types/VersionsDocument.ts';
import { CompatibilityRegistryUtil }                                      from './CompatibilityRegistryUtil.ts';

function versionOf(major: number, minor: number): SystemVersion {
  return { major, minor };
}

function endpointOf(endpoint: string, version: number, introducedIn: SystemVersion, lastNeededBy: SystemVersion | null): EndpointEntry {
  return {
    kind: 'endpoint',
    endpoint,
    version,
    introducedIn,
    lastNeededBy,
  };
}

function pathOf(name: string, introducedIn: SystemVersion, lastNeededBy: SystemVersion | null): CompatibilityPathEntry {
  return {
    kind: 'compatibility-path',
    name,
    introducedIn,
    lastNeededBy,
  };
}

const EXAMPLE_VERSIONS: VersionsDocument = { current: versionOf(3, 2), minimumSupported: versionOf(1, 0) };

const EXAMPLE_ORDERS_V1 = endpointOf('orders', 1, versionOf(1, 0), versionOf(1, 4));
const EXAMPLE_ORDERS_V2 = endpointOf('orders', 2, versionOf(2, 0), versionOf(2, 3));
const EXAMPLE_ORDERS_V3 = endpointOf('orders', 3, versionOf(3, 0), null);
const EXAMPLE_HEALTH_V1 = endpointOf('health', 1, versionOf(1, 0), null);
const EXAMPLE_LEGACY_ALIAS = pathOf('unversioned /api/orders', versionOf(1, 0), versionOf(1, 4));
const EXAMPLE_PRICE_MIGRATION = pathOf('prices as text', versionOf(2, 0), versionOf(2, 3));

const EXAMPLE_REGISTRY: readonly CompatibilityEntry[] = [
  EXAMPLE_ORDERS_V1,
  EXAMPLE_ORDERS_V2,
  EXAMPLE_ORDERS_V3,
  EXAMPLE_HEALTH_V1,
  EXAMPLE_LEGACY_ALIAS,
  EXAMPLE_PRICE_MIGRATION,
];

describe('raising the minimum', () => {
  test('lists exactly the entries last needed below the new minimum as removable, and keeps the rest', () => {
    const report = CompatibilityRegistryUtil.raiseReportOf(EXAMPLE_REGISTRY, EXAMPLE_VERSIONS, versionOf(2, 0));
    expect(report.removable).toEqual([EXAMPLE_ORDERS_V1, EXAMPLE_LEGACY_ALIAS]);
    expect(report.kept).toEqual([EXAMPLE_ORDERS_V2, EXAMPLE_ORDERS_V3, EXAMPLE_HEALTH_V1, EXAMPLE_PRICE_MIGRATION]);
  });

  test('keeps an entry whose last needing version is the new minimum itself, since that client is still supported', () => {
    expect(CompatibilityRegistryUtil.removableAt(EXAMPLE_REGISTRY, versionOf(2, 3))).toEqual([EXAMPLE_ORDERS_V1, EXAMPLE_LEGACY_ALIAS]);
    expect(CompatibilityRegistryUtil.removableAt(EXAMPLE_REGISTRY, versionOf(2, 4))).toEqual([EXAMPLE_ORDERS_V1, EXAMPLE_ORDERS_V2, EXAMPLE_LEGACY_ALIAS, EXAMPLE_PRICE_MIGRATION]);
  });

  test('answers the dry run as the removable entries, then the kept ones, each with its lifetime', () => {
    const answer = CompatibilityRegistryUtil.raiseMinimumAnswerOf(EXAMPLE_REGISTRY, EXAMPLE_VERSIONS, '2.0');
    expect(answer).toEqual({
      outcome: 'reported',
      text:    [
        'Raising the minimum supported version from 1.0 to 2.0 makes 2 entries removable:',
        '  endpoint orders at v1 (introduced in 1.0, last needed by 1.4)',
        '  unversioned /api/orders (introduced in 1.0, last needed by 1.4)',
        '4 entries must stay:',
        '  endpoint orders at v2 (introduced in 2.0, last needed by 2.3)',
        '  endpoint orders at v3 (introduced in 3.0, still needed)',
        '  endpoint health at v1 (introduced in 1.0, still needed)',
        '  prices as text (introduced in 2.0, last needed by 2.3)',
        'A dry run: nothing changed. Once the minimum is raised, the registry guard fails until each removable entry, and what it keeps, is removed.',
      ].join('\n'),
    });
  });

  test('says so when a raise makes nothing removable', () => {
    const answer = CompatibilityRegistryUtil.raiseMinimumAnswerOf([EXAMPLE_HEALTH_V1], EXAMPLE_VERSIONS, '1.1');
    expect(answer.text.split('\n')[0]).toBe('Raising the minimum supported version from 1.0 to 1.1 makes nothing removable.');
  });

  test('refuses a text that names no version, a minimum that is no raise, and one newer than the current version', () => {
    expect(['', 'next', '1.0', '0.9', '3.3'].map((requestedText) => CompatibilityRegistryUtil.raiseMinimumAnswerOf(EXAMPLE_REGISTRY, EXAMPLE_VERSIONS, requestedText)))
      .toEqual([
        { outcome: 'refused', text: 'Name the new minimum supported version as major.minor, such as 3.2.' },
        { outcome: 'refused', text: 'Name the new minimum supported version as major.minor, such as 3.2.' },
        { outcome: 'refused', text: '1.0 is no raise: the minimum supported version is 1.0.' },
        { outcome: 'refused', text: '0.9 is no raise: the minimum supported version is 1.0.' },
        { outcome: 'refused', text: '3.3 is newer than the current version 3.2, which no client could then be built for.' },
      ]);
    expect(CompatibilityRegistryUtil.raiseMinimumAnswerOf(EXAMPLE_REGISTRY, EXAMPLE_VERSIONS, undefined).outcome).toBe('refused');
  });
});

describe('the registry guard', () => {
  test('holds for a registry that agrees with its server\'s versions', () => {
    expect(CompatibilityRegistryUtil.inconsistenciesOf(EXAMPLE_REGISTRY, EXAMPLE_VERSIONS)).toEqual([]);
  });

  test('fails once the minimum is raised, naming each entry the raise made removable, until it is removed', () => {
    const raised: VersionsDocument = { ...EXAMPLE_VERSIONS, minimumSupported: versionOf(2, 0) };
    expect(CompatibilityRegistryUtil.inconsistenciesOf(EXAMPLE_REGISTRY, raised)).toEqual([
      'endpoint orders at v1 is last needed by 1.4, below the minimum supported 2.0: remove it and what it keeps',
      'unversioned /api/orders is last needed by 1.4, below the minimum supported 2.0: remove it and what it keeps',
    ]);
    const cleared = EXAMPLE_REGISTRY.filter((entry) => entry !== EXAMPLE_ORDERS_V1 && entry !== EXAMPLE_LEGACY_ALIAS);
    expect(CompatibilityRegistryUtil.inconsistenciesOf(cleared, raised)).toEqual([]);
  });

  test('names every planted contradiction of an entry with itself, with the versions, or with another entry', () => {
    const planted: readonly CompatibilityEntry[] = [
      endpointOf('orders', 0, versionOf(1, 0), null),
      endpointOf('quotes', 1, versionOf(3, 3), null),
      pathOf('reversed lifetime', versionOf(2, 0), versionOf(1, 5)),
      pathOf('needed by the current version', versionOf(2, 0), versionOf(3, 2)),
      pathOf('needed by the current version', versionOf(2, 0), null),
      endpointOf('health', 1, versionOf(1, 0), versionOf(2, 1)),
      endpointOf('health', 2, versionOf(2, 0), null),
    ];
    expect(CompatibilityRegistryUtil.inconsistenciesOf(planted, { current: versionOf(3, 2), minimumSupported: versionOf(3, 4) })).toEqual([
      'the minimum supported version 3.4 is newer than the current version 3.2',
      'endpoint orders at v0 has no whole version of at least 1',
      'endpoint quotes at v1 is introduced in 3.3, after the current version 3.2',
      'reversed lifetime is last needed by 1.5, before its introduction in 2.0',
      'reversed lifetime is last needed by 1.5, below the minimum supported 3.4: remove it and what it keeps',
      'needed by the current version is last needed by 3.2, not before the current version: an entry the current version needs has no last version',
      'needed by the current version is last needed by 3.2, below the minimum supported 3.4: remove it and what it keeps',
      'needed by the current version is named twice',
      'endpoint health at v1 is last needed by 2.1, below the minimum supported 3.4: remove it and what it keeps',
      'endpoint health at v1 and endpoint health at v2 are both needed by one client version',
    ]);
  });
});

describe('the entry a versioned path names', () => {
  const EXAMPLE_ORDER_LINES_V1 = endpointOf('orders/{orderId}/lines', 1, versionOf(1, 0), null);
  const EXAMPLE_ORDER_V1 = endpointOf('orders/{orderId}', 1, versionOf(1, 0), null);
  const TEMPLATED_REGISTRY: readonly CompatibilityEntry[] = [...EXAMPLE_REGISTRY, EXAMPLE_ORDER_LINES_V1, EXAMPLE_ORDER_V1];

  test('a template matches a concrete path of the same length, a literal endpoint only itself, each at its own version', () => {
    expect(CompatibilityRegistryUtil.endpointEntryForPath(TEMPLATED_REGISTRY, 'orders/O-1.a_b/lines', 1)).toBe(EXAMPLE_ORDER_LINES_V1);
    expect(CompatibilityRegistryUtil.endpointEntryForPath(TEMPLATED_REGISTRY, 'orders/O1', 1)).toBe(EXAMPLE_ORDER_V1);
    expect(CompatibilityRegistryUtil.endpointEntryForPath(TEMPLATED_REGISTRY, 'orders', 3)).toBe(EXAMPLE_ORDERS_V3);
    expect(CompatibilityRegistryUtil.endpointEntryForPath(TEMPLATED_REGISTRY, 'orders/O1/lines', 2)).toBeNull();
  });

  test('refuses an empty segment, an extra or a missing segment, a percent-escape and a compatibility path of the same name', () => {
    const refusedPaths = ['orders//lines', 'orders/O1/lines/extra', 'orders/O1/extra', 'orders/O%2F1/lines', 'orders/', 'health/extra'];
    expect(refusedPaths.map((endpointPath) => CompatibilityRegistryUtil.endpointEntryForPath(TEMPLATED_REGISTRY, endpointPath, 1))).toEqual(refusedPaths.map(() => null));
    expect(CompatibilityRegistryUtil.endpointEntryForPath([pathOf('orders', versionOf(1, 0), null)], 'orders', 1)).toBeNull();
  });

  test('a template is filled from its values, each encoded, and a missing value throws', () => {
    expect(CompatibilityRegistryUtil.endpointPathOf('orders/{orderId}/lines', { orderId: 'O 1/2' })).toBe('orders/O%201%2F2/lines');
    expect(CompatibilityRegistryUtil.endpointPathOf('health', {})).toBe('health');
    expect(() => CompatibilityRegistryUtil.endpointPathOf('orders/{orderId}/lines', { lineId: 'L1' })).toThrow('{orderId}');
    expect(() => CompatibilityRegistryUtil.endpointPathOf('orders/{constructor}', {})).toThrow('{constructor}');
  });

  test('a template with an empty name or with two equal names is an inconsistency', () => {
    const planted: readonly CompatibilityEntry[] = [
      endpointOf('orders/{}/lines', 1, versionOf(1, 0), null),
      endpointOf('orders/{orderId}/lines/{orderId}', 1, versionOf(1, 0), null),
      EXAMPLE_ORDER_LINES_V1,
    ];
    expect(CompatibilityRegistryUtil.inconsistenciesOf(planted, EXAMPLE_VERSIONS)).toEqual([
      'endpoint orders/{}/lines at v1 has a template segment with no name',
      'endpoint orders/{orderId}/lines/{orderId} at v1 names {orderId} twice',
    ]);
  });
});

describe('the endpoint version a client calls', () => {
  test('is the one version of the endpoint whose lifetime holds the client\'s version', () => {
    const versionsCalled = [versionOf(1, 0), versionOf(1, 4), versionOf(2, 0), versionOf(2, 3), versionOf(3, 2)]
      .map((clientVersion) => CompatibilityRegistryUtil.endpointVersionAt(EXAMPLE_REGISTRY, 'orders', clientVersion));
    expect(versionsCalled).toEqual([1, 1, 2, 2, 3]);
  });

  test('is none for an endpoint the server does not serve that client, and none for a compatibility path of the same name', () => {
    expect(CompatibilityRegistryUtil.endpointVersionAt(EXAMPLE_REGISTRY, 'orders', versionOf(2, 4))).toBeNull();
    expect(CompatibilityRegistryUtil.endpointVersionAt(EXAMPLE_REGISTRY, 'quotes', versionOf(3, 2))).toBeNull();
    expect(CompatibilityRegistryUtil.endpointVersionAt([pathOf('orders', versionOf(1, 0), null)], 'orders', versionOf(1, 0))).toBeNull();
  });
});
