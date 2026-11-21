/**
 * The forge-level conditions of `docs/design/screens.md` A1, "Forges that need a look": derived from one reading, never stored, at most one per forge, the
 * first that applies.
 */
import type { ForgeLook, ForgeLookKind } from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeReading }             from '../../../shared/@types/ForgeReading.ts';

/** The kind of the forge's warning that a restart failed: row 3 of that table. */
export const RESTART_FAILED_WARNING_KIND = 'restart-failed';

/** Hephaestus's notice that the code on disk is newer than the code it runs. */
export const NEW_CODE_NOTICE_KIND = 'new-code';

/** Warnings, notices, a held state and machine slots come from the current monitor snapshot, which only a forge read in full has. */
function forgeIsReadInFull(reading: ForgeReading): boolean {
  return reading.fidelity === 'full';
}

function restartFailed(reading: ForgeReading): boolean {
  return forgeIsReadInFull(reading) && reading.warnings.some((warning) => warning.kind === RESTART_FAILED_WARNING_KIND);
}

/** The monitor ingestion reads `hephaestus.state` `held-by-install-change` as the condition `held`. */
function launchesAreHeld(reading: ForgeReading): boolean {
  return forgeIsReadInFull(reading) && reading.condition === 'held';
}

function newCodeWaits(reading: ForgeReading): boolean {
  return forgeIsReadInFull(reading) && reading.notices.some((notice) => notice.kind === NEW_CODE_NOTICE_KIND);
}

/** A dormant forge Gaia read nothing of in this run has no ready count, and so no look: Gaia never reads a board's files. */
function dormantForgeHasReadyTickets(reading: ForgeReading): boolean {
  return reading.fidelity === 'dormant' && (reading.readyTicketCount ?? 0) > 0;
}

function ticketsWaitForAMachineSlot(reading: ForgeReading): boolean {
  return forgeIsReadInFull(reading) && (reading.concurrency?.ticketsWaitingForMachineSlot ?? 0) > 0;
}

/** The table of `docs/design/screens.md` A1, "Forges that need a look", in its order. */
const LOOK_RULES: readonly { readonly kind: ForgeLookKind; readonly applies: (reading: ForgeReading) => boolean }[] = [
  { kind: 'unreachable', applies: (reading) => reading.fidelity === 'unreachable' },
  { kind: 'newer-contract', applies: (reading) => reading.fidelity === 'newer-contract' },
  { kind: 'older-contract', applies: (reading) => reading.fidelity === 'older-contract' },
  { kind: 'restart-failed', applies: restartFailed },
  { kind: 'launches-held', applies: launchesAreHeld },
  { kind: 'new-code', applies: newCodeWaits },
  { kind: 'counts-only', applies: (reading) => reading.fidelity === 'counts-only' },
  { kind: 'dormant-with-ready-tickets', applies: dormantForgeHasReadyTickets },
  { kind: 'machine-limit-reached', applies: ticketsWaitForAMachineSlot },
];

function lookKindOf(reading: ForgeReading): ForgeLookKind | null {
  return LOOK_RULES.find((rule) => rule.applies(reading))?.kind ?? null;
}

/** One look per forge that needs one, in the forges' order. */
function looksOf(readings: readonly ForgeReading[]): ForgeLook[] {
  return readings.flatMap((reading) => {
    const kind = lookKindOf(reading);
    return kind === null ? [] : [{ trackerId: reading.trackerId, kind }];
  });
}

export const ForgeLookUtil = {
  lookKindOf,
  looksOf,
} as const;
