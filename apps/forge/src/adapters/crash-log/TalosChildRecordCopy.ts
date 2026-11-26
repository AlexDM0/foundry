/**
 * A Talos child record copied into a crash log as stored, for evidence, never interpreted: parsed where it is JSON, its text where it is not.
 * Talos versions the record itself (`formatVersion`), and the copy keeps whatever version it found.
 */
import { readFileSync } from 'node:fs';

import { StoredValueUtil } from '../utils/StoredValueUtil.ts';

export type TalosChildRecordCopyReading = { verdict: 'readable'; copy: unknown } | { verdict: 'absent' };

export class TalosChildRecordCopy {
  constructor(private readonly childRecordFilePath: string) {}

  /** Never throws: a record that was never written, or cannot be read at all, has nothing to copy. */
  read(): TalosChildRecordCopyReading {
    let text: string;
    try {
      text = readFileSync(this.childRecordFilePath, 'utf8');
    } catch {
      return { verdict: 'absent' };
    }
    const parsedJson = StoredValueUtil.parsedJsonOf(text);
    return { verdict: 'readable', copy: parsedJson.verdict === 'parsed' ? parsedJson.value : text };
  }
}
