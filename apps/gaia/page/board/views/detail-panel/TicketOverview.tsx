/**
 * The ticket form's Overview: the state card with its Flint slot, the newest open incident on the ticket, the one likely action with its
 * effect, the live job's message box and More menu, Next as numbered steps (the current one marked), Other moves, and the Facts grid.
 * Watch is a link, so a stream that is down never disables it; every move posts a board command.
 */

import { Button }      from 'design-system/Button';
import { MonoId }      from 'design-system/MonoId';
import { Row }         from 'design-system/Row';
import { Stamp }       from 'design-system/Stamp';
import { StateDot }    from 'design-system/StateDot';
import { Text }        from 'design-system/Text';
import { TitledBlock } from 'design-system/TitledBlock';
import { View }        from 'design-system/View';
import { useState }    from 'react';

import { PAGE_CONTRACT_VERSIONS }            from '../../../../src/shared/constants/PageContractVersions.ts';
import { FlintSlotHabitat }                  from '../../flint/FlintSlotHabitat.tsx';
import { FLINT_SLOT_HABITATS }               from '../../flint/FlintSlotHabitats.ts';
import { useBoardHrefOf }                    from '../../shell/BoardRouteLinks.ts';
import { CommandButton }                     from '../../shell/CommandButton.tsx';
import { useQuestionPanelHoldsTheFlintSlot } from '../../shell/CoveringPanel.ts';
import { StateToneUtil }                     from '../../utils/StateToneUtil.ts';
import { DetailFacts, TextParts }            from './DetailParts.tsx';
import { JobStopMenu }                       from './JobStopMenu.tsx';
import { TicketMoves, MoveButton }           from './TicketMoves.tsx';
import type {
  LeadActionModel,
  NextStepModel,
  NowCardModel,
  OpenIncidentLineModel,
  TicketJobControlsModel,
  TicketOverviewModel
} from './TicketOverviewModel.ts';

/** The state card: Flint's slot on the strip ground beside what the ticket's job does now, or why nothing works on it. */
function NowCard({ now }: { readonly now: NowCardModel }) {
  const { job } = now;
  const flintSlotIsCovered = useQuestionPanelHoldsTheFlintSlot();
  return (
    <section className="board-detail-state-card" data-state={now.stateToken} data-state-tone={StateToneUtil.toneOf(now.stateToken)}>
      {flintSlotIsCovered ? null : <FlintSlotHabitat habitat={FLINT_SLOT_HABITATS.ticketDetail} cue={now.flintCue} label={null} ground="strip" />}
      <View grow centerY gap="four" paddingVertical="ten" paddingHorizontal="fourteen">
        <Row centerY gap="eight">
          <StateDot {...StateToneUtil.dotOf(now.stateToken)} />
          <Text typeRole="lead" bold element="h3">{now.heading}</Text>
        </Row>
        {job === null ? null : (
          <>
            <Text element="p" muted>
              <span className="board-detail-figure">{job.jobId}</span>
              {`, ${job.roleText}, attempt `}
              <span className="board-detail-figure">{job.attempt}</span>
              {job.since === null ? null : (
                <>
                  {', since '}
                  <Stamp shortText={job.since.shortText} fullText={job.since.fullText} />
                  {job.elapsedText === null ? null : <>{' ('}<span className="board-detail-figure">{job.elapsedText}</span>)</>}
                </>
              )}
            </Text>
            <Text element="p" muted>
              <span className="board-detail-figure">{job.callsText}</span>
              {` calls · ${job.lastToolText}`}
            </Text>
          </>
        )}
        {job === null && now.note !== null ? <Text element="p" muted>{now.note}</Text> : null}
      </View>
    </section>
  );
}

function LeadAction({ ticketId, lead }: { readonly ticketId: string; readonly lead: LeadActionModel }) {
  const effect = lead.kind === 'watch-job' ? lead.effect : lead.move.effect;
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-detail-lead">
      {lead.kind === 'watch-job'
        ? <Button label={`Watch ${lead.jobId}`} href={hrefOf({ tab: 'agents', item: lead.jobId })} emphasis="primary" />
        : <MoveButton ticketId={ticketId} move={lead.move} primary />}
      <p className="board-detail-effect"><TextParts parts={effect} /></p>
    </div>
  );
}

function OpenIncidentLine({ incident }: { readonly incident: OpenIncidentLineModel }) {
  return (
    <p className="board-detail-incident">
      {'Open incident '}
      <MonoId text={incident.incidentId} />
      {' on this ticket: '}
      <span className="board-detail-figure">{incident.kind}</span>
      {', default '}
      <span className="board-detail-figure">{incident.defaultMove}</span>
      .
    </p>
  );
}

/** A message to the job while it takes one, then More; a stopping job shows `Stopping.` alone. */
function JobControls({ ticketId, controls }: { readonly ticketId: string; readonly controls: TicketJobControlsModel }) {
  const [message, setMessage] = useState('');
  if (controls.stopping) return <p className="board-detail-note">Stopping.</p>;
  const trimmedMessage = message.trim();
  const messageLabel = `Message ${controls.jobId}`;
  return (
    <div className="board-detail-job-controls" role="group" aria-label={controls.label}>
      {controls.messages
        ? (
          <>
            <input className="board-detail-input" aria-label={messageLabel} placeholder={messageLabel} value={message} onChange={(event) => setMessage(event.target.value)} />
            <CommandButton
              label="Send message"
              command={trimmedMessage === '' ? null : {
                boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId: controls.jobId, text: trimmedMessage, pictures: [], incidentId: null
              }}
              onApplied={() => setMessage('')}
            />
          </>
        )
        : null}
      <JobStopMenu ticketId={ticketId} controls={controls} />
    </div>
  );
}

function NumberedSteps({ steps }: { readonly steps: readonly NextStepModel[] }) {
  return (
    <ol className="board-detail-steps">
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
      {model.openIncident === null ? null : <OpenIncidentLine incident={model.openIncident} />}
      {model.lead === null ? null : <LeadAction ticketId={ticketId} lead={model.lead} />}
      {/* Keyed by ticket, so a typed message never carries over to the next ticket opened. */}
      {model.jobControls === null ? null : <JobControls key={ticketId} ticketId={ticketId} controls={model.jobControls} />}
      {model.conflictedFiles.length === 0 ? null : (
        <ul className="board-detail-conflicts" aria-label="Conflicted files">
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
