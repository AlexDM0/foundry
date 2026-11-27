/**
 * A3bConstitution, the constitution step, as FlowConstitution draws it: the agent's state over the page's title row with Edit or Preview,
 * and the free markdown document in its card, in Edit or in a sandboxed Preview; beside it the pipeline agent's panel with who reads the
 * constitution, the SOURCES the agent drafts from, the chat with its questions as decision cards, Flint drafting and the composer. The
 * footer counts the sections and rules of the draft. In setup it goes Back to research or Continue to pipeline design; editing an applied
 * pipeline's constitution, it goes Back to the flow. In monorepo mode (MonoConstitution) each entity has its own document under the level
 * the route holds, beside the entity rail that marks each entity's state; the forge level lists the entities, and has no document.
 */
import { useId, useState, type ReactNode }                              from 'react';
import type { BoardPipelineEntityDocument, BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  MonoId,
  Row,
  SegmentedControl,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { BoardRoute }                                                                 from '../../../../shared/BoardRouter.ts';
import type { TranscriptFollower }                                                         from '../../../@types/BoardServices.ts';
import { SandboxedHtmlFrame }                                                              from '../../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { type BoardClock, useTickingNow }                                                  from '../../../shared/BoardClock.ts';
import { CommandButton }                                                                   from '../../../shared/commands/CommandButton.tsx';
import { useBoardHrefOf, useBoardNavigation }                                              from '../../../shared/routing/BoardRouteLinks.ts';
import { TimeUtil }                                                                        from '../../../utils/TimeUtil.ts';
import { ViewTitle }                                                                       from '../../ViewTitle.tsx';
import { PipelinePage }                                                                    from '../PipelinePage.tsx';
import { PipelinePanel }                                                                   from '../PipelinePanel.tsx';
import { PipelineViewModel, type PipelineViewFacts }                                       from '../PipelineViewModel.ts';
import { AgentMeter }                                                                      from '../agent-panel/AgentMeter.tsx';
import { AgentSessionModel }                                                               from '../agent-panel/AgentSessionModel.ts';
import { PipelineAgentPanel }                                                              from '../agent-panel/PipelineAgentPanel.tsx';
import { PipelineAgentPanelModel }                                                         from '../agent-panel/PipelineAgentPanelModel.ts';
import { ConstitutionStateTag }                                                            from '../entities/ConstitutionStateTag.tsx';
import { CONSTITUTION_STATE_MEANINGS, ConstitutionStateTagModel, type EntityConstitution } from '../entities/ConstitutionStateTagModel.ts';
import { EntityLevelBreadcrumb }                                                           from '../entities/EntityLevelBreadcrumb.tsx';
import { EntityLevelFactsModel }                                                           from '../entities/EntityLevelFactsModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel }                             from '../entities/PipelineLevelModel.ts';
import { PipelineLevelRail, type PipelineLevelRailMarks }                                  from '../entities/PipelineLevelRail.tsx';
import { BillingStepModel }                                                                from './BillingStepModel.ts';
import { ConstitutionEditor }                                                              from './ConstitutionEditor.tsx';
import { ConstitutionStepModel }                                                           from './ConstitutionStepModel.ts';
import { SourceChoices }                                                                   from './SourceChoices.tsx';

type ConstitutionView = 'edit' | 'preview';

const VIEW_OPTIONS = [{ value: 'edit', label: 'Edit' }, { value: 'preview', label: 'Preview' }] as const;

export interface ConstitutionStepProps {
  readonly facts:            PipelineViewFacts;
  readonly setup:            BoardPipelineSetupDocument;
  readonly followTranscript: TranscriptFollower;
  readonly clock:            BoardClock;
  /** The route the step is on; in monorepo mode it holds the level shown. */
  readonly route:            BoardRoute;
}

/** The step reads only the route's item, so the stored tab never matters. */
/** Who reads the constitution, as pills, and who gets the conflicts and red gates. */
function ReadBy({ setup }: { readonly setup: BoardPipelineSetupDocument }) {
  return (
    <section className="board-pipeline-constitution-readers" aria-label="Read by">
      <Text typeRole="small" subtle element="h4">Read by</Text>
      <ul className="board-pipeline-constitution-reader-list">
        {ConstitutionStepModel.readerLabelsOf(setup.readByRoles).map((label) => (
          <li key={label} className="board-pipeline-constitution-reader">{label}</li>
        ))}
      </ul>
      <Text typeRole="tab" muted element="p">Conflicts and red gates go to the last of them that worked on the code, so no other agent reads it.</Text>
    </section>
  );
}

function SingleConstitutionStep({
  facts, setup, followTranscript, clock
}: ConstitutionStepProps) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const viewLabelId = useId();
  const [view, setView] = useState<ConstitutionView>('edit');
  const { record } = setup;
  const mode = ConstitutionStepModel.stepModeOf(record.mode);
  const agentState = ConstitutionStepModel.agentStateOf(setup, AgentSessionModel.setupSessionStateOf(setup, facts.jobs));
  const now = useTickingNow(clock, false);
  const outlineText = ConstitutionStepModel.outlineTextOf(setup.constitutionOutline);
  const main = (
    <>
      <Row between gap="sixteen">
        <View gap="two">
          <span className="board-pipeline-constitution-status" data-state={agentState}>
            <span className="board-pipeline-constitution-status-dot" data-state={agentState} aria-hidden="true" />
            {ConstitutionStepModel.statusLineOf(agentState)}
          </span>
          <ViewTitle
            title="The constitution"
            lead={(
              <>
                What every builder and reviewer reads first, before its own brief. Edit it here or ask the agent; Apply commits it to main as
                {' '}
                <code>CONSTITUTION.md</code>
                .
              </>
            )}
          />
        </View>
        <span id={viewLabelId} className="board-visually-hidden">Show the constitution as</span>
        <span className="board-pipeline-constitution-view-switch">
          <SegmentedControl labelledBy={viewLabelId} options={VIEW_OPTIONS} selected={view} onSelect={setView} size="standard" />
        </span>
      </Row>
      <article className="board-pipeline-constitution-article" data-view={view} aria-label="Constitution">
        <div className="board-pipeline-constitution-article-head">
          <Text typeRole="small" mono muted>CONSTITUTION.md</Text>
          <Text typeRole="small" subtle>The pill beside a rule names its source</Text>
        </div>
        {view === 'edit'
          ? (
            <ConstitutionEditor
              key={record.setupId}
              setupId={record.setupId}
              version={ConstitutionStepModel.versionOf(record.constitution)}
              annotations={setup.annotations}
              drafting={agentState === 'drafting'}
            />
          )
          : setup.constitutionHtml === null
            ? <Text element="p" muted>The agent has not drafted the constitution yet.</Text>
            : <SandboxedHtmlFrame title="Constitution preview" html={setup.constitutionHtml} placement="constitution" />}
      </article>
    </>
  );
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title="Pipeline agent"
      status={ConstitutionStepModel.panelStatusOf(agentState)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="constitution"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="For example: small commits, one subject line each"
        jobs={facts.jobs}
        beforeChat={(
          <>
            <ReadBy setup={setup} />
            <SourceChoices setup={setup} />
          </>
        )}
        showsAgentStrip
      />
    </PipelinePanel>
  );
  const footer = (
    <ActionBar
      label="Constitution actions"
      start={(
        <>
          <Tag text="Draft" tone="neutral" />
          {outlineText === null ? null : <Text bold>{outlineText}</Text>}
          <Text muted>{ConstitutionStepModel.footerNoteOf(mode)}</Text>
        </>
      )}
      end={mode === 'setup'
        ? (
          <>
            <Button label="Back to research" href={hrefOf(PipelineViewModel.setupStepRouteOf('research'))} />
            <CommandButton
              label="Continue to pipeline design"
              command={ConstitutionStepModel.continueCommandOf(setup)}
              primary
              attention={ConstitutionStepModel.continueHasAttention(setup)}
              onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('design'))}
            />
          </>
        )
        : <Button label="Back to the flow" href={hrefOf({ tab: 'pipeline', item: null })} />}
    />
  );
  return (
    <div className="board-pipeline-constitution" data-mode={mode} data-state={agentState}>
      <PipelinePage main={main} panel={panel} footer={footer} />
    </div>
  );
}

