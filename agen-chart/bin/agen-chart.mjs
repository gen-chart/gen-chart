#!/usr/bin/env node
// agen-chart CLI — skeleton. Command surface matches the plan; only `doctor`
// and `help` are functional until M1 lands.

import process from 'node:process';

const VERSION = '0.1.0';

function usage() {
  return `agen-chart v${VERSION}

Usage:
  agen-chart guide "<scenario>" [--json]
  agen-chart inspect-data <file.csv|json> [--json]
  agen-chart validate <chart_type> <spec.json> [--quality showcase] [--json]
  agen-chart render   <chart_type> <spec.json> <out.html> [--json]
  agen-chart deliver  <chart_type> <spec.json> <out.html> [--quality showcase] [--json]
  agen-chart visual-check <out.html> [--json]
  agen-chart doctor
  agen-chart demo <output-directory>

Chart types: cartesian | distribution | proportion | matrix
`;
}

function doctor() {
  const [major] = process.versions.node.split('.').map(Number);
  const ok = major >= 18;
  console.log(`node ${process.versions.node} ${ok ? 'OK (>=18)' : 'FAIL (need >=18)'}`);
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
    console.error(`agen-chart: '${command}' is not implemented yet (skeleton build).`);
    process.exit(2);
  default:
    console.error(`agen-chart: unknown command '${command}'\n`);
    console.error(usage());
    process.exit(1);
}
