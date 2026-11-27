/**
 * Code documents itself: an inline comment is a why of one or two lines, any comment (file headers and docblocks included) holds at most
 * five lines, and no comment names a ticket, acceptance or question id, a plan section or an artboard. Comments are read from the syntax
 * tree, so `//` in a string is not one; the scan proves it read runs of each size, and each form is planted.
 */
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

import { repositoryRootOfThisCheckout }                from '../src/testing/ImportGraph.ts';
import { memoisedPerSource, programTypeScriptSources } from '../src/testing/RepositorySources.ts';

interface CommentRun {
  readonly firstLine:  number;
  readonly lineCount:  number;
  readonly isDocblock: boolean;
  readonly text:       string;
}

const LONGEST_INLINE_COMMENT_LINES = 2;
const LONGEST_COMMENT_LINES = 5;
// A ticket, acceptance or question id (`E85`, `A4`, `W5.6`), an artboard (`A2Proposal`), a work package or a plan section.
const REFERENCE_PATTERNS: readonly RegExp[] = [
  /\b[A-Z]\d{1,3}(?:\.\d+)*\b/,
  /\b[A-Z]\d[A-Z][a-z]/,
  /\bWP\s?\d/,
  /\bplan\s+(?:section\s+)?\d/i,
  /\b(?:ticket|acceptance)\s+#?\d/i,
];