const EVERY_CONSTITUTION_NOTE = 'Every new or changed constitution is committed together when you apply.';

/** The monorepo page's level and the route that holds it, from which the rail and the links move to another level. */
interface LevelShown {
  readonly level: PipelineLevel;
  readonly route: BoardRoute;
}

interface MonorepoStepProps extends ConstitutionStepProps {
  readonly shown: LevelShown;
}

function railMarksOf(constitutions: readonly EntityConstitution<BoardPipelineEntityDocument>[]): PipelineLevelRailMarks {
  return {
    ...ConstitutionStateTagModel.railMarkTextsOf(constitutions),
    markOf: (entityKey) => <ConstitutionStateTag state={ConstitutionStateTagModel.stateInListOf(constitutions, entityKey)} />,
  };
}

/** Who reads one entity's constitution: its own roles only, and what a crossing ticket reads instead. */
function EntityReadBy({ entityKey, entity, setup }: { readonly entityKey: string; readonly entity: BoardPipelineEntityDocument; readonly setup: BoardPipelineSetupDocument }) {
  return (
    <section className="board-pipeline-constitution-readers" aria-label="Read by">
      <Text typeRole="small" subtle element="h4">{`Read by ${entityKey}’s`}</Text>
      <ul className="board-pipeline-constitution-reader-list">
        {ConstitutionStepModel.entityReaderLabelsOf(setup.readByRoles).map((label) => (
          <li key={label} className="board-pipeline-constitution-reader">{label}</li>
        ))}
      </ul>
      <Text typeRole="tab" muted element="p">{ConstitutionStepModel.entityReadersNoteOf(entity)}</Text>
    </section>
  );
}

