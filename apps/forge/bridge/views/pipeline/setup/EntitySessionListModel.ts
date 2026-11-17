/**
 * The research sessions of a forge over entities, pure: the forge's own session first, then one row per entity in the groups Apps,
 * Packages and Root, each with its state, its findings and open research questions, and the command that stops it. An entity's session
 * is its part of the setup record; it has no session until the Overseer starts one. Only the forge's session can say that its research is
 * done, so an entity's live session reads as researching. No setting limits how many sessions run at once: each starts as its entity is
 * confirmed. Stop all sends a stop for every live session; a stopped session keeps what it found.
 */
import type { JobState }                                       from '../../../../src/lib/tracker-model/@types/Job.ts';
import type { EntityKey, PipelineEntity, PipelineEntityKind }  from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }                             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { ResearchFinding, SetupQuestion }                 from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                             from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }                                 from '../../../conversation/ChatTurnWordingUtil.ts';
import type { PanelStatus }                                    from '../PipelinePanel.tsx';
import { PipelineAgentPanelModel }                             from '../agent-panel/PipelineAgentPanelModel.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel } from '../entities/PipelineLevelModel.ts';

export type ResearchSessionState = 'not-started' | 'researching' | 'research-done' | 'stopping' | 'stopped';

/** The facts the list reads: the setup record with each entity's part and job state, and the entities the draft or the pipeline holds. */
export interface EntitySessionFacts {
  readonly setup:         Pick<PipelineSetupFacts, 'record' | 'agentJobState' | 'entities'>;
  readonly shownEntities: Readonly<Record<EntityKey, Pick<PipelineEntity, 'kind' | 'home'>>>;
}

export interface EntitySessionRowView {
  readonly level:             PipelineLevel;
  /** The forge's name, or the entity's key, set in mono. */
  readonly name:              string;
  readonly kindText:          string;
  /** The group this row opens, shown over it; `null` on the forge row and on every row after a group's first. */
  readonly groupLabel:        string | null;
  readonly state:             ResearchSessionState;
  readonly stateText:         string;
  readonly openQuestionCount: number;
  readonly findingCount:      number;
  readonly selected:          boolean;
  /** `null` while the session has no live job to stop. */
  readonly stopCommand:       ControlCommandBody | null;
  /** "Stop web's session", the stop button's name. */
  readonly stopName:          string;
  /** The row's whole sentence for a screen reader: its name, kind, state and counts. */
  readonly accessibleName:    string;
}

/** The session a level shows beside the list: its findings and what it reads. */
export interface SelectedSessionView {
  readonly level:     PipelineLevel;
  readonly name:      string;
  /** "Only what is in apps/web.", or what the forge's session reads. */
  readonly scopeText: string;
  readonly state:     ResearchSessionState;
  readonly findings:  readonly ResearchFinding[];
  /** What stands in for the findings before the first; `null` once the session found something, or while it researches (grey lines). */
  readonly emptyText: string | null;
}

type EntityGroup = PipelineEntityKind | 'unknown';

const GROUP_ORDER: readonly EntityGroup[] = ['app', 'package', 'root', 'unknown'];

const GROUP_LABELS: Readonly<Record<EntityGroup, string>> = Object.freeze({
  app: 'Apps', package: 'Packages', root: 'Root', unknown: 'Entities'
});

const KIND_TEXTS: Readonly<Record<EntityGroup, string>> = Object.freeze({
  app: 'app', package: 'package', root: 'every other path', unknown: 'entity'
});

const FORGE_KIND_TEXT = 'Shared by every entity';

const STATE_TEXTS: Readonly<Record<ResearchSessionState, string>> = Object.freeze({
  'not-started':   'Not started',
  'researching':   'Researching',
  'research-done': 'Research done',
  'stopping':      'Stopping',
  'stopped':       'Stopped',
});

/** The footer counts the entities' sessions in this order. */
const COUNTED_STATES: readonly ResearchSessionState[] = ['researching', 'research-done', 'stopping', 'stopped', 'not-started'];

const FORGE_SCOPE_TEXT = 'What every entity shares, kept apart from each entity\'s own findings.';

const ROOT_FOLDER = '/';

const EMPTY_TEXTS: Readonly<Record<ResearchSessionState, string | null>> = Object.freeze({
  'not-started':   'No session has started for it yet.',
  'researching':   null,
  'research-done': 'The research found nothing here.',
  'stopping':      'Stopping before it found anything.',
  'stopped':       'Stopped before it found anything. You can still set up this entity by hand in the next steps.',
});

