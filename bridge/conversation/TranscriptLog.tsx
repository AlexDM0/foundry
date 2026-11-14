/**
 * A session's transcript, followed from the Overseer's job stream and shown as text, every entry with its role; the Bridge never parses a
 * vendor line, and an agent's text never reaches the DOM as markup. The Agents view words an entry's mark and line its own way.
 */
import { Stamp, type StampProps } from 'design-system/Stamp';
import { useEffect, useState }    from 'react';

import type { TranscriptEntryDocument, TranscriptStreamHandlers } from '../api/TranscriptStreamClient.ts';

export type TranscriptFollower = (jobId: string, handlers: TranscriptStreamHandlers) => { close: () => void };

/** Every entry of the job's transcript so far, followed while mounted; starts empty again for another job. */
export function useTranscript(jobId: string | null, followTranscript: TranscriptFollower): readonly TranscriptEntryDocument[] {
  const [entries, setEntries] = useState<{ jobId: string | null; entries: readonly TranscriptEntryDocument[] }>({ jobId, entries: [] });
  useEffect(() => {
    if (jobId === null) return undefined;
    const followed = (received: readonly TranscriptEntryDocument[]): void => setEntries((previous) => ({
      jobId,
      entries: previous.jobId === jobId ? [...previous.entries, ...received] : [...received],
    }));
    const stream = followTranscript(jobId, { onEntries: followed });
    return () => stream.close();
  }, [jobId, followTranscript]);
  return entries.jobId === jobId ? entries.entries : [];
}

export interface TranscriptLogProps {
  readonly label:       string;
  readonly entries:     readonly TranscriptEntryDocument[];
  /** What an entry's mark says; its role by default. */
  readonly roleTextOf?: (entry: TranscriptEntryDocument) => string;
  /** What an entry's line says; its text by default. */
  readonly textOf?:     (entry: TranscriptEntryDocument) => string;
  /** The stamp in an entry's time column; with none, no time column is drawn. */
  readonly stampOf?:    (entry: TranscriptEntryDocument) => StampProps | null;
}

export function TranscriptLog({
  label, entries, roleTextOf = (entry) => entry.role, textOf = (entry) => entry.text, stampOf
}: TranscriptLogProps) {
  return (
    <ol className="bridge-transcript" aria-label={label} data-stamped={stampOf === undefined ? undefined : ''}>
      {entries.map((entry) => {
        const stamp = stampOf?.(entry) ?? null;
        return (
          <li key={entry.entryKey} className="bridge-transcript-entry" data-role={entry.role}>
            {stampOf === undefined ? null : <span className="bridge-transcript-time">{stamp === null ? null : <Stamp {...stamp} />}</span>}
            <span className="bridge-transcript-line">
              <span className="bridge-mark">{roleTextOf(entry)}</span>
              <span className="bridge-transcript-text">{textOf(entry)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