/** Files with comments longer than five lines, each with its count; the sweep shrinks this to nothing and nothing joins it. */
const LONG_COMMENTS_AWAITING_THE_SWEEP: Readonly<Record<string, number>> = {
  'architecture/AgentBoundary.spec.ts':                                      1,
  'architecture/ClientNames.spec.ts':                                        1,
  'architecture/ComponentNames.spec.ts':                                     1,
  'architecture/DocumentSpecCitations.spec.ts':                              1,
  'architecture/GitRunsAtAToplevel.spec.ts':                                 1,
  'architecture/ImportDirection.spec.ts':                                    1,
  'architecture/LineEndingPolicy.spec.ts':                                   1,
  'architecture/LintRules.spec.ts':                                          1,
  'architecture/PlatformBoundary.spec.ts':                                   1,
  'architecture/PlatformProbes.integration.spec.ts':                         1,
  'architecture/ProductNameLiterals.spec.ts':                                1,
  'architecture/ProseWrap.spec.ts':                                          1,
  'architecture/RealSystemSpecs.spec.ts':                                    1,
  'architecture/SpecSleeps.spec.ts':                                         1,
  'architecture/SpecsOpenNoPage.spec.ts':                                    1,
  'architecture/StoreBoundary.spec.ts':                                      1,
  'architecture/TalosClosure.spec.ts':                                       1,
  'architecture/TalosMainThread.spec.ts':                                    1,
  'architecture/TestFileConventions.spec.ts':                                1,
  'forge-contracts/@types/BoardAgentDocuments.ts':                           1,
  'forge-contracts/@types/BoardPipelineDocuments.ts':                        1,
  'forge-contracts/@types/MonitorSnapshotDocument.ts':                       1,
  'forge-contracts/constants/ForgeCompatibilityRegistry.spec.ts':            1,
  'forge-contracts/constants/ForgeCompatibilityRegistry.ts':                 1,
  'forge-contracts/constants/ForgeSystemVersions.ts':                        1,
  'src/adapters/StoredFileText.ts':                                          1,
  'src/adapters/agent-slot/AgentSlotIngestion.spec.ts':                      1,
  'src/adapters/board-commands/utils/BoardCommandMappingUtil.spec.ts':       1,
  'src/adapters/board-document/utils/BoardConversationMappingUtil.spec.ts':  1,
  'src/adapters/board-document/utils/BoardEntityRefusalMappingUtil.spec.ts': 1,
  'src/adapters/board-document/utils/BoardJobMappingUtil.spec.ts':           1,
  'src/adapters/board-document/utils/BoardPageMappingUtil.spec.ts':          1,
  'src/adapters/board-document/utils/BoardPipelineMappingUtil.spec.ts':      1,
  'src/adapters/board-document/utils/BoardPipelineMappingUtil.ts':           1,
  'src/adapters/board-document/utils/BoardReadingMappingUtil.spec.ts':       1,
  'src/adapters/board-document/utils/TicketDocumentsMappingUtil.spec.ts':    1,
  'src/adapters/board-document/utils/TicketDocumentsMappingUtil.ts':         1,
  'src/adapters/gate-manifest/GateRunManifestIngestion.spec.ts':             1,
  'src/adapters/gate-run-slot/GateRunSlotIngestion.spec.ts':                 1,
  'src/adapters/gate-run-slot/GateRunSlotIngestion.ts':                      1,
  'src/adapters/generation-record/GenerationRecordIngestion.spec.ts':        1,
  'src/adapters/hatch/utils/HatchFormatUtil.spec.ts':                        1,
  'src/adapters/launch-registry/LaunchRegistryIngestion.spec.ts':            1,
  'src/adapters/launch-registry/LaunchRegistryIngestion.ts':                 1,
  'src/adapters/launch-settings/LaunchSettingsIngestion.spec.ts':            1,
  'src/adapters/log/LogFileIngestion.spec.ts':                               1,
  'src/adapters/log/LogRecordProblem.spec.ts':                               1,
  'src/adapters/main-resolution/MainMergeResolutionIngestion.spec.ts':       1,
  'src/adapters/merge-settlement/MergeSettlementIngestion.spec.ts':          1,
  'src/adapters/merge-sides/MergeSidesIngestion.spec.ts':                    1,
  'src/adapters/pipeline-setup/SetupPayloadSchemas.spec.ts':                 1,
  'src/adapters/pipeline-setup/SetupPayloadSchemas.ts':                      1,
  'src/adapters/pipeline/ConstitutionSourcesFile.ts':                        1,
  'src/adapters/pipeline/GateProfilesFile.spec.ts':                          1,
  'src/adapters/pipeline/PipelineFile.entities.spec.ts':                     1,
  'src/adapters/pipeline/PipelineFile.spec.ts':                              1,
  'src/adapters/pipeline/PipelineFile.ts':                                   1,
  'src/adapters/pipeline/PipelineSetupFile.spec.ts':                         1,
  'src/adapters/progress/utils/ProgressFileMappingUtil.decisions.spec.ts':   1,
  'src/adapters/progress/utils/ProgressFileMappingUtil.jobs.spec.ts':        1,
  'src/adapters/progress/utils/ProgressFileMappingUtil.spec.ts':             1,
  'src/adapters/reports/ReportSchemas.spec.ts':                              1,
  'src/adapters/step-verdict/StepVerdictIngestion.spec.ts':                  1,
  'src/adapters/tickets/TicketDocumentsFileIngestion.spec.ts':               1,
  'src/adapters/tickets/utils/TicketAcceptanceUtil.spec.ts':                 1,
  'src/adapters/tickets/utils/TicketHandoffUtil.spec.ts':                    1,
  'src/adapters/usage-marker/UsageWindowsFile.spec.ts':                      1,
  'src/adapters/utils/HtmlLabelUtil.spec.ts':                                1,
  'src/adapters/utils/LogUtil.spec.ts':                                      1,
  'src/adapters/utils/OperationRefusalWordingUtil.boardRefusal.spec.ts':     2,
  'src/adapters/utils/OperationRefusalWordingUtil.entityRows.spec.ts':       1,
  'src/adapters/utils/OperationRefusalWordingUtil.spec.ts':                  1,
  'src/adapters/utils/StatusDocumentUtil.spec.ts':                           1,
  'src/adapters/utils/StatusWordingUtil.spec.ts':                            1,
  'src/lib/atomic-file/AtomicFile.ts':                                       1,
  'src/lib/claude-code/ClaudeCodeAdapter.nestedCheckout.spec.ts':            1,
  'src/lib/claude-code/ClaudeCodeAdapter.posix.spec.ts':                     1,
  'src/lib/claude-code/ClaudeCodeAdapter.sessionKinds.spec.ts':              1,
  'src/lib/claude-code/ClaudeCodeAdapter.spec.ts':                           1,
  'src/lib/claude-code/ClaudeCodeAdapter.stageFolders.spec.ts':              1,
  'src/lib/claude-code/ClaudeCodeAdapter.windows.spec.ts':                   1,
  'src/lib/claude-code/ClaudeHookInput.spec.ts':                             1,
  'src/lib/claude-code/ClaudeSessionSubagents.spec.ts':                      1,
  'src/lib/claude-code/ClaudeStreamFixtures.spec.ts':                        1,
  'src/lib/claude-code/ClaudeStreamLines.spec.ts':                           1,
  'src/lib/claude-code/ClaudeStreamMapper.spec.ts':                          1,
  'src/lib/claude-code/ClaudeSubagentUsages.spec.ts':                        1,
  'src/lib/claude-code/ClaudeTranscripts.ts':                                2,
  'src/lib/claude-code/utils/TranscriptUsageUtil.spec.ts':                   1,
  'src/lib/gate-confinement/DarwinSeatbelt.ts':                              1,
  'src/lib/gate-confinement/GateConfinement.contract.integration.spec.ts':   1,
  'src/lib/gate-confinement/GateConfinement.contract.spec.ts':               1,
  'src/lib/gate-confinement/LinuxBubblewrap.ts':                             1,
  'src/lib/git/BranchMerge.integration.spec.ts':                             1,
  'src/lib/git/GitProcess.ts':                                               1,
  'src/lib/git/GitWorktrees.integration.spec.ts':                            1,
  'src/lib/git/LineEndingPolicy.integration.spec.ts':                        1,
  'src/lib/git/MergeTree.integration.spec.ts':                               1,
  'src/lib/git/RecordedGitScenarios.integration.spec.ts':                    1,
  'src/lib/git/Worktrees.integration.spec.ts':                               1,
  'src/lib/git/Worktrees.ts':                                                1,
  'src/lib/platform-ports/PlatformPortsFor.spec.ts':                         1,
  'src/lib/process-identity/ProcessIdentity.integration.spec.ts':            1,
  'src/lib/process-identity/ProcessSupervision.frozen.spec.ts':              1,
  'src/lib/process-identity/ProcessSupervision.ts':                          1,
  'src/lib/program-folders/ProgramFolders.contract.spec.ts':                 1,
  'src/lib/shell-line/ShellLine.contract.integration.spec.ts':               1,
  'src/lib/talos/ChildSupervisor.spec.ts':                                   1,
  'src/lib/talos/ChildSupervisor.ts':                                        1,
  'src/lib/talos/CleanQuit.spec.ts':                                         1,
  'src/lib/talos/LocalEndpoint.answers.integration.spec.ts':                 1,
  'src/lib/talos/LocalEndpoint.contract.integration.spec.ts':                1,
  'src/lib/talos/SynchronousCallsThread.integration.spec.ts':                1,
  'src/lib/talos/Talos.agents.integration.spec.ts':                          1,
  'src/lib/talos/Talos.cleanQuit.integration.spec.ts':                       1,
  'src/lib/talos/Talos.lease.integration.spec.ts':                           1,
  'src/lib/talos/Talos.lines.integration.spec.ts':                           1,
  'src/lib/talos/Talos.stages.integration.spec.ts':                          1,
  'src/lib/talos/Talos.ts':                                                  1,
  'src/lib/talos/TalosSocketServer.spec.ts':                                 1,
  'src/lib/tracker-model/@types/Job.ts':                                     2,
  'src/lib/tracker-model/AgentQuestions.spec.ts':                            1,
  'src/lib/tracker-model/Board.airlocks.spec.ts':                            1,
  'src/lib/tracker-model/Board.decisions.spec.ts':                           1,
  'src/lib/tracker-model/Board.dispatchQueries.spec.ts':                     1,
  'src/lib/tracker-model/Board.entityPipelineGates.spec.ts':                 1,
  'src/lib/tracker-model/Board.epics.spec.ts':                               1,
  'src/lib/tracker-model/Board.groupReleases.spec.ts':                       1,
  'src/lib/tracker-model/Board.incidents.spec.ts':                           1,
  'src/lib/tracker-model/Board.jobs.spec.ts':                                1,
  'src/lib/tracker-model/Board.lifecycle.spec.ts':                           1,
  'src/lib/tracker-model/Board.logRecords.spec.ts':                          2,
  'src/lib/tracker-model/Board.needs.spec.ts':                               1,
  'src/lib/tracker-model/Board.optionNotes.spec.ts':                         1,
  'src/lib/tracker-model/Board.pipelinePhases.spec.ts':                      1,
  'src/lib/tracker-model/Board.queries.spec.ts':                             1,
  'src/lib/tracker-model/Board.stages.spec.ts':                              1,
  'src/lib/tracker-model/Board.ticketEdits.spec.ts':                         1,
  'src/lib/tracker-model/Board.ticketMoves.spec.ts':                         1,
  'src/lib/tracker-model/Board.ticketSettings.spec.ts':                      1,
  'src/lib/tracker-model/Board.ts':                                          2,
  'src/lib/tracker-model/Findings.spec.ts':                                  1,
  'src/lib/tracker-model/GateProfiles.spec.ts':                              1,
  'src/lib/tracker-model/IncidentMoves.spec.ts':                             1,
  'src/lib/tracker-model/JobControls.ts':                                    2,
  'src/lib/tracker-model/Jobs.documentAgents.spec.ts':                       1,
  'src/lib/tracker-model/MergeQueueMarks.ts':                                1,
  'src/lib/tracker-model/PipelineSetups.agent.spec.ts':                      1,
  'src/lib/tracker-model/PipelineSetups.apply.spec.ts':                      1,
  'src/lib/tracker-model/PipelineSetups.applyEntities.spec.ts':              1,
  'src/lib/tracker-model/PipelineSetups.spec.ts':                            1,
  'src/lib/tracker-model/PipelineSetups.ts':                                 3,
  'src/lib/tracker-model/Playbook.documentAgents.spec.ts':                   1,
  'src/lib/tracker-model/Playbook.entityCaps.spec.ts':                       1,
  'src/lib/tracker-model/Playbook.forecast.spec.ts':                         1,
  'src/lib/tracker-model/Playbook.interleavings.spec.ts':                    1,
  'src/lib/tracker-model/Playbook.needs.spec.ts':                            1,
  'src/lib/tracker-model/Playbook.redHandoff.spec.ts':                       1,
  'src/lib/tracker-model/Playbook.reviewPhase.spec.ts':                      1,
  'src/lib/tracker-model/Playbook.stages.spec.ts':                           1,
  'src/lib/tracker-model/Playbook.ts':                                       1,
  'src/lib/tracker-model/ReviewStatistics.spec.ts':                          1,
  'src/lib/tracker-model/TicketDocuments.spec.ts':                           1,
  'src/lib/tracker-model/TicketDocuments.ts':                                1,
  'src/lib/tracker-model/TicketForecasts.spec.ts':                           1,
  'src/lib/tracker-model/TicketMoves.ts':                                    1,
  'src/lib/tracker-model/TicketStageRows.spec.ts':                           1,
  'src/lib/tracker-model/TicketStageRows.ts':                                1,
  'src/lib/tracker-model/TrackerChanges.ts':                                 1,
  'src/lib/tracker-model/constants/TicketStages.ts':                         1,
  'src/lib/tracker-model/utils/DocumentLineMergeUtil.spec.ts':               1,
  'src/lib/tracker-model/utils/DraftProgressUtil.spec.ts':                   1,
  'src/lib/tracker-model/utils/EntityOwnershipUtil.spec.ts':                 1,
  'src/lib/tracker-model/utils/EntityValidationUtil.spec.ts':                1,
  'src/lib/tracker-model/utils/FailedPassUtil.spec.ts':                      1,
  'src/lib/tracker-model/utils/FailedPassUtil.ts':                           1,
  'src/lib/tracker-model/utils/LaunchSlotUtil.spec.ts':                      1,
  'src/lib/tracker-model/utils/LineDiffUtil.spec.ts':                        1,
  'src/lib/tracker-model/utils/MergeQueueUtil.spec.ts':                      1,
  'src/lib/tracker-model/utils/OptionConsequencesUtil.spec.ts':              1,
  'src/lib/tracker-model/utils/PipelineChangeUtil.spec.ts':                  1,
  'src/lib/tracker-model/utils/PipelineChangeUtil.ts':                       1,
  'src/lib/tracker-model/utils/PipelineDraftEditUtil.spec.ts':               1,
  'src/lib/tracker-model/utils/PipelineUtil.spec.ts':                        1,
  'src/lib/tracker-model/utils/RoundVerdictUtil.spec.ts':                    1,
  'src/lib/tracker-model/utils/TicketBodyHashUtil.spec.ts':                  1,
  'src/lib/tracker-model/utils/TicketDocumentReadingUtil.spec.ts':           1,
  'src/lib/tracker-model/utils/TicketDocumentStandingUtil.spec.ts':          1,
  'src/lib/tracker-model/utils/TicketStageUtil.spec.ts':                     1,
  'src/lib/tracker-model/utils/TicketWritingUtil.spec.ts':                   1,
  'src/services/control/AgentCommandPreparation.spec.ts':                    1,
  'src/services/control/AgentPrograms.spec.ts':                              1,
  'src/services/control/AgentTools.spec.ts':                                 1,
  'src/services/control/AirlockControls.spec.ts':                            1,
  'src/services/control/BoardLifetimeControls.spec.ts':                      1,
  'src/services/control/Bouncer.spec.ts':                                    1,
  'src/services/control/ByHandBoardControls.spec.ts':                        1,
  'src/services/control/DocumentAgentControls.questions.spec.ts':            1,
  'src/services/control/DocumentAgentControls.spec.ts':                      1,
  'src/services/control/GateProfileControls.spec.ts':                        1,
  'src/services/control/GateProfileControls.ts':                             1,
  'src/services/control/JobControls.spec.ts':                                1,
  'src/services/control/PipelineAgentControls.spec.ts':                      1,
  'src/services/control/PipelineAgentControls.ts':                           1,
  'src/services/control/PipelineSetupControls.entities.spec.ts':             1,
  'src/services/control/PipelineSetupControls.spec.ts':                      1,
  'src/services/control/PipelineSetupControls.ts':                           4,
  'src/services/control/ResumeControls.spec.ts':                             1,
  'src/services/control/ResumeControls.ts':                                  1,
  'src/services/control/SettingControls.spec.ts':                            1,
  'src/services/control/TicketControls.spec.ts':                             1,
  'src/services/control/TicketDocumentControls.spec.ts':                     1,
  'src/services/control/WorktreeRepair.spec.ts':                             1,
  'src/services/hephaestus/AgentFactsReading.spec.ts':                       1,
  'src/services/hephaestus/AgentSlots.spec.ts':                              1,
  'src/services/hephaestus/AgentSlots.ts':                                   1,
  'src/services/hephaestus/AirlockSandboxIncident.spec.ts':                  1,
  'src/services/hephaestus/Airlocks.airlockAgents.spec.ts':                  1,
  'src/services/hephaestus/Airlocks.conflicts.spec.ts':                      1,
  'src/services/hephaestus/Airlocks.constitutionCommit.spec.ts':             1,
  'src/services/hephaestus/Airlocks.crossing.spec.ts':                       1,
  'src/services/hephaestus/Airlocks.entities.spec.ts':                       1,
  'src/services/hephaestus/Airlocks.entityConstitutions.spec.ts':            1,
  'src/services/hephaestus/Airlocks.gateBesideThePass.spec.ts':              1,
  'src/services/hephaestus/Airlocks.interruptedStart.spec.ts':               1,
  'src/services/hephaestus/Airlocks.mainLine.spec.ts':                       1,
  'src/services/hephaestus/Airlocks.mergeApproval.spec.ts':                  1,
  'src/services/hephaestus/Airlocks.minimalPipeline.spec.ts':                1,
  'src/services/hephaestus/Airlocks.reReview.spec.ts':                       1,
  'src/services/hephaestus/Airlocks.siblingTrackers.spec.ts':                1,
  'src/services/hephaestus/Airlocks.spec.ts':                                1,
  'src/services/hephaestus/Airlocks.ts':                                     4,
  'src/services/hephaestus/AnswerDelivery.ts':                               1,
  'src/services/hephaestus/AssistantBoot.spec.ts':                           1,
  'src/services/hephaestus/AssistantSession.spec.ts':                        1,
  'src/services/hephaestus/AssistantSession.ts':                             2,
  'src/services/hephaestus/BoardDocumentAssembly.spec.ts':                   1,
  'src/services/hephaestus/BoardOffers.parity.spec.ts':                      1,
  'src/services/hephaestus/BoardState.mergeQueue.spec.ts':                   1,
  'src/services/hephaestus/BoardState.spec.ts':                              1,
  'src/services/hephaestus/CodeVersion.spec.ts':                             1,
  'src/services/hephaestus/ConstitutionCommits.spec.ts':                     1,
  'src/services/hephaestus/ConstitutionCommits.ts':                          1,
  'src/services/hephaestus/CrashLog.spec.ts':                                1,
  'src/services/hephaestus/CrashLog.ts':                                     1,
  'src/services/hephaestus/CrashMatrix.integration.spec.ts':                 1,
  'src/services/hephaestus/CrashMatrix.merges.spec.ts':                      1,
  'src/services/hephaestus/CrashMatrix.spec.ts':                             1,
  'src/services/hephaestus/CrashPath.spec.ts':                               1,
  'src/services/hephaestus/CrossingStages.spec.ts':                          1,
  'src/services/hephaestus/DataFolderWatch.spec.ts':                         1,
  'src/services/hephaestus/DocumentAgentSessions.spec.ts':                   1,
  'src/services/hephaestus/DocumentAgentSessions.ts':                        2,
  'src/services/hephaestus/DocumentAgentWording.spec.ts':                    1,
  'src/services/hephaestus/DrivePass.abandonedPasses.spec.ts':               1,
  'src/services/hephaestus/DrivePass.heldTargets.spec.ts':                   1,
  'src/services/hephaestus/DrivePass.sessionConfinement.spec.ts':            1,
  'src/services/hephaestus/DrivePass.ts':                                    1,
  'src/services/hephaestus/EffectReadings.spec.ts':                          1,
  'src/services/hephaestus/EffectReadings.ts':                               1,
  'src/services/hephaestus/EndedJobTokens.spec.ts':                          1,
  'src/services/hephaestus/EntityDecisionAnswers.spec.ts':                   1,
  'src/services/hephaestus/EntityDecisionAnswers.ts':                        1,
  'src/services/hephaestus/EventBroker.spec.ts':                             1,
  'src/services/hephaestus/EventBroker.ts':                                  1,
  'src/services/hephaestus/GateProfiling.integration.spec.ts':               1,
  'src/services/hephaestus/GateProfiling.outputFollower.spec.ts':            1,
  'src/services/hephaestus/GateProfiling.spec.ts':                           1,
  'src/services/hephaestus/GateProfiling.ts':                                1,
  'src/services/hephaestus/GateRunSlots.integration.spec.ts':                1,
  'src/services/hephaestus/GateRunSlots.spec.ts':                            1,
  'src/services/hephaestus/GateRunSlots.ts':                                 1,
  'src/services/hephaestus/GroupWorktrees.spec.ts':                          1,
  'src/services/hephaestus/HatchInbox.documentAgents.spec.ts':               1,
  'src/services/hephaestus/HatchInbox.spec.ts':                              1,
  'src/services/hephaestus/HatchInbox.ts':                                   1,
  'src/services/hephaestus/HephaestusLock.spec.ts':                          1,
  'src/services/hephaestus/HephaestusLock.ts':                               1,
  'src/services/hephaestus/HephaestusServer.integration.spec.ts':            1,
  'src/services/hephaestus/HephaestusServer.monitor.spec.ts':                1,
  'src/services/hephaestus/HephaestusServer.spec.ts':                        1,
  'src/services/hephaestus/HephaestusServer.ts':                             1,
  'src/services/hephaestus/IncidentRouter.spec.ts':                          1,
  'src/services/hephaestus/InstallChangeWatch.spec.ts':                      1,
  'src/services/hephaestus/InstallChangeWatch.ts':                           1,
  'src/services/hephaestus/InstructionFiles.project.spec.ts':                1,
  'src/services/hephaestus/InstructionFiles.spec.ts':                        1,
  'src/services/hephaestus/InstructionFiles.ts':                             1,
  'src/services/hephaestus/IntakeSessions.spec.ts':                          1,
  'src/services/hephaestus/JobControlDelivery.frames.spec.ts':               1,
  'src/services/hephaestus/JobControlDelivery.ts':                           1,
  'src/services/hephaestus/JobLaunch.buildJobFrames.spec.ts':                1,
  'src/services/hephaestus/JobLaunch.crossing.spec.ts':                      1,
  'src/services/hephaestus/JobLaunch.crossingLands.spec.ts':                 1,
  'src/services/hephaestus/JobLaunch.deniedRoots.spec.ts':                   1,
  'src/services/hephaestus/JobLaunch.entityForge.spec.ts':                   1,
  'src/services/hephaestus/JobLaunch.gateEnvironment.spec.ts':               1,
  'src/services/hephaestus/JobLaunch.gating.spec.ts':                        1,
  'src/services/hephaestus/JobLaunch.mergingMain.spec.ts':                   1,
  'src/services/hephaestus/JobLaunch.projectScope.spec.ts':                  1,
  'src/services/hephaestus/JobLaunch.retry.spec.ts':                         1,
  'src/services/hephaestus/JobLaunch.stageReviewBar.spec.ts':                1,
  'src/services/hephaestus/JobLaunch.targetCatchUp.spec.ts':                 1,
  'src/services/hephaestus/JobLaunch.ticketDocuments.spec.ts':               1,
  'src/services/hephaestus/JobLaunch.ts':                                    6,
  'src/services/hephaestus/JobLaunch.unreadableFiles.spec.ts':               1,
  'src/services/hephaestus/JobLiveFactsReader.spec.ts':                      1,
  'src/services/hephaestus/JobLiveFactsReader.ts':                           1,
  'src/services/hephaestus/JobResumption.adapt.spec.ts':                     1,
  'src/services/hephaestus/JobResumption.entities.spec.ts':                  1,
  'src/services/hephaestus/JobResumption.spec.ts':                           1,
  'src/services/hephaestus/JobResumption.ts':                                3,
  'src/services/hephaestus/JobResumption.verdicts.spec.ts':                  1,
  'src/services/hephaestus/JobTranscript.spec.ts':                           1,
  'src/services/hephaestus/JobTranscript.ts':                                1,
  'src/services/hephaestus/LaunchSettings.spec.ts':                          1,
  'src/services/hephaestus/LeaseRenewal.integration.spec.ts':                1,
  'src/services/hephaestus/LeaseRenewal.spec.ts':                            1,
  'src/services/hephaestus/LineSandbox.integration.spec.ts':                 1,
  'src/services/hephaestus/LockfileDependencyGraph.spec.ts':                 1,
  'src/services/hephaestus/MainLineReads.spec.ts':                           1,
  'src/services/hephaestus/MainMovedCounts.spec.ts':                         1,
  'src/services/hephaestus/MergedTreeGateRun.spec.ts':                       1,
  'src/services/hephaestus/MergedTreeGateRuns.spec.ts':                      1,
  'src/services/hephaestus/MergedTreeGateRuns.ts':                           1,
  'src/services/hephaestus/MonitorSnapshotAssembly.spec.ts':                 1,
  'src/services/hephaestus/MonitorSnapshotAssembly.ts':                      1,
  'src/services/hephaestus/NeedTickets.spec.ts':                             1,
  'src/services/hephaestus/PipelineAgentSessions.project.spec.ts':           1,
  'src/services/hephaestus/PipelineAgentSessions.spec.ts':                   1,
  'src/services/hephaestus/PipelineAgentSessions.ts':                        2,
  'src/services/hephaestus/PipelineChecking.spec.ts':                        1,
  'src/services/hephaestus/PipelineChecking.ts':                             1,
  'src/services/hephaestus/Presence.spec.ts':                                1,
  'src/services/hephaestus/PresenceDocumentAssembly.spec.ts':                1,
  'src/services/hephaestus/QuestionRouting.spec.ts':                         1,
  'src/services/hephaestus/QuestionRouting.ts':                              1,
  'src/services/hephaestus/RedHandoff.spec.ts':                              1,
  'src/services/hephaestus/Regrouping.integration.spec.ts':                  1,
  'src/services/hephaestus/Regrouping.spec.ts':                              1,
  'src/services/hephaestus/Restart.spec.ts':                                 1,
  'src/services/hephaestus/SessionConfinement.spec.ts':                      1,
  'src/services/hephaestus/SessionPlace.spec.ts':                            1,
  'src/services/hephaestus/SessionPlace.ts':                                 1,
  'src/services/hephaestus/StartClassification.spec.ts':                     1,
  'src/services/hephaestus/StartGate.spec.ts':                               1,
  'src/services/hephaestus/TalosChildren.spec.ts':                           1,
  'src/services/hephaestus/TalosConnection.spec.ts':                         1,
  'src/services/hephaestus/TalosLines.spec.ts':                              1,
  'src/services/hephaestus/TalosStart.integration.spec.ts':                  1,
  'src/services/hephaestus/TalosStart.spec.ts':                              1,
  'src/services/hephaestus/TalosStart.ts':                                   1,
  'src/services/hephaestus/TicketDocumentsAssembly.spec.ts':                 1,
  'src/services/hephaestus/UnreadableJobFileIncident.spec.ts':               1,
  'src/services/hephaestus/UnreadableJobFileIncident.ts':                    1,
  'src/services/hephaestus/UnreadablePipelineGate.spec.ts':                  1,
  'src/services/hephaestus/UsageLimits.spec.ts':                             1,
  'src/services/hephaestus/WorkerProfiles.airlock.integration.spec.ts':      1,
  'src/services/hephaestus/WorkerProfiles.entities.spec.ts':                 1,
  'src/services/hephaestus/WorkerProfiles.nestedCheckout.spec.ts':           1,
  'src/services/hephaestus/WorkerProfiles.spec.ts':                          1,
  'src/services/hephaestus/WorkerProfiles.ts':                               1,
  'src/services/hephaestus/testing/AirlocksHarness.ts':                      1,
  'src/services/lifecycle/CachingChecks.spec.ts':                            1,
  'src/services/lifecycle/CachingChecks.ts':                                 1,
  'src/services/lifecycle/Customs.mergeCheck.spec.ts':                       1,
  'src/services/lifecycle/Customs.pipelineAgent.spec.ts':                    1,
  'src/services/lifecycle/Customs.projectScope.spec.ts':                     1,
  'src/services/lifecycle/Customs.provenance.spec.ts':                       1,
  'src/services/lifecycle/Customs.spec.ts':                                  1,
  'src/services/lifecycle/Customs.ts':                                       1,
  'src/services/lifecycle/Customs.verification.spec.ts':                     1,
  'src/services/lifecycle/GateLineRun.spec.ts':                              1,
  'src/services/lifecycle/GateRun.entities.spec.ts':                         1,
  'src/services/lifecycle/GateRun.integration.spec.ts':                      1,
  'src/services/lifecycle/GateRun.spec.ts':                                  1,
  'src/services/lifecycle/GateRun.ts':                                       1,
  'src/services/lifecycle/Landing.spec.ts':                                  1,
  'src/services/lifecycle/Landing.ts':                                       1,
  'src/services/lifecycle/MergeRun.owners.spec.ts':                          1,
  'src/services/lifecycle/MergeRun.projectScope.spec.ts':                    1,
  'src/services/lifecycle/MergeRun.ts':                                      1,
  'src/services/lifecycle/ProposalTwiceRun.integration.spec.ts':             1,
  'src/services/lifecycle/ReviewOutcome.settled.spec.ts':                    1,
  'src/services/lifecycle/ReviewOutcome.spec.ts':                            1,
  'src/services/lifecycle/ReviewOutcome.threshold.spec.ts':                  1,
  'src/services/lifecycle/ReviewOutcome.ts':                                 1,
  'src/services/render/BoardFacts.spec.ts':                                  1,
  'src/services/render/PagePayloadAssembly.spec.ts':                         1,
  'src/services/render/PipelineFactsAssembly.spec.ts':                       1,
  'src/services/render/PipelineFlowGraph.spec.ts':                           1,
  'src/services/store/BoardStore.contract.spec.ts':                          1,
  'src/services/store/BoardStore.ts':                                        1,
  'src/services/store/LocalFilesBoardStore.integration.spec.ts':             1,
  'src/services/store/LocalFilesBoardStore.spec.ts':                         1,
  'src/services/tracker/GenerationLock.integration.spec.ts':                 1,
  'src/services/tracker/GenerationLock.spec.ts':                             1,
  'src/services/tracker/GenerationLock.ts':                                  1,
  'src/services/tracker/HoldJournal.spec.ts':                                1,
  'src/services/tracker/PictureStore.spec.ts':                               1,
  'src/services/tracker/ProjectLocation.spec.ts':                            1,
  'src/services/tracker/RegisteredRepositoryRoots.spec.ts':                  1,
  'src/services/tracker/TrackerLock.integration.spec.ts':                    1,
  'src/services/tracker/TrackerPipeline.entitiesInAFolder.spec.ts':          1,
  'src/services/tracker/TrackerPipeline.spec.ts':                            1,
  'src/services/tracker/TrackerPipeline.ts':                                 1,
  'src/services/tracker/Workspace.integration.spec.ts':                      1,
  'src/services/tracker/Workspace.projectLookup.spec.ts':                    1,
  'src/services/tracker/Workspace.ts':                                       1,
  'src/shared/@types/ControlContext.ts':                                     1,
  'src/shared/BranchNames.spec.ts':                                          1,
  'src/shared/Environment.integration.spec.ts':                              1,
  'src/shared/Environment.ts':                                               1,
  'src/shared/constants/HephaestusApiContracts.parity.spec.ts':              1,
  'src/shared/monitor/AttentionEntries.ts':                                  1,
  'src/shared/monitor/utils/NoticeWordingUtil.spec.ts':                      1,
  'src/shared/monitor/utils/OpenDecisionsUtil.spec.ts':                      1,
  'src/shared/rework/utils/ReworkCountUtil.spec.ts':                         1,
  'src/shared/utils/EntityFoldersUtil.spec.ts':                              1,
  'src/testing/BoundaryRecordings.ts':                                       1,
  'src/testing/CheckRecordingStamps.integration.spec.ts':                    1,
  'src/testing/ChildProcessCaseTimeout.ts':                                  1,
  'src/testing/DrivePassHarness.ts':                                         1,
  'src/testing/EntityForgeFixture.ts':                                       1,
  'src/testing/EntityForgeScenarios.spec.ts':                                1,
  'src/testing/EntityForgeScenarios.ts':                                     1,
  'src/testing/FakeAgentAdapter.ts':                                         1,
  'src/testing/FakeReportingSessions.spec.ts':                               1,
  'src/testing/FakeReportingSessions.ts':                                    1,
  'src/testing/ImportGraph.spec.ts':                                         1,
  'src/testing/ImportGraph.ts':                                              1,
  'src/testing/LockRetryWaits.ts':                                           1,
  'src/testing/ProcessesInFolder.integration.spec.ts':                       1,
  'src/testing/ProgramTraps.spec.ts':                                        1,
  'src/testing/RecordedBoundaryPrograms.spec.ts':                            1,
  'src/testing/RecordedGateLines.confinement.integration.spec.ts':           1,
  'src/testing/RecordedGateLines.gateRun.integration.spec.ts':               1,
  'src/testing/RecordedGateLines.spec.ts':                                   1,
  'src/testing/RecordedGateLines.ts':                                        1,
  'src/testing/RecordedGit.spec.ts':                                         1,
  'src/testing/RecordedGit.ts':                                              2,
  'src/testing/RecordedGitFlow.ts':                                          1,
  'src/testing/RecordedGitScenarios.ts':                                     1,
  'src/testing/RecordedHephaestusFetch.spec.ts':                             1,
  'src/testing/RecordedHephaestusFetch.ts':                                  1,
  'src/testing/RecordedLocalEndpoint.spec.ts':                               1,
  'src/testing/RecordedLocalEndpoint.ts':                                    1,
  'src/testing/RecordedProcessTable.ts':                                     1,
  'src/testing/RecordedTalosStages.ts':                                      1,
  'src/testing/RecordingStamps.spec.ts':                                     1,
  'src/testing/RepositorySources.spec.ts':                                   1,
  'src/testing/TestRunLeakCheck.gitState.spec.ts':                           1,
  'src/testing/TestRunLeakCheck.integration.spec.ts':                        1,
  'src/testing/TestRunReport.ts':                                            1,
  'src/testing/ToolGuard.integration.spec.ts':                               1,
  'src/testing/TrackerIsolation.integration.spec.ts':                        1,
  'src/testing/TwoTrackerScenarios.spec.ts':                                 1,
  'src/testing/TwoTrackerScenarios.ts':                                      1,
  'src/testing/fake-agent/RecordedClaudeLines.ts':                           1,
  'system-versions/utils/CompatibilityRegistryUtil.spec.ts':                 1,
};

