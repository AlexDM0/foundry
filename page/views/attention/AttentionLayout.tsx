/**
 * The Attention view laid out from its content (SCREENS A1 and B3): the unreachable forges' banners, the figures, what waits on User, the
 * forges that need a look, and beside them what Gaia reads of each forge, the running forges and what just happened. It takes no hooks: the
 * command states and the handlers come in as props, so a spec unfolds it whole.
 */
import type { CommandBody }                                       from '../../@types/CommandDocument.ts';
import { CommandSender, type CommandStates, type CommandSubject } from '../../api/CommandSender.ts';
import { Banner }                                                 from '../../design-system/Banner.tsx';
import { Button }                                                 from '../../design-system/Button.tsx';
import { Callout }                                                from '../../design-system/Callout.tsx';
import { ConditionDot }                                           from '../../design-system/ConditionDot.tsx';
import { Figure }                                                 from '../../design-system/Figure.tsx';
import { ListCard }                                               from '../../design-system/ListCard.tsx';
import { MicroCapsLabel }                                         from '../../design-system/MicroCapsLabel.tsx';
import { Pill }                                                   from '../../design-system/Pill.tsx';
import { Refusal }                                                from '../../design-system/Refusal.tsx';
import { RoleDot }                                                from '../../design-system/RoleDot.tsx';
import {
  type AttentionContent,
  AttentionModel,
  type AttentionRow,
  type ForgeReadingLine,
  type LookAction,
  type LookCallout,
  type RecentEntry,
  type RunningCard,
  type UnreachableBanner,
} from './AttentionModel.ts';

