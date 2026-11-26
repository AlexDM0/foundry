import { LEASE_RENEWAL_INTERVAL_MILLISECONDS } from '../../../shared/constants/HephaestusLimits.ts';

export const CRASH_LOG_FORMAT_VERSION = 2;

/** The lines of `hephaestus.log` a crash log keeps from its end. */
export const CRASH_LOG_TAIL_LINES = 200;

/** At most this much of the end of `hephaestus.log` is read for a crash log's tail, however large the log grew. */
export const CRASH_LOG_TAIL_READ_BOUND_BYTES = 256 * 1024;

/** Numbers a crash log tries before it gives up, each taken meanwhile by a writer of another crash. */
export const CRASH_LOG_CREATION_ATTEMPTS = 16;

/** Abandoned passes in a row, a count, before the board gets a notice of them. */
export const ABANDONED_PASSES_BEFORE_NOTICE = 3;

/** How long the crash path lets its registry write run before the dying process goes on without it. */
export const CRASH_PATH_REGISTRY_BOUND_MILLISECONDS = 5_000;

const LEASE_RENEWAL_INTERVALS_BEFORE_A_HEARTBEAT_IS_STALE = 4;

/** A heartbeat older than this when the machine booted reads as a forge that had stopped beating before the reboot. */
export const HEARTBEAT_STALE_BEFORE_BOOT_MILLISECONDS = LEASE_RENEWAL_INTERVALS_BEFORE_A_HEARTBEAT_IS_STALE * LEASE_RENEWAL_INTERVAL_MILLISECONDS;