/** Files whose comments name a reference, each with its count of such comments; it only shrinks. */
const REFERENCES_AWAITING_THE_SWEEP: Readonly<Record<string, number>> = {
  'forge-contracts/@types/BoardConversationDocuments.ts':                     1,
  'forge-contracts/@types/ForgeControlCommand.ts':                            1,
  'forge-contracts/@types/IdentityDocument.ts':                               1,
  'forge-contracts/@types/MonitorSnapshotDocument.ts':                        1,
  'src/adapters/@types/LaunchSnapshot.ts':                                    1,
  'src/adapters/airlock-facts/AirlockFactsIngestion.ts':                      1,
  'src/adapters/job-start/JobStartIngestion.ts':                              2,
  'src/adapters/log/LogRecordProblem.spec.ts':                                1,
  'src/adapters/progress/utils/ProgressFileMappingUtil.spec.ts':              1,
  'src/adapters/red-handoff/RedHandoffIngestion.ts':                          1,
  'src/adapters/reports/ReportSchemas.spec.ts':                               1,
  'src/adapters/reports/ReportSchemas.ts':                                    3,
  'src/adapters/stage-statement/StageStatementIngestion.ts':                  1,
  'src/adapters/tickets/utils/TicketAcceptanceUtil.spec.ts':                  1,
  'src/lib/claude-code/ClaudeCodeAdapter.stageFolders.spec.ts':               1,
  'src/lib/claude-code/ClaudeStreamLines.spec.ts':                            1,
  'src/lib/claude-code/ClaudeStreamLines.ts':                                 1,
  'src/lib/claude-code/ClaudeStreamMapper.ts':                                1,
  'src/lib/process-identity/ProcessSupervision.contract.integration.spec.ts': 1,
  'src/lib/tracker-model/@types/OptionConsequences.ts':                       1,
  'src/lib/tracker-model/@types/PipelineFacts.ts':                            1,
  'src/lib/tracker-model/@types/PipelineSetup.ts':                            1,
  'src/lib/tracker-model/@types/PlaybookStep.ts':                             5,
  'src/lib/tracker-model/Board.claim.spec.ts':                                1,
  'src/lib/tracker-model/Board.stages.spec.ts':                               2,
  'src/lib/tracker-model/Board.ticketSettings.spec.ts':                       1,
  'src/lib/tracker-model/Board.ts':                                           9,
  'src/lib/tracker-model/BoardRefusal.ts':                                    1,
  'src/lib/tracker-model/Findings.spec.ts':                                   1,
  'src/lib/tracker-model/IncidentMoves.spec.ts':                              2,
  'src/lib/tracker-model/PipelineSetups.applyEntities.spec.ts':               1,
  'src/lib/tracker-model/PipelineSetups.ts':                                  4,
  'src/lib/tracker-model/Playbook.entityCaps.spec.ts':                        1,
  'src/lib/tracker-model/Playbook.needs.spec.ts':                             1,
  'src/lib/tracker-model/Playbook.stages.spec.ts':                            4,
  'src/lib/tracker-model/Playbook.ts':                                        3,
  'src/lib/tracker-model/TicketDocuments.spec.ts':                            1,
  'src/lib/tracker-model/TicketMoves.ts':                                     3,
  'src/lib/tracker-model/TicketSettings.ts':                                  1,
  'src/lib/tracker-model/TicketStageRows.spec.ts':                            1,
  'src/lib/tracker-model/TicketStageRows.ts':                                 4,
  'src/lib/tracker-model/constants/EntityDecisionAnswers.ts':                 1,
  'src/lib/tracker-model/constants/LogRecordSchema.ts':                       1,
  'src/lib/tracker-model/constants/TicketStages.ts':                          1,
  'src/lib/tracker-model/utils/EntityOwnershipUtil.spec.ts':                  1,
  'src/lib/tracker-model/utils/EntityOwnershipUtil.ts':                       2,
  'src/lib/tracker-model/utils/EntityValidationUtil.spec.ts':                 1,
  'src/lib/tracker-model/utils/TicketDocumentStandingUtil.spec.ts':           1,
  'src/lib/tracker-model/utils/TicketIdUtil.ts':                              1,
  'src/lib/tracker-model/utils/TicketStageUtil.spec.ts':                      1,
  'src/services/control/AirlockControls.spec.ts':                             1,
  'src/services/control/Bouncer.spec.ts':                                     1,
  'src/services/control/Bouncer.ts':                                          2,
  'src/services/control/GateProfileControls.spec.ts':                         1,
  'src/services/control/JobControls.spec.ts':                                 1,
  'src/services/control/PipelineAgentControls.spec.ts':                       1,
  'src/services/control/PipelineSetupControls.entities.spec.ts':              3,
  'src/services/control/PipelineSetupControls.spec.ts':                       2,
  'src/services/control/TicketControls.spec.ts':                              3,
  'src/services/control/TicketControls.ts':                                   2,
  'src/services/hephaestus/Airlocks.conflicts.spec.ts':                       4,
  'src/services/hephaestus/Airlocks.constitutionCommit.spec.ts':              1,
  'src/services/hephaestus/Airlocks.crossing.spec.ts':                        3,
  'src/services/hephaestus/Airlocks.entities.spec.ts':                        2,
  'src/services/hephaestus/Airlocks.entityConstitutions.spec.ts':             1,
  'src/services/hephaestus/Airlocks.gateBesideThePass.spec.ts':               1,
  'src/services/hephaestus/Airlocks.interruptedStart.spec.ts':                1,
  'src/services/hephaestus/Airlocks.mainLine.spec.ts':                        1,
  'src/services/hephaestus/Airlocks.siblingTrackers.spec.ts':                 1,
  'src/services/hephaestus/Airlocks.ts':                                      15,
  'src/services/hephaestus/ConstitutionCommits.ts':                           1,
  'src/services/hephaestus/CrashMatrix.integration.spec.ts':                  1,
  'src/services/hephaestus/CrashMatrix.merges.spec.ts':                       1,
  'src/services/hephaestus/CrashMatrix.spec.ts':                              2,
  'src/services/hephaestus/CrossingStages.spec.ts':                           1,
  'src/services/hephaestus/CrossingStages.ts':                                15,
  'src/services/hephaestus/DependentFixTickets.ts':                           1,
  'src/services/hephaestus/DrivePass.heldTargets.spec.ts':                    1,
  'src/services/hephaestus/DrivePass.ts':                                     5,
  'src/services/hephaestus/EntityDecisionAnswers.spec.ts':                    2,
  'src/services/hephaestus/EntityDecisionAnswers.ts':                         6,
  'src/services/hephaestus/HatchInbox.documentAgents.spec.ts':                1,
  'src/services/hephaestus/HatchInbox.ts':                                    1,
  'src/services/hephaestus/InstructionFiles.project.spec.ts':                 1,
  'src/services/hephaestus/InstructionFiles.spec.ts':                         1,
  'src/services/hephaestus/InstructionFiles.ts':                              2,
  'src/services/hephaestus/IntakeSessions.spec.ts':                           1,
  'src/services/hephaestus/JobLaunch.crossing.spec.ts':                       1,
  'src/services/hephaestus/JobLaunch.deniedRoots.spec.ts':                    1,
  'src/services/hephaestus/JobLaunch.entityForge.spec.ts':                    2,
  'src/services/hephaestus/JobLaunch.projectScope.spec.ts':                   3,
  'src/services/hephaestus/JobLaunch.retry.spec.ts':                          3,
  'src/services/hephaestus/JobLaunch.stageReviewBar.spec.ts':                 1,
  'src/services/hephaestus/JobLaunch.targetCatchUp.spec.ts':                  1,
  'src/services/hephaestus/JobLaunch.ticketDocuments.spec.ts':                1,
  'src/services/hephaestus/JobLaunch.ts':                                     23,
  'src/services/hephaestus/JobLaunch.unreadableFiles.spec.ts':                1,
  'src/services/hephaestus/JobLiveFactsReader.spec.ts':                       2,
  'src/services/hephaestus/JobResumption.adapt.spec.ts':                      1,
  'src/services/hephaestus/JobResumption.airlockOwner.spec.ts':               1,
  'src/services/hephaestus/JobResumption.entities.spec.ts':                   2,
  'src/services/hephaestus/JobResumption.spec.ts':                            1,
  'src/services/hephaestus/JobResumption.ts':                                 4,
  'src/services/hephaestus/NeedTickets.spec.ts':                              3,
  'src/services/hephaestus/NeedTickets.ts':                                   7,
  'src/services/hephaestus/PipelineAgentSessions.project.spec.ts':            2,
  'src/services/hephaestus/PipelineAgentSessions.spec.ts':                    1,
  'src/services/hephaestus/PipelineAgentSessions.ts':                         2,
  'src/services/hephaestus/PipelineChecking.spec.ts':                         1,
  'src/services/hephaestus/WorkerProfiles.entities.spec.ts':                  1,
  'src/services/hephaestus/WorkerProfiles.ts':                                4,
  'src/services/hephaestus/testing/AirlockAnswerSets.ts':                     3,
  'src/services/hephaestus/testing/CrossingStageRun.ts':                      1,
  'src/services/hephaestus/testing/GroupAirlockAnswers.ts':                   1,
  'src/services/lifecycle/Customs.mergeCheck.spec.ts':                        2,
  'src/services/lifecycle/Customs.pipelineAgent.spec.ts':                     1,
  'src/services/lifecycle/Customs.projectScope.spec.ts':                      1,
  'src/services/lifecycle/Customs.provenance.spec.ts':                        2,
  'src/services/lifecycle/Customs.spec.ts':                                   1,
  'src/services/lifecycle/Customs.ts':                                        39,
  'src/services/lifecycle/Customs.verification.spec.ts':                      2,
  'src/services/lifecycle/MergeRun.owners.spec.ts':                           1,
  'src/services/lifecycle/MergeRun.projectScope.spec.ts':                     1,
  'src/services/lifecycle/MergeRun.ts':                                       10,
  'src/services/lifecycle/ReviewOutcome.ts':                                  3,
  'src/services/render/PipelineFactsAssembly.spec.ts':                        1,
  'src/services/render/PipelineFactsAssembly.ts':                             1,
  'src/services/render/PipelineFlowGraph.spec.ts':                            1,
  'src/services/render/PipelineFlowGraph.ts':                                 1,
  'src/services/tracker/TrackerReader.stageCounts.spec.ts':                   2,
  'src/shared/BranchNames.spec.ts':                                           1,
  'src/shared/Environment.ts':                                                1,
  'src/shared/monitor/utils/NoticeWordingUtil.ts':                            1,
  'src/testing/EntityForgeScenarios.spec.ts':                                 1,
  'src/testing/EntityForgeScenarios.ts':                                      1,
  'src/testing/FakeAgentAdapter.ts':                                          2,
  'src/testing/FakeReportingSessions.ts':                                     1,
  'src/testing/RecordedGitFlow.ts':                                           5,
  'src/testing/RecordedGitScenarioCalls.ts':                                  4,
  'src/testing/ToolGuard.ts':                                                 1,
  'src/testing/fake-agent/ClaudeWireRecorder.ts':                             1,
  'src/testing/fake-agent/RecordedClaudeLines.ts':                            1,
};
const ONLY_A_LINE_BREAK_BETWEEN = /^[ \t]*\r?\n[ \t]*$/;