export interface AttentionLayoutProps {
  readonly content:          AttentionContent;
  readonly commandStates:    CommandStates;
  readonly onCommand:        (command: CommandBody) => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

interface CommandHandlers {
  readonly commandStates:    CommandStates;
  readonly onCommand:        (command: CommandBody) => void;
  readonly onDismissFailure: (subject: CommandSubject) => void;
}

const WAITING_HEAD_ID = 'gaia-attention-waiting-head';
const LOOKS_HEAD_ID = 'gaia-attention-looks-head';
const READINGS_HEAD_ID = 'gaia-attention-readings-head';
const RUNNING_HEAD_ID = 'gaia-attention-running-head';
const RECENT_HEAD_ID = 'gaia-attention-recent-head';

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

const ACTIVITY_HREF = '#activity';

const NO_ACTIVITY_SENTENCE = 'No forge has reported activity yet.';

function commandIsOnItsWay(commandStates: CommandStates, command: CommandBody): boolean {
  return CommandSender.stateOf(commandStates, CommandSender.subjectOf(command)).onItsWay !== null;
}

function LookAgainRefusal({ commandStates, onCommand, onDismissFailure }: CommandHandlers) {
  const subject = CommandSender.subjectOf(LOOK_AGAIN);
  const { failure } = CommandSender.stateOf(commandStates, subject);
  if (failure === null) return null;
  const { code, sentence } = AttentionModel.refusalTextOf(failure);
  return (
    <div className="gaia-attention-refusal">
      <Refusal commandLabel="Look again" code={code} sentence={sentence} onTryAgain={() => onCommand(LOOK_AGAIN)} onDismiss={() => onDismissFailure(subject)} />
    </div>
  );
}

function UnreachableBannerLine({ banner, commandStates, onCommand }: { readonly banner: UnreachableBanner } & CommandHandlers) {
  const text = banner.lastReportedClock === null
    ? <>{`Overseer unreachable: ${banner.project}. Gaia shows nothing of it and tries again.`}</>
    : (
      <>
        {`Overseer unreachable: ${banner.project}. Gaia shows what it last reported at `}
        <span className="gaia-attention-banner-stamp">{banner.lastReportedClock}</span>
        {' and tries again.'}
      </>
    );
  return (
    <Banner
      text={text}
      action={<Button label="Look again" disabled={commandIsOnItsWay(commandStates, LOOK_AGAIN)} onPress={() => onCommand(LOOK_AGAIN)} />}
    />
  );
}

function AttentionRowCells({ row }: { readonly row: AttentionRow }) {
  return (
    <div className="gaia-attention-row" data-stale={row.isStale ? '' : undefined}>
      <span className="gaia-attention-row-forge">
        <ConditionDot condition={row.condition} />
        <span className="gaia-attention-row-forge-text">
          <span className="gaia-attention-row-project">{row.project}</span>
          <span className="gaia-attention-row-condition">{row.conditionWord}</span>
        </span>
      </span>
      <span className="gaia-attention-row-kind"><Pill text={row.kindText} tone={row.kindTone} /></span>
      <span className="gaia-attention-row-id">{row.idText}</span>
      <span className="gaia-attention-row-text">
        <span className="gaia-attention-row-subject">{row.subject}</span>
        <span className="gaia-attention-row-meta">{row.metaText}</span>
      </span>
      <Button label={row.actionLabel} href={row.href} disabled={row.isStale} emphasis={row.isPrimary ? 'primary' : 'plain'} />
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
      {...(action.icon === null ? {} : { icon: action.icon })}
      disabled={!action.forgeAcceptsIt || commandIsOnItsWay(commandStates, command)}
      onPress={() => onCommand(command)}
    />
  );
}

/** A forge's refusal shows under the callout whose button sent the refused command, until dismissed or the next success. */
function LookRefusal({
  look, commandStates, onCommand, onDismissFailure
}: { readonly look: LookCallout } & CommandHandlers) {
  const subject = { trackerId: look.trackerId };
  const { failure } = CommandSender.stateOf(commandStates, subject);
  const refusedAction = failure === null
    ? undefined
    : look.actions.find((action) => action.kind === 'command' && action.command.kind === failure.kind && 'trackerId' in action.command);
  if (failure === null || refusedAction?.kind !== 'command') return null;
  const { code, sentence } = AttentionModel.refusalTextOf(failure);
  return (
    <Refusal
      commandLabel={refusedAction.label}
      code={code}
      sentence={sentence}
      onTryAgain={() => onCommand(refusedAction.command)}
      onDismiss={() => onDismissFailure(subject)}
    />
  );
}

function LookBlock({ look, ...handlers }: { readonly look: LookCallout } & CommandHandlers) {
  return (
    <div className="gaia-attention-look">
      <Callout
        tone={look.tone}
        dot={<ConditionDot condition={look.condition} />}
        title={look.project}
        word={look.word}
        sentence={look.sentence}
        {...(look.machineLine === null ? {} : { machineLine: look.machineLine })}
        actions={<>{look.actions.map((action) => <LookActionButton key={action.label} action={action} {...handlers} />)}</>}
      />
      <LookRefusal look={look} {...handlers} />
    </div>
  );
}

function ReadingsPanel({ readings }: { readonly readings: readonly ForgeReadingLine[] }) {
  return (
    <section className="gaia-attention-section" aria-labelledby={READINGS_HEAD_ID}>
      <MicroCapsLabel element="h2" id={READINGS_HEAD_ID} text="What Gaia reads of each forge" />
      <ul className="gaia-attention-readings">
        {readings.map((reading) => (
          <li key={reading.trackerId} className="gaia-attention-reading" data-totals-cannot-vouch={reading.totalsCannotVouchForIt ? '' : undefined}>
            <span className="gaia-attention-reading-forge">{reading.project}</span>
            <span className="gaia-attention-reading-contract">{reading.contractText}</span>
            <span className="gaia-attention-reading-text">{reading.readingText}</span>
            {reading.totalsCannotVouchForIt ? <span className="gaia-attention-reading-totals">The totals cannot vouch for it.</span> : null}
          </li>
        ))}
      </ul>
      <p className="gaia-attention-note">Gaia never guesses a count. A forge it cannot read in full is named here, and the totals do not vouch for it.</p>
    </section>
  );
}

function RunningCardLink({ card }: { readonly card: RunningCard }) {
  return (
    <a className="gaia-attention-running-card" href={card.href} data-stale={card.isStale ? '' : undefined}>
      <span className="gaia-attention-running-head">
        <ConditionDot condition={card.condition} />
        <span className="gaia-attention-running-name">{card.project}</span>
        <span className="gaia-attention-running-condition">{card.conditionWord}</span>
        {card.slotsText === null ? null : <span className="gaia-attention-running-slots">{card.slotsText}</span>}
      </span>
      <span className="gaia-attention-running-jobs">
        {card.jobs.map((job) => (
          <span key={job.jobId} className="gaia-attention-running-job">
            <RoleDot role={job.role} />
            {job.text}
          </span>
        ))}
      </span>
      {card.waitingText === null ? null : <span className="gaia-attention-running-waiting">{card.waitingText}</span>}
    </a>
  );
}

function RecentList({ recent }: { readonly recent: readonly RecentEntry[] }) {
  return (
    <section className="gaia-attention-section" aria-labelledby={RECENT_HEAD_ID}>
      <div className="gaia-attention-recent-top">
        <MicroCapsLabel element="h2" id={RECENT_HEAD_ID} text="Just happened" />
        <a className="gaia-attention-link" href={ACTIVITY_HREF}>All activity</a>
      </div>
      {recent.length === 0 ? <p className="gaia-attention-nothing">{NO_ACTIVITY_SENTENCE}</p> : (
        <ul className="gaia-attention-recent">
          {recent.map((entry) => (
            <li key={entry.key} className="gaia-attention-recent-entry">
              <span className="gaia-attention-recent-at">{entry.clockText ?? ''}</span>
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
      {content.banners.map((banner) => <UnreachableBannerLine key={banner.trackerId} banner={banner} {...handlers} />)}
      <LookAgainRefusal {...handlers} />
      <div className="gaia-attention-figures">
        {content.figures.map((figure) => <Figure key={figure.label} value={figure.value} label={figure.label} />)}
      </div>
      <div className="gaia-attention-body">
        <div className="gaia-attention-main">
          <section className="gaia-attention-section" aria-labelledby={WAITING_HEAD_ID}>
            <MicroCapsLabel element="h2" id={WAITING_HEAD_ID} text={content.waitingHead} />
            {content.rows.length === 0
              ? <p className="gaia-attention-nothing">{content.nothingText}</p>
              : <ListCard label="Waiting on you" rows={content.rows.map((row) => ({ key: row.key, content: <AttentionRowCells row={row} /> }))} />}
          </section>
          {content.looks.length === 0 ? null : (
            <section className="gaia-attention-section" aria-labelledby={LOOKS_HEAD_ID}>
              <MicroCapsLabel element="h2" id={LOOKS_HEAD_ID} text={content.looksHead} />
              {content.looks.map((look) => <LookBlock key={`${look.trackerId}/${look.lookKind}`} look={look} {...handlers} />)}
            </section>
          )}
        </div>
        <aside className="gaia-attention-aside">
          {content.readings === null ? null : <ReadingsPanel readings={content.readings} />}
          {content.running.length === 0 ? null : (
            <section className="gaia-attention-section" aria-labelledby={RUNNING_HEAD_ID}>
              <MicroCapsLabel element="h2" id={RUNNING_HEAD_ID} text={content.runningHead} />
              {content.running.map((card) => <RunningCardLink key={card.trackerId} card={card} />)}
            </section>
          )}
          <RecentList recent={content.recent} />
        </aside>
      </div>
    </div>
  );
}
