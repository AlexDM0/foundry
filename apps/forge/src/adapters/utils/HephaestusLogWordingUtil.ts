/**
 * The words of Hephaestus's log records, the sentence standard error shows and `hephaestus.log` keeps as `details`, and the stored line itself.
 * `FrozenHephaestusLogDetails.json` holds the sentence of each kind as the code before the records wrote it.
 */
import { basename }        from 'node:path';
import type {
  HephaestusLogRecord,
  StaleAgentSlotReason,
  StaleGateRunSlotReason,
  StaleHoldingReason,
  UnstartableGuardReason
} from '../@types/HephaestusLogRecord.ts';

import { AgentSlotProblemWording }             from '../agent-slot/AgentSlotProblemWording.ts';
import { MergedTreeGateOutcomeProblemWording } from '../gate-outcome/MergedTreeGateOutcomeProblemWording.ts';
import { GateProfileOutputProblemWording }     from '../gate-profile-output/GateProfileOutputProblemWording.ts';
import { GateRunSlotProblemWording }           from '../gate-run-slot/GateRunSlotProblemWording.ts';
import { GenerationRecordProblemWording }      from '../generation-record/GenerationRecordProblemWording.ts';
import { HeartbeatProblemWording }             from '../heartbeat/HeartbeatProblemWording.ts';
import { HephaestusLockProblemWording }        from '../hephaestus-lock/HephaestusLockProblemWording.ts';
import { PresenceProblemWording }              from '../presence/PresenceProblemWording.ts';
import { SeenHeadProblemWording }              from '../seen-head/SeenHeadProblemWording.ts';
import { UsageMarkerProblemWording }           from '../usage-marker/UsageMarkerProblemWording.ts';
import { UnreadableFileProblemWordingUtil }    from './UnreadableFileProblemWordingUtil.ts';

function staleHoldingReasonOf<Problem>(reason: StaleHoldingReason<Problem>, sentenceOf: (problem: Problem) => string): string {
  return reason.kind === 'holder-gone' ? `the process ${reason.processId} it names is gone` : `it could not be read (${sentenceOf(reason.problem)})`;
}

function staleAgentSlotReasonOf(reason: StaleAgentSlotReason): string {
  switch (reason.kind) {
    case 'unreadable':          return `it could not be read (${AgentSlotProblemWording.sentenceOf(reason.problem)})`;
    case 'names-no-hephaestus': return 'it names no Hephaestus';
    case 'hephaestus-gone':     return `the Hephaestus ${reason.processId} it names is gone`;
  }
}

function staleGateRunSlotReasonOf(reason: StaleGateRunSlotReason): string {
  return reason.kind === 'unreadable'
    ? `it could not be read (${GateRunSlotProblemWording.sentenceOf(reason.problem)})`
    : `its holder ${reason.holder} is no longer live`;
}

function talosRecordWordsOf(recordState: string | null): string {
  return recordState === null ? 'it never claimed its record' : `its record reads ${recordState}`;
}

function crashedHephaestusLockOf(crashedGeneration: number | null): string {
  return crashedGeneration === null ? 'a Hephaestus lock nothing names' : `Hephaestus lock ${crashedGeneration}`;
}

function launchedJobWordsOf(launched: { readonly jobKind: string; readonly ticketIds: readonly string[] }): string {
  return `${launched.jobKind}${launched.ticketIds.length === 0 ? '' : ` #${launched.ticketIds.join(', #')}`}`;
}

const UNSTARTABLE_GUARD_WORDS: Readonly<Record<'network' | 'stage-edits', { guard: string; calls: string }>> = {
  'network':     { guard: 'network guard', calls: 'shell commands and web fetches' },
  'stage-edits': { guard: 'stage edit guard', calls: 'file edits' },
};

const GUARD_COMMAND_PART_NAMES: Readonly<Record<'runtime' | 'entry-script', string>> = { 'runtime': 'the Bun runtime', 'entry-script': 'the entry script' };

