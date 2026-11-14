/**
 * The panel beside the Agents table: the selected agent's job, state and ticket, what its forge reports of it, its last line, and the way
 * to the agent in its forge. Gaia sends an agent no message and stops no single job, and the panel says so in every state of a job; a
 * selected Flint brain shows its own panel, with its Stop.
 */
import { Button }         from 'design-system/Button';
import { FactList }       from 'design-system/FactList';
import { MicroCapsLabel } from 'design-system/MicroCapsLabel';
import { Tag }            from 'design-system/Tag';
import { Text }           from 'design-system/Text';
import type { ReactNode } from 'react';

import { RoleDot }                                       from '../../design-system/RoleDot.tsx';
import type { AgentFact, SelectedAgentContent }          from './AgentsModel.ts';
import { AgentCallsMeter, type BrainHandlers, RoleWord } from './AgentsTable.tsx';
import { BrainPanel }                                    from './BrainPanel.tsx';

type RunningAgent = Extract<SelectedAgentContent, { kind: 'running' }>;

const FORGE_SENDS_NOTE = 'Gaia shows what the forge reports. Messages and stops are sent from the agent\'s own forge.';

/** Every agent fact is a machine value, so it is set in mono. */
function shownFactOf(fact: AgentFact) {
  return { label: fact.label, value: <Text typeRole="small" mono>{fact.value}</Text> };
}

function PanelHead({ jobId, children }: { readonly jobId: string; readonly children?: ReactNode }) {
  return (
    <div className="gaia-agents-panel-head">
      <span className="gaia-agents-panel-kind">Job</span>
      <span className="gaia-agents-panel-job">{jobId}</span>
      {children}
    </div>
  );
}

function RunningState({ content }: { readonly content: RunningAgent }) {
  return (
    <>
      {content.dotRole === null ? null : <span className="gaia-agents-panel-live-dot"><RoleDot role={content.dotRole} /></span>}
      <span className="gaia-agents-panel-state">
        {content.stateText}
        {content.runningText === null ? null : (
          <>
            {' · '}
            <span className="gaia-agents-panel-running">{content.runningText}</span>
          </>
        )}
      </span>
    </>
  );
}

function TicketChip({ content }: { readonly content: RunningAgent }) {
  if (content.ticketIdsText === null && content.ticketTitle === null) return null;
  return (
    <a className="gaia-agents-panel-ticket" href={content.openHref}>
      {content.ticketIdsText === null ? null : <span className="gaia-agents-ticket-ids">{content.ticketIdsText}</span>}
      {content.ticketTitle === null ? null : <span className="gaia-agents-panel-ticket-title">{content.ticketTitle}</span>}
    </a>
  );
}

function CallsLine({ content }: { readonly content: RunningAgent }) {
  return (
    <div className="gaia-agents-panel-calls">
      {content.calls === null ? null : (
        <>
          <AgentCallsMeter calls={content.calls} />
          <span>calls · </span>
        </>
      )}
      <span className="gaia-agents-panel-tokens">{content.tokensText}</span>
      <span> tokens</span>
    </div>
  );
}

function RunningAgentPanel({ content }: { readonly content: RunningAgent }) {
  return (
    <>
      <div className="gaia-agents-panel-section" data-section="head">
        <PanelHead jobId={content.jobId}>
          <RunningState content={content} />
        </PanelHead>
        <div className="gaia-agents-panel-lines">
          <div className="gaia-agents-panel-subject">
            {content.role === null ? null : <RoleWord role={content.role} />}
            <span className="gaia-agents-panel-project">{content.project}</span>
            {content.flags.map((flag) => <Tag key={flag.text} text={flag.text} tone={flag.tone} />)}
          </div>
          <TicketChip content={content} />
          <CallsLine content={content} />
          {content.lastToolCall === null ? null : (
            <div className="gaia-agents-panel-last-tool">
              Last tool
              {' '}
              <span className="gaia-agents-panel-last-tool-call">{content.lastToolCall}</span>
            </div>
          )}
        </div>
      </div>
      {content.facts.length === 0 ? null : (
        <div className="gaia-agents-panel-section" data-section="facts">
          <MicroCapsLabel text="What the forge reports" element="div" />
          <FactList facts={content.facts.map(shownFactOf)} layout="table" />
        </div>
      )}
      <div className="gaia-agents-panel-section" data-section="last-line">
        <MicroCapsLabel text="Last line" element="div" />
        <div className="gaia-agents-panel-last-line" data-reported={content.lastLine === null ? 'no' : 'yes'}>
          {content.lastLine ?? 'The forge reports no last line for this agent.'}
        </div>
      </div>
      <PanelFoot>
        <span className="gaia-agents-panel-actions">
          <Button label={content.openLabel} href={content.openHref} compact />
        </span>
      </PanelFoot>
    </>
  );
}

function PanelFoot({ children }: { readonly children?: ReactNode }) {
  return (
    <div className="gaia-agents-panel-section" data-section="foot">
      <p className="gaia-agents-panel-note">{FORGE_SENDS_NOTE}</p>
      {children}
    </div>
  );
}

function PanelSentence({ sentence }: { readonly sentence: string }) {
  return (
    <div className="gaia-agents-panel-section" data-section="sentence">
      <p className="gaia-agents-panel-sentence">{sentence}</p>
    </div>
  );
}

function PanelContent({ content, handlers }: { readonly content: SelectedAgentContent; readonly handlers: BrainHandlers }) {
  switch (content.kind) {
    case 'brain-running':
    case 'brain-no-longer-running':
      return <BrainPanel content={content} handlers={handlers} />;
    case 'none-selected':
      return (
        <>
          <PanelSentence sentence="Select an agent to see what its forge reports of it." />
          <PanelFoot />
        </>
      );
    case 'no-longer-running':
      return (
        <>
          <div className="gaia-agents-panel-section" data-section="head">
            <PanelHead jobId={content.jobId} />
            <div className="gaia-agents-panel-subject">
              <span className="gaia-agents-panel-project">{content.project}</span>
            </div>
          </div>
          <PanelSentence sentence="This agent is no longer running." />
          <PanelFoot />
        </>
      );
    case 'running':
      return <RunningAgentPanel content={content} />;
  }
}

export function SelectedAgentPanel({ content, handlers }: { readonly content: SelectedAgentContent; readonly handlers: BrainHandlers }) {
  return (
    <section className="gaia-agents-panel" aria-label="Selected agent">
      <PanelContent content={content} handlers={handlers} />
    </section>
  );
}
