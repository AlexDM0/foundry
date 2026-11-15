/**
 * The Attention view laid out from its content (SCREENS A1 and B3): the unreachable forges' banners, the figures while a forge is not
 * fully read (one line atop the main column; otherwise they stand in the page title), what waits on User, the forges that need a look with
 * a refusal or a pending restart under them, and beside them what Gaia reads of each forge, the running forges and what just happened. It
 * takes no hooks: the command states and the handlers come in as props, so a spec unfolds it whole.
 */
import { Banner }      from 'design-system/Banner';
import { Button }      from 'design-system/Button';
import { Card }        from 'design-system/Card';
import { EmptyState }  from 'design-system/EmptyState';
import { MonoId }      from 'design-system/MonoId';
import { Row }         from 'design-system/Row';
import { SectionHead } from 'design-system/SectionHead';
import { Stamp }       from 'design-system/Stamp';
import { Tag }         from 'design-system/Tag';
import { Text }        from 'design-system/Text';
import { TextButton }  from 'design-system/TextButton';
import { Figure }      from 'design-system-contributions/Figure';
import { PendingStep } from 'design-system-contributions/PendingStep';

import type { CommandBody }                                       from '../../@types/CommandDocument.ts';
import { CommandSender, type CommandStates, type CommandSubject } from '../../api/CommandSender.ts';
import { BrainDiamond }                                           from '../../design-system/BrainDiamond.tsx';
import { Callout }                                                from '../../design-system/Callout.tsx';
import { ConditionDot }                                           from '../../design-system/ConditionDot.tsx';
import { ListCard }                                               from '../../design-system/ListCard.tsx';
import { OpenInNewTabGlyph }                                      from '../../design-system/OpenInNewTabGlyph.tsx';
import { Refusal }                                                from '../../design-system/Refusal.tsx';
import { RoleDot }                                                from '../../design-system/RoleDot.tsx';
import { VersionsLine, VersionsText }                             from '../../shared/VersionsText.tsx';
import { ACTIVITY_SENTENCES }                                     from '../../shared/constants/ActivitySentences.ts';
import { CommandFailureTextUtil }                                 from '../../shared/utils/CommandFailureTextUtil.ts';
import { FigureLookUtil }                                         from '../../shared/utils/FigureLookUtil.ts';
import { ForgeCommandTextUtil }                                   from '../../shared/utils/ForgeCommandTextUtil.ts';
import {
  type AttentionContent,
  type AttentionKindTone,
  type AttentionRow,
  type ForgeReadingLine,
  type LookAction,
  type LookCallout,
  type ReadingsNote,
  type RecentEntry,
  type RunningBrainLine,
  type RunningCard,
  type RunningCardForm,
  type UnreachableBanner,
} from './AttentionModel.ts';

export interface AttentionLayoutProps {
  readonly content:                 AttentionContent;
  readonly commandStates:           CommandStates;
  readonly onCommand:               (command: CommandBody) => void;
  readonly onDismissFailure:        (subject: CommandSubject) => void;
  readonly onDismissRestartPending: (subject: CommandSubject) => void;
}

interface CommandHandlers {
  readonly commandStates:           CommandStates;
  readonly onCommand:               (command: CommandBody) => void;
  readonly onDismissFailure:        (subject: CommandSubject) => void;
  readonly onDismissRestartPending: (subject: CommandSubject) => void;
}

const READINGS_HEAD = 'What Gaia reads of each forge';

const RECENT_HEAD = 'Just happened';

const VERSIONS_LINK_LABEL = 'Versions';

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

const ACTIVITY_HREF = '#activity';

const WAITING_ORDER_SENTENCE = 'oldest first · escalations on top';

const HEAD_SEPARATOR = ' · ';

const LINE_SEPARATOR = ' · ';

const BRAIN_NAME = 'Flint\'s brain';

function commandIsOnItsWay(commandStates: CommandStates, command: CommandBody): boolean {
  return CommandSender.stateOf(commandStates, CommandSender.subjectOf(command)).onItsWay !== null;
}

