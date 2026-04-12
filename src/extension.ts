import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  console.log('Auto Pull Notifier Activated ✅');
  vscode.window.showInformationMessage('Extension Started ✅');

  const checkForUpdates = () => {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) return;

  const cwd = workspaceFolders[0].uri.fsPath;

  // Fetch latest changes
  exec('git fetch', { cwd }, (fetchError) => {
    if (fetchError) return;

    // Compare local vs remote commit count
    exec('git rev-list --count HEAD..@{u}', { cwd }, (err, stdout) => {
      if (err) return;

      const behindCount = parseInt(stdout.trim(), 10);

      if (behindCount > 0) {
        vscode.window.showInformationMessage(
          `🚨 ${behindCount} new commit(s) available. Pull now?`,
          'Pull Now'
        ).then(selection => {
          if (selection === 'Pull Now') {
            exec('git pull', { cwd });
            vscode.window.showInformationMessage('Pulling latest changes...');
          }
        });
      }
    });
  });
};

  // Run once when VS Code starts
  checkForUpdates();

  // Run every 5 minutes
  const interval = setInterval(checkForUpdates, 5 * 60 * 1000);

  context.subscriptions.push({
    dispose: () => clearInterval(interval)
  });
}

export function deactivate() {}