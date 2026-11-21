/**
 * The forge route's presence under its bar, laid out from `ForgePresenceModel`: the alert with its Start, the crash logs with a Show log each
 * and the log once read, and the waiting work with its causes, a Resume per job that waits for an instruction and Resume all. Hook-free:
 * which logs are open and what each read gave come in as props.
 */

import type { CommandBody }     from '../../@types/CommandDocument.ts';
import { Callout }              from '../../components/Callout.tsx';
import { ConditionDot }         from '../../components/ConditionDot.tsx';
import { Button, MonoId, Text } from '../../lib/design-system/DesignSystemInterface.ts';
import {
  type CrashLogLine,
  type CrashLogShown,
  type ForgePresenceContent,
  ForgePresenceModel,
  type WaitingJobLine,
} from './ForgePresenceModel.ts';

/** What User opened of a crash log: its read on its way, the log as read, or a read that gave none. */
export type CrashLogOpening = { readonly phase: 'reading' } | { readonly phase: 'read'; readonly shown: CrashLogShown } | { readonly phase: 'not-read' };

export interface ForgePresenceLayoutProps {
  readonly project:           string;
  readonly content:           ForgePresenceContent;
  readonly openedCrashLogs:   ReadonlyMap<number, CrashLogOpening>;
  readonly commandIsOnItsWay: boolean;
  readonly onCommand:         (command: CommandBody) => void;
  readonly onOpenCrashLog:    (crashLogNumber: number) => void;
}

const CRASH_LOG_NOT_READ = 'Gaia could not read this crash log. It is readable while the forge serves.';
const LOG_TAIL_NOT_READ = 'The forge\'s log could not be read at the crash.';

function CrashLogBody({ shown }: { readonly shown: CrashLogShown }) {
  return (
    <div className="gaia-forge-presence-crash-log-body">
      <Text typeRole="small" element="h4">{shown.heading}</Text>
      {shown.errorLine === null ? null : <pre className="gaia-forge-presence-machine">{shown.errorLine}</pre>}
      {shown.stack === null ? null : <pre className="gaia-forge-presence-machine">{shown.stack}</pre>}
      <Text typeRole="small" element="h5">Active jobs</Text>
      {shown.activeJobs === null
        ? <Text typeRole="small" muted>{ForgePresenceModel.UNREAD_JOBS}</Text>
        : <pre className="gaia-forge-presence-machine">{shown.activeJobs.join('\n')}</pre>}
      <Text typeRole="small" element="h5">Log</Text>
      {shown.logTail === null
        ? <Text typeRole="small" muted>{LOG_TAIL_NOT_READ}</Text>
        : <pre className="gaia-forge-presence-machine">{shown.logTail.join('\n')}</pre>}
    </div>
  );
}

interface CrashLogItemProps {
  readonly line:           CrashLogLine;
  readonly opening:        CrashLogOpening | undefined;
  readonly onOpenCrashLog: (crashLogNumber: number) => void;
}

function CrashLogItem({ line, opening, onOpenCrashLog }: CrashLogItemProps) {
  return (
    <li className="gaia-forge-presence-line">
      <span className="gaia-forge-presence-line-text">
        <MonoId text={`crash ${line.crashLogNumber}`} tone="muted" />
        <span>{line.title}</span>
        <Text typeRole="small" muted>{line.recordedAt}</Text>
      </span>
      {opening === undefined || opening.phase === 'not-read'
        ? <Button label="Show log" compact emphasis="quiet" onPress={() => onOpenCrashLog(line.crashLogNumber)} />
        : null}
      {opening?.phase === 'reading' ? <Text typeRole="small" muted>Reading…</Text> : null}
      {opening?.phase === 'not-read' ? <Text typeRole="small" muted>{CRASH_LOG_NOT_READ}</Text> : null}
      {opening?.phase === 'read' ? <CrashLogBody shown={opening.shown} /> : null}
    </li>
  );
}

interface WaitingJobItemProps {
  readonly line:              WaitingJobLine;
  readonly commandIsOnItsWay: boolean;
  readonly onCommand:         (command: CommandBody) => void;
}

function WaitingJobItem({ line, commandIsOnItsWay, onCommand }: WaitingJobItemProps) {
  const { resume } = line;
  return (
    <li className="gaia-forge-presence-line">
      <span className="gaia-forge-presence-line-text">
        <MonoId text={line.jobId} tone="muted" />
        <span>{line.cause}</span>
        <Text typeRole="small" muted>{[line.kind, line.ticketIds, line.waitsFor].filter((part) => part !== '').join(' · ')}</Text>
      </span>
      {resume === null ? null : <Button label="Resume" compact emphasis="quiet" disabled={commandIsOnItsWay} onPress={() => onCommand(resume)} />}
    </li>
  );
}

export function ForgePresenceLayout({
  project, content, openedCrashLogs, commandIsOnItsWay, onCommand, onOpenCrashLog,
}: ForgePresenceLayoutProps) {
  const { alert, resumeAll } = content;
  const start = alert?.start ?? null;
  return (
    <div className="gaia-forge-presence">
      {alert === null ? null : (
        <Callout
          tone="error"
          dot={<ConditionDot condition="unreachable" />}
          title={project}
          word={alert.title}
          sentence={alert.suspected === null ? alert.sentence : `${alert.suspected}. ${alert.sentence}`}
          {...(alert.machineLine === null ? {} : { machineLine: alert.machineLine })}
          {...(start === null ? {} : { actions: <Button label="Start" emphasis="primary" disabled={commandIsOnItsWay} onPress={() => onCommand(start)} /> })}
        />
      )}
      {content.crashLogs.length === 0 ? null : (
        <section className="gaia-forge-presence-list" aria-label="Crash logs">
          <Text typeRole="section" element="h3">Crash logs</Text>
          <ul>
            {content.crashLogs.map((line) => (
              <CrashLogItem key={line.crashLogNumber} line={line} opening={openedCrashLogs.get(line.crashLogNumber)} onOpenCrashLog={onOpenCrashLog} />
            ))}
          </ul>
        </section>
      )}
      {content.waitingWork.length === 0 ? null : (
        <section className="gaia-forge-presence-list" aria-label="Waiting work">
          <span className="gaia-forge-presence-list-head">
            <Text typeRole="section" element="h3">Waiting work</Text>
            {resumeAll === null ? null : <Button label="Resume all" compact emphasis="primary" disabled={commandIsOnItsWay} onPress={() => onCommand(resumeAll)} />}
          </span>
          <ul>
            {content.waitingWork.map((line) => <WaitingJobItem key={line.jobId} line={line} commandIsOnItsWay={commandIsOnItsWay} onCommand={onCommand} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
