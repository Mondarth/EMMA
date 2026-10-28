import fs from 'node:fs';
import path from 'node:path';

/** The development server's secrets file, which the e2e server reads too unless `FOUNDRY_SECRETS_FILE` names another. */
const DEFAULT_SECRETS_FILE = path.resolve(import.meta.dirname, '../../../../../.foundryvtt/secrets.json');

/**
 * The password for the Foundry setup screen, found as the e2e server finds it (see `tests/e2e/compose.yaml`): from the
 * secrets file if it has one, or else from `FOUNDRY_ADMIN_KEY`.
 * @returns The admin key, or `undefined` if neither gives one
 */
export function adminKey(): string | undefined {
  const file = process.env.FOUNDRY_SECRETS_FILE ?? DEFAULT_SECRETS_FILE;
  if (fs.existsSync(file)) {
    const { foundry_admin_key: key } = JSON.parse(fs.readFileSync(file, 'utf8')) as { foundry_admin_key?: unknown };
    if (typeof key === 'string' && key !== '') return key;
  }
  return process.env.FOUNDRY_ADMIN_KEY || undefined;
}
