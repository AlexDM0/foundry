/**
 * A session's transcript, followed from the Overseer's job stream and shown as text, every entry with its role; the Bridge never parses a
 * vendor line, and an agent's text never reaches the DOM as markup. The Agents view words an entry's mark and line its own way.
 */
import { useEffect, useState } from 'react';

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
}

export function TranscriptLog({
  label, entries, roleTextOf = (entry) => entry.role, textOf = (entry) => entry.text
}: TranscriptLogProps) {
  return (
    <ol className="bridge-transcript" aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.entryKey} className="bridge-transcript-entry" data-role={entry.role}>
          <span className="bridge-mark">{roleTextOf(entry)}</span>
          <span className="bridge-transcript-text">{textOf(entry)}</span>
        </li>
      ))}
    </ol>
  );
}