function StepFooter({ setup, shown, start }: { readonly setup: BoardPipelineSetupDocument; readonly shown: LevelShown; readonly start: ReactNode }) {
  const hrefOf = useBoardHrefOf();
  const navigateTo = useBoardNavigation();
  const mode = ConstitutionStepModel.stepModeOf(setup.record.mode);
  return (
    <ActionBar
      label="Constitution actions"
      start={start}
      end={mode === 'setup'
        ? (
          <>
            <Button label="Back to entities" href={hrefOf(PipelineViewModel.setupStepRouteOf('entities', shown.level))} />
            <CommandButton
              label="Continue to pipeline design"
              command={ConstitutionStepModel.continueCommandOf(setup)}
              primary
              attention={ConstitutionStepModel.continueHasAttention(setup)}
              onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf('design', shown.level))}
            />
          </>
        )
        : <Button label="Back to the flow" href={hrefOf(PipelineLevelModel.routeAtLevel(shown.level, null))} />}
    />
  );
}

/** The forge level: no document of its own, each entity's state with a link to its document, and what each state means. */
interface ForgeLevelConstitutionsProps {
  readonly constitutions: readonly EntityConstitution<BoardPipelineEntityDocument>[];
  readonly hrefOf:        (level: PipelineLevel) => string;
}

function ForgeLevelConstitutions({ constitutions, hrefOf }: ForgeLevelConstitutionsProps) {
  return (
    <>
      <ul className="board-pipeline-constitution-entities" aria-label="Entities">
        {constitutions.map(({ entityKey, entity, state }) => (
          <li key={entityKey} className="board-pipeline-constitution-entity">
            <a className="board-pipeline-constitution-entity-link" href={hrefOf(PipelineLevelModel.entityLevelOf(entityKey))} aria-label={`Open ${entityKey}’s constitution`}>
              <MonoId text={entityKey} tone="strong" weight="medium" />
            </a>
            <Text typeRole="small" muted>{state === 'kept-for-a-person' ? 'no file' : ConstitutionStepModel.entityConstitutionFileOf(entity)}</Text>
            <ConstitutionStateTag state={state} />
          </li>
        ))}
      </ul>
      <dl className="board-pipeline-constitution-legend" aria-label="States">
        {CONSTITUTION_STATE_MEANINGS.map((meaning) => (
          <div key={meaning.state} className="board-pipeline-constitution-legend-item">
            <dt><ConstitutionStateTag state={meaning.state} /></dt>
            <dd><Text typeRole="small" muted>{meaning.meaning}</Text></dd>
          </div>
        ))}
      </dl>
      <Text typeRole="small" muted element="p">None of them blocks Apply.</Text>
    </>
  );
}

