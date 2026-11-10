/**
 * The Sessions card: intake and Assistant jobs, which never take a launch slot, in the same rows as the worker list. Its head tallies the
 * live sessions of each kind, linked to their tabs, with how many wait on User; a session's About cell says what it is about.
 */
import type { IdentifiedRecord }          from '../../@types/BoardStateDocument.ts';
import { Pane }                           from '../../design-system/Pane.tsx';
import { Tag }                            from '../../design-system/Tag.tsx';
import { HashRouter }                     from '../../shell/HashRouter.ts';
import type { TimestampSlices }           from '../../utils/TimeUtil.ts';
import type { AgentJobDocument }          from './AgentJobDocument.ts';
import { AgentsModel, type SessionTally } from './AgentsModel.ts';
import { ASKING_STATE }                   from './AskUserRow.tsx';
import { JobTable }                       from './JobTable.tsx';
import { RoleGlyph }                      from './RoleGlyph.tsx';
import { SubjectChip }                    from './SubjectChip.tsx';

export interface SessionCardProps {
  readonly project:           string;
  readonly jobs:              readonly AgentJobDocument[];
  readonly decisions:         readonly IdentifiedRecord[];
  readonly openIncidentCount: number;
  readonly selectedJobId:     string | null;
  readonly now:               Date;
  readonly timestampSlices:   TimestampSlices | null;
  readonly showDiagnostics:   boolean;
}

const TALLY_TAB = { intake: 'intake', assistant: 'assistant' } as const;

const TALLY_NAME: Readonly<Record<SessionTally['kind'], string>> = { intake: 'Intake', assistant: 'Assistant' };

const TALLY_ROLE: Readonly<Record<SessionTally['kind'], string>> = { intake: 'product-owner', assistant: 'assistant' };

function TallyPill({ tally, openIncidentCount }: { readonly tally: SessionTally; readonly openIncidentCount: number }) {
  const roleMark = AgentsModel.roleMarkOf({ role: TALLY_ROLE[tally.kind], kind: tally.kind });
  return (
    <a className="agents-tally" href={HashRouter.fragmentOf({ tab: TALLY_TAB[tally.kind], item: null })}>
      <RoleGlyph mark={roleMark} />
      <span className="agents-tally-name">{TALLY_NAME[tally.kind]}</span>
      <span className="agents-figure">{tally.liveCount}</span>
      <span className="agents-muted">live</span>
      {tally.kind === 'assistant'
        ? <span className="agents-muted">{AgentsModel.incidentsOpenTextOf(openIncidentCount)}</span>
        : null}
      {tally.waitingOnUserCount > 0
        ? <Tag text={AgentsModel.waitsOnUserTextOf(tally.waitingOnUserCount)} tone="state" state={ASKING_STATE} />
        : null}
    </a>
  );
}

function AboutCell({ job, openIncidentCount }: { readonly job: AgentJobDocument; readonly openIncidentCount: number }) {
  const aboutText = AgentsModel.sessionAboutTextOf(job, openIncidentCount);
  if (job.role !== 'product-owner') return <span className="agents-muted">{aboutText}</span>;
  return <SubjectChip href={HashRouter.fragmentOf({ tab: 'intake', item: job.id })} idText={null} text={aboutText} />;
}

export function SessionCard({
  project, jobs, decisions, openIncidentCount, selectedJobId, now, timestampSlices, showDiagnostics
}: SessionCardProps) {
  const waitingOnUserCount = jobs.filter((job) => AgentsModel.openDecisionOf(decisions, job.id) !== null).length;
  return (
    <Pane
      label="Sessions"
      title="Sessions"
      subtitle="intake and the Assistant · never count toward the limit"
      headEnd={(
        <div className="agents-tallies">
          {AgentsModel.sessionTalliesOf(jobs, decisions).map((tally) => <TallyPill key={tally.kind} tally={tally} openIncidentCount={openIncidentCount} />)}
        </div>
      )}
      body="flush"
    >
      <JobTable
        variant="sessions"
        project={project}
        projectLine={<span className="agents-muted">{AgentsModel.sessionsLineTextOf(jobs.length, waitingOnUserCount)}</span>}
        groups={AgentsModel.projectGroupsOf(jobs, decisions, project)}
        decisions={decisions}
        emptyText="No intake or Assistant session is live."
        subjectOf={(job) => <AboutCell job={job} openIncidentCount={openIncidentCount} />}
        countedOf={() => null}
        selectedJobId={selectedJobId}
        now={now}
        timestampSlices={timestampSlices}
        showDiagnostics={showDiagnostics}
      />
    </Pane>
  );
}
