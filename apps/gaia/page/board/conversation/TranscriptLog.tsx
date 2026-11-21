/**
 * A session's transcript, followed from the forge's job stream through Gaia's relay and shown as text, every entry with its role; the
 * board never parses a vendor line, and an agent's text never reaches the DOM as markup. The Agents view words an entry's mark and line its own way.
 */
import { Stamp, type StampProps } from 'design-system/Stamp';
import { useEffect, useState }    from 'react';

import type { BoardTranscriptEntryDocument }    from '../../@types/board/ConversationDocument.ts';
import type { TranscriptFollower }              from '../@types/BoardServices.ts';
import { presenceAttributeOf, useItemPresence } from '../shell/ItemPresence.ts';

/**
 * Every entry of the job's transcript so far, followed while mounted; starts empty again for another job. `historyKey` is the job's id once
 * its history arrived, `null` before, so a chat tells the history batch from a happening.
 */
export interface FollowedTranscript {
  readonly entries:    readonly BoardTranscriptEntryDocument[];
  readonly historyKey: string | null;
}

const NO_TRANSCRIPT: FollowedTranscript = { entries: [], historyKey: null };

export function useTranscript(jobId: string | null, followTranscript: TranscriptFollower): FollowedTranscript {
  const [followed, setFollowed] = useState<FollowedTranscript & { readonly jobId: string | null }>({ jobId, ...NO_TRANSCRIPT });
  useEffect(() => {
    if (jobId === null) return undefined;
    const receive = (received: readonly BoardTranscriptEntryDocument[]): void => setFollowed((previous) => ({
      jobId,
      historyKey: jobId,
      entries:    previous.jobId === jobId ? [...previous.entries, ...received] : [...received],
    }));
    const historyArrived = (): void => setFollowed((previous) => ({
      jobId,
      historyKey: jobId,
      entries:    previous.jobId === jobId ? previous.entries : [],
    }));
    const stream = followTranscript(jobId, { onEntries: receive, onHistory: historyArrived });
    return () => stream.close();
  }, [jobId, followTranscript]);
  return followed.jobId === jobId ? { entries: followed.entries, historyKey: followed.historyKey } : NO_TRANSCRIPT;
}

export interface TranscriptLogProps {
  readonly label:       string;
  readonly entries:     readonly BoardTranscriptEntryDocument[];
  /** What an entry's mark says; its role by default. */
  readonly roleTextOf?: (entry: BoardTranscriptEntryDocument) => string;
  /** What an entry's line says; its text by default. */
  readonly textOf?:     (entry: BoardTranscriptEntryDocument) => string;
  /** The stamp in an entry's time column; with none, no time column is drawn. */
  readonly stampOf?:    (entry: BoardTranscriptEntryDocument) => StampProps | null;
}

export function TranscriptLog({
  label, entries, roleTextOf = (entry) => entry.role, textOf = (entry) => entry.text, stampOf
}: TranscriptLogProps) {
  // The log mounts with the entries so far; each line the stream brings after rises in, and no line leaves.
  const presentEntries = useItemPresence(entries, ({ entryKey }) => entryKey).filter(({ presence }) => presence !== 'leaving');
  return (
    <ol className="board-transcript" aria-label={label} data-stamped={stampOf === undefined ? undefined : ''}>
      {presentEntries.map(({ item: entry, presence }) => {
        const stamp = stampOf?.(entry) ?? null;
        return (
          <li key={entry.entryKey} className="board-transcript-entry" data-role={entry.role} data-presence={presenceAttributeOf(presence)}>
            {stampOf === undefined ? null : <span className="board-transcript-time">{stamp === null ? null : <Stamp {...stamp} />}</span>}
            <span className="board-transcript-line">
              <span className="board-mark">{roleTextOf(entry)}</span>
              <span className="board-transcript-text">{textOf(entry)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
