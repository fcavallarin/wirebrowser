import { textMatches } from "#src/common/utils.js";

const getCircularLabel = (node) => {
  switch (node.type) {
    case "object":
      return `[Circular Object:${node.name}]`;
    case "array":
      return `[Circular Array]`;
    case "string":
      return `[Circular String:"${node.name}"]`;
    case "number":
      return `[Circular Number:${node.name}]`;
    case "regexp":
      return `[Circular RegExp:${node.name}]`;
    default:
      return `[Circular ${node.type}]`;
  }
}

const isPrimitiveNode = (node) => {
  const t = node.type;

  // fast path: real primitives with explicit type
  if (t === "string") return true;
  if (t === "number") return true;
  if (t === "bigint") return true;
  if (t === "symbol") return true;

  // booleans, null, undefined inside hidden/value nodes
  if (t === "hidden" || t === "value") {
    const v = node.name;

    if (
      v === true ||
      v === false ||
      v === null ||
      v === undefined
    ) {
      return true;
    }

    // rare case: as string (older snapshots)
    if (
      v === "true" ||
      v === "false" ||
      v === "null" ||
      v === "undefined"
    ) {
      return true;
    }
  }

  return false;
}

const convertPrimitive = (node) => {
  const v = node.name;

  // already a JS primitive
  if (
    v === true ||
    v === false ||
    v === null ||
    v === undefined
  ) {
    return v;
  }

  // fallback for string-wrapped primitives
  switch (v) {
    case "true": return true;
    case "false": return false;
    case "null": return null;
    case "undefined": return undefined;
  }

  // explicit types
  try {
    if (node.type === "string") return v;
    if (node.type === "number") return Number(v);
    if (node.type === "bigint") return BigInt(String(v).replace(/n$/, ""));
    if (node.type === "symbol") return v;
  } catch {
    return `error -> ${node.type}:${v}`
  }

  return v;
}

export const inspectObject = (node, nodes, depth = 15, seen = new Set(), path = "root") => {
  if (!node) {
    return { object: null, meta: [] };
  }

  if (isPrimitiveNode(node)) {
    return { object: convertPrimitive(node), meta: [] };
  }
  if (seen.has(node.id)) {
    return {
      object: getCircularLabel(node),
      meta: []
    };
  }
  seen.add(node.id);

  if (depth <= 0) {
    return { object: `[Max depth reached ${node.name}]`, meta: [] };
  }

  if (node.type === "object") {
    const isArray = node.name === "Array";
    const container = isArray ? [] : {};
    const meta = [];
    let className = "Object";

    if (!isArray && node.name && node.name !== "Object") {
      meta.push({
        type: "classType",
        field: path,
        class: node.name
      });
      if (path === "root") {
        className = node.name;
      }
    }

    for (const edge of node.edges) {
      if (!edge.name || (edge.type !== "property" && edge.type !== "element")) {
        continue;
      }

      const child = nodes[edge.toNode];
      if (!child) {
        continue;
      }

      const childPath = isArray ? `${path}[${edge.name}]` : `${path}.${edge.name}`;
      const { object: childObj, meta: childMeta } = inspectObject(child, nodes, depth - 1, seen, childPath);

      container[edge.name] = childObj;
      meta.push(...childMeta);
    }

    return { object: container, meta, className };
  }

  return { object: node.name, meta: [], className: "" };
}


