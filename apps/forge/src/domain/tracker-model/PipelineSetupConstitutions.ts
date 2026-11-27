/** The setup record's constitution drafts, of the forge or of one entity: the agent's whole document with its sources, and User's edits. */
import type { PipelineSetupChanged } from './@types/BoardChanges.ts';
import type { LogRecord }            from './@types/LogRecord.ts';
import type { EntityKey }            from './@types/Pipeline.ts';
import type {
  ConstitutionDraft,
  ConstitutionEdit,
  ConstitutionSetting,
  ConstitutionSources,
  SetupEditAuthor,
  SourceAnnotationKind
} from './@types/PipelineSetup.ts';
import type { BoardRecords }                                           from './BoardRecords.ts';
import { BoardRefusal }                                                from './BoardRefusal.ts';
import type { PipelineSetupRecord }                                    from './PipelineSetupRecord.ts';
import { CONSTITUTION_LIMIT_CHARACTERS, DEFAULT_CONSTITUTION_SOURCES } from './constants/PipelineSetupVocabulary.ts';
import { PipelineSetupUtil }                                           from './utils/PipelineSetupUtil.ts';

/** The SOURCES tick that selects each kind of source a constitution line may name. */
const SOURCE_TICK_OF_KIND: Readonly<Record<SourceAnnotationKind, keyof ConstitutionSources>> = {
  'contributing':      'contributing',
  'research':          'research',
  'installed-default': 'installedDefault',
};

export class PipelineSetupConstitutions {
  constructor(
    private readonly records: BoardRecords,
    private readonly setupRecord: PipelineSetupRecord,
  ) {}

  /**
   * The agent's whole document and its sources, of the forge or, with an entity key, of that entity; a source must name a line the text
   * holds, once, of a kind the SOURCES ticks select.
   */
  setConstitution(setupId: string, setting: ConstitutionSetting, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup = this.setupRecord.requireMovableSetup(setupId);
    if (setting.markdown.trim() === '') throw new BoardRefusal({ reason: 'constitution-empty' });
    this.refuseOverlongConstitution(setting.markdown);
    const holder = entityKey === undefined ? setup : this.setupRecord.entityPartOf(setup, entityKey);
    const ticks = holder.constitution?.draftedFrom ?? DEFAULT_CONSTITUTION_SOURCES;
    const anchoredLines = new Set<string>();
    for (const annotation of setting.annotations) {
      const { lineText, occurrence, kind } = annotation;
      if (!ticks[SOURCE_TICK_OF_KIND[kind]]) throw new BoardRefusal({
        reason: 'constitution-source-not-ticked', lineText, occurrence, kind
      });
      const occurs = !/[\r\n]/u.test(lineText) && Number.isInteger(occurrence) && occurrence >= 1 && PipelineSetupUtil.occurrencesOf(setting.markdown, lineText) >= occurrence;
      if (!occurs) throw new BoardRefusal({ reason: 'constitution-source-unanchored', lineText, occurrence });
      const lineKey = JSON.stringify([lineText, occurrence]);
      if (anchoredLines.has(lineKey)) throw new BoardRefusal({ reason: 'constitution-source-repeated', lineText, occurrence });
      anchoredLines.add(lineKey);
    }

    const previous = holder.constitution;
    holder.constitution = {
      markdown:    setting.markdown,
      annotations: setting.annotations.map((annotation) => ({ ...annotation })),
      draftedFrom: previous === null ? { ...DEFAULT_CONSTITUTION_SOURCES } : previous.draftedFrom,
      baseBlob:    previous?.baseBlob ?? null,
      revision:    (previous?.revision ?? 0) + 1,
    };
    this.setupRecord.store(setup);
    return { logged: [this.constitutionSetRecord(setup.setupId, 'agent', holder.constitution, at)], setup };
  }

  /**
   * User's markdown or SOURCES ticks, of the forge or, with an entity key, of that entity, at the revision User saw; the sources re-anchor,
   * so an edited line loses its tag.
   */
  editConstitution(setupId: string, edit: ConstitutionEdit, at: string, entityKey?: EntityKey): PipelineSetupChanged {
    const setup   = this.setupRecord.requireMovableSetup(setupId);
    const holder  = entityKey === undefined ? setup : this.setupRecord.entityPartOf(setup, entityKey);
    const current = holder.constitution ?? {
      markdown: '', annotations: [], draftedFrom: { ...DEFAULT_CONSTITUTION_SOURCES }, baseBlob: null, revision: 0
    };
    if (edit.revision !== current.revision) {
      throw new BoardRefusal({
        reason: 'constitution-draft-stale', setupId, revision: edit.revision, currentRevision: current.revision
      });
    }
    const markdown = edit.markdown ?? current.markdown;
    this.refuseOverlongConstitution(markdown);

    const reopened = this.setupRecord.userEditReopenRecords(setup, 'constitution', at);
    holder.constitution = {
      markdown,
      annotations: PipelineSetupUtil.reanchoredAnnotationsOf(markdown, current.annotations),
      draftedFrom: { ...(edit.draftedFrom ?? current.draftedFrom) },
      baseBlob:    current.baseBlob,
      revision:    current.revision + 1,
    };
    this.setupRecord.store(setup);
    return { logged: [...reopened, this.constitutionSetRecord(setupId, 'user', holder.constitution, at)], setup };
  }

  private constitutionSetRecord(setupId: string, by: SetupEditAuthor, constitution: ConstitutionDraft, at: string): LogRecord {
    return this.records.logger.log({ kind: 'pipeline-constitution-set', setupId, fields: { by, revision: constitution.revision } }, at);
  }

  private refuseOverlongConstitution(markdown: string): void {
    if (markdown.length > CONSTITUTION_LIMIT_CHARACTERS) {
      throw new BoardRefusal({ reason: 'constitution-too-long', characterCount: markdown.length, limit: CONSTITUTION_LIMIT_CHARACTERS });
    }
  }
}
