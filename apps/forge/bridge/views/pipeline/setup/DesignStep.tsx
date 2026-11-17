/**
 * A2Proposal, the design step: the Focus layout of the proposed flow, with the pipeline agent's panel in its right column, whose tabs are
 * the Conversation (the agent's chat with the design questions as decision cards, Flint's strip and the composer) and the change list.
 * The agent's newest change shows under its chat with a link that opens the step's phase and selects it, and its Undo. The footer says
 * that nothing is stored before Apply, counts the proposed steps and gates, and offers Discard proposal and Apply pipeline, which waits
 * while a question is open and opens the apply dialog, also on its own while an Apply is pending. Until the agent proposes a draft, a
 * line over the phases says that it is designing.
 * In monorepo mode (MonoDesignEntity, MonoDesignForge) the page is one level's, which the route holds: the entity rail stands left and the
 * level's breadcrumb over the title. At an entity, its three phases, gates, dialogs, chat and changes are its own, and its settings can be
 * copied to other entities; at the forge, the forge's page stands in place of the phases. A press on the rail keeps the screen and moves
 * to that level, and a question in any level holds Apply.
 */

import { ActionBar }  from 'design-system/ActionBar';
import { Button }     from 'design-system/Button';
import { CountBadge } from 'design-system/CountBadge';
import { Tabs }       from 'design-system/Tabs';
import { Tag }        from 'design-system/Tag';
import { Text }       from 'design-system/Text';
import { TextButton } from 'design-system/TextButton';
import { useState }   from 'react';

import type { EntityKey }                                      from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }                             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { TranscriptFollower }                             from '../../../conversation/TranscriptLog.tsx';
import { useTickingNow, type BridgeClock }                     from '../../../shell/BridgeClock.ts';
import { CommandButton }                                       from '../../../shell/CommandButton.tsx';
import { HashRouter, type BridgeRoute }                        from '../../../shell/HashRouter.ts';
import { TimeUtil }                                            from '../../../utils/TimeUtil.ts';
import { FlowWorkspace }                                       from '../FlowWorkspace.tsx';
import { PipelinePanel, PipelinePanelBody }                    from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts }           from '../PipelineViewModel.ts';
import { AgentMeter }                                          from '../agent-panel/AgentMeter.tsx';
import { PipelineAgentPanel }                                  from '../agent-panel/PipelineAgentPanel.tsx';
import { PipelineAgentPanelModel }                             from '../agent-panel/PipelineAgentPanelModel.ts';
import { ApplyDialog }                                         from '../apply/ApplyDialog.tsx';
import { ChangeList }                                          from '../apply/ChangeList.tsx';
import { ChangeListModel }                                     from '../apply/ChangeListModel.ts';
import { CopyBetweenEntitiesDialog }                           from '../editing/CopyBetweenEntitiesDialog.tsx';
import { ChangeGroup }                                         from '../entities/ChangeGroup.tsx';
import { ChangeGroupModel }                                    from '../entities/ChangeGroupModel.ts';
import { EntityLevelBreadcrumb }                               from '../entities/EntityLevelBreadcrumb.tsx';
import { EntityLevelFactsModel }                               from '../entities/EntityLevelFactsModel.ts';
import { EntityRail }                                          from '../entities/EntityRail.tsx';
import { ForgeLevelPage }                                      from '../entities/ForgeLevelPage.tsx';
import { ForgeLevelPageModel }                                 from '../entities/ForgeLevelPageModel.ts';
import { MonorepoLevelContext, type MonorepoLevelScope }       from '../entities/MonorepoLevelContext.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';
import { FlowGlyph }                                           from '../flow/FlowGlyph.tsx';
import { useFlowSelection, type FlowSelection }                from '../flow/FlowSelection.ts';
import { BillingStepModel }                                    from './BillingStepModel.ts';
import { DesignStepModel }                                     from './DesignStepModel.ts';

type PanelTab = 'conversation' | 'changes';

export interface DesignStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            PipelineSetupFacts;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BridgeClock;
  /** Called with the board's resume choice once the Overseer took the Apply. */
  readonly onApplySent?:     (resumesBoard: boolean) => void;
  /** The route the step is on; in monorepo mode it holds the level shown. */
  readonly route?:           BridgeRoute;
}

interface NewestAgentChangeProps {
  readonly facts:     PipelineViewFacts;
  readonly setup:     PipelineSetupFacts;
  readonly selection: FlowSelection;
  /** The monorepo level shown, whose facts `facts` are; null in single mode. */
  readonly level:     PipelineLevel | null;
}

