#!/usr/bin/env node
// gen-chart CLI — skeleton. Command surface matches the plan; only `doctor`
// and `help` are functional until M1 lands.

import process from 'node:process';

const VERSION = '0.1.0';

function usage() {
  return `gen-chart v${VERSION}

Usage:
  gen-chart guide "<scenario>" [--json]
  gen-chart inspect-data <file.csv|json> [--json]
  gen-chart validate <chart_type> <spec.json> [--quality showcase] [--json]
  gen-chart render   <chart_type> <spec.json> <out.html> [--json]
  gen-chart deliver  <chart_type> <spec.json> <out.html> [--quality showcase] [--json]
  gen-chart visual-check <out.html> [--json]
  gen-chart doctor
  gen-chart demo <output-directory>

Chart types: cartesian | distribution | proportion | matrix
`;
}

function doctor() {
  const [major] = process.versions.node.split('.').map(Number);
  const ok = major >= 22;
  console.log(`node ${process.versions.node} ${ok ? 'OK (>=22)' : 'FAIL (need >=22)'}`);
  console.log('renderers: not implemented (skeleton)');
  process.exit(ok ? 0 : 1);
}

const command = process.argv[2];
switch (command) {
  case undefined:
  case '-h':
  case '--help':
  case 'help':
    console.log(usage());
    break;
  case 'doctor':
    doctor();
    break;
  case 'guide':
  case 'inspect-data':
  case 'validate':
  case 'render':
  case 'deliver':
  case 'visual-check':
  case 'demo':
    console.error(`gen-chart: '${command}' is not implemented yet (skeleton build).`);
    process.exit(2);
  default:
    console.error(`gen-chart: unknown command '${command}'\n`);
    console.error(usage());
    process.exit(1);
}