/** Every entity with a session or a place in the draft: the draft's order first, then the parts the draft does not hold. */
function entityKeysOf(facts: EntitySessionFacts): EntityKey[] {
  const shownKeys = Object.keys(facts.shownEntities);
  const partKeys = Object.keys(facts.setup.record.entities ?? {}).filter((key) => !shownKeys.includes(key));
  return [...shownKeys, ...partKeys];
}

function groupOf(entityKey: EntityKey, facts: EntitySessionFacts): EntityGroup {
  return Object.hasOwn(facts.shownEntities, entityKey) ? facts.shownEntities[entityKey]?.kind ?? 'unknown' : 'unknown';
}

function sessionStateOf(agentJobId: string | null, agentJobState: JobState | null, researchIsDone: boolean): ResearchSessionState {
  if (agentJobId === null) return 'not-started';
  if (agentJobState === null) return 'stopped';
  if (agentJobState === 'stopping') return 'stopping';
  return researchIsDone ? 'research-done' : 'researching';
}

function stateOfLevel(facts: EntitySessionFacts, level: PipelineLevel): ResearchSessionState {
  const session = PipelineAgentPanelModel.levelSessionOf(facts.setup, level);
  const researchIsDone = PipelineLevelModel.isForgeLevel(level) && facts.setup.record.readyToContinue.includes('research');
  return sessionStateOf(session.agentJobId, session.agentJobState, researchIsDone);
}

function openResearchQuestionCountOf(questions: readonly SetupQuestion[]): number {
  return questions.filter((question) => question.step === 'research' && question.answer === null).length;
}

/** The findings a session's cards and scripts show: the layout is the forge's report of the entities, shown on its own. */
function researchFindingsOf(findings: readonly ResearchFinding[]): ResearchFinding[] {
  return findings.filter((finding) => finding.topic !== 'layout');
}

function stopCommandOf(agentJobId: string | null, state: ResearchSessionState): ControlCommandBody | null {
  if (agentJobId === null || (state !== 'researching' && state !== 'research-done')) return null;
  return { kind: 'job-stop', jobId: agentJobId, mode: 'stop' };
}

function accessibleNameOf(row: Omit<EntitySessionRowView, 'accessibleName'>): string {
  const parts = [row.name, row.kindText, row.stateText];
  if (row.findingCount > 0) parts.push(ChatTurnWordingUtil.countTextOf(row.findingCount, 'finding', 'findings'));
  if (row.openQuestionCount > 0) parts.push(ChatTurnWordingUtil.countTextOf(row.openQuestionCount, 'open question', 'open questions'));
  return parts.join(', ');
}

function rowOf(
  facts: EntitySessionFacts, level: PipelineLevel, selectedLevel: PipelineLevel, kindText: string, groupLabel: string | null
): EntitySessionRowView {
  const session = PipelineAgentPanelModel.levelSessionOf(facts.setup, level);
  const state = stateOfLevel(facts, level);
  const name = PipelineLevelModel.levelNameOf(level);
  const row = {
    level,
    name,
    kindText,
    groupLabel,
    state,
    stateText:         STATE_TEXTS[state],
    openQuestionCount: openResearchQuestionCountOf(session.questions),
    findingCount:      researchFindingsOf(session.findings).length,
    selected:          PipelineLevelModel.levelsAreEqual(level, selectedLevel),
    stopCommand:       stopCommandOf(session.agentJobId, state),
    stopName:          `Stop ${name}'s session`,
  };
  return { ...row, accessibleName: accessibleNameOf(row) };
}

/** The forge's session first, then each entity's by group, the group's label over its first row. */
function rowsOf(facts: EntitySessionFacts, selectedLevel: PipelineLevel): EntitySessionRowView[] {
  const entityKeys = entityKeysOf(facts);
  const entityRows = GROUP_ORDER.flatMap((group) => entityKeys
    .filter((entityKey) => groupOf(entityKey, facts) === group)
    .map((entityKey, index) => rowOf(
      facts, PipelineLevelModel.entityLevelOf(entityKey), selectedLevel, KIND_TEXTS[group], index === 0 ? GROUP_LABELS[group] : null
    )));
  return [rowOf(facts, FORGE_LEVEL, selectedLevel, FORGE_KIND_TEXT, null), ...entityRows];
}

