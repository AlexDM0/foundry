/**
 * The Forges view laid out from its content (SCREENS A4 and B2): the table of forges with the Stop dialog and a refusal under their row,
 * a held forge's banner, the forges whose repository is gone, the folded group of hidden forges, and beside them this machine's panel and
 * Gaia's. It takes no hooks: the command states and the handlers come in as props, so a spec unfolds it whole.
 */
import type { CommandBody, ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { CommandStates, CommandSubject }                  from '../../api/CommandSender.ts';
import { Button }                                              from '../../design-system/Button.tsx';
import { ChoiceOption }                                        from '../../design-system/ChoiceOption.tsx';
import { ConditionDot }                                        from '../../design-system/ConditionDot.tsx';
import { ConfirmPanel }                                        from '../../design-system/ConfirmPanel.tsx';
import { DataTable, type DataTableColumn, type DataTableRow }  from '../../design-system/DataTable.tsx';
import { FactList }                                            from '../../design-system/FactList.tsx';
import { Meter }                                               from '../../design-system/Meter.tsx';
import { MicroCapsLabel }                                      from '../../design-system/MicroCapsLabel.tsx';
import { Refusal }                                             from '../../design-system/Refusal.tsx';
import { Stepper }                                             from '../../design-system/Stepper.tsx';
import { CommandFailureRefusal }                               from '../../shared/CommandFailureRefusal.tsx';
import type {
  ForgeAgentsCell,
  ForgeButton,
  ForgeEntry,
  ForgeRow,
  ForgesContent,
  HeldBanner,
  MachinePanel,
  ShownRefusal,
  StopDialog,
} from './ForgesModel.ts';
import { GaiaPanel, type GaiaPanelHandlers } from './GaiaPanel.tsx';
import type { GaiaPanelContent }             from './GaiaPanelModel.ts';

export interface ForgesHandlers extends GaiaPanelHandlers {
  readonly onCommand:        (command: CommandBody) => void;
  readonly onOpenStopDialog: (trackerId: string) => void;
  readonly onStopChoice:     (agents: ForgeStopAgents) => void;
  readonly onCancelStop:     () => void;
  readonly onConfirmStop:    (command: ForgeCommandBody) => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

export interface ForgesLayoutProps {
  readonly content:       ForgesContent;
  readonly gaiaPanel:     GaiaPanelContent;
  readonly commandStates: CommandStates;
  readonly handlers:      ForgesHandlers;
}

type ForgeColumn = 'forge' | 'condition' | 'agents' | 'waiting' | 'code' | 'controls';

const COLUMNS: readonly DataTableColumn<ForgeColumn>[] = [
  { key: 'forge', label: 'Forge' },
  { key: 'condition', label: 'Overseer' },
  { key: 'agents', label: 'Agents' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'code', label: 'Code' },
  { key: 'controls', label: 'Controls', align: 'end' },
];

/** The tracks live in tokens.css with every other size. */
const COLUMN_WIDTHS = 'var(--forges-table-columns)';

const NOT_FOUND_HEAD_ID = 'gaia-forges-not-found-head';
const MACHINE_HEAD_ID = 'gaia-forges-machine-head';

const LOOK_AGAIN_SUBJECT: CommandSubject = { fleetCommand: 'fleet-look-again' };
const MACHINE_LIMIT_SUBJECT: CommandSubject = { fleetCommand: 'machine-agent-limit-set' };

/** The element the route's `?forge=` scrolls into view. */
export function forgeAnchorIdOf(trackerId: string): string {
  return `gaia-forges-forge-${trackerId}`;
}

function ForgeButtonView({ button, trackerId, handlers }: { readonly button: ForgeButton; readonly trackerId: string; readonly handlers: ForgesHandlers }) {
  switch (button.kind) {
    case 'command': {
      const { command } = button;
      return (
        <Button
          label={button.label}
          emphasis={button.emphasis}
          disabled={button.disabled}
          onPress={() => handlers.onCommand(command)}
          {...(button.iconOnly ? { icon: 'open-in-new-tab', iconOnly: true } as const : {})}
        />
      );
    }
    case 'stop':
      return <Button label={button.label} disabled={button.disabled} onPress={() => handlers.onOpenStopDialog(trackerId)} />;
    case 'link':
      return <Button label={button.label} href={button.href} disabled={button.disabled} />;
    case 'waiting':
      return <Button label={button.label} disabled />;
  }
}

function buttonKeyOf(button: ForgeButton): string {
  return button.kind === 'waiting' ? 'waiting' : button.button;
}

function ShownRefusalLine({ refusal, trackerId, handlers }: { readonly refusal: ShownRefusal | null; readonly trackerId: string; readonly handlers: ForgesHandlers }) {
  if (refusal === null) return null;
  const { retryCommand } = refusal;
  return (
    <Refusal
      commandLabel={refusal.commandLabel}
      code={refusal.code}
      sentence={refusal.sentence}
      onDismiss={() => handlers.onDismissFailure({ trackerId })}
      {...(retryCommand === null ? {} : { onTryAgain: () => handlers.onCommand(retryCommand) })}
    />
  );
}

function ForgeName({ trackerId, project, condition }: Pick<ForgeRow, 'trackerId' | 'project' | 'condition'>) {
  return (
    <span className="gaia-forges-forge-name-line" id={forgeAnchorIdOf(trackerId)}>
      <ConditionDot condition={condition} />
      <span className="gaia-forges-forge-name">{project}</span>
    </span>
  );
}

function AgentsCell({ agents, handlers }: { readonly agents: ForgeAgentsCell | null; readonly handlers: ForgesHandlers }) {
  if (agents === null) return null;
  if (agents.kind === 'text') return <span className="gaia-forges-agents">{agents.text}</span>;
  const { lowerCommand, raiseCommand } = agents;
  return (
    <Stepper
      value={agents.valueText}
      lowerLabel={agents.lowerLabel}
      raiseLabel={agents.raiseLabel}
      lowerDisabled={agents.disabled || lowerCommand === null}
      raiseDisabled={agents.disabled || raiseCommand === null}
      onLower={() => {
        if (lowerCommand !== null) handlers.onCommand(lowerCommand);
      }}
      onRaise={() => {
        if (raiseCommand !== null) handlers.onCommand(raiseCommand);
      }}
    />
  );
}

function StopDialogPanel({ dialog, trackerId, handlers }: { readonly dialog: StopDialog; readonly trackerId: string; readonly handlers: ForgesHandlers }) {
  const choices = dialog.choices.map((choice) => (
    <ChoiceOption
      key={choice.agents}
      name={`gaia-forges-stop-${trackerId}`}
      title={choice.title}
      consequence={choice.consequence}
      chosen={choice.chosen}
      disabled={dialog.isOnItsWay}
      onChoose={() => handlers.onStopChoice(choice.agents)}
    />
  ));
  return (
    <ConfirmPanel
      label={dialog.label}
      question={dialog.question}
      {...(choices.length === 0 ? {} : { choices })}
      {...(dialog.consequence === null ? {} : { consequence: dialog.consequence })}
      confirmLabel="Stop"
      onConfirm={() => handlers.onConfirmStop(dialog.command)}
      onCancel={handlers.onCancelStop}
      disabled={dialog.isOnItsWay}
    />
  );
}

function rowBelowOf(row: ForgeRow, handlers: ForgesHandlers) {
  if (row.stopDialog === null && row.refusal === null) return null;
  return (
    <div className="gaia-forges-row-below">
      {row.stopDialog === null ? null : <StopDialogPanel dialog={row.stopDialog} trackerId={row.trackerId} handlers={handlers} />}
      <ShownRefusalLine refusal={row.refusal} trackerId={row.trackerId} handlers={handlers} />
    </div>
  );
}

function tableRowOf(row: ForgeRow, handlers: ForgesHandlers): DataTableRow<ForgeColumn> {
  const below = rowBelowOf(row, handlers);
  return {
    key:      row.trackerId,
    selected: row.isInView || row.stopDialog !== null,
    cells:    {
      forge: (
        <span className="gaia-forges-forge">
          <ForgeName trackerId={row.trackerId} project={row.project} condition={row.condition} />
          <span className="gaia-forges-forge-root">{row.rootText}</span>
        </span>
      ),
      condition: (
        <span className="gaia-forges-condition">
          <span className="gaia-forges-condition-word" data-tone={row.conditionTone ?? undefined}>{row.conditionWord}</span>
          {row.detailText === null ? null : <span className="gaia-forges-condition-detail">{row.detailText}</span>}
        </span>
      ),
      agents:   <AgentsCell agents={row.agents} handlers={handlers} />,
      waiting:  row.waitingText === null ? null : <span className="gaia-forges-waiting">{row.waitingText}</span>,
      code:     row.codeText === null ? null : <span className="gaia-forges-code">{row.codeText}</span>,
      controls: (
        <span className="gaia-forges-controls">
          {row.buttons.map((button) => <ForgeButtonView key={buttonKeyOf(button)} button={button} trackerId={row.trackerId} handlers={handlers} />)}
        </span>
      ),
    },
    ...(below === null ? {} : { below }),
  };
}

function HeldBannerCard({ banner, handlers }: { readonly banner: HeldBanner; readonly handlers: ForgesHandlers }) {
  return (
    <div className="gaia-forges-held-group">
      <section className="gaia-forges-held" aria-label={`${banner.project} holds its launches`}>
        <p className="gaia-forges-held-text">
          <span className="gaia-forges-held-project">{`${banner.project} holds its launches.`}</span>
          {` ${banner.sentence}`}
        </p>
        <ForgeButtonView button={banner.updateButton} trackerId={banner.trackerId} handlers={handlers} />
      </section>
      <ShownRefusalLine refusal={banner.refusal} trackerId={banner.trackerId} handlers={handlers} />
    </div>
  );
}

function ForgeEntryCard({ entry, place, handlers }: { readonly entry: ForgeEntry; readonly place: 'not-found' | 'hidden'; readonly handlers: ForgesHandlers }) {
  return (
    <div className="gaia-forges-entry-group">
      <div className="gaia-forges-entry" data-place={place} data-in-view={entry.isInView ? '' : undefined}>
        <span className="gaia-forges-entry-text">
          <ForgeName trackerId={entry.trackerId} project={entry.project} condition={entry.condition} />
          <span className="gaia-forges-entry-detail">{entry.detailText}</span>
        </span>
        <ForgeButtonView button={entry.button} trackerId={entry.trackerId} handlers={handlers} />
      </div>
      <ShownRefusalLine refusal={entry.refusal} trackerId={entry.trackerId} handlers={handlers} />
    </div>
  );
}

function MachinePanelCard({ machine, commandStates, handlers }: { readonly machine: MachinePanel; readonly commandStates: CommandStates; readonly handlers: ForgesHandlers }) {
  const { lowerCommand, raiseCommand } = machine;
  return (
    <section className="gaia-forges-machine" aria-labelledby={MACHINE_HEAD_ID} data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
      <MicroCapsLabel element="h2" id={MACHINE_HEAD_ID} text="This machine" />
      <div className="gaia-forges-machine-limit">
        <span className="gaia-forges-machine-limit-label">Agent limit</span>
        <Stepper
          value={machine.limitText}
          valueSize="figure"
          lowerLabel="Lower the machine's agent limit"
          raiseLabel="Raise the machine's agent limit"
          lowerDisabled={machine.stepperIsOff || lowerCommand === null}
          raiseDisabled={machine.stepperIsOff || raiseCommand === null}
          onLower={() => {
            if (lowerCommand !== null) handlers.onCommand(lowerCommand);
          }}
          onRaise={() => {
            if (raiseCommand !== null) handlers.onCommand(raiseCommand);
          }}
        />
      </div>
      <p className="gaia-forges-machine-sentence">{machine.sentence}</p>
      {machine.meter === null ? null : <Meter label={machine.meter.label} used={machine.meter.used} whole={machine.meter.whole} thickness="thick" />}
      {machine.atTheLimitText === null ? null : <p className="gaia-forges-machine-at-the-limit">{machine.atTheLimitText}</p>}
      <FactList facts={machine.facts} layout="values-end" />
      <CommandFailureRefusal
        commandStates={commandStates}
        subject={MACHINE_LIMIT_SUBJECT}
        commandLabel="Set the machine's agent limit"
        onDismissFailure={handlers.onDismissFailure}
      />
    </section>
  );
}

export function ForgesLayout({
  content, gaiaPanel, commandStates, handlers
}: ForgesLayoutProps) {
  return (
    <div className="gaia-forges">
      <section className="gaia-forges-main" aria-label="Forges">
        <CommandFailureRefusal
          commandStates={commandStates}
          subject={LOOK_AGAIN_SUBJECT}
          commandLabel="Look again"
          onDismissFailure={handlers.onDismissFailure}
          onTryAgain={() => handlers.onCommand({ kind: 'fleet-look-again' })}
        />
        {content.emptySentence === null
          ? <DataTable label="Forges" columns={COLUMNS} columnWidths={COLUMN_WIDTHS} rows={content.rows.map((row) => tableRowOf(row, handlers))} rowHeight="tall" />
          : <p className="gaia-forges-empty">{content.emptySentence}</p>}
        {content.heldBanners.map((banner) => <HeldBannerCard key={banner.trackerId} banner={banner} handlers={handlers} />)}
        {content.notFound.length === 0 ? null : (
          <section className="gaia-forges-group" aria-labelledby={NOT_FOUND_HEAD_ID}>
            <MicroCapsLabel element="h2" id={NOT_FOUND_HEAD_ID} text={content.notFoundHead} />
            {content.notFound.map((entry) => <ForgeEntryCard key={entry.trackerId} entry={entry} place="not-found" handlers={handlers} />)}
          </section>
        )}
        {content.hidden.length === 0 ? null : (
          <details className="gaia-forges-hidden">
            <summary className="gaia-forges-hidden-summary">{content.hiddenHead}</summary>
            <div className="gaia-forges-group">
              {content.hidden.map((entry) => <ForgeEntryCard key={entry.trackerId} entry={entry} place="hidden" handlers={handlers} />)}
            </div>
          </details>
        )}
      </section>
      <aside className="gaia-forges-aside" aria-label="This machine and Gaia">
        <MachinePanelCard machine={content.machine} commandStates={commandStates} handlers={handlers} />
        <GaiaPanel content={gaiaPanel} handlers={handlers} />
      </aside>
    </div>
  );
}