function LookAgainRefusal({ commandStates, onCommand, onDismissFailure }: CommandHandlers) {
  const subject = CommandSender.subjectOf(LOOK_AGAIN);
  const { failure } = CommandSender.stateOf(commandStates, subject);
  if (failure === null) return null;
  const { refusedBy, code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
  return (
    <div className="gaia-attention-refusal">
      <Refusal
        commandLabel="Look again"
        refusedBy={refusedBy}
        code={code}
        sentence={sentence}
        onTryAgain={() => onCommand(LOOK_AGAIN)}
        onDismiss={() => onDismissFailure(subject)}
      />
    </div>
  );
}

function UnreachableBannerLine({ banner, commandStates, onCommand }: { readonly banner: UnreachableBanner } & CommandHandlers) {
  const lead = <span className="gaia-attention-banner-lead">{`Overseer unreachable: ${banner.project}.`}</span>;
  const text = banner.lastReportedClock === null
    ? <>{lead}{' Gaia shows nothing of it and tries again.'}</>
    : (
      <>
        {lead}
        {' Gaia shows what it last reported at '}
        <Stamp shortText={banner.lastReportedClock} />
        {' and tries again.'}
      </>
    );
  return (
    <Banner
      tone="error"
      text={text}
      action={<Button label="Look again" compact disabled={commandIsOnItsWay(commandStates, LOOK_AGAIN)} onPress={() => onCommand(LOOK_AGAIN)} />}
    />
  );
}

/** Accept waits only on User's word for work done, so it reads as the package's success tone; every other kind is a decision, in orange. */
function KindPill({ text, tone }: { readonly text: string; readonly tone: AttentionKindTone }) {
  return tone === 'pass' ? <Tag text={text} tone="state" stateTone="success" /> : <Tag text={text} tone="warn" />;
}

function AttentionRowCells({ row }: { readonly row: AttentionRow }) {
  return (
    <div className="gaia-attention-row" data-stale={row.isStale ? '' : undefined} data-primary={row.isPrimary ? '' : undefined}>
      <span className="gaia-attention-row-forge">
        <ConditionDot condition={row.condition} />
        <span className="gaia-attention-row-forge-text">
          <span className="gaia-attention-row-project">{row.project}</span>
          <span className="gaia-attention-row-condition">{row.conditionWord}</span>
        </span>
      </span>
      <span className="gaia-attention-row-kind"><KindPill text={row.kindText} tone={row.kindTone} /></span>
      <span className="gaia-attention-row-id"><MonoId text={row.idText} tone="muted" /></span>
      <span className="gaia-attention-row-text">
        <span className="gaia-attention-row-subject">{row.subject}</span>
        <span className="gaia-attention-row-meta">{row.metaText}</span>
      </span>
      <Button label={row.actionLabel} compact disabled={row.isStale} emphasis={row.isPrimary ? 'primary' : 'quiet'} {...(row.isStale ? {} : { href: row.href })} />
    </div>
  );
}

function LookActionButton({ action, commandStates, onCommand }: { readonly action: LookAction } & CommandHandlers) {
  if (action.kind === 'link') return <Button label={action.label} href={action.href} emphasis={action.emphasis} />;
  const { command } = action;
  return (
    <Button
      label={action.label}
      emphasis={action.emphasis}
      {...(action.icon === null ? {} : { leading: <OpenInNewTabGlyph /> })}
      disabled={!action.forgeAcceptsIt || commandIsOnItsWay(commandStates, command)}
      onPress={() => onCommand(command)}
    />
  );
}

/**
 * A forge's refusal shows under the callout whose button sent the refused command, the pending step's Restart included, until dismissed or
 * the next success.
 */
function LookRefusal({
  look, commandStates, onCommand, onDismissFailure
}: { readonly look: LookCallout } & CommandHandlers) {
  const subject = { trackerId: look.trackerId };
  const { failure } = CommandSender.stateOf(commandStates, subject);
  const actionsItSends = look.restartAfterUpdate === null ? look.actions : [...look.actions, look.restartAfterUpdate];
  const refusedAction = failure === null
    ? undefined
    : actionsItSends.find((action) => action.kind === 'command' && action.command.kind === failure.kind && 'trackerId' in action.command);
  if (failure === null || refusedAction?.kind !== 'command') return null;
  const { refusedBy, code, sentence } = CommandFailureTextUtil.refusalTextOf(failure);
  return (
    <Refusal
      commandLabel={refusedAction.label}
      refusedBy={refusedBy}
      code={code}
      sentence={sentence}
      onTryAgain={() => onCommand(refusedAction.command)}
      onDismiss={() => onDismissFailure(subject)}
    />
  );
}

/** The restart an update left pending shows under the callout whose Update forge sent it, until the sender drops it or it is dismissed. */
function LookPendingRestart({ look, ...handlers }: { readonly look: LookCallout } & CommandHandlers) {
  const subject = { trackerId: look.trackerId };
  const { restartAfterUpdate } = look;
  if (restartAfterUpdate === null || !CommandSender.stateOf(handlers.commandStates, subject).restartPending) return null;
  const { word, sentence, dismissLabel } = ForgeCommandTextUtil.RESTART_PENDING;
  return (
    <PendingStep
      word={word}
      sentence={look.updateSteps?.doneStepSentence ?? sentence}
      action={<LookActionButton action={restartAfterUpdate} {...handlers} />}
      dismissLabel={dismissLabel}
      onDismiss={() => handlers.onDismissRestartPending(subject)}
    />
  );
}

function calloutWordOf(look: LookCallout): string {
  return look.wordForm === 'pill' ? look.word : `${look.word}.`;
}

/** Where an older forge's Update forge stands: on its way, or done with the restart pending; every other callout stays idle. */
type LookUpdateStep = 'idle' | 'pending' | 'done';

function lookUpdateStepOf(look: LookCallout, commandStates: CommandStates): LookUpdateStep {
  if (look.updateSteps === null) return 'idle';
  const { onItsWay, restartPending } = CommandSender.stateOf(commandStates, { trackerId: look.trackerId });
  if (onItsWay === 'forge-update') return 'pending';
  return restartPending ? 'done' : 'idle';
}

/** While Update forge is on its way the callout says so beside a ring and its button waits; once done, the pending step under it acts. */
function LookCalloutAtItsStep({ look, ...handlers }: { readonly look: LookCallout } & CommandHandlers) {
  const step = lookUpdateStepOf(look, handlers.commandStates);
  const parts = {
    tone:  look.tone,
    dot:   <ConditionDot condition={look.condition} />,
    title: look.project,
    word:  calloutWordOf(look),
  };
  if (step === 'pending' && look.updateSteps !== null) {
    const sentence = <span className="gaia-attention-look-status"><ConditionDot condition="starting" />{look.updateSteps.pendingText}</span>;
    return <Callout {...parts} sentence={sentence} actions={<Button label={look.updateSteps.pendingButtonLabel} disabled onPress={() => undefined} />} />;
  }
  if (step === 'done' && look.updateSteps !== null) return <Callout {...parts} sentence={look.updateSteps.doneSentence} />;
  return (
    <Callout
      {...parts}
      sentence={look.sentence}
      {...(look.machineLine === null ? {} : { machineLine: look.machineLine })}
      {...(look.versionsLine === null ? {} : { versionsLine: <VersionsLine text={look.versionsLine} /> })}
      actions={<>{look.actions.map((action) => <LookActionButton key={action.label} action={action} {...handlers} />)}</>}
    />
  );
}

function LookBlock({ look, ...handlers }: { readonly look: LookCallout } & CommandHandlers) {
  return (
    <div className="gaia-attention-look" data-look-kind={look.lookKind} data-word-form={look.wordForm}>
      <LookCalloutAtItsStep look={look} {...handlers} />
      <LookRefusal look={look} {...handlers} />
      <LookPendingRestart look={look} {...handlers} />
    </div>
  );
}

function Figures({ content }: { readonly content: AttentionContent }) {
  return (
    <div className="gaia-attention-figures" data-form={content.figuresForm}>
      {content.figures.map((figure) => (
        <Figure
          key={figure.label}
          value={figure.value}
          label={figure.label}
          form={content.figuresForm === 'line' ? 'inline' : 'stacked'}
          {...FigureLookUtil.toneOf(figure.attention)}
        />
      ))}
    </div>
  );
}

function ReadingRight({ reading }: { readonly reading: ForgeReadingLine }) {
  const { rightText } = reading;
  if (rightText.kind === 'contract') return <span className="gaia-attention-reading-contract">{rightText.text}</span>;
  return (
    <span className="gaia-attention-reading-version" data-work={rightText.isWork ? '' : undefined}>
      <VersionsText text={rightText.text} numberInk="inherit" />
    </span>
  );
}

function ReadingsNoteLine({ note }: { readonly note: ReadingsNote | null }) {
  if (note === null) return null;
  return (
    <div className="gaia-attention-note">
      <p className="gaia-attention-note-sentence">{note.sentence}</p>
      {note.versionsHref === null ? null : <TextButton label={VERSIONS_LINK_LABEL} href={note.versionsHref} />}
    </div>
  );
}

function ReadingsPanel({ readings, note }: { readonly readings: readonly ForgeReadingLine[]; readonly note: ReadingsNote | null }) {
  return (
    <section className="gaia-attention-section" aria-label={READINGS_HEAD}>
      <SectionHead title={READINGS_HEAD} />
      <ul className="gaia-attention-readings">
        {readings.map((reading) => (
          <li key={reading.trackerId} className="gaia-attention-reading" data-totals-cannot-vouch={reading.totalsCannotVouchForIt ? '' : undefined}>
            <span className="gaia-attention-reading-head">
              <ConditionDot condition={reading.condition} />
              <span className="gaia-attention-reading-forge">{reading.project}</span>
            </span>
            <ReadingRight reading={reading} />
            <span className="gaia-attention-reading-text">
              {reading.readingText}
              {reading.totalsCannotVouchForIt ? <span className="gaia-visually-hidden">{' The totals cannot vouch for it.'}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <ReadingsNoteLine note={note} />
    </section>
  );
}

function RunningWaiting({ card }: { readonly card: RunningCard }) {
  return card.waitingText === null ? null : <span className="gaia-attention-running-waiting">{card.waitingText}</span>;
}

/** A job chip: its id, then its role word. */
function RunningJobChip({ job }: { readonly job: RunningCard['jobs'][number] }) {
  return (
    <span className="gaia-attention-running-job" data-role={job.role}>
      <RoleDot role={job.role} />
      <MonoId text={job.jobId} tone="strong" weight="bold" />
      <span className="gaia-attention-running-job-role">{` ${job.roleWord}`}</span>
    </span>
  );
}

/** Flint's brain under the job chips: the diamond, then the model and the time left as its forge reports them. */
function RunningBrain({ brain }: { readonly brain: RunningBrainLine }) {
  return (
    <span className="gaia-attention-running-brain">
      <BrainDiamond />
      <span>
        {BRAIN_NAME}
        {brain.model === null ? null : `${LINE_SEPARATOR}${brain.model}`}
        {brain.countdown === null ? null : (
          <>
            {LINE_SEPARATOR}
            <span className="gaia-attention-running-brain-countdown">{brain.countdown}</span>
            {' left'}
          </>
        )}
      </span>
    </span>
  );
}

function RunningCardLink({ card, form }: { readonly card: RunningCard; readonly form: RunningCardForm }) {
  return (
    <a className="gaia-attention-running-card" href={card.href} data-stale={card.isStale ? '' : undefined} data-form={form}>
      <span className="gaia-attention-running-head">
        <ConditionDot condition={card.condition} />
        <span className="gaia-attention-running-name">{card.project}</span>
        <span className="gaia-attention-running-condition" data-condition={card.condition}>{card.conditionWord}</span>
        {form === 'compact' && !card.isStale ? <RunningWaiting card={card} /> : null}
        <span className="gaia-attention-running-slots">{card.slotsText}</span>
      </span>
      <span className="gaia-attention-running-jobs">
        {card.jobs.map((job) => <RunningJobChip key={job.jobId} job={job} />)}
      </span>
      {card.brain === null ? null : <RunningBrain brain={card.brain} />}
      {form === 'full' ? <RunningWaiting card={card} /> : null}
    </a>
  );
}

/** What waits on User in one card: its serif head with the count in an orange pill and the order at the end, then the rows or the place empty. */
function WaitingCard({ content }: { readonly content: AttentionContent }) {
  return (
    <section className="gaia-attention-waiting" aria-label={content.waitingHead}>
      <Card padding="none" clipped>
        <div className="gaia-attention-waiting-head">
          <Row between centerY gap="twelve">
            <Text typeRole="page" element="h2">
              Waiting on you
              <span className="gaia-visually-hidden">{HEAD_SEPARATOR}</span>
              <Tag text={content.waitingCount} tone="warn" />
            </Text>
            <Text typeRole="small" muted>{WAITING_ORDER_SENTENCE}</Text>
          </Row>
        </div>
        {content.rows.length === 0
          ? <EmptyState text={content.nothingText} />
          : <ListCard label="Waiting on you" rows={content.rows.map((row) => ({ key: row.key, content: <AttentionRowCells row={row} /> }))} />}
      </Card>
    </section>
  );
}

function RecentList({ recent }: { readonly recent: readonly RecentEntry[] }) {
  return (
    <section className="gaia-attention-section" aria-label={RECENT_HEAD}>
      <SectionHead title={RECENT_HEAD}>
        <span className="gaia-attention-recent-all"><TextButton label="All activity" href={ACTIVITY_HREF} /></span>
      </SectionHead>
      {recent.length === 0 ? <EmptyState text={ACTIVITY_SENTENCES.noActivity} compact /> : (
        <ul className="gaia-attention-recent">
          {recent.map((entry) => (
            <li key={entry.key} className="gaia-attention-recent-entry">
              <span className="gaia-attention-recent-at">{entry.clockText === null ? null : <Stamp shortText={entry.clockText} />}</span>
              <span className="gaia-attention-recent-what">
                <span className="gaia-attention-recent-forge">{entry.project}</span>
                {' '}
                <span className="gaia-attention-recent-text">{entry.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AttentionLayout({ content, ...handlers }: AttentionLayoutProps) {
  return (
    <div className="gaia-attention">
      {content.banners.length === 0 ? null : (
        <div className="gaia-attention-banners">
          {content.banners.map((banner) => <UnreachableBannerLine key={banner.trackerId} banner={banner} {...handlers} />)}
        </div>
      )}
      <LookAgainRefusal {...handlers} />
      <div className="gaia-attention-body">
        <div className="gaia-attention-main">
          {content.figuresForm === 'line' ? <Figures content={content} /> : null}
          <WaitingCard content={content} />
          {content.looks.length === 0 ? null : (
            <section className="gaia-attention-looks" aria-label={content.looksHead}>
              <SectionHead title={content.looksHead} />
              <div className="gaia-attention-look-list">
                {content.looks.map((look) => <LookBlock key={`${look.trackerId}/${look.lookKind}`} look={look} {...handlers} />)}
              </div>
            </section>
          )}
        </div>
        <aside className="gaia-attention-aside">
          {content.readings === null ? null : <ReadingsPanel readings={content.readings} note={content.readingsNote} />}
          {content.running.length === 0 && content.runningNote === null ? null : (
            <section className="gaia-attention-section" aria-label={content.runningHead}>
              <SectionHead title={content.runningHead} />
              {content.running.map((card) => <RunningCardLink key={card.trackerId} card={card} form={content.runningForm} />)}
              {content.runningNote === null ? null : <p className="gaia-attention-note">{content.runningNote}</p>}
            </section>
          )}
          <RecentList recent={content.recent} />
        </aside>
      </div>
    </div>
  );
}
