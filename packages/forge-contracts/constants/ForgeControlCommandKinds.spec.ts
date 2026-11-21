/**
 * The list of every kind a client may send against the contract's two command unions. What matters: the list names each kind of
 * `ForgeControlCommand` and of `ForgeBoardCommand` once and nothing else, which a record keyed by every kind holds at compile time; and
 * the list cannot be changed at run time.
 */
import { describe, expect, test } from 'bun:test';

import { FORGE_CONTROL_COMMAND_KINDS, type ForgeClientCommandKind } from './ForgeControlCommandKinds.ts';

/** One key per kind of the two unions: a kind added to either, or a key that is no kind, fails the typecheck. */
const EVERY_CLIENT_COMMAND_KIND = {
  'hephaestus-pause':           true,
  'hephaestus-unpause':         true,
  'interrupted-work-resume':    true,
  'hephaestus-stop':            true,
  'hephaestus-restart':         true,
  'talos-restart':              true,
  'concurrency-set':            true,
  'job-stop-all':               true,
  'machine-agent-limit-set':    true,
  'chart-range-set':            true,
  'decision-answer':            true,
  'gate-profile-start':         true,
  'gate-profile-stop':          true,
  'intake-close':               true,
  'intake-start':               true,
  'job-fresh':                  true,
  'job-message':                true,
  'job-stop':                   true,
  'merge-accept':               true,
  'merge-update':               true,
  'pipeline-agent-advise':      true,
  'pipeline-apply':             true,
  'pipeline-apply-cancel':      true,
  'pipeline-assistant-set':     true,
  'pipeline-check':             true,
  'pipeline-constitution-edit': true,
  'pipeline-draft-discard':     true,
  'pipeline-draft-edit':        true,
  'pipeline-draft-undo':        true,
  'pipeline-setup-answer':      true,
  'pipeline-setup-billing':     true,
  'pipeline-setup-resume':      true,
  'pipeline-setup-start':       true,
  'pipeline-setup-start-over':  true,
  'pipeline-setup-step':        true,
  'pipeline-update-start':      true,
  'ticket-deliver-by-hand':     true,
  'ticket-hold':                true,
  'ticket-network':             true,
  'ticket-park':                true,
  'ticket-priority':            true,
  'ticket-ready':               true,
  'ticket-unhold':              true,
  'tracker-clear':              true,
} as const satisfies Record<ForgeClientCommandKind, true>;

describe('every kind a client may send', () => {
  test('names each kind of the control and the board commands exactly once, and nothing else', () => {
    expect(new Set(FORGE_CONTROL_COMMAND_KINDS).size).toBe(FORGE_CONTROL_COMMAND_KINDS.length);
    expect<string[]>([...FORGE_CONTROL_COMMAND_KINDS].sort()).toEqual(Object.keys(EVERY_CLIENT_COMMAND_KIND).sort());
  });

  test('is frozen', () => {
    expect(Object.isFrozen(FORGE_CONTROL_COMMAND_KINDS)).toBe(true);
  });
});