export const parseSnapshot = (heap) => {
  const nodeFieldCount = heap.snapshot.meta.node_fields.length;
  const edgeFieldCount = heap.snapshot.meta.edge_fields.length;

  const nodeTypeOffset = heap.snapshot.meta.node_fields.indexOf("type");
  const nodeNameOffset = heap.snapshot.meta.node_fields.indexOf("name");
  const nodeIdOffset = heap.snapshot.meta.node_fields.indexOf("id");
  const nodeEdgeCountOffset = heap.snapshot.meta.node_fields.indexOf("edge_count");

  const edgeTypeOffset = heap.snapshot.meta.edge_fields.indexOf("type");
  const edgeNameOrIndexOffset = heap.snapshot.meta.edge_fields.indexOf("name_or_index");
  const edgeToNodeOffset = heap.snapshot.meta.edge_fields.indexOf("to_node");

  const nodeTypes = heap.snapshot.meta.node_types[nodeTypeOffset];
  const edgeTypes = heap.snapshot.meta.edge_types[edgeTypeOffset];
  const strings = heap.strings;

  const nodes = [];
  const rawNodes = heap.nodes;
  const rawEdges = heap.edges;


  let edgeIndex = 0;
  for (let i = 0, idx = 0; i < rawNodes.length; i += nodeFieldCount, idx++) {
    const type = nodeTypes[rawNodes[i + nodeTypeOffset]];
    let name = strings[rawNodes[i + nodeNameOffset]];
    const id = rawNodes[i + nodeIdOffset];
    const edgeCount = rawNodes[i + nodeEdgeCountOffset];

    if (type === "hidden") {
      switch (name) {
        case "true":
          name = true;
          break;
        case "false":
          name = false;
          break;
        case "null":
          name = null;
          break;
        case "undefined":
          name = undefined;
          break;
      }
    }
    const node = { idx, type, name, id, edges: [] };


    for (let j = 0; j < edgeCount; j++) {
      const eOff = (edgeIndex + j) * edgeFieldCount;
      const eType = edgeTypes[rawEdges[eOff + edgeTypeOffset]];

      let eName;
      if (eType === "element") {
        eName = String(rawEdges[eOff + edgeNameOrIndexOffset]);
      } else {
        eName = strings[rawEdges[eOff + edgeNameOrIndexOffset]];
      }

      const eToNode = rawEdges[eOff + edgeToNodeOffset] / nodeFieldCount;
      node.edges.push({ type: eType, name: eName, toNode: eToNode });
    }

    edgeIndex += edgeCount;
    nodes.push(node);
  }

  // Second pass to get the values of numbers from their edges
  for (const node of nodes) {

    if (node.type === "number" || node.type === "bigint") {
      const valEdge =
        node.edges.find(e => e.name === "value" && (e.type === "internal" || e.type === "shortcut"))
        || node.edges.find(e => e.name === "value"); // fallback

      if (!valEdge) {
        continue;
      }
      const child = nodes[valEdge.toNode];
      if (child && child.type === "string") {
        if (node.type === "number") {
          switch (child.name) {  // The value of the number as a string
            case "NaN":
              node.name = NaN;
              break;
            case "Infinity":
              node.name = Infinity;
              break;
            case "-Infinity":
              node.name = -Infinity;
              break;
            default:
              const n = Number(child.name);
              node.name = Number.isNaN(n) ? undefined : n;
          }
        }
        if (node.type === "bigint") {
          try {
            node.name = BigInt(child.name);
          } catch {
            node.name = child.name + "n";
          }
        }
      }
    }
  }

  return nodes;
};



export const captureSnapshot = async (page) => {
  const client = await page.target().createCDPSession();
  await client.send("HeapProfiler.enable");

  let snapshot = "";
  client.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => {
    snapshot += chunk;
  });

  await client.send("HeapProfiler.takeHeapSnapshot", {
    reportProgress: false,
    captureNumericValue: true,
  });
  await client.send("HeapProfiler.disable");
  const j = JSON.parse(snapshot);
  snapshot = null;
  return j;
};

export const getParsedSnapshot = async (page) => {
  const snapshotJson = await captureSnapshot(page);
  const parsed = parseSnapshot(snapshotJson);
  snapshotJson = null;
  return parsed;
};


export const searchObjects = (nodes, {
  propertySearch = null,
  valueSearch = null,
  classSearch = null,
  osEnabled,
  osObject,
  osThreshold,
  osAlpha,
  similarityFn
}) => {
  const results = [];
  let similarity = null;
  let inspected;
  const osObjectParsed = osEnabled && osObject ? JSON.parse(osObject) : null;

  for (const node of nodes) {
    let keyMatch = !propertySearch || !propertySearch[0];
    let valueMatch = !valueSearch || !valueSearch[0];
    let classMatches = !classSearch || !classSearch[0];

    if (node.type === "string") {
      if (valueSearch && node.name && textMatches(String(node.name), ...valueSearch)) {
        results.push({ node });
      }
      continue;
    }
    if (node.type !== "object") continue;

    if (classSearch) {
      inspected = inspectObject(node, nodes);
      if (textMatches(inspected.className, ...classSearch)) {
        classMatches = true;
      }
    }

    for (const edge of node.edges) {
      const child = nodes[edge.toNode];

      if (propertySearch && edge.name && textMatches(edge.name, ...propertySearch)) {
        keyMatch = true;
      }

      if (valueSearch && child && textMatches(String(child.name), ...valueSearch)) {
        valueMatch = true;
      }

      if (keyMatch && valueMatch) break;
    }

    if (osEnabled) {
      inspected = inspcted || inspectObject(node, nodes);
      similarity = similarityFn(inspected.object, osObjectParsed, Number(osAlpha));
    }

    if (
      keyMatch && valueMatch && classMatches
      && (similarity === null || similarity >= Number(osThreshold))
    ) {
      results.push({
        node,
        inspected,
        similarity
      });
    }

    inspected = null;
  }

  return results;
};