/** The change the agent's last reply names, with its links: show the step on the flow, and undo the change. */
function NewestAgentChange({
  facts, setup, selection, level
}: NewestAgentChangeProps) {
  const { edits } = setup.record;
  const edit = level === null ? DesignStepModel.newestAgentEditOf(edits) : DesignStepModel.newestAgentEditAtLevelOf(edits, level);
  const flow = facts.pipelineFlow ?? null;
  if (edit === null) return null;
  const target = flow === null ? null : DesignStepModel.flowTargetAtLevelOf(edit.field, flow, level);
  const wordedField = EntityLevelFactsModel.fieldAsASinglePipelineNamesIt(edit.field);
  return (
    <section className="bridge-pipeline-design-latest-change" aria-label="The agent's newest change">
      <p className="bridge-pipeline-design-latest-change-text">{edit.summary}</p>
      <span className="bridge-pipeline-design-latest-change-links">
        {target === null ? null : <TextButton label={DesignStepModel.showLinkTextOf(wordedField)} onPress={() => selection.showOnFlow(target)} />}
        <CommandButton
          label="Undo this change"
          accessibleName={`Undo the change to ${ChangeListModel.fieldWordsOf(wordedField).title}`}
          command={ChangeListModel.undoCommandOf(setup.record.setupId, edit.editId)}
        />
      </span>
    </section>
  );
}

/** The level a monorepo page shows, and the route that holds it, from which the rail and the links move to another level. */
interface LevelShown {
  readonly level: PipelineLevel;
  readonly route: BridgeRoute;
}

/** The Changes tab at a level: that level's group, a copy's edits as one set; nothing undoes a set at once yet, so its Undo waits. */
function LevelChanges({ setup, facts, level }: { readonly setup: PipelineSetupFacts; readonly facts: PipelineViewFacts; readonly level: PipelineLevel }) {
  const groups = ChangeGroupModel.groupsOf(facts.pipelineFlow?.changeList ?? [], setup.record.edits, Object.keys(setup.record.draft?.entities ?? {}));
  const group = groups.find((candidate) => PipelineLevelModel.levelsAreEqual(candidate.level, level)) ?? null;
  if (group === null) return <p className="bridge-pipeline-design-level-no-change">No changes at this level yet.</p>;
  return <ChangeGroup setupId={setup.record.setupId} group={group} batchUndoCommandOf={() => null} />;
}

function levelChangeCountOf(facts: PipelineViewFacts, level: PipelineLevel): number {
  const changeList = facts.pipelineFlow?.changeList ?? [];
  return changeList.filter((change) => PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(change.field), level)).length;
}

function levelFooterSummaryOf(setup: PipelineSetupFacts, level: PipelineLevel): string {
  if (PipelineLevelModel.isForgeLevel(level)) return ForgeLevelPageModel.footerSummaryOf(setup.record.draft);
  const entityFacts = setup.entities ?? {};
  const summary = Object.hasOwn(entityFacts, level.key) ? entityFacts[level.key]?.summary : undefined;
  return summary === undefined ? level.key : `${level.key}: ${DesignStepModel.footerSummaryOf(summary)}`;
}

function scopeOf(level: PipelineLevel, route: BridgeRoute, setup: PipelineSetupFacts): MonorepoLevelScope {
  return { level, forgeLevelHref: HashRouter.fragmentOf(PipelineLevelModel.routeMovedTo(route, FORGE_LEVEL)), wholeDraft: setup.record.draft };
}

interface DesignPageProps extends DesignStepProps {
  readonly shown: LevelShown | null;
}

