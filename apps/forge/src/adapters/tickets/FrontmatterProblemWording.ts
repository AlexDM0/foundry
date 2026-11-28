/** The words of what a ticket file and an epic file share going wrong: reading the file and the frontmatter's own lines. */
import type { FrontmatterProblem }    from '../../shared/@types/FrontmatterProblem.ts';
import type { RecordFileReadProblem } from '../../shared/@types/RecordFileReadProblem.ts';

function sentenceOf(problem: RecordFileReadProblem | FrontmatterProblem): string {
  switch (problem.code) {
    case 'file-unreadable':        return `the file could not be read: ${problem.systemError}`;
    case 'file-not-utf8-text':     return 'the file is not UTF-8 text';
    case 'first-line-not-a-fence': return 'the first line must be the frontmatter fence `---`';
    case 'no-closing-fence':       return 'the frontmatter has no closing `---` fence';
    case 'not-a-key-value-line':   return `\`${problem.lineText}\` is not a \`key: value\` line`;
    case 'quoted-value-unclosed':  return `\`${problem.field}\` opens a quoted value that does not close: ${problem.storedValue}`;
    case 'quoted-value-not-text':  return `\`${problem.field}\` is quoted but does not hold text`;
    case 'key-missing':            return `the frontmatter has no \`${problem.field}\` key`;
  }
}

export const FrontmatterProblemWording = Object.freeze({ sentenceOf });
