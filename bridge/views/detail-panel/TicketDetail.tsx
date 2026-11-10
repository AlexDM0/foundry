/** The ticket form a Kanban card or wave card opens: head, facts, the Bridge's controls, the Timeline and the Description. */
import { PriorityMark, TypeMark }     from '../../chips/TicketMarks.tsx';
import { StatePill }                  from '../../design-system/StatePill.tsx';
import { SandboxedHtmlFrame }         from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { DetailControls }             from './DetailControls.tsx';
import { DetailFacts, DetailSection } from './DetailParts.tsx';
import type { TicketDetailModel }     from './TicketDetailModel.ts';
import { TicketTimeline }             from './TicketTimeline.tsx';

export function TicketDetail({ model }: { readonly model: TicketDetailModel }) {
  return (
    <>
      <div className="bridge-detail-head" data-state={model.stateToken}>
        <span className="bridge-detail-id">{model.idText}</span>
        <h2 className="bridge-detail-title">{model.title}</h2>
        <StatePill label={model.stateLabel} />
        {model.reviewedTitle === null
          ? null
          : <span className="bridge-detail-reviewed-mark" data-state="reviewed" title={model.reviewedTitle} role="img" aria-label="reviewed">✓</span>}
        <PriorityMark priority={model.priority} />
        <TypeMark type={model.ticketType} />
      </div>
      <DetailFacts facts={model.facts} />
      <DetailControls ticketId={model.ticketId} controls={model.controls} />
      <DetailSection title="Timeline">
        <TicketTimeline model={model.timeline} />
      </DetailSection>
      <DetailSection title="Description">
        <SandboxedHtmlFrame title={`Description of ${model.title}`} html={model.bodyHtml} placement="ticket-body" />
      </DetailSection>
    </>
  );
}
