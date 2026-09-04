import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const DEFAULT_OPERATIONS = { existsSync, renameSync, unlinkSync, writeFileSync };

// A pair cannot be replaced by one filesystem rename. Stage every candidate,
// preserve every prior destination, then roll the whole set back if any final
// rename fails. Operations are injectable so the mid-commit recovery path is
// deterministic under test instead of depending on a filesystem accident.
export function commitAtomically(outputs, operations = DEFAULT_OPERATIONS) {
  const nonce = `${process.pid}-${Date.now()}`;
  const records = outputs.map(({ path, html }, index) => ({
    path,
    html,
    staged: join(dirname(path), `.${basename(path)}.tmp-${nonce}-${index}`),
    backup: join(dirname(path), `.${basename(path)}.bak-${nonce}-${index}`),
    hadPrevious: false,
    committed: false
  }));
  try {
    for (const record of records) operations.writeFileSync(record.staged, record.html);
    for (const record of records) {
      if (operations.existsSync(record.path)) {
        operations.renameSync(record.path, record.backup);
        record.hadPrevious = true;
      }
    }
    for (const record of records) {
      operations.renameSync(record.staged, record.path);
      record.committed = true;
    }
    for (const record of records) {
      if (record.hadPrevious && operations.existsSync(record.backup)) operations.unlinkSync(record.backup);
    }
  } catch (error) {
    for (const record of records) {
      if (operations.existsSync(record.staged)) operations.unlinkSync(record.staged);
      if (record.committed && operations.existsSync(record.path)) operations.unlinkSync(record.path);
    }
    for (const record of records) {
      if (record.hadPrevious && operations.existsSync(record.backup)) operations.renameSync(record.backup, record.path);
    }
    throw error;
  }
}
