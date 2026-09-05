import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function artifactReceipt(rendered, raw, output, command = 'deliver') {
  const { content, ...result } = rendered;
  if (!result.ok) return { ...result, command };
  return {
    ...result, command, output: resolve(output),
    bytes: { spec: Buffer.byteLength(raw), [result.format]: Buffer.byteLength(content) },
    sha256: { spec: sha256(raw), [result.format]: sha256(content) }
  };
}
