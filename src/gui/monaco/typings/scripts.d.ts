export {};

declare global {
  namespace WB {
    namespace Browser {
      /**
       * Utility functions available in Browser scripts.
       */
      interface UtilsAPI {
        /**
         * Returns a shared variable by name
         * (same variable scope as the API Collection).
         */
        getVar(name: string): string;

        /**
         * Safely converts any object to JSON,
         * handling circular references.
         */
        safeJsonStringify(obj: any): string;

        /**
         * Iterates over any structure (Object, Array, Map, etc.).
         *
         * Example:
         * `for (const [k, v] of Utils.iterate(obj))`
         */
        iterate(obj: any): Iterable<WB.Common.IterateEntry>;
      }

      /**
       * Browser utilities entry point.
       */
      const Utils: UtilsAPI;
    }
  }
}
