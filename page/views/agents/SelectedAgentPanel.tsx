/**
 * The panel under the Agents table: what the selected agent's forge reports of it, its last line, and the way to the agent in its forge.
 * Gaia sends an agent no message and stops no single job, and the panel says so in every state.
 */
import { Button }                    from '../../design-system/Button.tsx';
import { FactList }                  from '../../design-system/FactList.tsx';
import { MicroCapsLabel }            from '../../design-system/MicroCapsLabel.tsx';
import { Tag }                       from '../../design-system/Tag.tsx';
import type { SelectedAgentContent } from './AgentsModel.ts';

const FORGE_SENDS_NOTE = 'Gaia shows what the forge reports. Messages and stops are sent from the agent\'s own forge.';

function TicketLine({ ticketIdsText, ticketTitle }: { readonly ticketIdsText: string | null; readonly ticketTitle: string | null }) {
  return (
    <>
      {ticketIdsText === null ? null : <span className="gaia-agents-ticket-ids">{ticketIdsText}</span>}
      {ticketIdsText !== null && ticketTitle !== null ? ' ' : null}
      {ticketTitle}
    </>
  );
}

function RunningAgent({ content }: { readonly content: Extract<SelectedAgentContent, { kind: 'running' }> }) {
  return (
    <>
      <div className="gaia-agents-panel-column" data-column="facts">
        <div className="gaia-agents-panel-head">
          <span className="gaia-agents-panel-job">{content.jobId}</span>
          {content.role === null ? null : <span>{content.role}</span>}
          {content.flags.map((flag) => <Tag key={flag.text} text={flag.text} tone={flag.tone} />)}
        </div>
        <div className="gaia-agents-panel-subject">
          {content.project}
          {content.ticketIdsText === null && content.ticketTitle === null ? null : ' · '}
          <TicketLine ticketIdsText={content.ticketIdsText} ticketTitle={content.ticketTitle} />
        </div>
        <FactList facts={content.facts} />
        <div className="gaia-agents-panel-actions">
          <Button label={content.openLabel} href={content.openHref} />
        </div>
      </div>
      <div className="gaia-agents-panel-column" data-column="last-line">
        <MicroCapsLabel text="Last line" element="div" />
        <div className="gaia-agents-panel-last-line" data-reported={content.lastLine === null ? 'no' : 'yes'}>
          {content.lastLine ?? 'The forge reports no last line for this agent.'}
        </div>
        <p className="gaia-agents-panel-note">{FORGE_SENDS_NOTE}</p>
      </div>
    </>
  );
}

function PanelSentence({ sentence }: { readonly sentence: string }) {
  return (
    <div className="gaia-agents-panel-column" data-column="last-line">
      <p className="gaia-agents-panel-sentence">{sentence}</p>
      <p className="gaia-agents-panel-note">{FORGE_SENDS_NOTE}</p>
    </div>
  );
}

function PanelContent({ content }: { readonly content: SelectedAgentContent }) {
  switch (content.kind) {
    case 'none-selected':
      return <PanelSentence sentence="Select an agent to see what its forge reports of it." />;
    case 'no-longer-running':
      return (
        <>
          <div className="gaia-agents-panel-column" data-column="facts">
            <div className="gaia-agents-panel-head">
              <span className="gaia-agents-panel-job">{content.jobId}</span>
            </div>
            <div className="gaia-agents-panel-subject">{content.project}</div>
          </div>
          <PanelSentence sentence="This agent is no longer running." />
        </>
      );
    case 'running':
      return <RunningAgent content={content} />;
  }
}

export function SelectedAgentPanel({ content }: { readonly content: SelectedAgentContent }) {
  return (
    <section className="gaia-agents-panel" aria-label="Selected agent">
      <PanelContent content={content} />
    </section>
  );
}
