// Runtime support checks shared by the CLI and doctor. The renderer has no
// runtime dependencies, but it does need Node.js; 22 is the supported floor.

export const MIN_NODE_MAJOR = 22;

export function nodeMajor(version = process.versions.node) {
  return Number(String(version).replace(/^v/, '').split('.')[0]);
}

export function nodeSupported(version = process.versions.node) {
  return nodeMajor(version) >= MIN_NODE_MAJOR;
}

// One stderr line for commands run on an older runtime. Receipts on stdout
// stay machine-readable; the warning tells the agent what to report.
export function nodeVersionWarning(version = process.versions.node) {
  if (nodeSupported(version)) return null;
  return `gen-chart: warning: Node.js ${String(version).replace(/^v/, '')} is below the supported minimum ` +
    `${MIN_NODE_MAJOR}; the command still runs, but upgrade Node.js to ${MIN_NODE_MAJOR} or newer ` +
    '(https://nodejs.org) for supported results.';
}
