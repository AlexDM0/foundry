/**
 * Code documents itself: an inline comment is a why of one or two lines, any comment (file headers and docblocks included) holds at most
 * five lines, and no comment names a ticket, acceptance or question id, a plan section or an artboard. Comments are read from the syntax
 * tree, so `//` in a string is not one; the scan proves it read runs of each size, and each form is planted.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';
import ts                         from 'typescript';

interface ScannedSource {
  readonly path: string;
  readonly text: string;
}

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
  'architecture/AgentVendorNames.spec.ts':                                        1,
  'architecture/LibraryBoundaries.spec.ts':                                       1,
  'architecture/PageImportDirection.spec.ts':                                     1,
  'architecture/RealProgramRuns.spec.ts':                                         1,
  'architecture/StyleContract.spec.ts':                                           1,
  'architecture/WorkspaceDependencies.spec.ts':                                   1,
  'page/@types/board/BoardPipelineDocuments.ts':                                  1,
  'page/DesignSystemLibrary.spec.tsx':                                            1,
  'page/Screens.visual.spec.ts':                                                  1,
  'page/api/CommandSender.spec.tsx':                                              1,
  'page/api/CommandSender.ts':                                                    1,
  'page/api/FleetStreamClient.spec.ts':                                           1,
  'page/api/FleetStreamClient.ts':                                                1,
  'page/board/api/BoardCommandClient.spec.ts':                                    1,
  'page/board/api/BoardEventStreamClient.spec.ts':                                1,
  'page/board/api/BoardEventStreamClient.ts':                                     1,
  'page/board/api/PictureUploadClient.spec.ts':                                   1,
  'page/board/api/TranscriptStreamClient.spec.ts':                                1,
  'page/board/api/TranscriptStreamClient.ts':                                     1,
  'page/board/conversation/AskItem.dom.tsx':                                      1,
  'page/board/conversation/ChatCueOccasion.spec.ts':                              1,
  'page/board/conversation/ChatThread.dom.tsx':                                   1,
  'page/board/conversation/ChatThread.tsx':                                       1,
  'page/board/conversation/ChatThreadModel.spec.ts':                              1,
  'page/board/conversation/ChatTurnWordingUtil.spec.ts':                          1,
  'page/board/conversation/Composer.dom.tsx':                                     1,
  'page/board/conversation/Composer.tsx':                                         1,
  'page/board/conversation/DecisionCard.tsx':                                     1,
  'page/board/conversation/ToolUseFold.dom.tsx':                                  1,
  'page/board/flint/BoardFlint.dom.tsx':                                          1,
  'page/board/flint/BoardFlint.tsx':                                              1,
  'page/board/flint/BoardOccasionModel.spec.ts':                                  1,
  'page/board/flint/BoardOccasionModel.ts':                                       1,
  'page/board/flint/FlintSlotHabitat.dom.tsx':                                    1,
  'page/board/flint/FlintSlotHabitat.tsx':                                        1,
  'page/board/flint/FlintSlotHabitats.spec.ts':                                   1,
  'page/board/flint/FlintSlotHabitats.ts':                                        1,
  'page/board/flint/FlintStripSlot.spec.ts':                                      1,
  'page/board/flint/QuestionsSpriteHabitat.ts':                                   1,
  'page/board/flint/QuestionsSpriteModel.spec.ts':                                1,
  'page/board/flint/QuestionsSpriteModel.ts':                                     1,
  'page/board/flint/TicketsSpriteModel.spec.ts':                                  1,
  'page/board/flint/TicketsSpriteModel.ts':                                       1,
  'page/board/flint/UseBoardOccasions.dom.tsx':                                   1,
  'page/board/flint/UseCueOnChange.dom.tsx':                                      1,
  'page/board/flint/UseHabitatHappenings.dom.tsx':                                1,
  'page/board/flint/UseHabitatHappenings.ts':                                     1,
  'page/board/flint/VisitTargetTracker.dom.tsx':                                  1,
  'page/board/flint/VisitTargetTracker.ts':                                       1,
  'page/board/markdown-editor/MarkdownEditor.tsx':                                1,
  'page/board/markdown-editor/MarkdownEditorModel.spec.ts':                       1,
  'page/board/markdown-editor/MarkdownEditorModel.ts':                            1,
  'page/board/sandboxed-html/SandboxedHtmlDocument.ts':                           1,
  'page/board/sandboxed-html/SandboxedHtmlFrame.tsx':                             1,
  'page/board/shared/CoveringPanel.ts':                                           1,
  'page/board/shared/commands/CommandButton.dom.tsx':                             1,
  'page/board/shared/commands/CommandWaitPanel.tsx':                              1,
  'page/board/shared/commands/ControlCommandSender.dom.tsx':                      1,
  'page/board/shared/commands/ControlCommandSender.ts':                           1,
  'page/board/shared/routing/DetailRoute.spec.ts':                                1,
  'page/board/shared/routing/DetailRoute.ts':                                     1,
  'page/board/shared/tickets/IntakeSessionsModel.spec.ts':                        1,
  'page/board/shell/ActivityStrip.tsx':                                           1,
  'page/board/shell/ActivityStripModel.spec.ts':                                  1,
  'page/board/shell/AgentNoticeModel.ts':                                         1,
  'page/board/shell/BoardApp.dom.tsx':                                            1,
  'page/board/shell/BoardApp.tsx':                                                1,
  'page/board/shell/DetailPanelHost.dom.tsx':                                     1,
  'page/board/shell/FinishedWorkFilter.dom.tsx':                                  1,
  'page/board/shell/FinishedWorkFilter.tsx':                                      1,
  'page/board/shell/Header.dom.tsx':                                              1,
  'page/board/shell/Header.tsx':                                                  1,
  'page/board/shell/HeaderModel.spec.ts':                                         1,
  'page/board/shell/HeaderModel.ts':                                              1,
  'page/board/shell/IncidentNotice.dom.tsx':                                      1,
  'page/board/shell/IncidentNotice.tsx':                                          1,
  'page/board/shell/IncidentNoticeModel.spec.ts':                                 1,
  'page/board/shell/WaitingOnUserModel.spec.ts':                                  1,
  'page/board/testing/PipelineFixture.ts':                                        1,
  'page/board/testing/TicketDocumentsFixture.ts':                                 1,
  'page/board/testing/WaitingOnUserFixture.ts':                                   1,
  'page/board/utils/DependencyGraphUtil.spec.ts':                                 1,
  'page/board/utils/FinishedWorkUtil.spec.ts':                                    1,
  'page/board/utils/FlintSlotCueUtil.spec.ts':                                    1,
  'page/board/utils/IncidentTrailUtil.spec.ts':                                   1,
  'page/board/utils/TimeUtil.spec.ts':                                            1,
  'page/board/utils/TimeUtil.ts':                                                 1,
  'page/board/views/agents/AgentPanelSpriteModel.spec.ts':                        1,
  'page/board/views/agents/AgentPanelSpriteModel.ts':                             1,
  'page/board/views/agents/AgentsModel.spec.ts':                                  1,
  'page/board/views/agents/AgentsModel.ts':                                       1,
  'page/board/views/agents/AgentsView.dom.tsx':                                   1,
  'page/board/views/agents/AgentsView.tsx':                                       1,
  'page/board/views/agents/JobControls.tsx':                                      1,
  'page/board/views/agents/UseAgentPanelHabitat.dom.tsx':                         1,
  'page/board/views/agents/UseAgentPanelHabitat.ts':                              1,
  'page/board/views/assistant/AssistantModel.spec.ts':                            1,
  'page/board/views/assistant/AssistantModel.ts':                                 1,
  'page/board/views/assistant/AssistantView.dom.tsx':                             1,
  'page/board/views/assistant/AssistantView.tsx':                                 1,
  'page/board/views/detail-panel/DetailFactsModel.spec.ts':                       1,
  'page/board/views/detail-panel/DetailPanel.dom.tsx':                            1,
  'page/board/views/detail-panel/RowDetailModel.spec.ts':                         1,
  'page/board/views/detail-panel/TicketDetail.dom.tsx':                           1,
  'page/board/views/detail-panel/TicketDetail.tsx':                               1,
  'page/board/views/detail-panel/TicketDetailModel.spec.ts':                      1,
  'page/board/views/detail-panel/TicketMoves.tsx':                                1,
  'page/board/views/detail-panel/TicketOverview.tsx':                             1,
  'page/board/views/detail-panel/TicketOverviewModel.spec.ts':                    1,
  'page/board/views/detail-panel/TicketOverviewModel.ts':                         1,
  'page/board/views/detail-panel/TicketTimelineModel.spec.ts':                    1,
  'page/board/views/documents/DiagramFrame.tsx':                                  1,
  'page/board/views/documents/DocumentAgentStripModel.spec.ts':                   1,
  'page/board/views/documents/DocumentAgentStripModel.ts':                        1,
  'page/board/views/documents/DocumentBlocks.tsx':                                1,
  'page/board/views/documents/DocumentChat.dom.tsx':                              1,
  'page/board/views/documents/DocumentChat.tsx':                                  1,
  'page/board/views/documents/DocumentChatModel.spec.ts':                         1,
  'page/board/views/documents/DocumentChatModel.ts':                              1,
  'page/board/views/documents/DocumentCodeEditor.dom.tsx':                        1,
  'page/board/views/documents/DocumentCodeEditor.tsx':                            1,
  'page/board/views/documents/DocumentPreview.dom.tsx':                           1,
  'page/board/views/documents/DocumentPreview.tsx':                               1,
  'page/board/views/documents/DocumentQuestionCard.tsx':                          1,
  'page/board/views/documents/DocumentQuestionsModel.spec.ts':                    1,
  'page/board/views/documents/DocumentQuestionsModel.ts':                         1,
  'page/board/views/documents/DocumentSelectionModel.spec.ts':                    1,
  'page/board/views/documents/DocumentSelectionModel.ts':                         1,
  'page/board/views/documents/EffectTreeModel.spec.ts':                           1,
  'page/board/views/documents/EffectTreeModel.ts':                                1,
  'page/board/views/documents/TicketDocumentsView.dom.tsx':                       1,
  'page/board/views/documents/TicketDocumentsView.tsx':                           1,
  'page/board/views/documents/TicketDocumentsViewModel.spec.ts':                  1,
  'page/board/views/documents/TicketDocumentsViewModel.ts':                       1,
  'page/board/views/epics/EpicsModel.spec.ts':                                    1,
  'page/board/views/epics/EpicsModel.ts':                                         1,
  'page/board/views/epics/EpicsView.dom.tsx':                                     1,
  'page/board/views/epics/EpicsView.tsx':                                         1,
  'page/board/views/intake/IntakeChat.tsx':                                       1,
  'page/board/views/intake/IntakeChatPane.tsx':                                   1,
  'page/board/views/intake/IntakeModel.spec.ts':                                  1,
  'page/board/views/intake/IntakeModel.ts':                                       1,
  'page/board/views/intake/IntakeView.dom.tsx':                                   1,
  'page/board/views/intake/PictureAttachments.dom.tsx':                           1,
  'page/board/views/intake/PictureAttachmentsModel.spec.ts':                      1,
  'page/board/views/kanban/KanbanCardTextUtil.spec.ts':                           1,
  'page/board/views/kanban/KanbanEntityFilterModel.spec.ts':                      1,
  'page/board/views/kanban/KanbanEntityFilterModel.ts':                           1,
  'page/board/views/kanban/KanbanEntityRail.dom.tsx':                             1,
  'page/board/views/kanban/KanbanFilterSections.dom.tsx':                         1,
  'page/board/views/kanban/KanbanModel.entities.spec.ts':                         1,
  'page/board/views/kanban/KanbanModel.spec.ts':                                  1,
  'page/board/views/kanban/KanbanModel.ts':                                       1,
  'page/board/views/kanban/KanbanView.dom.tsx':                                   1,
  'page/board/views/kanban/KanbanView.tsx':                                       1,
  'page/board/views/merge-queue/MergeQueueModel.spec.ts':                         1,
  'page/board/views/merge-queue/MergeQueueModel.ts':                              1,
  'page/board/views/merge-queue/MergeQueueSpriteModel.spec.ts':                   1,
  'page/board/views/merge-queue/MergeQueueView.dom.tsx':                          1,
  'page/board/views/pipeline/FlowWorkspace.tsx':                                  1,
  'page/board/views/pipeline/PipelineView.dom.tsx':                               1,
  'page/board/views/pipeline/PipelineView.tsx':                                   1,
  'page/board/views/pipeline/PipelineViewModel.levels.spec.ts':                   1,
  'page/board/views/pipeline/PipelineViewModel.spec.ts':                          1,
  'page/board/views/pipeline/PipelineViewModel.ts':                               1,
  'page/board/views/pipeline/agent-panel/PipelineAgentPanel.dom.tsx':             1,
  'page/board/views/pipeline/agent-panel/PipelineAgentPanel.tsx':                 1,
  'page/board/views/pipeline/agent-panel/PipelineAgentPanelModel.levels.spec.ts': 1,
  'page/board/views/pipeline/agent-panel/PipelineAgentPanelModel.spec.ts':        1,
  'page/board/views/pipeline/agent-panel/PipelineAgentPanelModel.ts':             1,
  'page/board/views/pipeline/agent/AgentChoiceModel.spec.ts':                     1,
  'page/board/views/pipeline/agent/AgentChoiceModel.ts':                          1,
  'page/board/views/pipeline/agent/AgentLaunchAndTools.dom.tsx':                  1,
  'page/board/views/pipeline/agent/AgentProgramPanel.tsx':                        1,
  'page/board/views/pipeline/agent/ToolListDialog.tsx':                           1,
  'page/board/views/pipeline/agent/ToolListModel.spec.ts':                        1,
  'page/board/views/pipeline/agent/ToolListModel.ts':                             1,
  'page/board/views/pipeline/apply/ApplyChangesDialog.dom.tsx':                   1,
  'page/board/views/pipeline/apply/ApplyChangesDialog.tsx':                       1,
  'page/board/views/pipeline/apply/ApplyChangesDialogModel.spec.ts':              1,
  'page/board/views/pipeline/apply/ApplyChangesDialogModel.ts':                   1,
  'page/board/views/pipeline/apply/ApplyDialog.dom.tsx':                          1,
  'page/board/views/pipeline/apply/ApplyDialog.tsx':                              1,
  'page/board/views/pipeline/apply/ApplyDialogModel.spec.ts':                     1,
  'page/board/views/pipeline/apply/ApplyDialogModel.ts':                          1,
  'page/board/views/pipeline/apply/ApplyPendingState.tsx':                        1,
  'page/board/views/pipeline/apply/ApplyPendingStateModel.spec.ts':               1,
  'page/board/views/pipeline/apply/ApplyPendingStateModel.ts':                    1,
  'page/board/views/pipeline/apply/ChangeListModel.spec.ts':                      1,
  'page/board/views/pipeline/apply/ChangeListModel.ts':                           1,
  'page/board/views/pipeline/apply/EntityAssignmentProgressModel.spec.ts':        1,
  'page/board/views/pipeline/dialogs/AgentStepDialog.dom.tsx':                    1,
  'page/board/views/pipeline/dialogs/AgentStepDialog.tsx':                        1,
  'page/board/views/pipeline/dialogs/AgentStepDialogModel.spec.ts':               1,
  'page/board/views/pipeline/dialogs/GateDialog.dom.tsx':                         1,
  'page/board/views/pipeline/dialogs/GateDialog.tsx':                             1,
  'page/board/views/pipeline/dialogs/GateDialogModel.spec.ts':                    1,
  'page/board/views/pipeline/dialogs/GateDialogModel.ts':                         1,
  'page/board/views/pipeline/dialogs/InstructionsEditor.tsx':                     1,
  'page/board/views/pipeline/dialogs/InstructionsEditorModel.spec.ts':            1,
  'page/board/views/pipeline/dialogs/MergeStepDialog.dom.tsx':                    1,
  'page/board/views/pipeline/dialogs/MergeStepDialog.tsx':                        1,
  'page/board/views/pipeline/dialogs/PipelineDialogs.tsx':                        1,
  'page/board/views/pipeline/dialogs/PipelineDocumentsSection.tsx':               1,
  'page/board/views/pipeline/dialogs/PipelineDocumentsSectionModel.spec.ts':      1,
  'page/board/views/pipeline/dialogs/ProfileBox.tsx':                             1,
  'page/board/views/pipeline/dialogs/RereviewSettings.tsx':                       1,
  'page/board/views/pipeline/dialogs/RereviewSettingsModel.spec.ts':              1,
  'page/board/views/pipeline/dialogs/ReviewStepDialog.dom.tsx':                   1,
  'page/board/views/pipeline/dialogs/ReviewStepDialog.tsx':                       1,
  'page/board/views/pipeline/editing/CopyBetweenEntitiesDialog.dom.tsx':          1,
  'page/board/views/pipeline/editing/CopyBetweenEntitiesDialogModel.spec.ts':     1,
  'page/board/views/pipeline/editing/CopyBetweenEntitiesDialogModel.ts':          1,
  'page/board/views/pipeline/editing/EditingAside.dom.tsx':                       1,
  'page/board/views/pipeline/editing/EditingAside.tsx':                           1,
  'page/board/views/pipeline/editing/MonorepoEditing.dom.tsx':                    1,
  'page/board/views/pipeline/editing/PipelineEditingModel.spec.ts':               1,
  'page/board/views/pipeline/editing/PipelineEditingModel.ts':                    1,
  'page/board/views/pipeline/entities/ChangeGroup.dom.tsx':                       1,
  'page/board/views/pipeline/entities/ChangeGroup.tsx':                           1,
  'page/board/views/pipeline/entities/ChangeGroupModel.spec.ts':                  1,
  'page/board/views/pipeline/entities/ChangeGroupModel.ts':                       1,
  'page/board/views/pipeline/entities/ConstitutionStateTagModel.spec.ts':         1,
  'page/board/views/pipeline/entities/ConstitutionStateTagModel.ts':              1,
  'page/board/views/pipeline/entities/EntityLevelFactsModel.spec.ts':             1,
  'page/board/views/pipeline/entities/EntityLevelFactsModel.ts':                  1,
  'page/board/views/pipeline/entities/ForgeLevelPage.tsx':                        1,
  'page/board/views/pipeline/entities/ForgeLevelPageModel.spec.ts':               1,
  'page/board/views/pipeline/entities/ForgeLevelPageModel.ts':                    1,
  'page/board/views/pipeline/entities/PipelineLevelModel.spec.ts':                1,
  'page/board/views/pipeline/entities/PipelineLevelModel.ts':                     1,
  'page/board/views/pipeline/entities/PipelineLevelRail.dom.tsx':                 1,
  'page/board/views/pipeline/entities/PipelineLevelRail.tsx':                     1,
  'page/board/views/pipeline/entities/PipelineLevelRailModel.spec.ts':            1,
  'page/board/views/pipeline/entities/PipelineLevelRailModel.ts':                 1,
  'page/board/views/pipeline/flow/FlowSelection.ts':                              1,
  'page/board/views/pipeline/flow/OpenPhase.dom.tsx':                             1,
  'page/board/views/pipeline/flow/OpenPhase.tsx':                                 1,
  'page/board/views/pipeline/flow/PipelineFlowEditSender.ts':                     1,
  'page/board/views/pipeline/flow/PipelineFlowModel.spec.ts':                     1,
  'page/board/views/pipeline/flow/PipelinePhaseModel.spec.ts':                    1,
  'page/board/views/pipeline/flow/PipelinePhaseModel.ts':                         1,
  'page/board/views/pipeline/flow/StepCard.tsx':                                  1,
  'page/board/views/pipeline/gates/GatesAreaModel.spec.ts':                       1,
  'page/board/views/pipeline/gates/GatesAreaModel.ts':                            1,
  'page/board/views/pipeline/gates/GatesTable.dom.tsx':                           1,
  'page/board/views/pipeline/gates/GatesTable.tsx':                               1,
  'page/board/views/pipeline/live/EntityWorkModel.spec.ts':                       1,
  'page/board/views/pipeline/live/EntityWorkModel.ts':                            1,
  'page/board/views/pipeline/live/FlowActivityPanel.dom.tsx':                     1,
  'page/board/views/pipeline/live/FlowActivityPanel.tsx':                         1,
  'page/board/views/pipeline/live/FlowActivityPanelModel.spec.ts':                1,
  'page/board/views/pipeline/live/FlowActivityPanelModel.ts':                     1,
  'page/board/views/pipeline/live/ForgeLevelLive.tsx':                            1,
  'page/board/views/pipeline/live/ForgeSettings.dom.tsx':                         1,
  'page/board/views/pipeline/live/ForgeSettings.tsx':                             1,
  'page/board/views/pipeline/live/LiveFooter.tsx':                                1,
  'page/board/views/pipeline/live/LivePipelineModel.spec.ts':                     1,
  'page/board/views/pipeline/live/LivePipelineModel.ts':                          1,
  'page/board/views/pipeline/setup/AgentStep.dom.tsx':                            1,
  'page/board/views/pipeline/setup/AgentStep.tsx':                                1,
  'page/board/views/pipeline/setup/BillingStep.dom.tsx':                          1,
  'page/board/views/pipeline/setup/BillingStep.tsx':                              1,
  'page/board/views/pipeline/setup/BillingStepModel.spec.ts':                     1,
  'page/board/views/pipeline/setup/BillingStepModel.ts':                          1,
  'page/board/views/pipeline/setup/ConstitutionStep.dom.tsx':                     1,
  'page/board/views/pipeline/setup/ConstitutionStep.tsx':                         1,
  'page/board/views/pipeline/setup/ConstitutionStepModel.spec.ts':                1,
  'page/board/views/pipeline/setup/ConstitutionStepModel.ts':                     1,
  'page/board/views/pipeline/setup/DesignStep.dom.tsx':                           1,
  'page/board/views/pipeline/setup/DesignStep.tsx':                               1,
  'page/board/views/pipeline/setup/DesignStepModel.spec.ts':                      1,
  'page/board/views/pipeline/setup/DesignStepModel.ts':                           1,
  'page/board/views/pipeline/setup/EntitiesStep.dom.tsx':                         1,
  'page/board/views/pipeline/setup/EntitiesStep.tsx':                             1,
  'page/board/views/pipeline/setup/EntitiesStepModel.spec.ts':                    1,
  'page/board/views/pipeline/setup/EntitiesStepModel.ts':                         1,
  'page/board/views/pipeline/setup/EntityRow.tsx':                                1,
  'page/board/views/pipeline/setup/EntitySessionListModel.spec.ts':               1,
  'page/board/views/pipeline/setup/EntitySessionListModel.ts':                    1,
  'page/board/views/pipeline/setup/FoldEntityDialogModel.spec.ts':                1,
  'page/board/views/pipeline/setup/FoldEntityDialogModel.ts':                     1,
  'page/board/views/pipeline/setup/ResearchStep.dom.tsx':                         1,
  'page/board/views/pipeline/setup/ResearchStep.tsx':                             1,
  'page/board/views/pipeline/setup/ResearchStepModel.spec.ts':                    1,
  'page/board/views/pipeline/setup/ResearchStepModel.ts':                         1,
  'page/board/views/pipeline/setup/ResumeSummary.dom.tsx':                        1,
  'page/board/views/pipeline/setup/ResumeSummary.tsx':                            1,
  'page/board/views/pipeline/setup/ResumeSummaryModel.spec.ts':                   1,
  'page/board/views/pipeline/setup/ResumeSummaryModel.ts':                        1,
  'page/board/views/pipeline/setup/SetupWelcome.dom.tsx':                         1,
  'page/board/views/pipeline/setup/SetupWelcome.tsx':                             1,
  'page/board/views/pipeline/setup/SetupWelcomeModel.spec.ts':                    1,
  'page/board/views/progress/ChartPanelRoom.ts':                                  1,
  'page/board/views/progress/CustomRangePopover.dom.tsx':                         1,
  'page/board/views/progress/EpicRowGrouping.spec.ts':                            1,
  'page/board/views/progress/ProgressModel.spec.ts':                              1,
  'page/board/views/progress/ProgressView.dom.tsx':                               1,
  'page/board/views/progress/ProgressView.tsx':                                   1,
  'page/board/views/progress/TimelineSpriteModel.spec.ts':                        1,
  'page/board/views/progress/UseTimelineHabitat.dom.tsx':                         1,
  'page/board/views/questions/QuestionsView.dom.tsx':                             1,
  'page/board/views/questions/QuestionsView.tsx':                                 1,
  'page/board/views/questions/panel/QuestionAskColumn.tsx':                       1,
  'page/board/views/questions/panel/QuestionBackgroundColumn.tsx':                1,
  'page/board/views/questions/panel/QuestionPanel.dom.tsx':                       1,
  'page/board/views/questions/panel/QuestionPanel.tsx':                           1,
  'page/board/views/questions/panel/QuestionPanelModel.spec.ts':                  1,
  'page/board/views/questions/panel/QuestionPanelModel.ts':                       1,
  'page/board/views/tickets/ActiveTicketsModel.spec.ts':                          1,
  'page/board/views/tickets/InDraftModel.spec.ts':                                1,
  'page/board/views/tickets/TicketsView.dom.tsx':                                 1,
  'page/board/views/tickets/TicketsView.tsx':                                     1,
  'page/board/views/waves/WaveForecastUtil.spec.ts':                              1,
  'page/board/views/waves/WavesModel.spec.ts':                                    1,
  'page/board/views/waves/WavesView.dom.tsx':                                     1,
  'page/board/views/waves/WavesView.tsx':                                         1,
  'page/components/BrandBar.spec.tsx':                                            1,
  'page/components/BrandBar.tsx':                                                 1,
  'page/components/Callout.tsx':                                                  1,
  'page/components/GaiaMark.spec.tsx':                                            1,
  'page/components/GaiaMark.tsx':                                                 1,
  'page/components/Refusal.spec.tsx':                                             1,
  'page/components/VersionsVerdictMark.tsx':                                      1,
  'page/diagram-frame/DiagramFrameScript.ts':                                     1,
  'page/lib/brand/architecture/PackageIsolation.spec.ts':                         1,
  'page/lib/brand/architecture/StyleChecks.spec.ts':                              1,
  'page/lib/brand/architecture/StyleContract.spec.ts':                            1,
  'page/lib/design-system/@types/StateTone.ts':                                   1,
  'page/lib/design-system/architecture/CompositionLayers.spec.ts':                1,
  'page/lib/design-system/architecture/HoverMovesNothing.spec.ts':                1,
  'page/lib/design-system/architecture/PackageIsolation.spec.ts':                 1,
  'page/lib/design-system/architecture/ReducedMotionStopsEveryAnimation.spec.ts': 1,
  'page/lib/design-system/architecture/RequiredProps.spec.ts':                    1,
  'page/lib/design-system/architecture/SpacingTokens.spec.ts':                    1,
  'page/lib/design-system/architecture/StoryCoverage.spec.ts':                    1,
  'page/lib/design-system/architecture/StyleBraceBalance.spec.ts':                1,
  'page/lib/design-system/architecture/StyleContract.spec.ts':                    1,
  'page/lib/design-system/architecture/ThemeTokens.spec.ts':                      1,
  'page/lib/design-system/architecture/TokenReadsAndStartingStyles.spec.ts':      1,
  'page/lib/design-system/atoms/Button.dom.tsx':                                  1,
  'page/lib/design-system/atoms/Icon.tsx':                                        1,
  'page/lib/design-system/atoms/NumberStepper.dom.tsx':                           1,
  'page/lib/design-system/atoms/NumberStepper.tsx':                               1,
  'page/lib/design-system/atoms/Popover.dom.tsx':                                 1,
  'page/lib/design-system/atoms/Tooltip.dom.tsx':                                 1,
  'page/lib/design-system/atoms/View.dom.tsx':                                    1,
  'page/lib/design-system/atoms/View.tsx':                                        1,
  'page/lib/design-system/constants/Spacing.spec.ts':                             1,
  'page/lib/design-system/fonts/FontLoader.dom.tsx':                              1,
  'page/lib/design-system/molecules/Callout.dom.tsx':                             1,
  'page/lib/design-system/molecules/Callout.tsx':                                 1,
  'page/lib/design-system/molecules/Card.dom.tsx':                                1,
  'page/lib/design-system/molecules/Card.tsx':                                    1,
  'page/lib/design-system/molecules/ChoiceOption.dom.tsx':                        1,
  'page/lib/design-system/molecules/ChoiceOption.tsx':                            1,
  'page/lib/design-system/molecules/ConfirmStrip.dom.tsx':                        1,
  'page/lib/design-system/molecules/ConfirmStrip.tsx':                            1,
  'page/lib/design-system/molecules/KeyedLineList.dom.tsx':                       1,
  'page/lib/design-system/molecules/LogTail.dom.tsx':                             1,
  'page/lib/design-system/molecules/Menu.dom.tsx':                                1,
  'page/lib/design-system/molecules/Menu.tsx':                                    1,
  'page/lib/design-system/molecules/ModelEffortMeter.dom.tsx':                    1,
  'page/lib/design-system/molecules/SectionHead.dom.tsx':                         1,
  'page/lib/design-system/molecules/SectionHead.tsx':                             1,
  'page/lib/design-system/molecules/SegmentedControl.dom.tsx':                    1,
  'page/lib/design-system/molecules/SegmentedControl.tsx':                        1,
  'page/lib/design-system/molecules/StateBadge.dom.tsx':                          1,
  'page/lib/design-system/molecules/Stepper.dom.tsx':                             1,
  'page/lib/design-system/molecules/Stepper.tsx':                                 1,
  'page/lib/design-system/molecules/Tag.dom.tsx':                                 1,
  'page/lib/design-system/molecules/Tag.tsx':                                     1,
  'page/lib/design-system/molecules/Toast.dom.tsx':                               1,
  'page/lib/design-system/molecules/Toast.tsx':                                   1,
  'page/lib/design-system/organisms/DataTable.dom.tsx':                           1,
  'page/lib/design-system/organisms/DataTable.tsx':                               1,
  'page/lib/design-system/organisms/Dialog.dom.tsx':                              1,
  'page/lib/design-system/organisms/Dialog.tsx':                                  1,
  'page/lib/design-system/organisms/MultipleChoiceQuestion.dom.tsx':              1,
  'page/lib/design-system/organisms/MultipleChoiceQuestion.tsx':                  1,
  'page/lib/design-system/organisms/Pane.dom.tsx':                                1,
  'page/lib/design-system/organisms/ReorderableList.dom.tsx':                     1,
  'page/lib/design-system/organisms/ReorderableList.tsx':                         1,
  'page/lib/design-system/organisms/SelectionRail.dom.tsx':                       1,
  'page/lib/design-system/organisms/SelectionRail.tsx':                           1,
  'page/lib/design-system/organisms/SidePanel.dom.tsx':                           1,
  'page/lib/design-system/organisms/SidePanel.tsx':                               1,
  'page/lib/design-system/organisms/Tabs.dom.tsx':                                1,
  'page/lib/design-system/organisms/Tabs.tsx':                                    1,
  'page/lib/design-system/utils/Dismissal.dom.tsx':                               1,
  'page/lib/design-system/utils/ListPresence.dom.tsx':                            1,
  'page/lib/design-system/utils/ReorderIndexUtil.spec.ts':                        1,
  'page/lib/flint/CreateFlint.dom.tsx':                                           1,
  'page/lib/flint/CreateFlint.ts':                                                2,
  'page/lib/flint/PoseComposition.spec.ts':                                       1,
  'page/lib/flint/PoseEasing.spec.ts':                                            1,
  'page/lib/flint/SpriteHabitat.ts':                                              2,
  'page/lib/flint/SpriteMind.spec.ts':                                            1,
  'page/lib/flint/SpritePose.ts':                                                 1,
  'page/lib/flint/SpriteRenderer.dom.tsx':                                        1,
  'page/lib/flint/SpriteRenderer.ts':                                             1,
  'page/lib/flint/SpriteSensors.dom.tsx':                                         1,
  'page/lib/flint/architecture/AnimationModules.spec.ts':                         1,
  'page/lib/flint/architecture/LintRules.spec.ts':                                1,
  'page/lib/flint/architecture/PackageIsolation.spec.ts':                         1,
  'page/lib/flint/attendants/watcher-spark/WatcherSparkAttendant.spec.ts':        1,
  'page/lib/flint/behaviours/BehaviourCatalog.spec.ts':                           1,
  'page/lib/flint/behaviours/BehaviourDefinition.ts':                             1,
  'page/lib/flint/behaviours/chase-bug/ChaseBugBehaviour.spec.ts':                1,
  'page/lib/flint/behaviours/chase-bug/ChaseBugBehaviour.ts':                     1,
  'page/lib/flint/behaviours/copy/CopyBehaviour.spec.ts':                         1,
  'page/lib/flint/behaviours/copy/CopyBehaviour.ts':                              1,
  'page/lib/flint/behaviours/landing/LandingBehaviour.spec.ts':                   1,
  'page/lib/flint/behaviours/lay-bar-along/LayBarAlongBehaviour.spec.ts':         1,
  'page/lib/flint/behaviours/lay-bar-along/LayBarAlongBehaviour.ts':              1,
  'page/lib/flint/behaviours/lay-bar-along/ShimmerShapeUtil.spec.ts':             1,
  'page/lib/flint/behaviours/visit/VisitBehaviour.spec.ts':                       1,
  'page/lib/flint/behaviours/visit/VisitBehaviour.ts':                            1,
  'page/lib/flint/behaviours/wander/WanderBehaviour.spec.ts':                     1,
  'page/lib/flint/behaviours/wander/WanderBehaviour.ts':                          1,
  'page/lib/flint/demo/DemoPage.ts':                                              1,
  'page/lib/flint/drawing/ShapeWriter.dom.tsx':                                   1,
  'page/lib/flint/gestures/BlockPressUtil.spec.ts':                               1,
  'page/lib/flint/gestures/GestureCatalog.spec.ts':                               1,
  'page/lib/flint/gestures/GestureMarkUtil.spec.ts':                              1,
  'page/lib/flint/gestures/airlock/AirlockGesture.spec.ts':                       1,
  'page/lib/flint/gestures/airlock/AirlockGesture.ts':                            1,
  'page/lib/flint/gestures/ask/AskGesture.spec.ts':                               1,
  'page/lib/flint/gestures/bank-fire/BankFireGesture.spec.ts':                    1,
  'page/lib/flint/gestures/baton-pass/BatonPassGesture.spec.ts':                  1,
  'page/lib/flint/gestures/bouncer/BouncerGesture.spec.ts':                       1,
  'page/lib/flint/gestures/bug-jar/BugJarGesture.spec.ts':                        1,
  'page/lib/flint/gestures/conflict/ConflictGesture.spec.ts':                     1,
  'page/lib/flint/gestures/crash-resume/CrashResumeGesture.spec.ts':              1,
  'page/lib/flint/gestures/customs/CustomsGesture.spec.ts':                       1,
  'page/lib/flint/gestures/escaped-bug/EscapedBugGesture.spec.ts':                1,
  'page/lib/flint/gestures/forced-stop/ForcedStopGesture.spec.ts':                1,
  'page/lib/flint/gestures/gate-failed/GateFailedGesture.spec.ts':                1,
  'page/lib/flint/gestures/gate-run/GateRunGesture.spec.ts':                      1,
  'page/lib/flint/gestures/hatch/HatchGesture.spec.ts':                           1,
  'page/lib/flint/gestures/hold/HoldGesture.spec.ts':                             1,
  'page/lib/flint/gestures/incident-fuse/IncidentFuseGesture.spec.ts':            1,
  'page/lib/flint/gestures/incident-fuse/IncidentFuseProp.spec.ts':               1,
  'page/lib/flint/gestures/ink-draft/InkDraftGesture.spec.ts':                    1,
  'page/lib/flint/gestures/intercept/InterceptEnvelopeProp.spec.ts':              1,
  'page/lib/flint/gestures/intercept/InterceptGesture.spec.ts':                   1,
  'page/lib/flint/gestures/interview/InterviewGesture.spec.ts':                   1,
  'page/lib/flint/gestures/lay-bar/LayBarGesture.spec.ts':                        1,
  'page/lib/flint/gestures/listen/ListenGesture.spec.ts':                         1,
  'page/lib/flint/gestures/make-ticket/MakeTicketGesture.spec.ts':                1,
  'page/lib/flint/gestures/merge/MergeGesture.spec.ts':                           1,
  'page/lib/flint/gestures/molt/MoltGesture.spec.ts':                             1,
  'page/lib/flint/gestures/out-of-fuel/OutOfFuelGesture.spec.ts':                 1,
  'page/lib/flint/gestures/playbook/PlaybookBookProp.spec.ts':                    1,
  'page/lib/flint/gestures/playbook/PlaybookGesture.spec.ts':                     1,
  'page/lib/flint/gestures/regroup/RegroupGesture.spec.ts':                       1,
  'page/lib/flint/gestures/reorder/ReorderGesture.spec.ts':                       1,
  'page/lib/flint/gestures/research/ResearchGesture.spec.ts':                     1,
  'page/lib/flint/gestures/review/ReviewGesture.spec.ts':                         1,
  'page/lib/flint/gestures/ribbon/RibbonGesture.spec.ts':                         1,
  'page/lib/flint/gestures/sandbox/SandboxGesture.spec.ts':                       1,
  'page/lib/flint/gestures/ship/ShipGesture.spec.ts':                             1,
  'page/lib/flint/gestures/slots/SlotsGesture.spec.ts':                           1,
  'page/lib/flint/gestures/slots/SlotsGesture.ts':                                1,
  'page/lib/flint/gestures/strike-spark/StrikeSparkGesture.spec.ts':              1,
  'page/lib/flint/gestures/survey/SurveyBlueprintProp.spec.ts':                   1,
  'page/lib/flint/gestures/survey/SurveyGesture.spec.ts':                         1,
  'page/lib/flint/gestures/type/TypeGesture.spec.ts':                             1,
  'page/lib/flint/gestures/unplugged/UnpluggedGesture.spec.ts':                   1,
  'page/lib/flint/gestures/waiver/WaiverGesture.spec.ts':                         1,
  'page/lib/flint/gestures/waiver/constants/WaiverValues.ts':                     1,
  'page/lib/flint/gestures/wave/WaveGesture.spec.ts':                             1,
  'page/lib/flint/gestures/wind-down/WindDownGesture.spec.ts':                    1,
  'page/lib/flint/mind/DirectorAsk.spec.ts':                                      1,
  'page/lib/flint/mind/IntentApplication.spec.ts':                                1,
  'page/lib/flint/mind/IntentApplication.ts':                                     1,
  'page/lib/flint/mind/MindState.ts':                                             1,
  'page/lib/flint/mind/Reaching.spec.ts':                                         1,
  'page/lib/flint/mind/Reflexes.spec.ts':                                         1,
  'page/lib/flint/mind/RuleDirector.ts':                                          1,
  'page/lib/flint/mind/Steering.spec.ts':                                         1,
  'page/lib/flint/mind/utils/StanceUtil.fit.spec.ts':                             1,
  'page/lib/flint/mind/utils/StanceUtil.spec.ts':                                 1,
  'page/lib/flint/props/shapes/PaperShapeUtil.spec.ts':                           1,
  'page/lib/flint/props/shapes/SparkShapeUtil.spec.ts':                           1,
  'page/lib/flint/react/FlintConnection.spec.ts':                                 1,
  'page/lib/flint/sensors/HabitatRegistry.dom.tsx':                               1,
  'page/lib/flint/sensors/PointerSensor.dom.tsx':                                 1,
  'page/lib/flint/sensors/PointerSensor.ts':                                      1,
  'page/lib/flint/sleep/SleepSequence.spec.ts':                                   1,
  'page/lib/flint/testing/CaptureFlintFrames.ts':                                 1,
  'page/lib/flint/testing/DrawnExtentMeasure.ts':                                 1,
  'page/shared/BoardRouter.spec.ts':                                              1,
  'page/shared/BoardRouter.ts':                                                   1,
  'page/shared/HashRouter.spec.ts':                                               1,
  'page/shared/HashRouter.ts':                                                    1,
  'page/shared/MachineLoadModel.spec.ts':                                         1,
  'page/shared/add-repository/AddRepositoryFields.spec.tsx':                      1,
  'page/shared/add-repository/AddRepositoryFields.tsx':                           1,
  'page/shared/utils/ForgeCommandTextUtil.spec.ts':                               1,
  'page/shared/utils/ForgeTextUtil.spec.ts':                                      1,
  'page/shared/utils/ForgeVersionsTextUtil.spec.ts':                              1,
  'page/shared/utils/ForgeVersionsTextUtil.ts':                                   1,
  'page/shell/BrandStatusModel.spec.ts':                                          1,
  'page/shell/GaiaApp.spec.tsx':                                                  1,
  'page/shell/GaiaApp.tsx':                                                       1,
  'page/shell/PageClock.spec.ts':                                                 1,
  'page/shell/Rail.spec.tsx':                                                     1,
  'page/shell/RailModel.setup.spec.ts':                                           1,
  'page/shell/RailModel.spec.ts':                                                 1,
  'page/shell/RailModel.ts':                                                      1,
  'page/testing/ArtboardScreens.tsx':                                             1,
  'page/testing/MarkupTree.spec.ts':                                              1,
  'page/testing/MarkupTree.ts':                                                   1,
  'page/testing/ReactElementTree.spec.tsx':                                       1,
  'page/testing/ReactElementTree.ts':                                             1,
  'page/testing/RunDomSpecs.ts':                                                  1,
  'page/testing/fixtures/fleet-outage-endings.ts':                                1,
  'page/testing/fixtures/fleet-versions.ts':                                      1,
  'page/testing/fixtures/storefront-tickets-board.ts':                            1,
  'page/views/activity/ActivityModel.spec.ts':                                    1,
  'page/views/activity/ActivityModel.ts':                                         1,
  'page/views/activity/ActivityView.spec.tsx':                                    1,
  'page/views/activity/ActivityView.tsx':                                         1,
  'page/views/agents/AgentsModel.spec.ts':                                        1,
  'page/views/agents/AgentsModel.ts':                                             1,
  'page/views/agents/AgentsView.spec.tsx':                                        2,
  'page/views/agents/SelectedAgentPanel.spec.tsx':                                1,
  'page/views/attention/AttentionLayout.spec.tsx':                                1,
  'page/views/attention/AttentionLayout.tsx':                                     1,
  'page/views/attention/AttentionModel.spec.ts':                                  1,
  'page/views/attention/AttentionView.spec.tsx':                                  1,
  'page/views/attention/NoForgeYet.spec.tsx':                                     1,
  'page/views/attention/NoForgeYet.tsx':                                          1,
  'page/views/forge/ForgeLayout.setup.spec.tsx':                                  1,
  'page/views/forge/ForgeLayout.spec.tsx':                                        1,
  'page/views/forge/ForgeLayout.tsx':                                             1,
  'page/views/forge/ForgeLayout.versions.spec.tsx':                               1,
  'page/views/forge/ForgeModel.runningVersions.spec.tsx':                         1,
  'page/views/forge/ForgeModel.spec.ts':                                          1,
  'page/views/forge/ForgeModel.ts':                                               1,
  'page/views/forge/ForgeModel.versions.spec.ts':                                 1,
  'page/views/forge/ForgePresenceModel.spec.ts':                                  1,
  'page/views/forge/ForgePresenceModel.ts':                                       1,
  'page/views/forge/ForgeView.spec.tsx':                                          1,
  'page/views/forge/ForgeView.tsx':                                               1,
  'page/views/forges/AddRepositoryDialog.spec.tsx':                               1,
  'page/views/forges/AddRepositoryDialog.tsx':                                    1,
  'page/views/forges/ForgesLayout.spec.tsx':                                      1,
  'page/views/forges/ForgesLayout.tsx':                                           1,
  'page/views/forges/ForgesModel.spec.ts':                                        1,
  'page/views/forges/ForgesModel.ts':                                             1,
  'page/views/forges/ForgesView.spec.tsx':                                        1,
  'page/views/forges/ForgesView.tsx':                                             1,
  'page/views/forges/GaiaPanel.spec.tsx':                                         1,
  'page/views/forges/GaiaPanel.tsx':                                              1,
  'page/views/forges/GaiaPanelModel.spec.ts':                                     1,
  'page/views/forges/GaiaPanelModel.ts':                                          1,
  'page/views/forges/WhatNotifiesDialog.tsx':                                     1,
  'src/shared/@types/CommandVerdict.ts':                                          2,
  'src/shared/@types/ForgeReading.ts':                                            1,
  'src/shared/@types/board/BoardPipeline.ts':                                     1,
  'src/shared/constants/ContractVersions.reference.spec.ts':                      1,
  'src/shared/constants/ContractVersions.ts':                                     1,
  'src/shared/constants/GaiaCompatibilityRegistry.spec.ts':                       1,
  'src/shared/constants/GaiaCompatibilityRegistry.ts':                            1,
  'src/shared/constants/GaiaSystemVersions.ts':                                   1,
  'src/shared/constants/PageContractVersions.ts':                                 1,
  'src/shared/utils/ContractVersionUtil.spec.ts':                                 1,
  'src/shared/utils/ForgeVersionsUtil.spec.ts':                                   1,
  'src/testing/BoundaryRecordings.spec.ts':                                       1,
  'src/testing/LeakCheck.spec.ts':                                                1,
  'src/testing/LeakCheck.ts':                                                     1,
  'src/testing/RecordedAnswers.spec.ts':                                          1,
  'src/testing/RecordedAnswers.ts':                                               3,
  'src/testing/RecordedRuns.spec.ts':                                             1,
  'src/testing/RecordingStamps.spec.ts':                                          1,
  'src/testing/RecordingStamps.ts':                                               1,
  'src/testing/ScratchForge.spec.ts':                                             1,
  'src/testing/ScratchForge.ts':                                                  1,
  'src/testing/SupportedForgeRecording.ts':                                       1,
};

/** Files whose comments name a reference, each with its count of such comments; it only shrinks. */
const REFERENCES_AWAITING_THE_SWEEP: Readonly<Record<string, number>> = {
  'page/@types/CommandDocument.ts':                                 1,
  'page/@types/FleetDocument.ts':                                   1,
  'page/Screens.visual.spec.ts':                                    1,
  'page/api/CommandSender.spec.tsx':                                2,
  'page/api/FleetStreamClient.spec.ts':                             1,
  'page/board/shared/tickets/DraftRowsModel.ts':                    1,
  'page/board/testing/BoardStateFixture.ts':                        1,
  'page/board/testing/IncidentNoticeFixture.ts':                    1,
  'page/board/testing/KanbanBoardFixture.ts':                       1,
  'page/board/testing/PipelineFixture.ts':                          3,
  'page/board/testing/QuestionPanelFixture.ts':                     4,
  'page/board/testing/TicketDocumentsFixture.ts':                   14,
  'page/board/utils/IncidentTrailUtil.spec.ts':                     1,
  'page/board/views/detail-panel/LogClaimUtil.ts':                  1,
  'page/board/views/documents/CommentPopoverModel.ts':              1,
  'page/board/views/documents/DocumentAgentStripModel.ts':          2,
  'page/board/views/documents/DocumentChat.tsx':                    1,
  'page/board/views/documents/DocumentChatModel.ts':                1,
  'page/board/views/documents/DocumentQuestionCard.tsx':            1,
  'page/board/views/documents/DocumentQuestionsModel.ts':           1,
  'page/board/views/documents/DocumentSelectionModel.spec.ts':      1,
  'page/board/views/documents/TicketDocumentsView.dom.tsx':         1,
  'page/board/views/documents/TicketDocumentsViewModel.ts':         1,
  'page/board/views/intake/IntakeModel.ts':                         1,
  'page/board/views/pipeline/PipelineView.tsx':                     1,
  'page/board/views/pipeline/apply/ApplyDialog.dom.tsx':            1,
  'page/board/views/pipeline/apply/ApplyDialog.tsx':                1,
  'page/board/views/pipeline/apply/ApplyPendingState.tsx':          2,
  'page/board/views/pipeline/apply/ChangeListModel.spec.ts':        1,
  'page/board/views/pipeline/dialogs/AgentStepDialog.dom.tsx':      1,
  'page/board/views/pipeline/dialogs/AgentStepDialog.tsx':          1,
  'page/board/views/pipeline/editing/EditingAside.dom.tsx':         1,
  'page/board/views/pipeline/editing/EditingAside.tsx':             1,
  'page/board/views/pipeline/editing/PipelineEditingModel.spec.ts': 1,
  'page/board/views/pipeline/editing/PipelineEditingModel.ts':      1,
  'page/board/views/pipeline/entities/PipelineLevelRail.dom.tsx':   1,
  'page/board/views/pipeline/live/EntityWorkModel.ts':              1,
  'page/board/views/pipeline/live/FlowActivityPanel.dom.tsx':       1,
  'page/board/views/pipeline/live/FlowActivityPanel.tsx':           1,
  'page/board/views/pipeline/live/FlowActivityPanelModel.ts':       2,
  'page/board/views/pipeline/live/LiveFooter.dom.tsx':              1,
  'page/board/views/pipeline/live/LiveFooter.tsx':                  1,
  'page/board/views/pipeline/setup/BillingStep.tsx':                1,
  'page/board/views/pipeline/setup/BillingStepModel.ts':            1,
  'page/board/views/pipeline/setup/DesignStep.dom.tsx':             1,
  'page/board/views/pipeline/setup/DesignStep.tsx':                 1,
  'page/board/views/pipeline/setup/EntitiesStepModel.ts':           1,
  'page/board/views/pipeline/setup/ResearchStep.dom.tsx':           2,
  'page/board/views/pipeline/setup/ResearchStep.tsx':               1,
  'page/board/views/pipeline/setup/ResearchStepModel.ts':           1,
  'page/components/BrandBar.spec.tsx':                              1,
  'page/shared/MachineLoadModel.ts':                                2,
  'page/shared/add-repository/AddRepositoryFields.spec.tsx':        1,
  'page/shared/add-repository/AddRepositoryFields.tsx':             1,
  'page/shared/add-repository/AddRepositoryForm.spec.ts':           1,
  'page/shared/add-repository/AddRepositoryForm.ts':                1,
  'page/shared/utils/ForgeCommandTextUtil.spec.ts':                 1,
  'page/shared/utils/ForgeCommandTextUtil.ts':                      2,
  'page/shared/utils/ForgeTextUtil.ts':                             1,
  'page/shared/utils/StampTextUtil.spec.ts':                        1,
  'page/shell/BrandStatusModel.spec.ts':                            1,
  'page/shell/GaiaApp.spec.tsx':                                    1,
  'page/shell/RailModel.spec.ts':                                   1,
  'page/shell/RailModel.ts':                                        1,
  'page/shell/WindowTitle.spec.ts':                                 1,
  'page/testing/ArtboardScreens.tsx':                               27,
  'page/testing/VersionsPartsSheet.spec.tsx':                       1,
  'page/testing/VersionsPartsSheet.tsx':                            3,
  'page/testing/fixtures/fleet-at-limit.spec.ts':                   1,
  'page/testing/fixtures/fleet-at-limit.ts':                        1,
  'page/testing/fixtures/fleet-degraded.spec.ts':                   1,
  'page/testing/fixtures/fleet-degraded.ts':                        1,
  'page/testing/fixtures/fleet-empty.spec.ts':                      1,
  'page/testing/fixtures/fleet-empty.ts':                           1,
  'page/testing/fixtures/fleet-five-forges.spec.ts':                1,
  'page/testing/fixtures/fleet-five-forges.ts':                     1,
  'page/testing/fixtures/fleet-outage-endings.ts':                  1,
  'page/testing/fixtures/fleet-versions.ts':                        3,
  'page/testing/fixtures/storefront-board.ts':                      1,
  'page/testing/fixtures/storefront-tickets-board.ts':              1,
  'page/views/activity/ActivityModel.spec.ts':                      1,
  'page/views/activity/ActivityView.spec.tsx':                      1,
  'page/views/activity/ActivityView.tsx':                           1,
  'page/views/agents/AgentsModel.spec.ts':                          1,
  'page/views/agents/AgentsTable.tsx':                              1,
  'page/views/agents/AgentsView.spec.tsx':                          3,
  'page/views/agents/AgentsView.tsx':                               1,
  'page/views/attention/AttentionLayout.spec.tsx':                  1,
  'page/views/attention/AttentionLayout.tsx':                       1,
  'page/views/attention/AttentionModel.spec.ts':                    1,
  'page/views/attention/AttentionModel.ts':                         11,
  'page/views/attention/AttentionView.spec.tsx':                    1,
  'page/views/attention/AttentionView.tsx':                         2,
  'page/views/attention/NoForgeYet.spec.tsx':                       1,
  'page/views/attention/NoForgeYet.tsx':                            1,
  'page/views/forge/ForgeLayout.spec.tsx':                          1,
  'page/views/forge/ForgeLayout.tsx':                               1,
  'page/views/forge/ForgeLayout.versions.spec.tsx':                 1,
  'page/views/forge/ForgeModel.spec.ts':                            1,
  'page/views/forge/ForgeModel.ts':                                 1,
  'page/views/forge/ForgeModel.versions.spec.ts':                   1,
  'page/views/forge/ForgeView.spec.tsx':                            1,
  'page/views/forge/ForgeView.tsx':                                 1,
  'page/views/forges/AddRepositoryDialog.spec.tsx':                 1,
  'page/views/forges/AddRepositoryDialog.tsx':                      1,
  'page/views/forges/ForgesLayout.spec.tsx':                        1,
  'page/views/forges/ForgesLayout.tsx':                             1,
  'page/views/forges/ForgesModel.spec.ts':                          2,
  'page/views/forges/ForgesModel.ts':                               8,
  'page/views/forges/ForgesView.spec.tsx':                          1,
  'page/views/forges/GaiaPanel.spec.tsx':                           1,
  'page/views/forges/GaiaPanel.tsx':                                2,
  'page/views/forges/GaiaPanelModel.spec.ts':                       1,
  'page/views/forges/GaiaPanelModel.ts':                            2,
  'page/views/forges/WhatNotifiesDialog.spec.tsx':                  1,
  'page/views/forges/WhatNotifiesDialog.tsx':                       2,
  'src/shared/constants/GaiaSettingsDefaults.ts':                   1,
  'src/shared/constants/Limits.ts':                                 1,
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
// A tool-gated `describeWhen…` and `testWhen…` takes a docblock the same way.
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

const SCANNED_FOLDERS = ['src', 'page', 'architecture'];
const LIBRARY_FOLDERS = ['page/lib/design-system/', 'page/lib/flint/', 'page/lib/brand/'];
const UNSCANNED_PATH_PARTS = ['node_modules', 'storybook-static'];

function gaiaSources(): ScannedSource[] {
  const gaiaRoot = join(import.meta.dir, '..');
  return SCANNED_FOLDERS
    .flatMap((folder) => [...new Bun.Glob(`${folder}/**/*.{ts,tsx}`).scanSync({ cwd: gaiaRoot })])
    .filter((path) => !path.split('/').some((part) => UNSCANNED_PATH_PARTS.includes(part)))
    .sort()
    .map((path) => ({ path, text: readFileSync(join(gaiaRoot, path), 'utf8') }));
}

const SOURCES = gaiaSources();
const runsBySource = new Map(SOURCES.map((source) => [source, commentRunsOf(source.path, source.text)]));
const commentRunsOfSource = (source: ScannedSource): CommentRun[] => runsBySource.get(source) ?? [];

test('the scan reads the server, the page and each library', () => {
  const paths = SOURCES.map((source) => source.path);
  expect(paths).toEqual(expect.arrayContaining(['src/Main.ts', 'page/Main.tsx']));
  for (const libraryFolder of LIBRARY_FOLDERS) {
    expect(paths.some((path) => path.startsWith(libraryFolder))).toBe(true);
  }
});

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
