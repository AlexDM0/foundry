/** Every attendant; the list of attendant names the host can give `attend` is derived from it. */
import { WATCHER_SPARK_ATTENDANT } from './watcher-spark/WatcherSparkAttendant.ts';

export const ATTENDANT_CATALOG = Object.freeze([
  WATCHER_SPARK_ATTENDANT,
] as const);

export type AttendantName = typeof ATTENDANT_CATALOG[number]['name'];
