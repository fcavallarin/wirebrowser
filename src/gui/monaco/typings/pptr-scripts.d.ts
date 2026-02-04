
export { };

declare global {
  namespace WB {
    namespace Node {
      interface HttpClient {
        got: any;
      }
      interface UtilsAPI {
        getPage(id: number | string): any;
        getVar(name: string): string;
        safeJsonStringify(obj: any): string;
        iterate(obj: any): Iterable<WB.Common.IterateEntry>;
        httpClient: HttpClient;
        // searchSnapshot(pageId: string, searchQuery: WB.Common.SearchQuery);
      }

      const Utils: UtilsAPI;
    }
  }

  /**
   * Legacy global (kept for backward compatibility).
   */
  const Utils: any;
}
