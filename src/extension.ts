import * as vscode from 'vscode';
import { exec } from 'child_process';

let pullStatusBar: vscode.StatusBarItem | undefined;
let pendingPull: { cwd: string; behindCount: number; context: vscode.ExtensionContext } | undefined;
let lastPopupBehindCount = 0;  // only show popup when count increases
let cleanPoll: ReturnType<typeof setInterval> | undefined;  // prevent duplicate polls

function hasTrackedChanges(statusOut: string): boolean {
  return statusOut.split('\n').some(line => line.trim() && !line.startsWith('??'));
}

function doPull(cwd: string) {
  exec('git pull', { cwd }, (pullErr) => {
    if (pullErr) {
      vscode.window.showErrorMessage(`Pull failed: ${pullErr.message}`);
    } else {
      pullStatusBar?.hide();
      lastPopupBehindCount = 0;
      vscode.window.showInformationMessage('✅ Pulled latest changes.');
    }
  });
}

function showPullStatusBar(cwd: string, behindCount: number, context: vscode.ExtensionContext) {
  pendingPull = { cwd, behindCount, context };

  if (!pullStatusBar) {
    pullStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    const commandId = 'pullNotifier.triggerPull';
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => {
        if (!pendingPull) return;
        const { cwd: activeCwd, behindCount: activeCount, context: activeCtx } = pendingPull;
        exec('git status --porcelain', { cwd: activeCwd }, (_, statusOut) => {
          if (hasTrackedChanges(statusOut)) {
            vscode.window.showWarningMessage(
              'You have uncommitted changes. Please commit or stash them before pulling.'
            );
            waitForCleanThenUpdateBar(activeCwd, activeCount, activeCtx);
            return;
          }
          doPull(activeCwd);
        });
      }),
      pullStatusBar
    );
    pullStatusBar.command = commandId;
  }

  pullStatusBar.text = `$(cloud-download) ${behindCount} new commit(s) — Click to Pull`;
  pullStatusBar.tooltip = 'Remote has new commits. Click to pull now.';
  pullStatusBar.show();

  // Only show popup when commit count increases (new commits arrived), not every interval tick
  if (behindCount > lastPopupBehindCount) {
    lastPopupBehindCount = behindCount;
    vscode.window.showInformationMessage(
      `🚨 ${behindCount} new commit(s) available. Pull now?`,
      'Pull Now'
    ).then(selection => {
      if (selection === 'Pull Now') {
        vscode.commands.executeCommand('pullNotifier.triggerPull');
      }
    });
  }
}

function waitForCleanThenUpdateBar(cwd: string, behindCount: number, context: vscode.ExtensionContext) {
  // If a poll is already running, don't start another one
  if (cleanPoll !== undefined) return;

  const POLL_INTERVAL_MS = 2000;
  const MAX_WAIT_MS = 5 * 60 * 1000;
  let elapsed = 0;

  cleanPoll = setInterval(() => {
    elapsed += POLL_INTERVAL_MS;
    if (elapsed >= MAX_WAIT_MS) {
      clearInterval(cleanPoll);
      cleanPoll = undefined;
      return;
    }

    exec('git status --porcelain', { cwd }, (_, statusOut) => {
      if (hasTrackedChanges(statusOut)) return;

      clearInterval(cleanPoll);
      cleanPoll = undefined;
      if (pullStatusBar) {
        pullStatusBar.text = `$(check) Changes resolved — Click to Pull`;
        pullStatusBar.tooltip = `${behindCount} commit(s) ready to pull.`;
      }
    });
  }, POLL_INTERVAL_MS);

  context.subscriptions.push({ dispose: () => { clearInterval(cleanPoll); cleanPoll = undefined; } });
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Auto Pull Notifier Activated ✅');

  const checkForUpdates = () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    const cwd = workspaceFolders[0].uri.fsPath;

    exec('git fetch', { cwd }, (fetchError) => {
      if (fetchError) return;

      exec('git rev-list --count HEAD..@{u}', { cwd }, (err, stdout) => {
        if (err) return;

        const behindCount = parseInt(stdout.trim(), 10);

        if (behindCount > 0) {
          showPullStatusBar(cwd, behindCount, context);
        } else {
          pullStatusBar?.hide();
        }
      });
    });
  };

  checkForUpdates();

  const interval = setInterval(checkForUpdates, 5 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {}