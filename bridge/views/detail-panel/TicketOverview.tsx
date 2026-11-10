/**
 * The ticket form's Overview: the state card, the one likely action with its effect, Next as numbered steps (the current one marked),
 * Other moves, and the Facts grid. Watch is a link, so a stream that is down never disables it; every move posts a `ControlCommand`.
 */
import { Button }                  from '../../design-system/Button.tsx';
import { Callout }                 from '../../design-system/Callout.tsx';
import { Stamp }                   from '../../design-system/Stamp.tsx';
import { TitledBlock }             from '../../design-system/TitledBlock.tsx';
import { HashRouter }              from '../../shell/HashRouter.ts';
import { DetailFacts, TextParts }  from './DetailParts.tsx';
import { TicketMoves, MoveButton } from './TicketMoves.tsx';
import type {
  LeadActionModel,
  NextStepModel,
  NowCardModel,
  TicketOverviewModel
} from './TicketOverviewModel.ts';

function NowCard({ now }: { readonly now: NowCardModel }) {
  const { job } = now;
  return (
    <Callout tone="state" state={now.stateToken} title={now.heading}>
      {job === null ? null : (
        <>
          <p>
            {`${job.jobId}, ${job.roleText}, attempt `}
            <span className="bridge-detail-figure">{job.attempt}</span>
            {job.since === null ? null : (
              <>
                {', since '}
                <Stamp shortText={job.since.shortText} fullText={job.since.fullText} />
                {job.elapsedText === null ? null : <>{' ('}<span className="bridge-detail-figure">{job.elapsedText}</span>)</>}
              </>
            )}
          </p>
          <p>
            <span className="bridge-detail-figure">{job.callsText}</span>
            {` calls · ${job.lastToolText}`}
          </p>
        </>
      )}
      {job === null && now.note !== null ? <p>{now.note}</p> : null}
    </Callout>
  );
}

function LeadAction({ ticketId, lead }: { readonly ticketId: string; readonly lead: LeadActionModel }) {
  const effect = lead.kind === 'watch-job' ? lead.effect : lead.move.effect;
  return (
    <div className="bridge-detail-lead">
      {lead.kind === 'watch-job'
        ? <Button label={`Watch ${lead.jobId}`} href={HashRouter.fragmentOf({ tab: 'agents', item: lead.jobId })} emphasis="primary" />
        : <MoveButton ticketId={ticketId} move={lead.move} primary />}
      <p className="bridge-detail-effect"><TextParts parts={effect} /></p>
    </div>
  );
}

function NumberedSteps({ steps }: { readonly steps: readonly NextStepModel[] }) {
  return (
    <ol className="bridge-detail-steps">
      {steps.map((step) => (
        <li key={step.key} data-current={step.current ? '' : undefined} aria-current={step.current ? 'step' : undefined}>
          <TextParts parts={step.parts} />
        </li>
      ))}
    </ol>
  );
}

export function TicketOverview({ ticketId, model }: { readonly ticketId: string; readonly model: TicketOverviewModel }) {
  return (
    <>
      <NowCard now={model.now} />
      {model.lead === null ? null : <LeadAction ticketId={ticketId} lead={model.lead} />}
      {model.conflictedFiles.length === 0 ? null : (
        <ul className="bridge-detail-conflicts" aria-label="Conflicted files">
          {model.conflictedFiles.map((file) => <li key={file}>{file}</li>)}
        </ul>
      )}
      {model.nextSteps === null ? null : <TitledBlock title="Next" rule="above"><NumberedSteps steps={model.nextSteps} /></TitledBlock>}
      {model.otherMoves.length === 0 ? null : (
        <TitledBlock title="Other moves" rule="above">
          <TicketMoves key={ticketId} ticketId={ticketId} moves={model.otherMoves} />
        </TitledBlock>
      )}
      <TitledBlock title="Facts" rule="above">
        <DetailFacts facts={model.facts} layout="grid" />
      </TitledBlock>
    </>
  );
}