/** "Forge and 2 entities": the forge's own session and the entities'. */
function countTextOf(rows: readonly EntitySessionRowView[]): string {
  const entityCount = rows.length - 1;
  return `${PipelineLevelModel.levelNameOf(FORGE_LEVEL)} and ${ChatTurnWordingUtil.countTextOf(entityCount, 'entity', 'entities')}`;
}

/** A stop for each session that runs, the forge's first; empty while none runs. */
function stopEveryCommandsOf(rows: readonly EntitySessionRowView[]): ControlCommandBody[] {
  return rows.flatMap((row) => (row.stopCommand === null ? [] : [row.stopCommand]));
}

/** "2 researching · 1 stopped · 1 open question": the entities' sessions by state, then the research questions open at every level. */
function footerCountsOf(rows: readonly EntitySessionRowView[]): string {
  const entityRows = rows.filter((row) => !PipelineLevelModel.isForgeLevel(row.level));
  const stateCounts = COUNTED_STATES.flatMap((state) => {
    const count = entityRows.filter((row) => row.state === state).length;
    return count === 0 ? [] : [`${count} ${STATE_TEXTS[state].toLowerCase()}`];
  });
  const openQuestionCount = rows.reduce((sum, row) => sum + row.openQuestionCount, 0);
  const questions = openQuestionCount === 0 ? [] : [ChatTurnWordingUtil.countTextOf(openQuestionCount, 'open question', 'open questions')];
  return [...stateCounts, ...questions].join(' · ');
}

function folderNameOf(home: string): string {
  return home.startsWith(ROOT_FOLDER) ? home.slice(ROOT_FOLDER.length) : home;
}

function scopeTextOf(facts: EntitySessionFacts, level: PipelineLevel): string {
  if (PipelineLevelModel.isForgeLevel(level)) return FORGE_SCOPE_TEXT;
  const entity = Object.hasOwn(facts.shownEntities, level.key) ? facts.shownEntities[level.key] : undefined;
  if (entity === undefined) return `Only what ${level.key} owns.`;
  if (entity.kind === 'root') return 'Only the paths that no other entity owns.';
  return `Only what is in ${entity.home.map(folderNameOf).join(', ')}.`;
}

function selectedSessionOf(facts: EntitySessionFacts, level: PipelineLevel): SelectedSessionView {
  const findings = researchFindingsOf(PipelineAgentPanelModel.levelSessionOf(facts.setup, level).findings);
  const state = stateOfLevel(facts, level);
  return {
    level,
    name:      PipelineLevelModel.levelNameOf(level),
    scopeText: scopeTextOf(facts, level),
    state,
    findings,
    emptyText: findings.length === 0 ? EMPTY_TEXTS[state] : null,
  };
}

/** The level whose session shows: the route's, while the list holds it; else the forge's. */
function shownLevelOf(facts: EntitySessionFacts, routedLevel: PipelineLevel | null): PipelineLevel {
  if (routedLevel === null || PipelineLevelModel.isForgeLevel(routedLevel)) return FORGE_LEVEL;
  return entityKeysOf(facts).includes(routedLevel.key) ? routedLevel : FORGE_LEVEL;
}

const PANEL_STATUSES: Readonly<Record<ResearchSessionState, PanelStatus>> = Object.freeze({
  'not-started':   { tone: 'idle', text: STATE_TEXTS['not-started'] },
  'researching':   { tone: 'working', text: STATE_TEXTS.researching },
  'research-done': { tone: 'ready', text: STATE_TEXTS['research-done'] },
  'stopping':      { tone: 'idle', text: STATE_TEXTS.stopping },
  'stopped':       { tone: 'idle', text: STATE_TEXTS.stopped },
});

/** The panel head's dot and word, and the footer's pill, for the session shown. */
function panelStatusOf(state: ResearchSessionState): PanelStatus {
  return PANEL_STATUSES[state];
}

/** The list shows once some entity has a part of the record: before that, the forge's session is the only one. */
function hasEntitySessions(facts: Pick<EntitySessionFacts, 'setup'>): boolean {
  return Object.keys(facts.setup.record.entities ?? {}).length > 0;
}

export const EntitySessionListModel = Object.freeze({
  rowsOf,
  countTextOf,
  stopEveryCommandsOf,
  footerCountsOf,
  selectedSessionOf,
  shownLevelOf,
  panelStatusOf,
  hasEntitySessions,
});
