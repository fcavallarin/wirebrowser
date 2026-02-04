export {};

declare global {
  namespace WB {
    namespace Common {
      type IterateEntry = [any, any];
      interface SearchOptions {
        matchCase?: boolean;
        useRegexp?: boolean;
        exactMatch?: boolean; // default true at runtime
      }

      type SearchQuery = [
        keyword: string,
        options?: SearchOptions
      ];
    }
  }
}
