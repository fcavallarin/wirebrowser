export {};

declare global {
  namespace WB {
    namespace Node {
      /**
       * Scope mode for live object search.
       * - "global": search across the entire heap
       * - "byroot": search starting from a specific root object
       */
      type LiveObjectSearchMode = "global" | "byroot";

      /**
       * HTTP client utilities available in Node context.
       */
      interface HttpClient {
        /**
         * Exposes the `got` HTTP client for making network requests.
         */
        got: any;
      }

      interface ObjectSearchQuery {

        /**
         * Enables the object similarity engine.
         */
        osEnabled?: boolean;

        /**
         * Target object used as reference for similarity matching.
         */
        osObject?: any;

        /**
         * Similarity threshold (0-1, higher means stricter matching).
         */
        osThreshold?: number;

        /**
         * Alpha coefficient (0-1) used to balance structural vs value similarity.
         */
        osAlpha?: number;

        /**
         * Whether to include object values in similarity computation.
         */
        osIncludeValues?: boolean;

        /**
         * Search keyword applied to object property names.
         */
        propertySearch?: WB.Common.SearchQuery;

        /**
         * Search keyword applied to object values.
         */
        valueSearch?: WB.Common.SearchQuery;

        /**
         * Search keyword applied to object class / constructor names.
         */
        classSearch?: WB.Common.SearchQuery;
      }

      /**
       * Configuration object for live object search.
       */
      interface LiveObjectSearchQuery extends ObjectSearchQuery {
        /**
         * Defines the search scope.
         */
        searchMode: LiveObjectSearchMode;

        /**
         * Root object identifier (e.g., window.obj1) used when `searchMode` is "byroot".
         */
        root?: string;
      }

      /**
       * Single result entry returned by live object search.
       * The structure depends on the search mode and engine output.
       */
      interface LiveObjectSearchResult {
        [index: number]: any;
      }

      /**
       * Response returned by `searchLiveObjects`.
       */
      interface LiveObjectSearchResponse {
        /**
         * List of matched objects.
         */
        results: LiveObjectSearchResult[];

        /**
         * Total number of matched results.
         */
        totResults: number;

        /**
         * Total number of objects analyzed during the search.
         */
        totObjectAnalyzed: number;

        /**
         * Indicates whether the results limit was reached.
         */
        resultsLimitReached: boolean;

        /**
         * Execution time in milliseconds.
         */
        timing: number; // ms
      }

      /**
       * Single result entry returned by heap snapshot search.
       * It contains the matched object and additional data
       */
      interface HeapSnapshotSearchResult {
        result: any;
      }

      /**
       * Response returned by `searchLiveObjects`.
       */
      interface HeapSnapshotSearchResponse {
        /**
         * List of matched objects.
         */
        results: HeapSnapshotSearchResult[];
      }

      interface HeapSnapshotSearchQuery extends ObjectSearchQuery {

      }

      /**
       * Utility functions available in Node (Puppeteer) scripts.
       */
      interface UtilsAPI {
        /**
         * Returns the Puppeteer Page object with the given ID.
         */
        getPage(id: number | string): any;

        /**
         * Returns a shared variable by name (same scope as API Collection).
         */
        getVar(name: string): string;

        /**
         * Safely converts any object to JSON, handling circular references.
         */
        safeJsonStringify(obj: any): string;

        /**
         * Iterates over any structure (Object, Array, Map, etc.).
         */
        iterate(obj: any): Iterable<WB.Common.IterateEntry>;

        /**
         * HTTP client utilities.
         */
        httpClient: HttpClient;
      }
      interface MemoryAPI {
        /**
         * Searches live objects in memory using the provided query.
         */
        searchLiveObjects(
          pageId: number | string,
          query: LiveObjectSearchQuery,
        ): Promise<LiveObjectSearchResponse>;

        /**
         * Takes an heap snapshot and runs a search against it using the provided query.
         */
        searchHeapSnapshot(
          pageId: number | string,
          query: HeapSnapshotSearchQuery,
        ): Promise<HeapSnapshotSearchResponse>;
      }

      /**
       * Node utilities entry point.
       */
      const Utils: UtilsAPI;
      /**
       * Node Memory entry point.
      */
      const Memory: MemoryAPI;
    }
  }
}
