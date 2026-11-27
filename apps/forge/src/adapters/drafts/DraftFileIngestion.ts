/** One draft file read into the model: a file that cannot be read or parsed is a `malformed` verdict with its problem, never a throw. */
import { readFileSync }                                 from 'node:fs';
import { DraftDocumentUtil, type DraftDocumentParsing } from './utils/DraftDocumentUtil.ts';

export class DraftFileIngestion {
  constructor(private readonly draftFilePath: string) {}

  read(): DraftDocumentParsing {
    let text: string;
    try {
      text = readFileSync(this.draftFilePath, 'utf8');
    } catch (problem) {
      return { verdict: 'malformed', problem: { code: 'file-unreadable', systemError: String(problem) } };
    }
    return DraftDocumentUtil.parsedDraftDocumentOf(text);
  }
}
