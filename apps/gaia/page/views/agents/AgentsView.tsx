/**
 * The Agents view (SCREENS A2): the two filters over every running agent and Flint brain on the machine, grouped by forge, and beside them
 * the selected agent's or brain's panel. `AgentsView` takes no hooks: its root reads the command sender, builds the content from the fleet
 * document, and hands it the way to change the filters, which it writes into the route, and to send a forge's brain its Wake or Stop.
 * `agentsViewPartsOf` hands the shell the page title's parts with it.
 */
import { EmptyState }       from 'design-system/EmptyState';
import { FillMeter }        from 'design-system/FillMeter';
import { MicroCapsLabel }   from 'design-system/MicroCapsLabel';
import { SegmentedControl } from 'design-system/SegmentedControl';

import type { FleetDocument }                                       from '../../@types/FleetDocument.ts';
import { type CommandSenderInView, useCommandSender }               from '../../api/CommandSender.ts';
import type { ClockReading }                                        from '../../shared/@types/ClockReading.ts';
import type { ViewParts }                                           from '../../shared/@types/ViewParts.ts';
import type { SelectedAgent }                                       from '../../shared/HashRouter.ts';
import type { MachineLoad }                                         from '../../shared/MachineLoadModel.ts';
import type { AgentConditionFilter, AgentFilters, AgentRoleFilter } from './AgentsFilters.ts';
import { type AgentsContent, AgentsModel }                          from './AgentsModel.ts';
import { AgentsTable, type BrainHandlers }                          from './AgentsTable.tsx';
import { SelectedAgentPanel }                                       from './SelectedAgentPanel.tsx';

export interface AgentsHandlers extends BrainHandlers {
  readonly onFiltersChange: (filters: AgentFilters) => void;
}

export interface AgentsViewProps {
  readonly content:  AgentsContent;
  readonly handlers: AgentsHandlers;
}

const ROLE_LABEL_ID = 'gaia-agents-role-label';
const CONDITION_LABEL_ID = 'gaia-agents-condition-label';

const EACH_FORGE_REPORTS_NOTE = 'Gaia shows what each forge reports.';

function footnoteOf(content: AgentsContent): string {
  if (content.brainCount === 0) return EACH_FORGE_REPORTS_NOTE;
  const brainSentence = content.brainCount === 1
    ? `Flint's brain is not one of the ${content.machineAgentsFigure} machine agents.`
    : `Flint's brains are not among the ${content.machineAgentsFigure} machine agents.`;
  return `${brainSentence} ${EACH_FORGE_REPORTS_NOTE}`;
}

function NoAgentRuns({ machine }: { readonly machine: MachineLoad }) {
  return (
    <section className="gaia-agents-empty" aria-label="No agents">
      <p className="gaia-agents-empty-sentence">No agents are running.</p>
      <div className="gaia-agents-machine" data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
        <MicroCapsLabel text="This machine" element="div" />
        <span className="gaia-agents-machine-agents">
          <span className="gaia-agents-machine-figure">{machine.agentsText}</span>
          <span className="gaia-agents-machine-unit">agents</span>
        </span>
        <FillMeter label={machine.meter.label} used={machine.meter.filled} limit={machine.meter.slots} near={machine.isAtTheLimit} tone="neutral" />
        <span className="gaia-agents-machine-line">{machine.atTheLimitLine ?? machine.limitLine}</span>
      </div>
    </section>
  );
}

