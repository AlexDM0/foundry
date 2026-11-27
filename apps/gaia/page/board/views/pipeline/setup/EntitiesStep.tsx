/**
 * MonoEntities, the entities step: the layout research found, proposed as monorepo mode, which User accepts or declines for single mode;
 * every entity as a row to rename, re-kind, re-home, fold or remove, an app's whitelist and reach, the root entity with what it gets (kept
 * for a person by default) and a form to add an entity; the refusals the forge serves for its stored draft before Continue; beside it the
 * pipeline agent at the forge level. Each gesture is a set of draft edits, sent at once as one `pipeline-draft-edit`, one gesture in flight
 * at a time: the step holds no edit, and a draft the forge refuses is shown as stored, with its refusals, until a further gesture fixes it.
 */
import { useState }                                                                             from 'react';
import type { BoardCommandDocument }                                                            from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDraftEditDocument, BoardPipelineEntityDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  Card,
  PageHead,
  Skeleton,
  Tag,
  Text,
  TextField,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { TranscriptFollower }                                  from '../../../@types/BoardServices.ts';
import { type BoardClock, useTickingNow }                           from '../../../shared/BoardClock.ts';
import { CommandButton }                                            from '../../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf, useBoardNavigation }                       from '../../../shared/routing/BoardRouteLinks.ts';
import { TimeUtil }                                                 from '../../../utils/TimeUtil.ts';
import { PipelinePage }                                             from '../PipelinePage.tsx';
import { PipelinePanel }                                            from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts }                from '../PipelineViewModel.ts';
import { AgentMeter }                                               from '../agent-panel/AgentMeter.tsx';
import { AgentSessionModel }                                        from '../agent-panel/AgentSessionModel.ts';
import { PipelineAgentPanel }                                       from '../agent-panel/PipelineAgentPanel.tsx';
import { PipelineAgentPanelModel }                                  from '../agent-panel/PipelineAgentPanelModel.ts';
import { CrossingDialog }                                           from '../entities/CrossingDialog.tsx';
import { CrossingDialogModel }                                      from '../entities/CrossingDialogModel.ts';
import { FORGE_LEVEL, PipelineLevelModel }                          from '../entities/PipelineLevelModel.ts';
import { usePipelineFlowEditSender }                                from '../flow/PipelineFlowEditSender.ts';
import { BillingStepModel }                                         from './BillingStepModel.ts';
import { CompactSelect }                                            from './CompactSelect.tsx';
import { EntitiesStepModel, type EntitiesMode, type RowEntityKind } from './EntitiesStepModel.ts';
import { EntityRefusals }                                           from './EntityRefusals.tsx';
import { EntityRefusalsModel }                                      from './EntityRefusalsModel.ts';
import { EntityRow }                                                from './EntityRow.tsx';
import { FoldEntityDialog }                                         from './FoldEntityDialog.tsx';
import { RootEntityChoice }                                         from './RootEntityChoice.tsx';

export interface EntitiesStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            BoardPipelineSetupDocument;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
}

const ENTITIES_STEP_ITEM = 'setup/entities';

const SKELETON_LINES = 3;

const ADDED_KIND_OPTIONS = [{ value: 'package', label: 'Package' }, { value: 'app', label: 'App' }] as const;

/** The dialog over the step, one at a time. */
type OpenDialog = { readonly dialog: 'fold'; readonly packageKey: string } | { readonly dialog: 'crossing'; readonly appKey: string } | null;

interface ModeBannerProps {
  readonly mode:            EntitiesMode;
  readonly rowCount:        number;
  readonly gesturesAreOpen: boolean;
  /** The step's Continue, which declines monorepo mode while the draft holds no entity: a done step with none is single mode. */
  readonly continueCommand: BoardCommandDocument;
  readonly onAccept:        () => void;
  readonly onDecline:       () => void;
}

function ModeBanner({
  mode, rowCount, gesturesAreOpen, continueCommand, onAccept, onDecline
}: ModeBannerProps) {
  const navigateTo = useBoardNavigation();
  if (mode === 'waiting') {
    return (
      <section aria-label="No proposal yet">
        <Card quiet row centerY gap="ten">
          <View grow>
            <Text typeRole="small" muted>
              The pipeline agent proposes monorepo mode when it finds several stand-alone codebases. Single mode keeps one pipeline for the
              whole repository, as a forge has today.
            </Text>
          </View>
          <CommandButton
            label="Stay in single mode"
            command={continueCommand}
            compact
            onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('constitution'))}
          />
        </Card>
      </section>
    );
  }
  if (mode === 'proposed') {
    return (
      <section aria-label="Proposal">
        <Card decision row centerY gap="fourteen">
          <View gap="two" grow>
            <Text bold>{`Research found ${rowCount} stand-alone ${rowCount === 1 ? 'codebase' : 'codebases'}`}</Text>
            <Text typeRole="small" muted>
              Monorepo mode runs each as an entity, below. Single mode keeps one pipeline for the whole repository, as a forge has today.
            </Text>
          </View>
          <Button label="Stay in single mode" disabled={!gesturesAreOpen} onPress={onDecline} />
          <Button label="Accept monorepo mode" emphasis="primary" onPress={onAccept} />
        </Card>
      </section>
    );
  }
  if (mode === 'accepted') {
    return (
      <section aria-label="Monorepo mode">
        <Card quiet row centerY gap="ten">
          <Tag text="Monorepo mode" tone="neutral" glyph="check" />
          <Text typeRole="small" muted>Each entity gets its own pipeline. Nothing is stored until you apply.</Text>
          <View grow />
          <Button label="Use single mode instead" dense disabled={!gesturesAreOpen} onPress={onDecline} />
        </Card>
      </section>
    );
  }
  if (mode === 'single') {
    return (
      <section aria-label="Single mode">
        <Card quiet row centerY gap="ten">
          <Tag text="Single mode" tone="neutral" glyph="check" />
          <Text typeRole="small" muted>One pipeline for the whole repository, as a forge has today. Nothing is stored until you apply.</Text>
        </Card>
      </section>
    );
  }
  return null;
}

