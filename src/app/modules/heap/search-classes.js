export const searchClassesToEvaluate = (classInstances, propertySearch, valueSearch, classSearch, textMatchesFn, iterateFn, serializeFn) => {

  const textMatches = eval(`(${textMatchesFn})`);
  const iterate = eval(`(${iterateFn})`);
  const safeStringify = eval(`(${serializeFn})`);



  const isInspectable = (obj) => {

    if (obj == null) return false;
    const t = typeof obj;
    if (t !== "object" && t !== "function") return false;

    const tag = Object.prototype.toString.call(obj).slice(8, -1);
    if (!["Object", "Array", "Map", "Set"].includes(tag)) return false;

    try {
      for (const k of Object.getOwnPropertyNames(obj)) {
        const d = Object.getOwnPropertyDescriptor(obj, k);
        if (d && typeof d.get === "function") {
          const src = Function.prototype.toString.call(d.get).trim();
          if (src.endsWith("{ [native code] }")) return false;
        }
      }
    } catch {
      return false;
    }

    return true;
  }


  const searchClasses = (classInstances) => {
    const result = [];

    for (let i = 0; i < classInstances.length; i++) {
      const cls = classInstances[i];
      if (!isInspectable(cls)) {
        continue;
      }
      let propMatches = !propertySearch || !propertySearch[0];
      let valMatches = !valueSearch || !valueSearch[0];
      let classMatches = !classSearch || !classSearch[0];

      let className = "Object";
      try {
        if (cls && cls.constructor && typeof cls.constructor.name === "string") {
          className = cls.constructor.name || "Object";
        }
      } catch { }

      if (classSearch && textMatches(className, ...classSearch)) {
        classMatches = true;
      }

      const r = {};
      for (const [k, v] of iterate(cls)) {
        if (propertySearch && textMatches(String(k), ...propertySearch)) {
          propMatches = true;
        }
        if (typeof v !== "object"
          && valueSearch
          && textMatches(String(v), ...valueSearch)) {
          valMatches = true;
        }
        r[k] = v;
      }
      if (propMatches && valMatches && classMatches) {
        result.push({
          index: i,
          className,
          obj: safeStringify(r)
        });
      }
    }

    return {
      results: result,
      totObjects: classInstances.length
    };
  };

  return searchClasses(classInstances);
}