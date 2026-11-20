/** One epic file read into the model: a file that cannot be read or parsed is a `malformed` verdict with its reason and line, never a throw. */
import { readFileSync }     from 'node:fs';
import type { Epic }        from '../../lib/tracker-model/@types/Epic.ts';
import { utf8TextOf }       from '../Utf8Text.ts';
import { EpicDocumentUtil } from './utils/EpicDocumentUtil.ts';

export type EpicFileReading =
  | { verdict: 'parsed'; epic: Epic }
  | { verdict: 'malformed'; reason: string; line: number };

export class EpicFileIngestion {
  constructor(private readonly epicFilePath: string) {}

  read(): EpicFileReading {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(this.epicFilePath);
    } catch (problem) {
      return { verdict: 'malformed', reason: `the file could not be read: ${String(problem)}`, line: 0 };
    }
    const text = utf8TextOf(bytes);
    if (text === null) return { verdict: 'malformed', reason: 'the file is not UTF-8 text', line: 0 };

    const parsed = EpicDocumentUtil.parsedEpicDocumentOf(text);
    if (parsed.verdict === 'malformed') return parsed;
    return {
      verdict: 'parsed',
      epic:    {
        frontmatter: parsed.frontmatter,
        body:        parsed.body,
        lineEnding:  parsed.lineEnding,
      },
    };
  }
}
