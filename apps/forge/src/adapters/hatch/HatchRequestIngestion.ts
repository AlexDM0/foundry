/**
 * `<W>/hatch/<J>/requests/<requestId>.json`, a request a session under a job wrote. A request the Hatch refuses is still read, since it is
 * answered with its refusal; one naming another Hatch format waits for a Hephaestus that reads it, as does a file that cannot be read now.
 */
import { JsonRecordUtil }           from '../../lib/json-record/JsonRecordUtil.ts';
import { storedFileTextOf }         from '../StoredFileText.ts';
import { StoredValueUtil }          from '../utils/StoredValueUtil.ts';
import type { HatchRequestReading } from './@types/HatchFormat.ts';
import { HATCH_FORMAT_VERSION }     from './constants/HatchFormatVersion.ts';
import { HatchFormatUtil }          from './utils/HatchFormatUtil.ts';

export type HatchRequestFileReading =
  | { verdict: 'readable'; reading: HatchRequestReading }
  | { verdict: 'another-version'; hatchFormatVersion: number }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class HatchRequestIngestion {
  constructor(private readonly requestFilePath: string) {}

  /** Never throws. */
  read(): HatchRequestFileReading {
    const storedText = storedFileTextOf(this.requestFilePath);
    if (storedText.verdict !== 'readable') return storedText;
    const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
    if (parsedJson.verdict === 'unparseable') return { verdict: 'readable', reading: { verdict: 'refused', reason: 'malformed-hatch-request' } };
    const { value } = parsedJson;
    const hatchFormatVersion = JsonRecordUtil.valueIsAPlainObject(value) ? value['hatchFormatVersion'] : undefined;
    if (typeof hatchFormatVersion === 'number' && hatchFormatVersion !== HATCH_FORMAT_VERSION) return { verdict: 'another-version', hatchFormatVersion };
    return { verdict: 'readable', reading: HatchFormatUtil.requestReadingOfValue(value) };
  }
}
