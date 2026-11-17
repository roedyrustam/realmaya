import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserEngine, DaemonMetadata } from '../types.js';
import { launchBrowserProcess } from './launcher.js';

/**
 * Returns the path to the persistent warm daemon metadata file for the given browser engine.
 */
export function getDaemonFilePath(engine: BrowserEngine = 'chrome'): string {
  return join(homedir(), '.realmaya', `daemon-${engine}.json`);
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspects the warm browser daemon status for the specified engine.
 * Automatically cleans up stale metadata if the process is no longer alive.
 */
export async function getDaemonStatus(
  engine: BrowserEngine = 'chrome',
): Promise<DaemonMetadata | null> {
  const filePath = getDaemonFilePath(engine);
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, 'utf8');
    const meta = JSON.parse(raw) as DaemonMetadata;
    if (meta && typeof meta.pid === 'number' && isProcessAlive(meta.pid)) {
      return meta;
    }
    await rm(filePath, { force: true }).catch(() => {});
    if (meta?.userDataDir) {
      await rm(meta.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
    return null;
  } catch {
    await rm(filePath, { force: true }).catch(() => {});
    return null;
  }
}

/**
 * Starts a persistent warm browser daemon if not already running, writes
 * its WebSocket endpoint and PID metadata to `~/.realmaya/daemon-<engine>.json`,
 * and returns the metadata.
 */
export async function startDaemon(opts?: {
  engine?: BrowserEngine;
  headless?: boolean;
  executablePath?: string;
}): Promise<DaemonMetadata> {
  const engine: BrowserEngine = opts?.engine ?? 'chrome';
  const existing = await getDaemonStatus(engine);
  if (existing) {
    return existing;
  }

  const launched = await launchBrowserProcess(engine, {
    headless: opts?.headless ?? true,
    ...(opts?.executablePath ? { executablePath: opts.executablePath } : {}),
    timeoutMs: 30_000,
    detached: true,
  });

  launched.process.unref();

  const meta: DaemonMetadata = {
    engine,
    wsUrl: launched.wsUrl,
    pid: launched.process.pid ?? 0,
    userDataDir: launched.userDataDir,
    startedAt: Date.now(),
  };

  const filePath = getDaemonFilePath(engine);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

/**
 * Stops a running warm browser daemon and removes its temporary profile and metadata file.
 */
export async function stopDaemon(engine: BrowserEngine = 'chrome'): Promise<boolean> {
  const filePath = getDaemonFilePath(engine);
  if (!existsSync(filePath)) return false;

  try {
    const raw = await readFile(filePath, 'utf8');
    const meta = JSON.parse(raw) as DaemonMetadata;
    if (meta && typeof meta.pid === 'number' && isProcessAlive(meta.pid)) {
      try {
        process.kill(meta.pid, 'SIGTERM');
      } catch {
        // Ignore kill error
      }
    }
    if (meta?.userDataDir) {
      await rm(meta.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    // Ignore parse errors
  }

  await rm(filePath, { force: true }).catch(() => {});
  return true;
}
