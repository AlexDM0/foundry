import type { TicketFileProblem, TicketFrontmatterVocabulary } from '../../shared/@types/TicketFileProblem.ts';
import { OLDER_FORMAT_ADVICE }                                 from '../constants/OlderFormatAdvice.ts';
import { FrontmatterProblemWording }                           from './FrontmatterProblemWording.ts';

const VOCABULARY_TEXT: Readonly<Record<TicketFrontmatterVocabulary, string>> = {
  'ticket-type':     'a known ticket type',
  'ticket-priority': 'a known ticket priority',
  'ticket-size':     'a known ticket size',
  'agent-model':     'a known agent model',
  'agent-effort':    'a known agent effort',
};

function sentenceOf(problem: TicketFileProblem): string {
  switch (problem.code) {
    case 'heading-in-frontmatter':
      return `line ${problem.lineNumber} is the markdown heading \`${problem.lineText}\`, and a frontmatter holds no heading (a comment has one \`#\`); `
        + `if the closing \`---\` fence was deleted, restore it above line ${problem.lineNumber}`;
    case 'one-hash-line-before-prose':
      return `line ${problem.lineNumber} \`${problem.lineText}\` is followed after blank lines by line ${problem.proseLineNumber}, which is not a \`key: value\` line: `
        + `if line ${problem.lineNumber} is a markdown heading, the closing \`---\` fence was deleted and belongs above it; `
        + `if it is a comment, line ${problem.proseLineNumber} does not belong in the frontmatter`;
    case 'line-indented':                   return `\`${problem.lineText}\` is indented, and this frontmatter has no nested structure`;
    case 'key-unusable':                    return `\`${problem.field}\` is not a usable frontmatter key`;
    case 'task-not-a-safe-whole-number':    return `\`${problem.field}\` is not a safe whole number: ${problem.storedValue}`;
    case 'task-quoted':                     return `\`${problem.field}\` is quoted, but a task is a whole number written without quotes: ${problem.storedValue}`;
    case 'not-a-whole-number':              return `\`${problem.field}\` is not a whole number: ${problem.storedValue}`;
    case 'value-unknown':                   return `\`${problem.field}\` is not ${VOCABULARY_TEXT[problem.vocabulary]}: ${problem.storedValue}`;
    case 'status-unknown':                  return `\`${problem.field}\` is not a known ticket status: ${problem.storedValue}; ${OLDER_FORMAT_ADVICE}`;
    case 'id-not-a-ticket-number':          return `\`${problem.field}\` is not a ticket number: ${problem.storedValue}`;
    case 'value-null':                      return `\`${problem.field}\` may not be null`;
    case 'releases-group-not-true-or-null': return `\`${problem.field}\` is neither true nor null: ${problem.storedValue}`;
    case 'names-a-non-ticket-number':       return `\`${problem.field}\` names something that is not a ticket number: ${problem.storedValue}`;
    case 'names-a-non-epic-key':            return `\`${problem.field}\` names something that is not an epic key: ${problem.storedValue}`;
    case 'names-a-non-public-domain':       return `\`${problem.field}\` names something that is not a public domain: ${problem.storedValue}`;
    case 'entity-blank':                    return `\`${problem.field}\` is blank, and it has to name an entity`;
    case 'content-hash-malformed':          return `\`${problem.field}\` is not a content hash of sixteen hex digits: ${problem.storedValue}`;
    default:                                return FrontmatterProblemWording.sentenceOf(problem);
  }
}

export const TicketFileProblemWording = Object.freeze({ sentenceOf });
