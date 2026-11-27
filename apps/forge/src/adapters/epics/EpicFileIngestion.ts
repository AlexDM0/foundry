/** One epic file read into the model: a file that cannot be read or parsed is a `malformed` verdict with its problem and line, never a throw. */
import { readFileSync }         from 'node:fs';
import type { Epic }            from '../../domain/tracker-model/@types/Epic.ts';
import { utf8TextOf }           from '../Utf8Text.ts';
import type { EpicFileProblem } from './@types/EpicFileProblem.ts';
import { EpicDocumentUtil }     from './utils/EpicDocumentUtil.ts';

export type EpicFileReading =
  | { verdict: 'parsed'; epic: Epic }
  | { verdict: 'malformed'; problem: EpicFileProblem; line: number };

export class EpicFileIngestion {
  constructor(private readonly epicFilePath: string) {}

  read(): EpicFileReading {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(this.epicFilePath);
    } catch (problem) {
      return { verdict: 'malformed', problem: { code: 'file-unreadable', systemError: String(problem) }, line: 0 };
    }
    const text = utf8TextOf(bytes);
    if (text === null) return { verdict: 'malformed', problem: { code: 'file-not-utf8-text' }, line: 0 };

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