function DesignPage({
  facts, setup, followTranscript, clock, onApplySent, shown
}: DesignPageProps) {
  const selection = useFlowSelection(setup.applyState === null ? null : setup.record.setupId);
  const [panelTab, setPanelTab] = useState<PanelTab>('conversation');
  const [copyIsOpen, setCopyIsOpen] = useState(false);
  const applyIsAsked = selection.applyIsAskedFor(setup.record.setupId);
  const { record } = setup;
  const now = useTickingNow(clock, false);
  const level = shown?.level ?? null;
  const entityKey: EntityKey | null = level?.kind === 'entity' ? level.key : null;
  const levelFacts = entityKey === null ? facts : EntityLevelFactsModel.factsAtEntityOf(facts, entityKey);
  const levelSetup = levelFacts.pipelineSetup ?? setup;
  const changeCount = level === null ? facts.pipelineFlow?.changeList.length ?? 0 : levelChangeCountOf(facts, level);
  const apply = DesignStepModel.applyAvailabilityOf(level === null ? setup.openQuestionCount : DesignStepModel.openQuestionCountOfEveryLevel(setup));
  const words = level === null ? PipelineViewModel.flowPageWordsOf('proposal', facts.pipelineFlow ?? null, null) : DesignStepModel.levelPageWordsOf(level);
  const hrefOf = (target: PipelineLevel): string => (shown === null ? '' : HashRouter.fragmentOf(PipelineLevelModel.routeMovedTo(shown.route, target)));
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title={PipelineAgentPanelModel.panelTitleOf(level)}
      status={DesignStepModel.panelStatusOf(levelSetup)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
      tabs={(
        <Tabs
          label="Pipeline agent and changes"
          mode="switch"
          size="section"
          selectedKey={panelTab}
          onSelect={setPanelTab}
          items={[
            { key: 'conversation', label: 'Conversation' },
            {
              key:            'changes',
              label:          'Changes',
              countBadge:     <CountBadge count={changeCount} tone="neutral" />,
              accessibleName: DesignStepModel.changesTabNameOf(changeCount),
            },
          ]}
        />
      )}
      tabPanelLabel={panelTab === 'conversation' ? 'Chat with the pipeline agent' : 'Changes'}
    >
      {panelTab === 'conversation'
        ? (
          <PipelineAgentPanel
            setup={setup}
            step="design"
            followTranscript={followTranscript}
            todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
            composerPlaceholder="Ask for a change, or ask why"
            afterChat={<NewestAgentChange facts={levelFacts} setup={setup} selection={selection} level={level} />}
            showsAgentStrip
            levelShown={level === null ? null : { level, hrefOf }}
          />
        )
        : (
          <PipelinePanelBody>
            {level === null
              ? <ChangeList setupId={record.setupId} changeList={facts.pipelineFlow?.changeList ?? []} edits={record.edits} />
              : <LevelChanges setup={setup} facts={facts} level={level} />}
          </PipelinePanelBody>
        )}
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Pipeline design actions"
      start={(
        <>
          <Tag text="Proposal" tone="neutral" />
          <Text bold>Nothing is stored until you apply.</Text>
          <Text muted>{level === null ? DesignStepModel.footerSummaryOf(setup.summary) : levelFooterSummaryOf(setup, level)}</Text>
        </>
      )}
      end={(
        <>
          <span className="bridge-pipeline-design-hint" data-tone={apply.hint.tone} role="status">
            {apply.hint.tone === 'question-open'
              ? <span className="bridge-pipeline-design-hint-dot" aria-hidden="true" />
              : <FlowGlyph glyph="check" />}
            {apply.hint.text}
          </span>
          <CommandButton label="Discard proposal" command={DesignStepModel.discardCommandOf(record.setupId)} />
          <span className="bridge-pipeline-design-apply" title={apply.disabledReason ?? undefined}>
            <Button
              label="Apply pipeline"
              emphasis="primary"
              attention={apply.enabled}
              disabled={!apply.enabled}
              expanded={applyIsAsked}
              onPress={() => selection.askApply(setup.record.setupId)}
            />
          </span>
        </>
      )}
    />
  );
  const designingNotice = record.draft === null ? <div role="status"><Text element="p" muted>The pipeline agent is designing…</Text></div> : null;
  const copyNotice = entityKey === null || record.draft === null
    ? null
    : (
      <span className="bridge-pipeline-design-copy">
        <TextButton label="Copy settings to another entity" onPress={() => setCopyIsOpen(true)} />
      </span>
    );
  const workspace = (
    <FlowWorkspace
      facts={levelFacts}
      selection={selection}
      title={words.title}
      lead={words.lead}
      notice={designingNotice ?? copyNotice}
      aside={panel}
      footer={footer}
      {...(shown === null
        ? {}
        : {
          rail:       <EntityRail facts={facts} level={shown.level} onSelect={(target) => HashRouter.navigateTo(PipelineLevelModel.routeMovedTo(shown.route, target))} />,
          breadcrumb: <EntityLevelBreadcrumb level={shown.level} forgeLevelHref={hrefOf(FORGE_LEVEL)} />,
          levelPage:  PipelineLevelModel.isForgeLevel(shown.level)
            ? <ForgeLevelPage facts={facts} selection={selection} entityHrefOf={(key) => hrefOf(PipelineLevelModel.entityLevelOf(key))} />
            : null,
        })}
    />
  );
  return (
    <div className="bridge-pipeline-design" data-state={DesignStepModel.agentStateOf(levelSetup)}>
      {shown === null
        ? workspace
        : <MonorepoLevelContext.Provider value={scopeOf(shown.level, shown.route, setup)}>{workspace}</MonorepoLevelContext.Provider>}
      {applyIsAsked
        ? (
          <ApplyDialog
            setup={setup}
            pendingTicketCount={BillingStepModel.pendingTicketCountOf(facts.page?.tickets ?? [])}
            concurrencyLimit={facts.concurrency?.limit ?? null}
            onClose={selection.closeApply}
            {...(onApplySent === undefined ? {} : { onApplySent })}
          />
        )
        : null}
      {copyIsOpen && entityKey !== null && record.draft !== null
        ? (
          <CopyBetweenEntitiesDialog
            wholeDraft={record.draft}
            fromEntityKey={entityKey}
            target={{ setupId: record.setupId, draftRevision: record.draftRevision }}
            onClose={() => setCopyIsOpen(false)}
          />
        )
        : null}
    </div>
  );
}

export function DesignStep(props: DesignStepProps) {
  const level = props.route === undefined ? null : PipelineViewModel.levelShownOf(props.facts, props.route);
  if (level === null || props.route === undefined) return <DesignPage {...props} shown={null} />;
  // Each level is its own page: an open phase, dialog or tab never follows the owner to another level.
  return <DesignPage key={PipelineLevelModel.itemAtLevel(level, null)} {...props} shown={{ level, route: props.route }} />;
}
