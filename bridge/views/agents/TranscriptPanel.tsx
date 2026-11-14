/**
 * A job's transcript under its "Transcript" head, replayed then followed. What it received is kept in the view's `TranscriptMemory`, so a
 * panel opened again on the same job shows it at once and asks only after the last cursor it holds. Every entry renders as text, with its
 * local time: an agent's markup is never markup here.
 */
import { EmptyState }          from 'design-system/EmptyState';
import { Row }                 from 'design-system/Row';
import { Text }                from 'design-system/Text';
import { useEffect, useState } from 'react';

import type {
  TranscriptEntryDocument,
  TranscriptStream,
  TranscriptStreamHandlers,
  TranscriptStreamOptions
} from '../../api/TranscriptStreamClient.ts';
import { ChatTurnWordingUtil } from '../../conversation/ChatTurnWordingUtil.ts';
import { TranscriptLog }       from '../../conversation/TranscriptLog.tsx';
import { useBridgeClock }      from '../../shell/BridgeClock.ts';
import { TimeUtil }            from '../../utils/TimeUtil.ts';
import { AgentsModel }         from './AgentsModel.ts';

export type FollowTranscript = (jobId: string, handlers: TranscriptStreamHandlers, options?: TranscriptStreamOptions) => TranscriptStream;

export interface HeldTranscript {
  entries: readonly TranscriptEntryDocument[];
  cursor:  string | null;
}

export type TranscriptMemory = Map<string, HeldTranscript>;

export interface TranscriptPanelProps {
  readonly jobId:            string;
  readonly memory:           TranscriptMemory;
  readonly followTranscript: FollowTranscript;
}

function roleTextOf(entry: TranscriptEntryDocument): string {
  return entry.parentToolUseId === undefined ? entry.role : `${entry.role} (subagent)`;
}

/** A tool call is collapsed to its tool's name, the rest to their text. */
function entryTextOf(entry: TranscriptEntryDocument): string {
  return entry.role === 'tool-call' ? entry.toolName ?? entry.text : entry.text;
}

export function TranscriptPanel({ jobId, memory, followTranscript }: TranscriptPanelProps) {
  const [entries, setEntries] = useState<readonly TranscriptEntryDocument[]>(() => memory.get(jobId)?.entries ?? []);
  // The viewer's day only picks the form a stamp is shown in.
  const todayCalendarDate = TimeUtil.calendarDateOf(useBridgeClock().now().getTime());

  useEffect(() => {
    const held = memory.get(jobId) ?? { entries: [], cursor: null };
    memory.set(jobId, held);
    const stream = followTranscript(jobId, {
      onEntries: (received) => {
        held.entries = [...held.entries, ...received];
        held.cursor = received.at(-1)?.cursor ?? held.cursor;
        setEntries(held.entries);
      },
    }, { after: held.cursor });
    return () => stream.close();
  }, [jobId, memory, followTranscript]);

  return (
    <div className="agents-transcript">
      <Row gap="eight" centerY>
        <Text bold element="h3">Transcript</Text>
        <Text typeRole="small" subtle>{AgentsModel.transcriptCountTextOf(entries.length)}</Text>
      </Row>
      {entries.length === 0
        ? <EmptyState text="No transcript yet." />
        : (
          <TranscriptLog
            label={`Transcript of ${jobId}`}
            entries={entries}
            roleTextOf={roleTextOf}
            textOf={entryTextOf}
            stampOf={(entry) => ChatTurnWordingUtil.stampOf(entry.at, todayCalendarDate)}
          />
        )}
    </div>
  );
}