export const edgeToJs = (edge, parentNode, nodes) => {
  if (
    ["__proto__", "constructor", "prototype", "context", "extension"].includes(edge.via)
  ) return "";

  if (edge.type === "property") {
    return /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(edge.via)
      ? `.${edge.via}`
      : `["${edge.via}"]`;
  }

  if (edge.type === "element") {
    return `[${edge.via}]`;
  }

  if (edge.type === "internal" && parentNode.name === "Map") {
    const tableNode = nodes[edge.toNode];
    if (tableNode && tableNode.type === "array") {
      const keyEdge = tableNode.edges.find(e => e.name === "5");
      const valEdge = tableNode.edges.find(e => e.name === "6");
      if (keyEdge && valEdge) {
        const keyNode = nodes[keyEdge.toNode];
        if (keyNode?.type === "string" || keyNode?.type === "number") {
          return `.get(${keyNode.type === "string" ? `"${keyNode.name}"` : keyNode.name})`;
        }
      }
    }
    return `.get(/*unknownKey*/)`; // fallback
  }

  // fallback
  return `/*${edge.type}:${edge.via}*/`;
};



export const buildReverseEdges = (nodes) => {
  const reverse = new Map();
  nodes.forEach((node, idx) => {
    for (const e of node.edges) {
      if (!reverse.has(e.toNode)) reverse.set(e.toNode, []);
      reverse.get(e.toNode).push({ from: idx, via: e.name, type: e.type });
    }
  });
  return reverse;
};

const IGNORE = new Set(["__proto__", "constructor", "prototype", "context", "extension"]);

const idToProp = (s) =>
  /^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(s) ? `.${s}` : `["${s}"]`;

export const buildJsPath = (nodes, reverseEdges, targetIdx) => {
  const visited = new Set();
  let expr = "";

  const rootLabel = (n) => {
    if (n.type === "object" && n.name === "Window") return "window";
    if (n.type === "object" && n.name === "global") return "globalThis";
    if (n.type === "closure" || (n.type === "object" && /(Script|Context|Module)/.test(n.name))) {
      return `<lexical ${n.name}>`;
    }
    return null;
  };

  const dfs = (idx, cameFromEdge = null) => {
    if (visited.has(idx)) return null;
    visited.add(idx);

    const cur = nodes[idx];
    const root = rootLabel(cur);
    if (root) return root + expr;

    const parents = reverseEdges.get(idx) || [];
    for (const p of parents) {
      const parent = nodes[p.from];

      if (
        parent?.name === "Map" &&
        cur?.type === "array" &&
        p.type === "internal" && p.via === "table" &&
        cameFromEdge && cameFromEdge.type === "internal" && cameFromEdge.via === "6"
      ) {
        const keyEdge = cur.edges.find(e => e.type === "internal" && e.name === "5");
        if (keyEdge) {
          const keyNode = nodes[keyEdge.toNode];
          const keyLit = keyNode?.type === "string" ? `"${keyNode.name}"` : `${keyNode?.name}`;
          expr = `.get(${keyLit ?? "/*unknownKey*/"})` + expr;
        } else {
          expr = `.get(/*unknownKey1*/)` + expr;
        }
      }

      if (IGNORE.has(p.via)) {
        const r = dfs(p.from, p);
        if (r) return r;
        continue;
      }

      const seg =
        p.type === "property" ? idToProp(p.via) :
          p.type === "element" ? `[${p.via}]` :
            "";

      const prev = expr;
      expr = seg + expr;
      const r = dfs(p.from, p);
      if (r) return r;
      expr = prev;
    }
    return null;
  };

  return dfs(targetIdx);
};


