export {};

declare global {
  namespace WB {
    namespace Common {
      /**
       * Key–value pair yielded when iterating over a structure
       * (Object entries, Array indices, Map entries, etc.).
       */
      type IterateEntry = [any, any];

      /**
       * Options controlling search behavior.
       */
      interface SearchOptions {
        /**
         * Enables case-sensitive matching.
         */
        matchCase?: boolean;

        /**
         * Treats the keyword as a regular expression.
         */
        useRegexp?: boolean;

        /**
         * Enables exact matching.
         * Default value at runtime is `true`.
         */
        exactMatch?: boolean; // default true at runtime
      }

      /**
       * Search query definition.
       *
       * The query is expressed as a tuple:
       * - first element: keyword or pattern
       * - second element: optional search options
       */
      type SearchQuery = [
        /**
         * Keyword or pattern to search for.
         */
        keyword: string,

        /**
         * Optional search behavior configuration.
         */
        options?: SearchOptions
      ];
    }
  }
}