function MonorepoConstitutionStep({
  facts, setup, followTranscript, clock, shown
}: MonorepoStepProps) {
  const navigateTo = useBoardNavigation();
  const viewLabelId = useId();
  const [view, setView] = useState<ConstitutionView>('edit');
  const now = useTickingNow(clock, false);
  const { level } = shown;
  const { record } = setup;
  const mode = ConstitutionStepModel.stepModeOf(record.mode);
  const hrefOf = useBoardHrefOf();
  const levelHrefOf = (target: PipelineLevel): string => hrefOf(PipelineLevelModel.routeMovedTo(shown.route, target));
  const constitutions = ConstitutionStateTagModel.entityConstitutionsOf(setup.record, PipelineViewModel.entitiesShownOf(facts));
  const rail = (
    <PipelineLevelRail
      facts={facts}
      level={level}
      onSelect={(target) => navigateTo(PipelineLevelModel.routeMovedTo(shown.route, target))}
      marks={railMarksOf(constitutions)}
    />
  );
  const breadcrumb = <EntityLevelBreadcrumb level={level} forgeLevelHref={levelHrefOf(FORGE_LEVEL)} />;
  const entityKey = level.kind === 'entity' ? level.key : null;
  const shownEntity = constitutions.find((constitution) => constitution.entityKey === entityKey) ?? null;
  const levelFacts = entityKey === null ? facts : EntityLevelFactsModel.factsAtEntityOf(facts, entityKey);
  const levelSetup = entityKey === null ? setup : ConstitutionStepModel.entitySetupOf(levelFacts.pipeline.setup ?? setup, entityKey);
  const agentState = ConstitutionStepModel.agentStateOf(levelSetup, AgentSessionModel.setupSessionStateOf(levelSetup, facts.jobs));
  const panel = (
    <PipelinePanel
      label="Pipeline agent"
      title={PipelineAgentPanelModel.panelTitleOf(level)}
      status={ConstitutionStepModel.panelStatusOf(agentState)}
      headEnd={<AgentMeter meter={BillingStepModel.pipelineAgentMeterOf(record, facts)} />}
    >
      <PipelineAgentPanel
        setup={setup}
        step="constitution"
        followTranscript={followTranscript}
        todayCalendarDate={TimeUtil.calendarDateOf(now.getTime())}
        composerPlaceholder="For example: pages stay server components"
        jobs={facts.jobs}
        levelShown={{ level, hrefOf: levelHrefOf }}
        {...(shownEntity === null || shownEntity.state === 'kept-for-a-person'
          ? {}
          : {
            beforeChat: (
              <>
                <EntityReadBy entityKey={shownEntity.entityKey} entity={shownEntity.entity} setup={levelSetup} />
                <SourceChoices
                  setup={levelSetup}
                  entity={{ key: shownEntity.entityKey, choices: ConstitutionStepModel.entitySourceChoicesOf(shownEntity.entityKey, shownEntity.entity) }}
                />
              </>
            ),
          })}
        showsAgentStrip
      />
    </PipelinePanel>
  );

  if (shownEntity === null) {
    const main = (
      <View gap="sixteen">
        <View gap="two">
          {breadcrumb}
          <ViewTitle
            title={entityKey === null ? 'Constitutions' : `${entityKey}’s constitution`}
            lead={entityKey === null
              ? 'One document per entity: each entity’s builder and reviewers read its own first. The Forge level has no constitution of its own.'
              : `The pipeline has no entity ${entityKey}.`}
          />
        </View>
        {entityKey === null ? <ForgeLevelConstitutions constitutions={constitutions} hrefOf={levelHrefOf} /> : null}
      </View>
    );
    const footer = <StepFooter setup={setup} shown={shown} start={<Text muted>{EVERY_CONSTITUTION_NOTE}</Text>} />;
    return (
      <div className="board-pipeline-constitution" data-mode={mode} data-state={agentState}>
        <PipelinePage main={main} panel={panel} footer={footer} rail={rail} />
      </div>
    );
  }

  const { entity, state } = shownEntity;
  const shownKey = shownEntity.entityKey;
  const fileName = ConstitutionStepModel.entityConstitutionFileOf(entity);
  const draft = levelSetup.record.constitution;
  const keptForAPerson = state === 'kept-for-a-person';
  const version = ConstitutionStepModel.entityEditorVersionOf(state, levelFacts.pipeline.flow ?? null, draft);
  const outlineText = ConstitutionStepModel.outlineTextOf(levelSetup.constitutionOutline);
  const shownView: ConstitutionView = keptForAPerson ? 'edit' : view;
  const editView = version === null
    ? (
      <p className="board-pipeline-constitution-note">
        <Text muted>{ConstitutionStepModel.entityEditNoteOf(state, fileName)}</Text>
      </p>
    )
    : (
      <ConstitutionEditor
        key={`${record.setupId}/${shownKey}`}
        setupId={record.setupId}
        version={version}
        annotations={levelSetup.annotations}
        drafting={agentState === 'drafting'}
        entityKey={shownKey}
      />
    );
  const previewView = levelSetup.constitutionHtml === null
    ? (
      <Text element="p" muted>{ConstitutionStepModel.entityPreviewNoteOf(state, fileName, shownKey)}</Text>
    )
    : <SandboxedHtmlFrame title="Constitution preview" html={levelSetup.constitutionHtml} placement="constitution" />;
  const main = (
    <>
      <Row between gap="sixteen">
        <View gap="two">
          {breadcrumb}
          <span className="board-pipeline-constitution-status" data-state={agentState}>
            <span className="board-pipeline-constitution-status-dot" data-state={agentState} aria-hidden="true" />
            {ConstitutionStepModel.entityStatusLineOf(agentState, shownKey)}
            <ConstitutionStateTag state={state} />
          </span>
          <ViewTitle
            title={`${shownKey}’s constitution`}
            lead={keptForAPerson
              ? `${shownKey} has no constitution of its own.`
              : (
                <>
                  {`One document per entity. ${shownKey}’s builder and reviewers read this one first, before their own brief. Edit it here or ask the agent. It is committed to `}
                  <code>{fileName}</code>
                  {' when you apply.'}
                </>
              )}
          />
        </View>
        {keptForAPerson
          ? null
          : (
            <>
              <span id={viewLabelId} className="board-visually-hidden">Show the constitution as</span>
              <span className="board-pipeline-constitution-view-switch">
                <SegmentedControl labelledBy={viewLabelId} options={VIEW_OPTIONS} selected={view} onSelect={setView} size="standard" />
              </span>
            </>
          )}
      </Row>
      <article className="board-pipeline-constitution-article" data-view={shownView} aria-label="Constitution">
        <div className="board-pipeline-constitution-article-head">
          <Text typeRole="small" mono muted>{keptForAPerson ? 'No file' : fileName}</Text>
          <Text typeRole="small" subtle>{draft === null ? 'The pill beside a rule names its source' : `Revision ${draft.revision} · the pill beside a rule names its source`}</Text>
        </div>
        {shownView === 'edit' ? editView : previewView}
      </article>
    </>
  );
  const footer = (
    <StepFooter
      setup={setup}
      shown={shown}
      start={(
        <>
          {keptForAPerson ? null : <Tag text="Draft" tone="neutral" />}
          <Text bold>{outlineText === null ? shownKey : `${shownKey} · ${outlineText}`}</Text>
          <Text muted>{EVERY_CONSTITUTION_NOTE}</Text>
        </>
      )}
    />
  );
  return (
    <div className="board-pipeline-constitution" data-mode={mode} data-state={agentState}>
      <PipelinePage main={main} panel={panel} footer={footer} rail={rail} />
    </div>
  );
}

/** In monorepo mode the level is the route's, followed as it changes. */
function MonorepoLevelRouter(props: ConstitutionStepProps) {
  const { route } = props;
  const level = PipelineViewModel.levelShownOf(props.facts, route) ?? FORGE_LEVEL;
  // Each level is its own page: its view, its editor and its unsaved text never follow the owner to another level.
  return <MonorepoConstitutionStep key={PipelineLevelModel.itemAtLevel(level, null)} {...props} shown={{ level, route }} />;
}

export function ConstitutionStep(props: ConstitutionStepProps) {
  return PipelineViewModel.monorepoModeOf(props.facts) ? <MonorepoLevelRouter {...props} /> : <SingleConstitutionStep {...props} />;
}
