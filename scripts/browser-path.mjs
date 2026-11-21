import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Shared discovery for the release checks on Windows, Linux and macOS. */
export function findChromium() {
  const explicit = process.env.PF_CHROME || process.env.CHROME_PATH;
  if (explicit) return explicit;
  const windowsRoots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  return [
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...windowsRoots.flatMap(root => [join(root, 'Google/Chrome/Application/chrome.exe'), join(root, 'Microsoft/Edge/Application/msedge.exe')]),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
}
