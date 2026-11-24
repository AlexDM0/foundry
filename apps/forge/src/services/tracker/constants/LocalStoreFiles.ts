/** The names of the local store's records and folders, each a bare name joined onto the tracker directory by `LocalStoreLayout.ts`. */
export const LOCAL_STORE_FILES = {
  PROGRESS_FILE_NAME:               'progress.json',
  PIPELINE_FILE_NAME:               'pipeline.json',
  PIPELINE_SETUP_FILE_NAME:         'pipeline-setup.json',
  GATE_PROFILES_FILE_NAME:          'gate-profiles.json',
  CONSTITUTION_SOURCES_FILE_NAME:   'constitution-sources.json',
  LOG_FILE_NAME:                    'log.jsonl',
  TICKETS_DIRECTORY_NAME:           'tickets',
  EPICS_DIRECTORY_NAME:             'epics',
  DRAFTS_DIRECTORY_NAME:            'filing-cabinet',
  COMMITTED_CONTENT_DIRECTORY_NAME: 'committed-content',
  TICKET_DOCUMENTS_DIRECTORY_NAME:  'ticket-documents',
  LOCK_DIRECTORY_NAME:              '.lock',
  HOLD_JOURNAL_FILE_NAME:           'hold-journal.json',
} as const;
