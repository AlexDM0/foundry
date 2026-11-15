/**
 * The form of "Add a repository" (SCREENS A4 and B4): a folder and a project name that follows the folder's name until User types one. "Add
 * and start" can be sent only with both filled, a forge program to run, and no add already on its way.
 */
import type { CommandBody }   from '../../@types/CommandDocument.ts';
import type { FleetDocument } from '../../@types/FleetDocument.ts';

export interface AddRepositoryForm {
  readonly folder:          string;
  readonly project:         string;
  readonly projectWasTyped: boolean;
}

export interface AddAndStartSurroundings {
  readonly forgeProgramIsMissing: boolean;
  readonly addIsOnItsWay:         boolean;
}

const EMPTY_FORM: AddRepositoryForm = { folder: '', project: '', projectWasTyped: false };

const TRAILING_SEPARATORS = /\/+$/;

function folderNameOf(folder: string): string {
  const withoutTrailingSeparators = folder.trim().replace(TRAILING_SEPARATORS, '');
  return withoutTrailingSeparators.slice(withoutTrailingSeparators.lastIndexOf('/') + 1);
}

function formAfterFolder(form: AddRepositoryForm, folder: string): AddRepositoryForm {
  return { folder, project: form.projectWasTyped ? form.project : folderNameOf(folder), projectWasTyped: form.projectWasTyped };
}

/** A cleared name stays empty while User types, and follows the folder's name again from the next folder on. */
function formAfterProject(form: AddRepositoryForm, project: string): AddRepositoryForm {
  return { folder: form.folder, project, projectWasTyped: project !== '' };
}

/** No forge program is known when the settings name none and Gaia found none: then no forge can be started or added. */
function forgeProgramIsMissingIn(fleetDocument: FleetDocument): boolean {
  return fleetDocument.settings.forgeProgramPath === null && fleetDocument.gaia.forgeProgramInUse === null;
}

function addAndStartCanBeSent(form: AddRepositoryForm, { forgeProgramIsMissing, addIsOnItsWay }: AddAndStartSurroundings): boolean {
  return form.folder.trim() !== '' && form.project.trim() !== '' && !forgeProgramIsMissing && !addIsOnItsWay;
}

function addCommandOf(form: AddRepositoryForm): CommandBody {
  return { kind: 'forge-add', root: form.folder.trim(), project: form.project.trim() };
}

export const AddRepositoryForm = {
  EMPTY_FORM,
  folderNameOf,
  formAfterFolder,
  formAfterProject,
  forgeProgramIsMissingIn,
  addAndStartCanBeSent,
  addCommandOf,
} as const;