interface CommentRanges {
  readonly ranges:                          ts.CommentRange[];
  readonly positionsLeadingADocumentedNode: ReadonlySet<number>;
}

const DOCUMENTED_DECLARATION_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.VariableStatement,
  ts.SyntaxKind.ExportDeclaration,
  ts.SyntaxKind.ExportAssignment,
]);
// `src/testing/ToolGuard.ts` wraps `describe` and `test` as `describeWhen…` and `testWhen…`, which take a docblock the same way.
const DOCUMENTED_CALLEE_NAME = /^(?:test|describe|it)(?:When[A-Z]\w*)?$/;

function calleeRootNameOf(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression)) {
    return calleeRootNameOf(expression.expression);
  }
  return null;
}

function nodeTakesADocblock(node: ts.Node): boolean {
  if (DOCUMENTED_DECLARATION_KINDS.has(node.kind)) {
    return true;
  }
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
    const calleeName = calleeRootNameOf(node.expression.expression);
    return calleeName !== null && DOCUMENTED_CALLEE_NAME.test(calleeName);
  }
  return false;
}

function commentRangesOf(sourceFile: ts.SourceFile): CommentRanges {
  const rangesByPosition = new Map<number, ts.CommentRange>();
  const positionsLeadingADocumentedNode = new Set<number>();
  const text = sourceFile.getFullText();
  const collect = (node: ts.Node): void => {
    const leadingRanges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    for (const range of [...leadingRanges, ...ts.getTrailingCommentRanges(text, node.getEnd()) ?? []]) {
      rangesByPosition.set(range.pos, range);
    }
    if (nodeTakesADocblock(node)) {
      leadingRanges.forEach((range) => positionsLeadingADocumentedNode.add(range.pos));
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  collect(sourceFile.endOfFileToken);
  return { ranges: [...rangesByPosition.values()].sort((a, b) => a.pos - b.pos), positionsLeadingADocumentedNode };
}

function commentRunsOf(path: string, text: string): CommentRun[] {
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const lineOf = (position: number): number => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const { ranges, positionsLeadingADocumentedNode } = commentRangesOf(sourceFile);
  const firstCodePosition = sourceFile.statements[0]?.getStart(sourceFile) ?? sourceFile.endOfFileToken.getStart(sourceFile);
  const isDocblock = (range: ts.CommentRange, index: number): boolean => text.startsWith('/**', range.pos)
    && ((index === 0 && range.end <= firstCodePosition) || positionsLeadingADocumentedNode.has(range.pos));
  const runs: CommentRun[] = [];
  let previous: ts.CommentRange | null = null;
  for (const [index, range] of ranges.entries()) {
    const commentText = text.slice(range.pos, range.end);
    const lineCount = lineOf(range.end) - lineOf(range.pos) + 1;
    if (isDocblock(range, index)) {
      runs.push({
        firstLine: lineOf(range.pos), lineCount, isDocblock: true, text: commentText
      });
      previous = null;
      continue;
    }
    const lastRun = runs.at(-1);
    const continuesTheRun = previous !== null && lastRun !== undefined && range.kind === ts.SyntaxKind.SingleLineCommentTrivia
      && previous.kind === ts.SyntaxKind.SingleLineCommentTrivia && ONLY_A_LINE_BREAK_BETWEEN.test(text.slice(previous.end, range.pos));
    if (continuesTheRun) {
      runs[runs.length - 1] = { ...lastRun, lineCount: lastRun.lineCount + lineCount, text: `${lastRun.text}\n${commentText}` };
    } else {
      runs.push({
        firstLine: lineOf(range.pos), lineCount, isDocblock: false, text: commentText
      });
    }
    previous = range;
  }
  return runs;
}

function commentWallsIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => !run.isDocblock && run.lineCount > LONGEST_INLINE_COMMENT_LINES)
    .map((run) => `${path}:${run.firstLine} holds a ${run.lineCount}-line comment`);
}

