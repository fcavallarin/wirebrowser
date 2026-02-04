export {};

declare global {
  namespace WB {
    namespace Browser {
      interface UtilsAPI {
        getVar(name: string): string;
        safeJsonStringify(obj: any): string;
        iterate(obj: any): Iterable<WB.Common.IterateEntry>;
      }

      const Utils: UtilsAPI;
    }
  }

  /**
   * Legacy global (kept for backward compatibility).
   */
  const Utils: any;
}
