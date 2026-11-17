/**
 * What a forge answers at `GET /api/versions`, unversioned and never removed: its own system version and the oldest forge version a
 * client may have been built for and still be served. Forge alone decides that minimum, whoever calls it.
 */
import type { VersionsDocument } from 'system-versions/VersionsDocument';

/**
 * Forge 1.0 is the first forge that serves `/api/versions` and the versioned paths; 1.1 adds Flint's brain to the monitor and the commands; 1.2 adds a
 * ticket's and a filing draft's entity and crosses, the entities setup step, the layout finding and a setup record's entity parts; 1.3 adds the
 * ticket-entity command, a ticket's entity at ticket-add, the entity-assigned record, the entity refusals, a draft's entity fields and a setup edit's
 * batch, and the board's entity flows, profile runs and cache marks by entity; 1.4 adds a job-launched record's entity and stage; 1.5 adds a progress
 * row's entity hashes, the entity of a level on the pipeline agent's, update, constitution-edit and gate-profile commands, the setup-entity-unknown
 * refusal, an entity's agent session and check on a setup record, and a draft edit's copy flag; 1.6 adds the need-declare command, a progress
 * file's needs, the need refusals, the needs-declared job outcome, the need decision kinds and the need-declared record; 1.7 adds the
 * changed-only-outside-home-and-reach refusal and job-ended cause and the pipeline-set-per-entity refusal; 1.8 adds the whitelist-not-supported
 * refusal, a pipeline with entities in the Overseer's documents and the board, and the changed-outside-home-and-reach job-ended cause; 1.9 adds a
 * progress row's stage, seals, package returns and stage counters, the entity-named-by-tickets and entities-while-tickets-in-flight refusals and
 * apply reasons, the entity on the constitution-moved refusal, the entities to assign on the job-launched record and the board's entity
 * assignment; 1.10 adds a stage on a review bar's progress row, the whole-batch flag on the pipeline-draft-undo command and the
 * draft-batch-undone setup message; 1.11 adds the sealed-change-altered refusal and job-ended cause, the package builder's and package
 * reviewer's reports and a package stage job's stage statement; 1.12 adds the package-gate-red and home-gate-red job-ended causes, the
 * parked:second-return hold, a merge agent's entity and stage on the job-launched record, the refused job outcome, the package-refused,
 * second-return and dependent-broken decision kinds, the stage-started, seal-set, seal-lifted and package-return records and a crossing
 * ticket's Handoff parts per stage. Each minor only adds.
 * Version 0.0 stands for every forge released before system versions: a client built for one calls the unversioned paths, which forge keeps until the
 * minimum is raised past it (`ForgeCompatibilityRegistry.ts`). The current version is raised with every change to a route, a document, a command or a
 * message, in its minor when the change only adds; the minimum only to retire what the registry keeps.
 */
export const FORGE_SYSTEM_VERSIONS: VersionsDocument = {
  current:          { major: 1, minor: 12 },
  minimumSupported: { major: 0, minor: 0 },
};
