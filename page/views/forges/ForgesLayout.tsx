/**
 * The Forges view laid out from its content (SCREENS A4 and B2): the table of forges with a notice that the Assistant cannot come up, the Stop dialog, a
 * refusal and a pending restart under their row, a held forge's banner, the forges whose repository is gone, the folded group of hidden forges, and beside
 * them this machine's panel and Gaia's. It takes no hooks: the command states and the handlers come in as props, so a spec unfolds it whole.
 */
import { Button }        from 'design-system/Button';
import { ChoiceOption }  from 'design-system/ChoiceOption';
import { FillMeter }     from 'design-system/FillMeter';
import { NumberStepper } from 'design-system/NumberStepper';
import { Text }          from 'design-system/Text';

import type { CommandBody, ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { CommandStates, CommandSubject }                  from '../../api/CommandSender.ts';
import { ConditionDot }                                        from '../../design-system/ConditionDot.tsx';
import { ConfirmPanel }                                        from '../../design-system/ConfirmPanel.tsx';
import { DataTable, type DataTableColumn, type DataTableRow }  from '../../design-system/DataTable.tsx';
import { OpenInNewTabGlyph }                                   from '../../design-system/OpenInNewTabGlyph.tsx';
import { PendingStep }                                         from '../../design-system/PendingStep.tsx';
import { Refusal }                                             from '../../design-system/Refusal.tsx';
import { CommandFailureRefusal }                               from '../../shared/CommandFailureRefusal.tsx';
import type {
  ForgeAgentsCell,
  ForgeButton,
  ForgeEntry,
  ForgeRow,
  ForgesContent,
  HeldBanner,
  MachinePanel,
  PendingRestart,
  ShownRefusal,
  StopDialog,
} from './ForgesModel.ts';
import { GaiaPanel, type GaiaPanelHandlers } from './GaiaPanel.tsx';
import type { GaiaPanelContent }             from './GaiaPanelModel.ts';

export interface ForgesHandlers extends GaiaPanelHandlers {
  readonly onCommand:               (command: CommandBody) => void;
  readonly onOpenStopDialog:        (trackerId: string) => void;
  readonly onStopChoice:            (agents: ForgeStopAgents) => void;
  readonly onCancelStop:            () => void;
  readonly onConfirmStop:           (command: ForgeCommandBody) => void;
  readonly onDismissFailure:        (subject: CommandSubject) => void;
  readonly onDismissRestartPending: (subject: CommandSubject) => void;
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

const FIRST_CHOICE_LETTER_CODE = 'A'.charCodeAt(0);

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
      if (button.iconOnly) {
        // The package's icon button cannot be disabled, so the arrow rides a label-less button named by its label, its tooltip on the wrapper.
        return (
          <span className="gaia-forges-icon-button" title={button.label}>
            <Button label="" leading={<OpenInNewTabGlyph />} accessibleName={button.label} compact disabled={button.disabled} onPress={() => handlers.onCommand(command)} />
          </span>
        );
      }
      return <Button label={button.label} emphasis={button.emphasis} compact disabled={button.disabled} onPress={() => handlers.onCommand(command)} />;
    }
    case 'stop':
      return <Button label={button.label} compact disabled={button.disabled} onPress={() => handlers.onOpenStopDialog(trackerId)} />;
    case 'link':
      return <Button label={button.label} compact disabled={button.disabled} {...(button.disabled ? {} : { href: button.href })} />;
    case 'waiting':
      return <Button label={button.label} compact disabled />;
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

interface PendingRestartLineProps {
  readonly pendingRestart: PendingRestart | null;
  readonly trackerId:      string;
  readonly handlers:       ForgesHandlers;
}

function PendingRestartLine({ pendingRestart, trackerId, handlers }: PendingRestartLineProps) {
  if (pendingRestart === null) return null;
  return (
    <PendingStep
      word={pendingRestart.word}
      sentence={pendingRestart.sentence}
      action={<ForgeButtonView button={pendingRestart.restartButton} trackerId={trackerId} handlers={handlers} />}
      dismissLabel={pendingRestart.dismissLabel}
      onDismiss={() => handlers.onDismissRestartPending({ trackerId })}
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

interface LimitStepperProps {
  readonly accessibleName: string;
  readonly limit:          number;
  readonly lowerLabel:     string;
  readonly raiseLabel:     string;
  /** `null` where that side is off: at the lowest limit or at the ceiling. */
  readonly lowerCommand:   CommandBody | null;
  readonly raiseCommand:   CommandBody | null;
  /** Both sides are off while a limit is on its way, or where the forge cannot take it. */
  readonly isOff:          boolean;
  readonly onCommand:      (command: CommandBody) => void;
}

/** A limit as the package's number stepper: a side that may not step is clamped shut, so each side is disabled on its own. */
function LimitStepper({
  accessibleName, limit, lowerLabel, raiseLabel, lowerCommand, raiseCommand, isOff, onCommand
}: LimitStepperProps) {
  const canLower = !isOff && lowerCommand !== null;
  const canRaise = !isOff && raiseCommand !== null;
  return (
    <NumberStepper
      accessibleName={accessibleName}
      value={limit}
      step={1}
      minimum={canLower ? limit - 1 : limit}
      maximum={canRaise ? limit + 1 : limit}
      unitText="agents"
      lowerLabel={lowerLabel}
      raiseLabel={raiseLabel}
      onChange={(value) => {
        const command = value < limit ? lowerCommand : raiseCommand;
        if (command !== null) onCommand(command);
      }}
    />
  );
}

function AgentsCell({ project, agents, handlers }: { readonly project: string; readonly agents: ForgeAgentsCell | null; readonly handlers: ForgesHandlers }) {
  if (agents === null) return null;
  if (agents.kind === 'text') return <span className="gaia-forges-agents">{agents.text}</span>;
  return (
    <span className="gaia-forges-agents-stepper">
      <span className="gaia-forges-agents">{`${agents.inFlight} /`}</span>
      <LimitStepper
        accessibleName={`${project}'s agent limit`}
        limit={agents.limit}
        lowerLabel={agents.lowerLabel}
        raiseLabel={agents.raiseLabel}
        lowerCommand={agents.lowerCommand}
        raiseCommand={agents.raiseCommand}
        isOff={agents.disabled}
        onCommand={handlers.onCommand}
      />
    </span>
  );
}

function StopDialogPanel({ dialog, trackerId, handlers }: { readonly dialog: StopDialog; readonly trackerId: string; readonly handlers: ForgesHandlers }) {
  const choices = dialog.choices.map((choice, i) => (
    <ChoiceOption
      key={choice.agents}
      letter={String.fromCharCode(FIRST_CHOICE_LETTER_CODE + i)}
      label={choice.title}
      description={choice.consequence}
      chosen={choice.chosen}
      variant="card"
      input={{
        type:           'radio',
        name:           `gaia-forges-stop-${trackerId}`,
        checked:        choice.chosen,
        accessibleName: choice.title,
        // The package's option cannot be disabled, so a choice made while the Stop is on its way changes nothing.
        onChange:       () => {
          if (!dialog.isOnItsWay) handlers.onStopChoice(choice.agents);
        },
      }}
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
  if (row.stopDialog === null && row.refusal === null && row.pendingRestart === null && row.noticeText === null) return null;
  return (
    <div className="gaia-forges-row-below">
      {row.noticeText === null ? null : <p className="gaia-forges-row-notice" role="status">{row.noticeText}</p>}
      {row.stopDialog === null ? null : <StopDialogPanel dialog={row.stopDialog} trackerId={row.trackerId} handlers={handlers} />}
      <ShownRefusalLine refusal={row.refusal} trackerId={row.trackerId} handlers={handlers} />
      <PendingRestartLine pendingRestart={row.pendingRestart} trackerId={row.trackerId} handlers={handlers} />
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
          <span className="gaia-forges-forge-root" title={row.rootPath}>{row.rootText}</span>
        </span>
      ),
      condition: (
        <span className="gaia-forges-condition">
          <span className="gaia-forges-condition-word" data-tone={row.conditionTone ?? undefined}>{row.conditionWord}</span>
          {row.detailText === null ? null : <span className="gaia-forges-condition-detail">{row.detailText}</span>}
        </span>
      ),
      agents:   <AgentsCell project={row.project} agents={row.agents} handlers={handlers} />,
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
      <PendingRestartLine pendingRestart={banner.pendingRestart} trackerId={banner.trackerId} handlers={handlers} />
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
  return (
    <section className="gaia-forges-machine" aria-labelledby={MACHINE_HEAD_ID} data-at-the-limit={machine.isAtTheLimit ? '' : undefined}>
      <Text typeRole="micro" element="h2" id={MACHINE_HEAD_ID}>This machine</Text>
      <div className="gaia-forges-machine-limit">
        <span className="gaia-forges-machine-limit-label">Agent limit</span>
        {machine.limit === null ? <span className="gaia-forges-machine-limit-value">{machine.limitText}</span> : (
          <LimitStepper
            accessibleName="The machine's agent limit"
            limit={machine.limit}
            lowerLabel="Lower the machine's agent limit"
            raiseLabel="Raise the machine's agent limit"
            lowerCommand={machine.lowerCommand}
            raiseCommand={machine.raiseCommand}
            isOff={machine.stepperIsOff}
            onCommand={handlers.onCommand}
          />
        )}
      </div>
      <p className="gaia-forges-machine-sentence">{machine.sentence}</p>
      {machine.meter === null ? null : (
        <FillMeter label={machine.meter.label} used={machine.meter.used} limit={machine.meter.whole} near={machine.meter.used >= machine.meter.whole} tone="neutral" />
      )}
      {machine.atTheLimitText === null ? null : <p className="gaia-forges-machine-at-the-limit">{machine.atTheLimitText}</p>}
      <dl className="gaia-forges-machine-facts">
        {machine.facts.map((fact) => (
          <div key={fact.label} className="gaia-forges-machine-fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
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
          ? (
            <DataTable
              label="Forges"
              columns={COLUMNS}
              columnWidths={COLUMN_WIDTHS}
              rows={content.rows.map((row) => tableRowOf(row, handlers))}
              rowHeight="tall"
              columnGap="narrow"
            />
          )
          : <p className="gaia-forges-empty">{content.emptySentence}</p>}
        {content.heldBanners.map((banner) => <HeldBannerCard key={banner.trackerId} banner={banner} handlers={handlers} />)}
        {content.notFound.length === 0 ? null : (
          <section className="gaia-forges-group" aria-labelledby={NOT_FOUND_HEAD_ID}>
            <Text typeRole="micro" element="h2" id={NOT_FOUND_HEAD_ID}>{content.notFoundHead}</Text>
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
