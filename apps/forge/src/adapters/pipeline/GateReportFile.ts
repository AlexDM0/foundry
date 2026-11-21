/**
 * The report a gate may write at the path Hephaestus hands it in `FORGE_GATE_REPORT`: `{"version": 1, "cache": "hit" | "partial" |
 * "miss"}`, what the gate's own tool says of its cache. Anything else reads as no report, so a gate that wrote none, a wrong one or one of
 * an unknown version shows no cache mark.
 */
import { lstatSync } from 'node:fs';

import { JsonRecordUtil }       from '../../lib/json-record/JsonRecordUtil.ts';
import type { GateCacheReport } from '../../lib/tracker-model/@types/Job.ts';
import { GATE_CACHE_REPORTS }   from '../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { storedFileTextOf }     from '../StoredFileText.ts';
import { StoredValueUtil }      from '../utils/StoredValueUtil.ts';

export const GATE_REPORT_FORMAT_VERSION = 1;

/** A report is two short keys; a larger file is no report, so a gate cannot make Hephaestus read a file of any size. */
export const GATE_REPORT_SIZE_LIMIT_BYTES = 4096;

function cacheReportOf(text: string): GateCacheReport | null {
  const parsedJson = StoredValueUtil.parsedJsonOf(text);
  if (parsedJson.verdict === 'unparseable' || !JsonRecordUtil.valueIsAPlainObject(parsedJson.value)) return null;
  const { version, cache } = parsedJson.value;
  if (version !== GATE_REPORT_FORMAT_VERSION) return null;
  const cacheReports: readonly unknown[] = GATE_CACHE_REPORTS;
  return cacheReports.includes(cache) ? cache as GateCacheReport : null;
}

/** Only a regular file within the size limit is read: a link the gate left there is no report, and Hephaestus never follows it. */
function read(reportFilePath: string): GateCacheReport | null {
  try {
    const status = lstatSync(reportFilePath);
    if (!status.isFile() || status.size > GATE_REPORT_SIZE_LIMIT_BYTES) return null;
  } catch {
    return null;
  }
  const storedText = storedFileTextOf(reportFilePath);
  return storedText.verdict === 'readable' ? cacheReportOf(storedText.text) : null;
}

export const GateReportFile = Object.freeze({ cacheReportOf, read });
