import { MODULE_ID } from './constants';

const PREFIX = `${MODULE_ID} |`;

/**
 * The module's namespaced logger. Every message is prefixed with the module ID so it can be filtered in the console.
 * Debug messages are only written while Foundry's hook debugging (`CONFIG.debug.hooks`) is switched on.
 */
export const log = {
  /**
   * Write a debug message, if `CONFIG.debug.hooks` is enabled.
   * @param args - The message and any values to log with it
   */
  debug(...args: unknown[]): void {
    if (CONFIG.debug.hooks) console.debug(PREFIX, ...args);
  },
  /**
   * Write an informational message.
   * @param args - The message and any values to log with it
   */
  info(...args: unknown[]): void {
    console.info(PREFIX, ...args);
  },
  /**
   * Write a warning.
   * @param args - The message and any values to log with it
   */
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  /**
   * Write an error.
   * @param args - The message and any values to log with it
   */
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
};