function commentWallsOf(path: string, text: string): string[] {
  return commentWallsIn(path, commentRunsOf(path, text));
}

function longCommentsIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => run.lineCount > LONGEST_COMMENT_LINES)
    .map((run) => `${path}:${run.firstLine} holds a ${run.lineCount}-line comment`);
}

const CODE_SPAN = /`[^`\n]*`/g;

function namesAReference(commentText: string): boolean {
  const prose = commentText.replace(CODE_SPAN, '');
  return REFERENCE_PATTERNS.some((pattern) => pattern.test(prose));
}

function referencesIn(path: string, runs: readonly CommentRun[]): string[] {
  return runs
    .filter((run) => namesAReference(run.text))
    .map((run) => `${path}:${run.firstLine} names a ticket, acceptance, plan or artboard reference`);
}

function countsPerFile(findings: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) {
    const path = finding.slice(0, finding.indexOf(':'));
    counts[path] = (counts[path] ?? 0) + 1;
  }
  return counts;
}

const SOURCES = programTypeScriptSources(repositoryRootOfThisCheckout());
const commentRunsOfSource = memoisedPerSource((source) => commentRunsOf(source.path, source.text));

describe('no inline comment runs past two lines', () => {
  test('the scan reads inline comments of one line and of two lines across the tree', () => {
    const runLengths = SOURCES.flatMap((source) => commentRunsOfSource(source).filter((run) => !run.isDocblock).map((run) => run.lineCount));
    expect(runLengths.filter((lineCount) => lineCount === 1).length).toBeGreaterThan(LONGEST_INLINE_COMMENT_LINES);
    expect(runLengths.filter((lineCount) => lineCount === LONGEST_INLINE_COMMENT_LINES).length).toBeGreaterThan(LONGEST_INLINE_COMMENT_LINES);
  });

  test('no file in the tree holds a comment wall', () => {
    expect(SOURCES.flatMap((source) => commentWallsIn(source.path, commentRunsOfSource(source)))).toEqual([]);
  });

  test.each([
    ['three `//` lines in a function', 'function work(): void {\n  // one\n  // two\n  // three\n  run();\n}\n'],
    ['three `//` lines opening a file', '// one\n// two\n// three\nexport const VALUE = 1;\n'],
    ['three `//` lines closing a file', 'export const VALUE = 1;\n// one\n// two\n// three\n'],
    ['a three-line block comment', 'function work(): void {\n  /* one\n     two\n     three */\n  run();\n}\n'],
    ['a three-line `/** */` above a call in a function', 'function work(): void {\n  /** one\n   * two\n   * three */\n  run();\n}\n'],
    ['a three-line `/** */` above a return in a callback', 'run(() => {\n  /** one\n   * two\n   * three */\n  return 1;\n});\n'],
    ['a three-line `/** */` below the code that opens a file', 'run();\n/** one\n * two\n * three */\nrun();\n'],
  ])('a planted wall of %s is named', (_form, plantedText) => {
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([expect.stringContaining('3-line comment')]);
  });

  const documentedLine = (code: string): string => `/**\n * A docblock of\n * four lines.\n */\n${code}\n`;
  test.each([
    ['a file header', documentedLine('import { run } from \'./Run.ts\';')],
    ['a function', 'run();\n' + documentedLine('function work(): void {}')],
    [
      'a class, its constructor, method, accessor and property',
      documentedLine('class Work {') + documentedLine('readonly size = 1;') + documentedLine('constructor() {}') + documentedLine('run(): void {}')
        + documentedLine('get total(): number { return 1; }') + '}\n',
    ],
    ['an interface and its members', documentedLine('interface Work {') + documentedLine('readonly size: number;') + documentedLine('run(): void;') + '}\n'],
    ['a type alias', 'run();\n' + documentedLine('type Work = number;')],
    ['an enum and its member', documentedLine('enum Work {') + documentedLine('Done,') + '}\n'],
    ['a variable statement in a function', 'function work(): void {\n' + documentedLine('const size = 1;') + 'run(size);\n}\n'],
    ['an object literal property', 'run({\n' + documentedLine('size: 1,') + '});\n'],
    [
      'a tool-gated `describeWhen…()` and `testWhen…()` call',
      'run();\n' + documentedLine('describeWhenGitIsPresent(\'work\', () => {') + documentedLine('testWhenBashIsPresent(\'runs\', () => {});') + '});\n',
    ],
    ['an export', 'run();\n' + documentedLine('export { run };') + documentedLine('export default run;')],
    [
      'a `test()` and a `test.each()()` call in a `describe()` call',
      'run();\n' + documentedLine('describe(\'work\', () => {') + documentedLine('test(\'runs\', () => {});')
        + documentedLine('test.each([1])(\'runs %d\', () => {});') + documentedLine('it(\'runs\', () => {});') + '});\n',
    ],
  ])('a long docblock leading %s passes', (_form, plantedText) => {
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([]);
  });

  test('a two-line comment, a long docblock, trailing comments on code lines and `//` inside strings pass', () => {
    const plantedText = [
      '/**',
      ' * A header of',
      ' * four lines.',
      ' */',
      'function work(): void {',
      '  // one',
      '  // two',
      '  run(); // a',
      '  run(); // b',
      '  run(); // c',
      '  const address = `https://example.com/${"//"}`;',
      '  const other = \'// not a comment\';',
      '}',
    ].join('\n');
    expect(commentWallsOf('Planted.ts', plantedText)).toEqual([]);
  });
});

