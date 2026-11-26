// Minimal Chrome DevTools Protocol client for static previews. It launches one
// headless browser, speaks CDP over Node's built-in WebSocket, and never adds a
// runtime dependency. Callers fall back to one-shot Chrome flags when the
// runtime has no WebSocket or the browser does not expose a DevTools endpoint.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CDP_FLAGS = [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--no-error-dialogs',
  // Containers give Chrome a small /dev/shm and no sandbox privileges.
  '--no-sandbox', '--disable-dev-shm-usage',
  // Skip background services that only slow a short-lived, offline browser.
  '--disable-extensions', '--disable-background-networking', '--disable-component-update',
  '--disable-sync', '--disable-default-apps', '--mute-audio', '--metrics-recording-only',
  '--password-store=basic', '--use-mock-keychain'
];

export function cdpAvailable() {
  return typeof globalThis.WebSocket === 'function';
}

export function parseDevToolsUrl(stderr) {
  return /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1] ?? null;
}

export async function launchBrowser(bin, { timeout = 30000 } = {}) {
  if (!cdpAvailable()) throw Object.assign(new Error('this Node.js runtime has no WebSocket'), { code: 'CDP_UNAVAILABLE' });
  const profile = mkdtempSync(join(tmpdir(), 'gen-chart-browser-'));
  const proc = spawn(bin, [...CDP_FLAGS, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  const exited = new Promise((resolve) => proc.once('close', resolve));
  const cleanup = async () => {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  };

  let ws;
  try {
    const url = await new Promise((resolve, reject) => {
      let stderr = '';
      const timer = setTimeout(() => reject(new Error('browser did not expose a DevTools endpoint')), timeout);
      proc.stderr.on('data', (chunk) => {
        stderr += chunk;
        const found = parseDevToolsUrl(stderr);
        if (found) { clearTimeout(timer); resolve(found); }
      });
      proc.once('error', (e) => { clearTimeout(timer); reject(e); });
      proc.once('exit', () => { clearTimeout(timer); reject(new Error('browser exited before exposing DevTools')); });
    });
    proc.stderr.resume();
    ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('cannot connect to the browser DevTools endpoint')), { once: true });
    });
  } catch (e) {
    await cleanup();
    throw Object.assign(e, { code: e.code ?? 'CDP_LAUNCH_FAILED' });
  }

  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  let closedError = null;
  const failAll = (error) => {
    closedError ??= error;
    for (const { reject } of pending.values()) reject(closedError);
    pending.clear();
    for (const l of listeners) l.reject(closedError);
    listeners.clear();
  };
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else p.resolve(msg.result);
    } else {
      for (const l of [...listeners]) {
        if (l.method === msg.method && l.sessionId === msg.sessionId) { listeners.delete(l); l.resolve(msg.params); }
      }
    }
  });
  ws.addEventListener('close', () => failAll(new Error('browser DevTools connection closed')));
  proc.once('exit', () => failAll(new Error('browser exited')));

  function send(method, params = {}, sessionId) {
    if (closedError) return Promise.reject(closedError);
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`DevTools ${method} timed out`));
      }, timeout);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  // Register before triggering the event, so a fast event is never missed.
  function waitFor(method, sessionId) {
    if (closedError) return Promise.reject(closedError);
    let listener;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error(`DevTools ${method} timed out`));
      }, timeout);
      listener = {
        method, sessionId,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      };
      listeners.add(listener);
    });
    return promise;
  }

  async function close() {
    try { ws.close(); } catch { /* already closed */ }
    await cleanup();
  }

  return { bin, send, waitFor, close };
}
