import type { HEARTBEAT_FORMAT_VERSION } from '../constants/HeartbeatFileVersions.ts';

/** `heartbeat.json`, written whole and atomically at each renewal Talos confirmed. */
export interface HeartbeatRecord {
  heartbeatVersion: typeof HEARTBEAT_FORMAT_VERSION;
  generation:       number;
  /** From 1, one up on each beat of the generation. */
  sequence:         number;
  /** Local ISO time of the beat. */
  at:               string;
}