interface AddEntityFormProps {
  readonly entities:        Readonly<Record<string, BoardPipelineEntityDocument>>;
  readonly gesturesAreOpen: boolean;
  readonly onGesture:       (edits: readonly BoardDraftEditDocument[]) => boolean;
}

/** The new entity needs a key no entity has and one home folder, since the draft stores no entity without a home. */
function AddEntityForm({ entities, gesturesAreOpen, onGesture }: AddEntityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [key, setKey] = useState('');
  const [kind, setKind] = useState<RowEntityKind>('package');
  const [homeFolder, setHomeFolder] = useState('');
  const edit = EntitiesStepModel.entityAddedEditOf(entities, { key, kind, homeFolder });
  const keyRefusal = EntitiesStepModel.keyRefusalOf(entities, key, null);
  if (!isOpen) return <span><Button label="Add an entity" compact disabled={!gesturesAreOpen} onPress={() => setIsOpen(true)} /></span>;
  return (
    <div className="board-entities-add" role="group" aria-label="Add an entity">
      <TextField label="Key" value={key} mono placeholder="shared" onChange={setKey} />
      <CompactSelect accessibleName="Kind of the new entity" value={kind} options={ADDED_KIND_OPTIONS} onChange={(value) => setKind(value === 'app' ? 'app' : 'package')} />
      <TextField label="Home folder" value={homeFolder} mono placeholder="packages/shared" onChange={setHomeFolder} />
      <Button label="Cancel" emphasis="ghost" compact onPress={() => setIsOpen(false)} />
      <Button
        label="Add"
        emphasis="primary"
        compact
        disabled={!gesturesAreOpen || edit === null}
        onPress={() => {
          if (edit === null || !onGesture([edit])) return;
          setKey('');
          setHomeFolder('');
          setIsOpen(false);
        }}
      />
      {keyRefusal === null ? null : <span className="board-refusal" role="status">{keyRefusal}</span>}
    </div>
  );
}