function unstartableGuardReasonOf(reason: UnstartableGuardReason): string {
  if (reason.kind === 'not-an-absolute-runtime-path') return 'its command is not an absolute runtime path';
  const partName = GUARD_COMMAND_PART_NAMES[reason.part];
  if (reason.path === null) return `${partName} is not in Hephaestus's command`;
  if (reason.cause === 'missing') return `${partName} ${reason.path} is not an absolute path to a file`;
  return `${partName} ${reason.path} lies inside the repository ${reason.repositoryRoot}`;
}

function leftOutLineOf(generation: number, fileName: string, sentence: string): string {
  return `The crash log of Hephaestus lock ${generation} leaves out ${fileName}, which cannot be read: ${sentence}`;
}

const SHORT_TREE_CHARACTERS = 12;

function mergedTreeGateRunOf(run: { readonly worktreePath: string; readonly treeId: string; readonly phase: string }): string {
  return `${basename(run.worktreePath)} at tree ${run.treeId.slice(0, SHORT_TREE_CHARACTERS)} in phase ${run.phase}`;
}

/** One case per kind, so a kind with no words fails the typecheck. */
function detailsOf(record: HephaestusLogRecord): string {
  switch (record.kind) {
    case 'hephaestus-serving':
      return `Hephaestus serving ${record.url} under Hephaestus lock ${record.generation} (code ${record.codeVersion}, install version ${record.installVersion}, `
        + `agents ${record.agentVendor}).`;
    case 'stop-signal-received':                    return 'Stop signal received.';
    case 'runtime-command-received':                return `${record.command} received${record.now ? ' (now)' : ''}.`;
    case 'talos-asked-to-quit-for-restart':         return `Talos ${record.talosStartNumber ?? 'none'} was asked to quit for a clean restart: ${record.outcome}.`;
    case 'board-state-unreadable-for-event-stream': return `The board state could not be read for the event stream: ${record.thrownMessage}`;
    case 'restart-refused':                         return `The restart was refused at ${record.step}: ${record.restartError}. This Hephaestus keeps driving.`;
    case 'handover-started':                            return `Handing the board over to the code on disk (Hephaestus lock ${record.generation}).`;
    case 'released-to-successor':                   return 'Released the board to the successor.';
    case 'successor-started':                       return `Started the successor as process ${record.processId}; exiting.`;
    case 'successor-could-not-serve':
      return `The successor of Hephaestus lock ${record.predecessorGeneration} could not serve, so no Hephaestus is on the board: ${record.errorMessage}`;
    case 'stop-wait-failed-late':                   return `After the stop went on, ${record.waitName} failed: ${record.thrownMessage}`;
    case 'stop-wait-cut-short':                     return `The stop went on without ${record.waitName}, which did not end within ${record.boundMilliseconds} ms.`;
    case 'crashed-staying-off':                     return 'Crashed; staying off, keeping the Hephaestus lock and the registry entry, until a start by hand.';
    case 'taken-over-stopping':                     return 'A newer Hephaestus took the board over; stopping without acting.';
    case 'hephaestus-stopped':                      return 'Hephaestus stopped; its Hephaestus lock is released.';
    case 'staying-off-after-crash':
      return `Staying off after a crash of ${crashedHephaestusLockOf(record.crashedGeneration)}${record.suspected ? ' suspected before the machine restarted' : ''}: `
        + `started by ${record.startOrigin}, so only a start by the user serves; the crash log is ${record.crashLogPath}.`;
    case 'talos-started':
      return `Started Talos ${record.talosStartNumber} (the one before ${record.previousTalos}, ${record.sweptOrphans} orphans swept).`;
    case 'talos-attached':                return `Attached to Talos ${record.talosStartNumber}.`;
    case 'talos-connection-closed':       return `The connection to Talos ${record.talosStartNumber} closed; the next pass ensures a Talos.`;
    case 'no-talos-serves':               return `No Talos serves the board (${record.reason}); the next pass tries again.`;
    case 'talos-stopped-after-quit-wait': return `Talos ${record.talosStartNumber} did not quit within its wait and was stopped.`;
    case 'talos-lost':                    return `Talos ${record.talosStartNumber} was lost; ${record.sweptOrphans} of its children were swept.`;
    case 'talos-endpoint-does-not-fit':   return `Talos ${record.talosStartNumber} cannot start: its endpoint ${record.endpoint} does not fit this platform.`;
    case 'talos-did-not-serve':           return `Talos ${record.talosStartNumber} did not serve: ${talosRecordWordsOf(record.recordState)}.`;
    case 'talos-protocol-differs':
      return `Talos ${record.talosStartNumber}, started from the program on disk, answers protocol version ${record.protocolVersion}: no Talos starts again.`;
    case 'talos-did-not-welcome':         return `Talos ${record.talosStartNumber} serves but did not welcome Hephaestus: ${record.answer}.`;
    case 'lost-cause-unreadable':
      return `The lost cause ${record.lostCausePath} names no interruption cause ("${record.storedText}"); it is settled again.`;
    case 'lost-child-stop-refused':
      return `The forced stop of ${record.childFolder}#${record.instance}, a child of the lost Talos ${record.talosStartNumber}, was refused.`;
    case 'crashed':
      return `Crashed (${record.component}) under Hephaestus lock ${record.generation}; the crash log is ${record.crashLogPath ?? 'not written'} (${record.crashLog}).`;
    case 'crash-log-leaves-out-presence':  return leftOutLineOf(record.generation, 'presence.json', PresenceProblemWording.sentenceOf(record.problem));
    case 'crash-log-leaves-out-heartbeat': return leftOutLineOf(record.generation, 'heartbeat.json', HeartbeatProblemWording.sentenceOf(record.problem));
    case 'crash-log-unwritten':            return `The crash log of Hephaestus lock ${record.generation} could not be written: ${record.thrownMessage}`;
    case 'crashed-ending-unwritten':       return `The crashed ending of Hephaestus lock ${record.generation} could not be written: ${record.thrownMessage}`;
    case 'lease-renewal-unstoppable':      return `The lease renewal could not be stopped: ${record.thrownMessage}`;
    case 'registry-crash-unwritten':       return `The registry could not be told of the crash: ${record.thrownMessage}`;
    case 'board-file-unreadable':
      return `Hephaestus cannot read the board file ${record.file} (${UnreadableFileProblemWordingUtil.sentenceOf(record.problem)}); `
        + 'the board header warns until Hephaestus restarts.';
    case 'heartbeat-unreadable-rewritten':
      return `heartbeat.json could not be read (${HeartbeatProblemWording.sentenceOf(record.problem)}); this beat rewrites it.`;
    case 'heartbeat-unreadable-at-start':
      return `heartbeat.json could not be read (${HeartbeatProblemWording.sentenceOf(record.problem)}); the start classifies without a last beat.`;
    case 'stale-lock-record-taken-over':
      return `The lock record ${record.recordPath} was stale and is taken over: ${staleHoldingReasonOf(record.reason, GenerationRecordProblemWording.sentenceOf)}.`;
    case 'stale-hephaestus-lock-taken-over': {
      const staleReason = staleHoldingReasonOf(record.reason, (problem) => (problem === null ? 'unknown' : HephaestusLockProblemWording.sentenceOf(problem)));
      return `Generation ${record.generation} took over the stale Hephaestus lock ${record.hephaestusLockFilePath}: ${staleReason}.`;
    }
    case 'agent-slot-taken-over':    return `The agent slot ${record.slotPath} was stale and is taken over: ${staleAgentSlotReasonOf(record.reason)}.`;
    case 'agent-slot-unreadable':
      return `The agent slot ${record.slotPath} could not be read (${AgentSlotProblemWording.sentenceOf(record.problem)}); it is left in place.`;
    case 'gate-run-slot-taken-over': return `The gate run slot ${record.slotPath} was stale and is taken over: ${staleGateRunSlotReasonOf(record.reason)}.`;
    case 'gate-run-slot-unreadable':
      return `The gate run slot ${record.slotPath} could not be read (${GateRunSlotProblemWording.sentenceOf(record.problem)}); it is left in place.`;
    case 'merged-tree-gate-started': return `The merged-tree gate of ${mergedTreeGateRunOf(record)} started.`;
    case 'merged-tree-gate-kept-outcome-unreadable':
      return `The kept outcome of the merged-tree gate of ${mergedTreeGateRunOf(record)} cannot be read (${MergedTreeGateOutcomeProblemWording.sentenceOf(record.problem)}).`;
    case 'merged-tree-gate-ended': return `The merged-tree gate of ${mergedTreeGateRunOf(record)} ended: ${record.outcome}.`;
    case 'merged-tree-gate-ended-without-outcome':
      return `The merged-tree gate of ${mergedTreeGateRunOf(record)} ended with no outcome: ${record.thrownMessage}`;
    case 'merged-tree-gate-stopped-while-running':
      return `The merged-tree gate of ${mergedTreeGateRunOf(record)} ended with no outcome: the run was stopped while it ran`;
    case 'merged-tree-gate-run-folder-removed':
      return `The merged-tree gate run folder ${record.runFolderName} is removed: its kept outcome cannot be read `
        + `(${MergedTreeGateOutcomeProblemWording.sentenceOf(record.problem)}).`;
    case 'gate-profile-failed':             return `Gate profile ${record.profileRunId} failed and waits for the next start: ${record.thrownMessage}`;
    case 'gate-profile-worktree-left-over': return `The gate profile worktree ${record.worktreePath} is a leftover: ${record.removalReason}`;
    case 'gate-profile-output-unreadable':
      return `The gate profile output ${record.outputFilePath} could not be read (${GateProfileOutputProblemWording.sentenceOf(record.problem)}); its stream waits.`;
    case 'gate-profile-output-line-unreadable':
      return `Line ${record.lineNumber} of the gate profile output ${record.outputFilePath} could not be read (${GateProfileOutputProblemWording.sentenceOf(record.problem)}); `
        + 'it and any later unreadable line are not sent.';
    case 'pipeline-check-failed':             return `Pipeline check of setup ${record.setupId} failed and waits for the next start: ${record.thrownMessage}`;
    case 'pipeline-check-worktree-left-over': return `The pipeline check worktree ${record.worktreePath} is a leftover: ${record.removalReason}`;
    case 'lease-renewal-without-connection':  return 'The lease renewal found no connection to Talos.';
    case 'lease-renewal-unanswered':          return 'Talos did not answer a lease renewal.';
    case 'lease-renewal-refused':             return `Talos refused a lease renewal: ${record.reason}.`;
    case 'lease-renewal-withheld':            return `The lease renewal is withheld: pass ${record.passNumber} has run for more than one renewal interval.`;
    case 'child-event-log-malformed':
      return `The event log of job ${record.jobId}, child instance ${record.childInstance}, is malformed; its events wait.`;
    case 'usage-marker-malformed':
      return `The usage marker ${record.markerPath} is malformed (${UsageMarkerProblemWording.sentenceOf(record.problem)}); no limit is held by it.`;
    case 'session-confinement-refused':
      return `The session of job ${record.jobId} did not launch: ${record.confinementRefusal}; the next pass tries again.`;
    case 'tool-left-off-search-path':
      return `The tool ${record.toolName} is left off the search path of job ${record.jobId}: ${record.resolverRefusal}.`;
    case 'job-file-unreadable-at-launch':
      return `Job ${record.jobId} did not launch: its launch reads ${record.file}, which cannot be read (${UnreadableFileProblemWordingUtil.sentenceOf(record.problem)}).`;
    case 'pipeline-agent-awaits-billing':
      return `The pipeline agent of job ${record.jobId} did not launch: its setup has no billing yet, and it launches once one is chosen.`;
    case 'airlock-agent-root-unmade':       return `The Airlock agent of job ${record.jobId} did not launch: ${record.sandboxRefusal}.`;
    case 'airlock-agent-conflicts-unknown':
      return `The Airlock agent of job ${record.jobId} did not launch: neither its kept facts nor git tell which files conflict.`;
    case 'commits-unsigned-despite-signing':
      return `Job ${record.jobId} commits unsigned although the repository sets commit.gpgsign: no gpg-agent socket reaches its sandbox.`;
    case 'child-instance-not-launched': {
      const why = record.talosRefusal === null ? 'no Talos took it' : `Talos refused it (${record.talosRefusal})`;
      return `Child instance ${record.childInstance} of job ${record.jobId} (${launchedJobWordsOf(record)}) did not launch: ${why}; the next pass tries again.`;
    }
    case 'child-instance-launched':
      return `Launched child instance ${record.childInstance} of job ${record.jobId} (${launchedJobWordsOf(record)}) under Talos.`;
    case 'cleanup-declined':                return `Git declined the ${record.cleanup} cleanup of ${record.groupBranch}: ${record.gitMessage}`;
    case 'presence-unrecorded':             return `Presence could not record the pass: ${record.thrownMessage}`;
    case 'pass-abandoned':                  return `Drive pass abandoned (${record.reason}); it waits for the next wake-up: ${record.refusalMessage}`;
    case 'pass-crashed':                    return `Drive pass crashed: ${record.thrownMessage}; the crash path runs and no further pass runs.`;
    case 'pass-crash-path-threw':           return `The crash path of the drive pass threw: ${record.thrownMessage}`;
    case 'child-instance-lost':             return `Child instance ${record.childInstance} of job ${record.jobId} is lost (${record.cause}).`;
    case 'gate-red':
      return `The ${record.gate} gate of job ${record.jobId} (#${record.ticketId}) is red on ${record.treeId}; its output is in ${record.outputFile}.`;
    case 'guard-cannot-start': {
      const { guard, calls } = UNSTARTABLE_GUARD_WORDS[record.guard];
      return `The ${guard} of job ${record.jobId} (#${record.ticketId}) cannot start, so its ${calls} are denied: ${unstartableGuardReasonOf(record.reason)}.`;
    }
    case 'line-refused': return `The ${record.step} line of job ${record.jobId} (#${record.ticketId}) did not run: ${record.sandboxRefusal}.`;
    case 'line-launched': {
      const confinementWords = record.confinement === null ? ', unconfined by design' : ` under ${record.confinement}`;
      return `Launched the ${record.step} line of job ${record.jobId} (#${record.ticketId}), instance ${record.instance}, under Talos${confinementWords}.`;
    }
    case 'line-not-launched': {
      const why = record.talosRefusal === null ? 'no Talos took it' : `Talos refused it (${record.talosRefusal})`;
      return `The ${record.step} line of job ${record.jobId}, instance ${record.instance}, did not launch: ${why}; the next pass tries again.`;
    }
    case 'merge-line-launched':
      return `Launched the ${record.step} line of job ${record.jobId} (#${record.ticketId}) under Talos, merging ${record.mergedTip} into ${record.branch}.`;
    case 'fresh-worktree-differs':
      return `The fresh worktree of job ${record.jobId} already differs from its commit in ${record.changedFileCount} file(s), as line-ending normalisation leaves it.`;
    case 'worktree-creation-failed': return `Creating the worktree of job ${record.jobId} failed: ${record.worktreeFailure}`;
    case 'seen-head-unreadable':
      return `The document agent's seen head ${record.seenHeadFilePath} is unreadable, so its next line carries the head again: `
        + SeenHeadProblemWording.sentenceOf(record.problem);
    case 'document-agent-snapshot-left-over': return `The document agent snapshot ${record.snapshotPath} is a leftover: ${record.removalReason}`;
    case 'pipeline-agent-snapshot-left-over': return `The pipeline agent snapshot ${record.snapshotPath} is a leftover: ${record.removalReason}`;
  }
}

/** The line `hephaestus.log` keeps: `at`, the kind and its keys, then `details`, the sentence standard error showed. */
function storedLineOf(record: HephaestusLogRecord, at: string): string {
  return JSON.stringify({ at, ...record, details: detailsOf(record) });
}

export const HephaestusLogWordingUtil = Object.freeze({ detailsOf, storedLineOf });
