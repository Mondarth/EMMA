/**
 * The parts of libWrapper's public API that EMMA uses. libWrapper (https://github.com/ruipin/fvtt-lib-wrapper) is a
 * required module, so its `libWrapper` global is there from the `init` hook on. It ships no types of its own.
 */

declare global {
  namespace libWrapper {
    /**
     * How a wrapper takes part in the call: `WRAPPER` always continues the chain, `MIXED` may or may not, `OVERRIDE`
     * never does, and `LISTENER` only learns of the call.
     */
    type Type = 'WRAPPER' | 'MIXED' | 'OVERRIDE' | 'LISTENER';

    /** A wrapper that continues the chain by calling `wrapped`. */
    type ChainedWrapper<This = unknown> = (
      this: This,
      wrapped: (...args: unknown[]) => unknown,
      ...args: unknown[]
    ) => unknown;

    /** libWrapper's API, the `libWrapper` global. */
    interface Api {
      /**
       * Wrap a method.
       * @param packageId - The ID of the package registering the wrapper
       * @param target - The path to the method from global scope, such as `foundry.Game.prototype.logOut`
       * @param fn - The wrapper
       * @param type - How the wrapper takes part in the call; `MIXED` if not given
       * @returns The target's unique ID, for `unregister`
       */
      register(packageId: string, target: string, fn: libWrapper.ChainedWrapper, type?: libWrapper.Type): number;
      /**
       * Remove a wrapper.
       * @param packageId - The ID of the package that registered it
       * @param target - The target, as given to `register` or returned by it
       */
      unregister(packageId: string, target: string | number): void;
    }
  }

  const libWrapper: libWrapper.Api;
}

export {};