function AgentFilterBar({ content, onFiltersChange }: { readonly content: AgentsContent; readonly onFiltersChange: AgentsHandlers['onFiltersChange'] }) {
  const { filters } = content;
  return (
    <div className="gaia-agents-filters">
      <span className="gaia-visually-hidden" id={ROLE_LABEL_ID}>Role</span>
      <SegmentedControl<AgentRoleFilter>
        labelledBy={ROLE_LABEL_ID}
        options={content.roleOptions}
        size="standard"
        selected={filters.role}
        onSelect={(role) => onFiltersChange({ ...filters, role })}
      />
      <span className="gaia-visually-hidden" id={CONDITION_LABEL_ID}>Condition</span>
      <SegmentedControl<AgentConditionFilter>
        labelledBy={CONDITION_LABEL_ID}
        options={content.conditionOptions}
        size="standard"
        selected={filters.condition}
        onSelect={(condition) => onFiltersChange({ ...filters, condition })}
      />
      <span className="gaia-agents-order">by forge, then job</span>
    </div>
  );
}

/** With neither a job nor a brain running the view says no agent runs; a brain alone still gets its forge's group. */
export function AgentsView({ content, handlers }: AgentsViewProps) {
  if (content.agentCount === 0 && content.brainCount === 0) {
    return (
      <div className="gaia-agents" data-layout="empty">
        <NoAgentRuns machine={content.machine} />
        {content.selected.kind === 'none-selected' ? null : <SelectedAgentPanel content={content.selected} handlers={handlers} />}
      </div>
    );
  }
  return (
    <div className="gaia-agents" data-layout="table">
      <section className="gaia-agents-main" aria-label="Agents per forge">
        <AgentFilterBar content={content} onFiltersChange={handlers.onFiltersChange} />
        {content.groups.length === 0
          ? <EmptyState text="No agent matches these filters." />
          : <AgentsTable groups={content.groups} handlers={handlers} />}
        <p className="gaia-agents-footnote">{footnoteOf(content)}</p>
      </section>
      <SelectedAgentPanel content={content.selected} handlers={handlers} />
    </div>
  );
}

export interface AgentsRoute {
  readonly selectedAgent: SelectedAgent | null;
  readonly query:         string;
}

export interface AgentsViewRootProps {
  readonly fleetDocument: FleetDocument;
  readonly route:         AgentsRoute;
  readonly clock:         ClockReading;
  readonly goTo:          (fragment: string) => void;
}

/** A filter press goes to the fragment that keeps the selected agent; Wake and Stop go to the command sender. */
export function agentsHandlersOf(
  selectedAgent: SelectedAgent | null,
  goTo: (fragment: string) => void,
  sender: Pick<CommandSenderInView, 'send' | 'dismissFailure'>,
): AgentsHandlers {
  return {
    onFiltersChange:  (filters) => goTo(AgentsModel.agentsFragmentOf(selectedAgent, filters)),
    onBrainCommand:   (command) => void sender.send(command),
    onDismissFailure: sender.dismissFailure,
  };
}

/** The view's root: it reads the command sender, so a Wake or Stop on its way disables its button and a refused one shows its refusal. */
export function AgentsViewRoot({
  fleetDocument, route, clock, goTo
}: AgentsViewRootProps) {
  const sender = useCommandSender();
  const { selectedAgent, query } = route;
  const content = AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent,
    query,
    readAtMilliseconds: clock.nowEpochMilliseconds,
    timeZone:           clock.timeZone,
    commandStates:      sender.states,
  });
  return <AgentsView content={content} handlers={agentsHandlersOf(selectedAgent, goTo, sender)} />;
}

const TITLE = 'Agents';

const LEAD = 'Every agent at work on this machine, per forge. Select one to read what its forge reports.';

/** Before the first fleet document the title stands alone. A filter press goes to the fragment that keeps the selected agent. */
export function agentsViewPartsOf(fleetDocument: FleetDocument | null, route: AgentsRoute, clock: ClockReading, goTo: (fragment: string) => void): ViewParts {
  if (fleetDocument === null) {
    return {
      title: TITLE, lead: LEAD, figures: [], actions: null, content: null
    };
  }
  return {
    title:   TITLE,
    lead:    LEAD,
    figures: AgentsModel.titleFiguresOf(fleetDocument),
    actions: null,
    content: <AgentsViewRoot fleetDocument={fleetDocument} route={route} clock={clock} goTo={goTo} />,
  };
}
