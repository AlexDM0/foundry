/**
 * The one mapping between a project path, as a tracker's tickets, gates and Customs name it, and a repository path, as git prints it. A
 * project path is relative to the project's folder, and a leading `/` makes it relative to the repository root instead. With the prefix
 * `''` both directions hand back every path without a leading `/` unchanged.
 */
const REPOSITORY_ROOT_MARKER = '/';
const SEPARATOR = '/';

function toRepositoryPath(projectPrefix: string, projectPath: string): string {
  if (projectPath.startsWith(REPOSITORY_ROOT_MARKER)) return projectPath.slice(REPOSITORY_ROOT_MARKER.length);
  if (projectPrefix === '') return projectPath;
  if (projectPath === '') return projectPrefix;
  return `${projectPrefix}${SEPARATOR}${projectPath}`;
}

/** A repository path outside the project keeps its place with a leading `/`, so mapping it back gives the same repository path. */
function toProjectPath(projectPrefix: string, repositoryPath: string): string {
  if (projectPrefix === '') return repositoryPath;
  if (repositoryPath === projectPrefix) return '';
  const projectFolder = `${projectPrefix}${SEPARATOR}`;
  if (repositoryPath.startsWith(projectFolder)) return repositoryPath.slice(projectFolder.length);
  return `${REPOSITORY_ROOT_MARKER}${repositoryPath}`;
}

export const ProjectPathsUtil = Object.freeze({
  toRepositoryPath,
  toProjectPath,
});
