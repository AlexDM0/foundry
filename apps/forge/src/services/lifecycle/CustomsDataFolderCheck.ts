/** V5: the branch changed nothing in a data folder, at the root, in an entity home or, for a project tracker, at any depth. */
import { PRODUCT_NAMES } from '../../shared/constants/ProductNames.ts';

import type { CustomsSubject }                    from './@types/CustomsSubject.ts';
import type { CheckVerdict }                      from './@types/CustomsVerdict.ts';
import { CustomsReadings, GIT_SEPARATOR, PASSED } from './CustomsReadings.ts';

/**
 * The git paths among `gitPaths` in a data folder: at the root for a tracker at the root, as always, and directly in each of `entityHomes`
 * on a pipeline with entities; at any depth for a project tracker, whose own data folder and every sibling's lie below the root.
 */
function dataFolderPathsAmong(gitPaths: readonly string[], projectPrefix: string, entityHomes: readonly string[] = []): string[] {
  const dataFolder = CustomsReadings.protectedFormOf(PRODUCT_NAMES.DATA_FOLDER);
  const homeDataFolders = CustomsReadings.protectedHomeFoldersOf(entityHomes).map((home) => `${home}${GIT_SEPARATOR}${dataFolder}${GIT_SEPARATOR}`);
  return gitPaths.filter((gitPath) => {
    const protectedForm = CustomsReadings.protectedFormOf(gitPath);
    const segments = protectedForm.split(GIT_SEPARATOR);
    if (projectPrefix !== '') return segments.includes(dataFolder);
    return segments[0] === dataFolder || homeDataFolders.some((homeDataFolder) => protectedForm.startsWith(homeDataFolder));
  });
}

function dataFolderUntouched(subject: CustomsSubject): CheckVerdict {
  const paths = CustomsReadings.pathsChangedInRange(subject);
  if (paths === null) return CustomsReadings.refused('git-failed', [CustomsReadings.rangeOf(subject)]);
  const touched = dataFolderPathsAmong(paths, CustomsReadings.projectPrefixOf(subject), CustomsReadings.entityHomesOf(subject));
  return touched.length === 0 ? PASSED : CustomsReadings.refused('data-folder-touched', touched);
}

export const CustomsDataFolderCheck = Object.freeze({
  dataFolderPathsAmong,
  dataFolderUntouched,
});
