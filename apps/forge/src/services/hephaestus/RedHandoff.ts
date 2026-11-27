/**
 * A red handoff's gate failure note, written in the job's folder as the same session is resumed to fix it: `gate-failure.md` for the agent to read
 * instead of rerunning the gate, and the facts its resume message is worded from, which a fresh session taking over reads again.
 */
import { join } from 'node:path';

import { RedHandoffIngestion, type RedHandoffFacts, type RedHandoffReading } from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import { createRedHandoffWriter }                                            from '../../adapters/red-handoff/RedHandoffWriter.ts';
import { writeFileAtomically }                                               from '../../lib/atomic-file/AtomicFile.ts';
import { StoredFileUnreadable }                                              from './StoredFileUnreadable.ts';

export const RED_HANDOFF_FILES = {
  gateFailureNote:  'gate-failure.md',
  facts:            'red-handoff.json',
  /**
   * The subfolder of an ended job's folder holding the red handoff of a stale green its ticket's gates turned red outside the Airlock, which
   * the next session of the same kind on the ticket takes over.
   */
  staleGreenFolder: 'stale-green',
} as const;

export const GATE_FAILURE_NOTE_OUTPUT_LIMITS = {
  HEAD_LINES: 40,
  TAIL_LINES: 40,
  BYTES:      8192,
} as const;

const OMISSION_MARK = (omittedLines: number): string => `[… ${omittedLines} lines omitted …]`;
/** Room kept for the omission mark and a character a byte cut splits, so the excerpt stays inside its bytes. */
const BYTE_CUT_MARGIN_BYTES = 64;

function bytesOf(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function firstBytesOf(text: string, byteCount: number): string {
  return Buffer.from(text, 'utf8').subarray(0, byteCount).toString('utf8').replace(/�$/u, '');
}

function lastBytesOf(text: string, byteCount: number): string {
  const bytes = Buffer.from(text, 'utf8');
  return bytes.subarray(Math.max(0, bytes.length - byteCount)).toString('utf8').replace(/^�/u, '');
}

/** The output's first and last lines with a mark for what lies between, cut to at most the byte limit, head and tail alike. */
function outputExcerptOf(output: string): string {
  const lines = output.replace(/\n$/, '').split('\n');
  const { HEAD_LINES, TAIL_LINES, BYTES } = GATE_FAILURE_NOTE_OUTPUT_LIMITS;
  const omittedLines = lines.length - HEAD_LINES - TAIL_LINES;
  const head = omittedLines > 0 ? lines.slice(0, HEAD_LINES).join('\n') : lines.join('\n');
  const tail = omittedLines > 0 ? lines.slice(-TAIL_LINES).join('\n') : '';
  const whole = omittedLines > 0 ? `${head}\n${OMISSION_MARK(omittedLines)}\n${tail}` : head;
  if (bytesOf(whole) <= BYTES) return whole;
  const halfBytes = Math.floor((BYTES - BYTE_CUT_MARGIN_BYTES) / 2);
  const cutTail = tail === '' ? head : tail;
  return `${firstBytesOf(head, halfBytes)}\n[… cut to ${BYTES} bytes …]\n${lastBytesOf(cutTail, halfBytes)}`;
}

const GATE_FAILURE_NOTE_HEADINGS: Readonly<Record<RedHandoffFacts['kind'], (name: string) => string>> = {
  'gate':           (name) => `Gate \`${name}\` is red`,
  'customs':        (name) => `Customs check ${name} is red`,
  'merge-conflict': (name) => `The merge of \`${name}\` conflicts`,
};

const OUTPUT_BOUNDS_TEXT = `first ${GATE_FAILURE_NOTE_OUTPUT_LIMITS.HEAD_LINES} and last ${GATE_FAILURE_NOTE_OUTPUT_LIMITS.TAIL_LINES} lines, `
  + `at most ${GATE_FAILURE_NOTE_OUTPUT_LIMITS.BYTES} bytes`;

/** A conflicted merge names the tip it took, and its output is the conflicted files. */
function gateFailureNoteTextOf(facts: Readonly<RedHandoffFacts>, output: string): string {
  if (facts.kind === 'merge-conflict') {
    return [
      `# ${GATE_FAILURE_NOTE_HEADINGS[facts.kind](facts.name)}`,
      '',
      `- Merged tip: ${facts.mergedTip ?? '-'}`,
      `- Branch tip: ${facts.commit}`,
      '',
      '## Conflicted files',
      '',
      ...output.split('\n').filter((path) => path !== '').map((path) => `- ${path}`),
      '',
    ].join('\n');
  }
  return [
    `# ${GATE_FAILURE_NOTE_HEADINGS[facts.kind](facts.name)}`,
    '',
    `- Gate: ${facts.kind === 'gate' ? facts.name : '-'}`,
    `- Customs check: ${facts.kind === 'customs' ? facts.name : '-'}`,
    `- Command: ${facts.command === null ? '-' : `\`${facts.command}\``}`,
    `- Fix command: ${facts.fixCommand === null ? '-' : `\`${facts.fixCommand}\``}`,
    `- Commit: ${facts.commit}`,
    `- Exit code: ${facts.exitCode === null ? '-' : String(facts.exitCode)}`,
    `- Full log: ${facts.fullLogPath ?? '-'}`,
    '',
    `## Output (${OUTPUT_BOUNDS_TEXT})`,
    '',
    '```',
    outputExcerptOf(output),
    '```',
    '',
  ].join('\n');
}

function gateFailureNotePathOf(jobFolder: string): string {
  return join(jobFolder, RED_HANDOFF_FILES.gateFailureNote);
}

/** Written before the job is interrupted, so the resume that reads the facts always finds the note beside them. */
function writeRedHandoff(jobFolder: string, facts: Readonly<RedHandoffFacts>, output: string): void {
  writeFileAtomically(facts.gateFailureNotePath, gateFailureNoteTextOf(facts, output));
  createRedHandoffWriter(join(jobFolder, RED_HANDOFF_FILES.facts)).write(facts);
}

/**
 * A fresh session taking over a red handoff keeps the facts in its own folder, so its calls count against the resume budget. Facts of its
 * own that cannot be read are never written over: its next pass opens their incident.
 */
function adoptRedHandoff(jobFolder: string, facts: Readonly<RedHandoffFacts>): void {
  if (redHandoffReadingOf(jobFolder).verdict === 'absent') createRedHandoffWriter(join(jobFolder, RED_HANDOFF_FILES.facts)).write(facts);
}

/** The facts kept in `jobFolder`, as their ingestion reads them. */
function redHandoffReadingOf(jobFolder: string): RedHandoffReading {
  return new RedHandoffIngestion(join(jobFolder, RED_HANDOFF_FILES.facts)).read();
}

/** `null` for a job that never went red; facts that cannot be read are the unreadable file, named inside the board's data folder. */
function redHandoffFactsOf(trackerDirectory: string, jobFolder: string): RedHandoffFacts | null | StoredFileUnreadable {
  const reading = redHandoffReadingOf(jobFolder);
  if (reading.verdict === 'readable') return reading.facts;
  if (reading.verdict === 'absent') return null;
  return StoredFileUnreadable.unreadableFileOf(trackerDirectory, join(jobFolder, RED_HANDOFF_FILES.facts), reading.problem);
}

export const RedHandoff = Object.freeze({
  outputExcerptOf,
  gateFailureNoteTextOf,
  gateFailureNotePathOf,
  writeRedHandoff,
  adoptRedHandoff,
  redHandoffReadingOf,
  redHandoffFactsOf,
});
