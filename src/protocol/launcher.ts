import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserEngine } from '../types.js';

export interface LaunchedBrowser {
  engine: BrowserEngine;
  wsUrl: string;
  process: ChildProcess;
  userDataDir: string;
  kill: () => Promise<void>;
}

const CHROME_CANDIDATES_WIN = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const FIREFOX_CANDIDATES_WIN = [
  'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  `${process.env.LOCALAPPDATA ?? ''}\\Mozilla Firefox\\firefox.exe`,
];

const CHROME_CANDIDATES_UNIX = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const FIREFOX_CANDIDATES_UNIX = [
  '/usr/bin/firefox',
  '/Applications/Firefox.app/Contents/MacOS/firefox',
];

/**
 * Discovers an installed Chrome or Firefox executable on the current OS,
 * honoring explicit paths and `REALMAYA_CHROME_PATH` / `REALMAYA_FIREFOX_PATH`.
 */
export function findBrowserExecutable(engine: BrowserEngine, explicitPath?: string): string {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      throw new Error(`Browser executable not found at explicit path: ${explicitPath}`);
    }
    return explicitPath;
  }

  const envPath =
    engine === 'chrome' ? process.env.REALMAYA_CHROME_PATH : process.env.REALMAYA_FIREFOX_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const isWin = process.platform === 'win32';
  const candidates =
    engine === 'chrome'
      ? isWin
        ? CHROME_CANDIDATES_WIN
        : CHROME_CANDIDATES_UNIX
      : isWin
        ? FIREFOX_CANDIDATES_WIN
        : FIREFOX_CANDIDATES_UNIX;

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate ${engine} executable. Pass 'executablePath' or set REALMAYA_${engine.toUpperCase()}_PATH.`,
  );
}

/**
 * Spawns a headless Chrome or Firefox process with remote debugging enabled
 * and resolves with its WebSocket endpoint.
 */
export async function launchBrowserProcess(
  engine: BrowserEngine,
  opts: {
    headless: boolean;
    executablePath?: string;
    args?: string[];
    timeoutMs: number;
  },
): Promise<LaunchedBrowser> {
  const executable = findBrowserExecutable(engine, opts.executablePath);
  const userDataDir = await mkdtemp(join(tmpdir(), `realmaya-${engine}-`));

  const spawnArgs =
    engine === 'chrome'
      ? [
          ...(opts.headless ? ['--headless=new'] : []),
          '--remote-debugging-port=0',
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-networking',
          '--disable-gpu',
          ...(opts.args ?? []),
          'about:blank',
        ]
      : [
          ...(opts.headless ? ['--headless'] : []),
          '--remote-debugging-port=0',
          '--no-remote',
          '-profile',
          userDataDir,
          ...(opts.args ?? []),
        ];

  const child = spawn(executable, spawnArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const wsRegex =
    engine === 'chrome'
      ? /DevTools listening on (ws:\/\/[^\s]+)/
      : /WebDriver BiDi listening on (ws:\/\/[^\s]+)/;

  const wsUrl = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let outputBuffer = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          `Timed out waiting for ${engine} WebSocket endpoint after ${opts.timeoutMs}ms.\nOutput: ${outputBuffer}`,
        ),
      );
    }, opts.timeoutMs);

    const onChunk = (chunk: Buffer) => {
      if (settled) return;
      const text = chunk.toString('utf8');
      outputBuffer += text;
      const match = wsRegex.exec(outputBuffer);
      if (match?.[1]) {
        settled = true;
        clearTimeout(timer);
        const rawUrl = match[1].trim();
        resolve(engine === 'firefox' && !rawUrl.endsWith('/session') ? `${rawUrl}/session` : rawUrl);
      }
    };

    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${engine} exited prematurely with code ${code}.\nOutput: ${outputBuffer}`));
    });
  });

  const onProcessExit = () => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  };
  process.once('exit', onProcessExit);

  let killed = false;
  const kill = async () => {
    if (killed) return;
    killed = true;
    process.removeListener('exit', onProcessExit);
    if (!child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
          resolve();
        }, 2000);
        child.once('exit', () => {
          clearTimeout(forceTimer);
          resolve();
        });
      });
    }
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  return {
    engine,
    wsUrl,
    process: child,
    userDataDir,
    kill,
  };
}
