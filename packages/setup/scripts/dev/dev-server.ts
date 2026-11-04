/**
 * Development only: where the setup screen's dev server answers, and where it finds Foundry VTT. It reads the same
 * optional `.pdt/mount.json` as the module's dev server (see `packages/module/vite.config.ts`), so one file sets up
 * both on a machine: `hostname` and `ports.base` as for the module, and `ports.setup` for this server.
 *
 *   { "hostname": "foundrymoddev1", "ports": { "base": 30000, "setup": 31003 } }
 */
import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

/** Where the dev server answers, and where it finds Foundry. */
export interface DevServer {
  /** The host name the dev server answers to, besides `localhost`. */
  readonly hostname: string;
  /** Foundry's port. */
  readonly foundry: number;
  /** The dev server's port. */
  readonly port: number;
}

/** Used for whatever the file leaves out. */
export const DEFAULTS: DevServer = { hostname: 'foundrymoddev1', foundry: 30000, port: 31003 };

/** The file read when `PDT_MOUNT_CONFIG` names no other, from the repository's root. */
export const DEFAULT_FILE = '.pdt/mount.json';

const port = z.int().min(1).max(65535);
const schema = z.object({
  hostname: z.string().min(1).optional(),
  // The module's dev server port, `ports.dev`, may be there too; this server ignores it.
  ports: z.object({ base: port.optional(), setup: port.optional() }).optional(),
});

/**
 * Read the dev server's settings.
 * @param root - The repository's root
 * @param env - The environment, which may name the file in `PDT_MOUNT_CONFIG`
 * @returns The settings, from the file over {@link DEFAULTS}
 */
export function readDevServer(root: string, env: NodeJS.ProcessEnv = process.env): DevServer {
  const named = env.PDT_MOUNT_CONFIG;
  const file = path.resolve(root, named ?? DEFAULT_FILE);
  if (!fs.existsSync(file)) {
    // The default file is optional, but a file that was asked for must exist.
    if (named !== undefined) throw new Error(`PDT_MOUNT_CONFIG names a missing file: ${file}`);
    return DEFAULTS;
  }

  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to parse ${file} as JSON`, { cause: error });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`Invalid dev server settings in ${file}:\n${z.prettifyError(parsed.error)}`);
  const { hostname, ports } = parsed.data;
  return {
    hostname: hostname ?? DEFAULTS.hostname,
    foundry: ports?.base ?? DEFAULTS.foundry,
    port: ports?.setup ?? DEFAULTS.port,
  };
}
