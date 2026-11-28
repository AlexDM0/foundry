import type { HephaestusLog }       from '../adapters/@types/HephaestusLogRecord.ts';
import { HephaestusLogWordingUtil } from '../adapters/utils/HephaestusLogWordingUtil.ts';

/** A Hephaestus log for a spec: each record's details, the sentence standard error shows, pushed onto `details`. */
export function detailsLoggerOf(details: string[]): HephaestusLog {
  return (record) => {
    details.push(HephaestusLogWordingUtil.detailsOf(record));
  };
}
