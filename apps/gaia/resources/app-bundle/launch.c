/*
 * The main executable of Gaia.app: it only runs Contents/MacOS/launch.sh beside it. It must be a real Mach-O, since macOS attaches a
 * Full Disk Access grant to a bundle only when its main executable is one; `gaia install-app` compiles it as a universal binary.
 */
#include <libgen.h>
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static const char LAUNCH_SCRIPT_NAME[] = "launch.sh";

int main(void) {
  char executablePath[PATH_MAX];
  uint32_t executablePathSize = sizeof executablePath;
  if (_NSGetExecutablePath(executablePath, &executablePathSize) != 0) return 1;

  char resolvedExecutablePath[PATH_MAX];
  if (realpath(executablePath, resolvedExecutablePath) == NULL) return 1;

  char launchScriptPath[PATH_MAX];
  int launchScriptPathLength = snprintf(launchScriptPath, sizeof launchScriptPath, "%s/%s", dirname(resolvedExecutablePath), LAUNCH_SCRIPT_NAME);
  if (launchScriptPathLength < 0 || (size_t)launchScriptPathLength >= sizeof launchScriptPath) return 1;

  /* The process stays the bundle's own, so a grant to Gaia.app reaches the script and everything it starts. */
  execl("/bin/sh", "sh", launchScriptPath, (char *)NULL);
  perror(launchScriptPath);
  return 1;
}
