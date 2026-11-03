/** The files of the machine-wide registry of every tracker whose page this machine wrote, in the monitor folder, and the version it is written in. */
export const MONITOR_REGISTRY_FILES = {
  REGISTRY_FILE_NAME:  'projects.json',
  LOCK_DIRECTORY_NAME: '.lock',
  ENTRIES_KEY:         'projects',
  SUPPORTED_VERSION:   1,
} as const;
