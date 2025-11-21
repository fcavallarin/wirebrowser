
export const searchByRootToEvaluate = (root, propertySearch, valueSearch, classSearch, textMatchesFn, iterateFn, serializeFn) => {

  const textMatches = eval(textMatchesFn);
  const iterate = eval(`(${iterateFn})`);
  const safeStringify = eval(`(${serializeFn})`);


  const searchRoot = (root, { propertySearch, valueSearch, classSearch, maxDepth = 125 }, rootPath) => {
    let index = 0;
    const seen = new WeakSet();
    const results = [];

    const search = (obj, path = rootPath, depth = 0) => {
      if (obj === null || typeof obj !== "object") return;
      index++;
      if (seen.has(obj)) return;
      if (depth > maxDepth) return;

      seen.add(obj);

      let className = "Object";
      try {
        if (obj.constructor && typeof obj.constructor.name === "string") {
          className = obj.constructor.name || "Object";
        }
      } catch { }

      for (const [k, v] of iterate(obj)) {
        let propPath;
        let propMatches = !propertySearch || !propertySearch[0];
        let valMatches = !valueSearch || !valueSearch[0];
        let classMatches = !classSearch || !classSearch[0];

        if (propertySearch && textMatches(String(k), ...propertySearch)) {
          propMatches = true;
        }

        if (typeof v !== "object"
          && valueSearch
          && textMatches(String(v), ...valueSearch)) {
          valMatches = true;

        }

        if (classSearch && textMatches(className, ...classSearch)) {
          classMatches = true;
        }

        if (propMatches && valMatches && classMatches) {
          results.push({
            index: index,
            path,
            className,
            obj: safeStringify(obj)
          });
        }

        if (typeof v === "object" && v !== null) {
          if (
            Array.isArray(obj)
            || ArrayBuffer.isView(obj)
            || obj instanceof NodeList
            || obj instanceof HTMLCollection
          ) {
            propPath = `${path}[${k}]`;
          } else if (obj instanceof Map) {
            propPath = `${path}.<map>[${k}]`;
          } else if (obj instanceof Set) {
            propPath = `${path}.<set>[${k}]`;
          } else {
            propPath = `${path}.${k}`;
          }

          search(v, propPath, depth + 1);
        }
      }
    }

    search(root);
    return {
      results: results,
      totObjects: index
    };
  }

  return searchRoot(eval(root), { propertySearch, valueSearch, classSearch }, root);
}