describe('no comment runs past five lines', () => {
  test('the scan reads docblocks of up to five lines across the tree', () => {
    const docblockLengths = SOURCES.flatMap((source) => commentRunsOfSource(source).filter((run) => run.isDocblock).map((run) => run.lineCount));
    expect(docblockLengths.filter((lineCount) => lineCount === LONGEST_COMMENT_LINES).length).toBeGreaterThan(LONGEST_COMMENT_LINES);
  });

  test('only the files awaiting the sweep hold a longer comment, each as often as listed', () => {
    expect(countsPerFile(SOURCES.flatMap((source) => longCommentsIn(source.path, commentRunsOfSource(source)))))
      .toEqual(LONG_COMMENTS_AWAITING_THE_SWEEP);
  });

  test.each([
    ['a six-line file header', '/**\n * one\n * two\n * three\n * four\n */\nexport const VALUE = 1;\n'],
    ['a six-line docblock on a function', 'run();\n/**\n * one\n * two\n * three\n * four\n */\nfunction work(): void {}\n'],
  ])('a planted %s is named', (_form, plantedText) => {
    expect(longCommentsIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([expect.stringContaining('6-line comment')]);
  });

  test('a five-line docblock passes', () => {
    const plantedText = '/**\n * one\n * two\n * three\n */\nexport const VALUE = 1;\n';
    expect(longCommentsIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([]);
  });
});

describe('no comment names a ticket, acceptance, plan or artboard reference', () => {
  test('only the files awaiting the sweep name one, each as often as listed', () => {
    expect(countsPerFile(SOURCES.flatMap((source) => referencesIn(source.path, commentRunsOfSource(source)))))
      .toEqual(REFERENCES_AWAITING_THE_SWEEP);
  });

  test.each([
    ['a ticket id', '// Refused outside its entity (E85).\nrun();\n'],
    ['an acceptance id with a part', '// As W5.6 asks.\nrun();\n'],
    ['an artboard', '/** The A2Proposal board. */\nfunction work(): void {}\n'],
    ['a work package', '// Removed by WP2.\nrun();\n'],
    ['a plan section', '// See PLAN 7.3.\nrun();\n'],
    ['a ticket number', '// Filed as ticket 12.\nrun();\n'],
  ])('a planted %s is named', (_form, plantedText) => {
    expect(referencesIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toHaveLength(1);
  });

  test('a pointer to a tracked document, a version, an id format in a code span and an id in code pass', () => {
    const plantedText = '// Why: `docs/cli.md`, "Exit codes", on ES2022 and UTF-8; ids run `P1`, `P2`.\nconst id = \'E85\';\n';
    expect(referencesIn('Planted.ts', commentRunsOf('Planted.ts', plantedText))).toEqual([]);
  });
});
