/** A log record's `details` is the sentence the code wrote before the records; `FrozenHephaestusLogDetails.json` holds one for each kind. */
import { describe, expect, test } from 'bun:test';

import type { HephaestusLogKind, HephaestusLogRecord } from '../@types/HephaestusLogRecord.ts';
import FROZEN_ROWS                                     from './FrozenHephaestusLogDetails.json';
import { HephaestusLogWordingUtil }                    from './HephaestusLogWordingUtil.ts';

interface FrozenRow {
  case:    string;
  record:  HephaestusLogRecord;
  details: string;
}

const ROWS = FROZEN_ROWS as unknown as readonly FrozenRow[];

/** Every kind, so a kind added to the union fails here until it has its frozen row. */
const EVERY_KIND: Readonly<Record<HephaestusLogKind, true>> = {
  'hephaestus-serving':                       true,
  'stop-signal-received':                     true,
  'runtime-command-received':                 true,
  'talos-asked-to-quit-for-restart':          true,
  'board-state-unreadable-for-event-stream':  true,
  'restart-refused':                          true,
  'handover-started':                         true,
  'released-to-successor':                    true,
  'successor-started':                        true,
  'successor-could-not-serve':                true,
  'stop-wait-failed-late':                    true,
  'stop-wait-cut-short':                      true,
  'crashed-staying-off':                      true,
  'taken-over-stopping':                      true,
  'hephaestus-stopped':                       true,
  'staying-off-after-crash':                  true,
  'talos-started':                            true,
  'talos-attached':                           true,
  'talos-connection-closed':                  true,
  'no-talos-serves':                          true,
  'talos-stopped-after-quit-wait':            true,
  'talos-lost':                               true,
  'talos-endpoint-does-not-fit':              true,
  'talos-did-not-serve':                      true,
  'talos-protocol-differs':                   true,
  'talos-did-not-welcome':                    true,
  'lost-cause-unreadable':                    true,
  'lost-child-stop-refused':                  true,
  'crashed':                                  true,
  'crash-log-leaves-out-presence':            true,
  'crash-log-leaves-out-heartbeat':           true,
  'crash-log-unwritten':                      true,
  'crashed-ending-unwritten':                 true,
  'lease-renewal-unstoppable':                true,
  'registry-crash-unwritten':                 true,
  'board-file-unreadable':                    true,
  'heartbeat-unreadable-rewritten':           true,
  'heartbeat-unreadable-at-start':            true,
  'stale-lock-record-taken-over':             true,
  'stale-hephaestus-lock-taken-over':         true,
  'agent-slot-taken-over':                    true,
  'agent-slot-unreadable':                    true,
  'gate-run-slot-taken-over':                 true,
  'gate-run-slot-unreadable':                 true,
  'merged-tree-gate-started':                 true,
  'merged-tree-gate-kept-outcome-unreadable': true,
  'merged-tree-gate-ended':                   true,
  'merged-tree-gate-ended-without-outcome':   true,
  'merged-tree-gate-stopped-while-running':   true,
  'merged-tree-gate-run-folder-removed':      true,
  'gate-profile-failed':                      true,
  'gate-profile-worktree-left-over':          true,
  'gate-profile-output-unreadable':           true,
  'gate-profile-output-line-unreadable':      true,
  'pipeline-check-failed':                    true,
  'pipeline-check-worktree-left-over':        true,
  'lease-renewal-without-connection':         true,
  'lease-renewal-unanswered':                 true,
  'lease-renewal-refused':                    true,
  'lease-renewal-withheld':                   true,
  'gate-red':                                 true,
  'guard-cannot-start':                       true,
  'line-refused':                             true,
  'line-launched':                            true,
  'line-not-launched':                        true,
  'merge-line-launched':                      true,
  'fresh-worktree-differs':                   true,
  'worktree-creation-failed':                 true,
  'seen-head-unreadable':                     true,
  'document-agent-snapshot-left-over':        true,
  'pipeline-agent-snapshot-left-over':        true,
  'child-event-log-malformed':                true,
  'usage-marker-malformed':                   true,
  'session-confinement-refused':              true,
  'tool-left-off-search-path':                true,
  'job-file-unreadable-at-launch':            true,
  'pipeline-agent-awaits-billing':            true,
  'airlock-agent-root-unmade':                true,
  'airlock-agent-conflicts-unknown':          true,
  'commits-unsigned-despite-signing':         true,
  'child-instance-not-launched':              true,
  'child-instance-launched':                  true,
  'cleanup-declined':                         true,
  'presence-unrecorded':                      true,
  'pass-abandoned':                           true,
  'pass-crashed':                             true,
  'pass-crash-path-threw':                    true,
  'child-instance-lost':                      true,
};

describe('the frozen details of each log record', () => {
  test.each(ROWS.map((row) => [row.case, row] as const))('%s', (_caseName, row) => {
    expect(HephaestusLogWordingUtil.detailsOf(row.record)).toBe(row.details);
  });

  test('every kind has a frozen row', () => {
    const frozenKinds = new Set(ROWS.map((row) => row.record.kind));
    expect(Object.keys(EVERY_KIND).filter((kind) => !frozenKinds.has(kind as HephaestusLogKind))).toEqual([]);
  });
});

describe('the stored line', () => {
  test('is one JSON object: at, the kind and its keys, then the details', () => {
    const record: HephaestusLogRecord = { kind: 'talos-lost', talosStartNumber: 4, sweptOrphans: 2 };
    const storedLine = HephaestusLogWordingUtil.storedLineOf(record, '2026-11-27T10:00:00+01:00');
    expect(storedLine).not.toContain('\n');
    expect(Object.entries(JSON.parse(storedLine) as object)).toEqual([
      ['at', '2026-11-27T10:00:00+01:00'],
      ['kind', 'talos-lost'],
      ['talosStartNumber', 4],
      ['sweptOrphans', 2],
      ['details', 'Talos 4 was lost; 2 of its children were swept.'],
    ]);
  });

  test('keeps a problem as its code and values, never as a sentence', () => {
    const record: HephaestusLogRecord = { kind: 'heartbeat-unreadable-rewritten', problem: { code: 'heartbeat-field-malformed', field: 'sequence' } };
    const stored = JSON.parse(HephaestusLogWordingUtil.storedLineOf(record, '2026-11-27T10:00:00+01:00')) as Record<string, unknown>;
    expect(stored['problem']).toEqual({ code: 'heartbeat-field-malformed', field: 'sequence' });
  });
});
