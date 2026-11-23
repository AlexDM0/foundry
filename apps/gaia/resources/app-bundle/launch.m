/*
 * The main executable of Gaia.app, and the process macOS knows as Gaia for as long as Gaia runs: it runs Contents/MacOS/launch.sh beside
 * it as its child, ends with it, and answers macOS in its place. It must be a real Mach-O, since macOS attaches a Full Disk Access grant
 * to a bundle only when its main executable is one; `gaia install-app` compiles it as a universal binary.
 */
#import <AppKit/AppKit.h>
#import <libproc.h>

static NSString *const LAUNCH_SCRIPT_NAME = @"launch.sh";
static NSString *const SHELL_PROGRAM = @"/bin/sh";
/* Bounds the walk from a process up to this one: the browser is the launch script's grandchild at most. */
static const int MAXIMUM_ANCESTOR_GENERATIONS = 8;
static const int STOP_SIGNALS[] = {SIGINT, SIGTERM, SIGHUP};
static const size_t STOP_SIGNAL_COUNT = sizeof STOP_SIGNALS / sizeof STOP_SIGNALS[0];

static BOOL processDescendsFromThisOne(pid_t processIdentifier) {
  pid_t ownProcessIdentifier = getpid();
  for (int generation = 0; generation < MAXIMUM_ANCESTOR_GENERATIONS && processIdentifier > 1; generation++) {
    struct proc_bsdinfo processInformation;
    if (proc_pidinfo(processIdentifier, PROC_PIDTBSDINFO, 0, &processInformation, sizeof processInformation) != sizeof processInformation) return NO;
    processIdentifier = (pid_t)processInformation.pbi_ppid;
    if (processIdentifier == ownProcessIdentifier) return YES;
  }
  return NO;
}

/* The application that shows Gaia's window: the one with a place in the Dock among the processes the launch script started. */
static NSRunningApplication *windowApplicationOrNil(void) {
  for (NSRunningApplication *runningApplication in NSWorkspace.sharedWorkspace.runningApplications) {
    if (runningApplication.activationPolicy != NSApplicationActivationPolicyRegular) continue;
    if (processDescendsFromThisOne(runningApplication.processIdentifier)) return runningApplication;
  }
  return nil;
}

@interface GaiaLaunchDelegate : NSObject <NSApplicationDelegate>
@end

@implementation GaiaLaunchDelegate {
  NSTask *_launchScriptRun;
  NSMutableArray<dispatch_source_t> *_stopSignalSources;
}

/*
 * The launch script starts only once macOS has registered this process as Gaia: a window application started before that takes the
 * registration for itself, and macOS then counts Gaia as not running and cannot open it again.
 */
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  NSString *launchScriptPath = [NSBundle.mainBundle.executablePath.stringByResolvingSymlinksInPath.stringByDeletingLastPathComponent
    stringByAppendingPathComponent:LAUNCH_SCRIPT_NAME];
  _launchScriptRun = [[NSTask alloc] init];
  _launchScriptRun.executableURL = [NSURL fileURLWithPath:SHELL_PROGRAM];
  _launchScriptRun.arguments = @[launchScriptPath];
  _launchScriptRun.terminationHandler = ^(NSTask *endedRun) {
    exit(endedRun.terminationReason == NSTaskTerminationReasonExit ? endedRun.terminationStatus : EXIT_FAILURE);
  };
  NSError *startFailure = nil;
  if (![_launchScriptRun launchAndReturnError:&startFailure]) {
    fprintf(stderr, "%s: %s\n", launchScriptPath.fileSystemRepresentation, startFailure.localizedDescription.UTF8String);
    exit(EXIT_FAILURE);
  }
  [self passStopSignalsOn];
}

/* A stop asked of this process is asked of the launcher, which closes Gaia's window and server; this process ends when the launcher has. */
- (void)passStopSignalsOn {
  _stopSignalSources = [NSMutableArray array];
  pid_t launchScriptProcessIdentifier = _launchScriptRun.processIdentifier;
  for (size_t i = 0; i < STOP_SIGNAL_COUNT; i++) {
    int stopSignal = STOP_SIGNALS[i];
    signal(stopSignal, SIG_IGN);
    dispatch_source_t stopSignalSource = dispatch_source_create(DISPATCH_SOURCE_TYPE_SIGNAL, (uintptr_t)stopSignal, 0, dispatch_get_main_queue());
    dispatch_source_set_event_handler(stopSignalSource, ^{
      kill(launchScriptProcessIdentifier, stopSignal);
    });
    dispatch_resume(stopSignalSource);
    [_stopSignalSources addObject:stopSignalSource];
  }
}

/* Opening Gaia.app while Gaia runs brings Gaia's window forward. */
- (BOOL)applicationShouldHandleReopen:(NSApplication *)application hasVisibleWindows:(BOOL)hasVisibleWindows {
  NSRunningApplication *windowApplication = windowApplicationOrNil();
  if (windowApplication == nil) return NO;
  if (@available(macOS 14.0, *)) {
    [application yieldActivationToApplication:windowApplication];
    [windowApplication activateFromApplication:NSRunningApplication.currentApplication options:NSApplicationActivateAllWindows];
  } else {
    [windowApplication activateWithOptions:NSApplicationActivateAllWindows | NSApplicationActivateIgnoringOtherApps];
  }
  return NO;
}

/* Quitting Gaia, as a logout does, stops the launcher first; the launch script's end then ends this process. */
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)application {
  if (_launchScriptRun == nil || !_launchScriptRun.running) return NSTerminateNow;
  [_launchScriptRun terminate];
  return NSTerminateLater;
}

@end

int main(void) {
  @autoreleasepool {
    NSApplication *application = NSApplication.sharedApplication;
    GaiaLaunchDelegate *launchDelegate = [[GaiaLaunchDelegate alloc] init];
    application.delegate = launchDelegate;
    [application run];
  }
  return EXIT_SUCCESS;
}