/** The step's own state: User's accept, the open rows and the open dialog; the draft and its refusals are the forge's. */
function useEntitiesStepState(setup: BoardPipelineSetupDocument) {
  const { record } = setup;
  const [acceptedHere, setAcceptedHere] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const sender = usePipelineFlowEditSender(EntitiesStepModel.draftEditTargetOf(record));
  const shown = EntitiesStepModel.draftEntitiesOf(record);

  /** Sends the gesture's edits at once; the forge stores them and serves the refusals the draft they leave holds. */
  const gesture = (edits: readonly BoardDraftEditDocument[]): boolean => {
    const sentEdits = EntitiesStepModel.sentEditsOf(edits, sender.enabled);
    if (sentEdits === null) return false;
    sender.sendEdits(sentEdits);
    return true;
  };
  const decline = (): void => {
    if (!sender.enabled) return;
    setAcceptedHere(false);
    sender.sendEdits(EntitiesStepModel.declineEditsOf(shown));
  };
  const toggle = (key: string): void => {
    const next = new Set(expandedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedKeys(next);
  };
  return {
    shown,
    sender,
    mode:   EntitiesStepModel.modeOf(record, shown, acceptedHere),
    accept: () => setAcceptedHere(true),
    decline,
    gesture,
    expandedKeys,
    toggle,
    show:   (key: string) => setExpandedKeys(new Set([...expandedKeys, key])),
    openDialog,
    setOpenDialog,
  };
}

export function EntitiesStep({
  facts, setup, followTranscript, clock
}: EntitiesStepProps) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const { record } = setup;
  const now = useTickingNow(clock, false);
  const state = useEntitiesStepState(setup);
  const { shown, mode, sender } = state;
  const gesturesAreOpen = sender.enabled;
  const rows = EntitiesStepModel.rowsOf(shown, setup.entityRefusals);
  const refusals = EntityRefusalsModel.refusalsOf(setup);
  const continueBlock = EntitiesStepModel.continueBlockOf(mode, refusals.length);
  const showsEntities = mode === 'proposed' || mode === 'accepted';
  const main = (
    <>
      <View gap="two">
        <Text typeRole="small" muted>{EntitiesStepModel.statusLineOf(record)}</Text>
        <PageHead titleElement="h2"
          title={EntitiesStepModel.headingOf(facts.project ?? '')}
          lead={'An entity is an app, a package or the root. Each gets its own constitution, gates and reviewers. A ticket changes one entity, '
            + 'and crosses into a whitelisted package in stages.'}
        />
      </View>
      <ModeBanner
        mode={mode}
        rowCount={rows.length}
        gesturesAreOpen={gesturesAreOpen}
        continueCommand={EntitiesStepModel.continueCommandOf(record)}
        onAccept={state.accept}
        onDecline={state.decline}
      />
      {mode === 'waiting' ? <Skeleton lines={SKELETON_LINES} accessibleName="Waiting for the proposed entities" /> : null}
      {showsEntities
        ? (
          <section aria-label="Entities">
            <Card gap="ten">
              <span className="board-entities-head">
                <Text bold>Entities</Text>
                <Text typeRole="small" muted>{EntitiesStepModel.entityCountTextOf(shown)}</Text>
                <Text typeRole="small" muted>Every path belongs to one entity: the one with the deepest home folder that holds it, else root.</Text>
              </span>
              <div className="board-entities-table">
                <div className="board-entities-table-head" aria-hidden="true">
                  <span />
                  <span>Key</span>
                  <span>Kind</span>
                  <span>Home folders</span>
                  <span>Summary</span>
                  <span>Constitution</span>
                  <span>Depends on</span>
                  <span />
                </div>
                <ul className="board-entities-rows" aria-label="Entity list">
                  {rows.map((row) => (
                    <EntityRow
                      key={row.key}
                      row={row}
                      entities={shown}
                      isExpanded={state.expandedKeys.has(row.key)}
                      onToggle={() => state.toggle(row.key)}
                      gesturesAreOpen={gesturesAreOpen}
                      onGesture={state.gesture}
                      onFold={() => state.setOpenDialog({ dialog: 'fold', packageKey: row.key })}
                      onShowCrossing={CrossingDialogModel.crossablePackagesOf(shown, row.key).length === 0
                        ? null
                        : () => state.setOpenDialog({ dialog: 'crossing', appKey: row.key })}
                    />
                  ))}
                </ul>
                <RootEntityChoice
                  root={EntitiesStepModel.rootViewOf(shown)}
                  gesturesAreOpen={gesturesAreOpen}
                  onChoose={(choice) => state.gesture(EntitiesStepModel.rootChoiceEditsOf(shown, choice))}
                />
              </div>
              <AddEntityForm entities={shown} gesturesAreOpen={gesturesAreOpen} onGesture={state.gesture} />
            </Card>
          </section>
        )
        : null}
      <EntityRefusals
        refusals={refusals}
        gesturesAreOpen={gesturesAreOpen}
        onShow={state.show}
        onFix={(edits) => state.gesture(edits)}
      />
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title={PipelineAgentPanelModel.panelTitleOf(FORGE_LEVEL)}
      status={EntitiesStepModel.panelStatusOf(setup, AgentSessionModel.setupSessionStateOf(setup, facts.jobs))}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="entities"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="Correct the layout, for example: apps/legacy is not used"
        jobs={facts.jobs}
        showsAgentStrip
        levelShown={{ level: FORGE_LEVEL, hrefOf: (level) => hrefOf(PipelineLevelModel.routeAtLevel(level, ENTITIES_STEP_ITEM)) }}
      />
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Entities actions"
      start={(
        <>
          <Tag text="Layout found" tone="neutral" glyph="check" />
          <Text bold>{EntitiesStepModel.footerSummaryOf(shown, refusals.length, setup.openQuestionCount)}</Text>
          <Text muted>{continueBlock ?? EntitiesStepModel.footerHintOf(mode)}</Text>
        </>
      )}
      end={(
        <>
          <Button label="Back to research" href={hrefOf(PipelineViewModel.setupStepRouteOf('research'))} />
          <CommandButton
            label="Continue to constitution"
            command={continueBlock === null ? EntitiesStepModel.continueCommandOf(record) : null}
            primary
            attention={continueBlock === null}
            onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('constitution'))}
          />
        </>
      )}
    />
  );
  const { openDialog } = state;
  return (
    <div className="board-entities-step" data-mode={mode}>
      <PipelinePage main={main} panel={panel} footer={footer} />
      {openDialog?.dialog === 'fold'
        ? <FoldEntityDialog packageKey={openDialog.packageKey} entities={shown} onFold={state.gesture} onClose={() => state.setOpenDialog(null)} />
        : null}
      {openDialog?.dialog === 'crossing'
        ? <CrossingDialog appKey={openDialog.appKey} entities={shown} draftEntities={setup.draftEntities} onClose={() => state.setOpenDialog(null)} />
        : null}
    </div>
  );
}
