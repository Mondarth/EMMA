/**
 * Local additions to Foundry's types for the setup screen.
 */
declare module 'fvtt-types/configuration' {
  namespace Hooks {
    interface HookConfig {
      /** Called each time the setup screen's menu (`SetupMenu`) renders, with its element. */
      renderSetupMenu: (app: unknown, element: HTMLElement) => void;
    }
  }
}

export {};
