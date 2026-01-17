import { quote as quoteBash, parse as parseBash } from "shell-quote";

export const textMatches = (text, pattern, { matchCase, useRegexp, exactMatch = true }) => {
  if (!useRegexp) {
    if (!matchCase) {
      pattern = pattern.toLowerCase();
      text = text.toLowerCase();
    }
    return exactMatch
      ? pattern === text
      : text.includes(pattern);
  }
  try {
    const r = new RegExp(pattern, matchCase ? "" : "i");
    return r.test(text);
  } catch {
    return false;
  }
};


export const isValidRegExp = (value) => {
  if (value) {
    try {
      new RegExp(value);
    } catch (e) {
      return false;
    }
  }
  return true;
};

/**
 * A variable is a token enclosed in {{ and }}.
 * {{identifier}} = variable
 * {{=identifier}} = literal ({{identifier}})
 * {{non_existing}} = {{non_existing}}
 */
export const replaceVars = (text, variables) => {
  return text
    .replace(/\{\{([^}=][^}]*)\}\}/g, (_, name) => (
      variables[name] ?? `{{${name}}}`
    ))
    .replace(/\{\{=([^}]+)\}\}/g, '{{$1}}');
};

export const getUnresolvedVars = (text, variables) => {
  const unresolved = new Set();
  for(const v of text.matchAll(/\{\{([^}=][^}]*)\}\}/g) || []){
    if(v[1] && variables[v[1]] === undefined){
      unresolved.add(v[1]);
    }
  }
  return [...unresolved];
};

export const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const bashEscape = (args) => {
  return args.map((str) => {
    if (str === "") {
      return "''";
    }
    if (/^[a-zA-Z0-9_\/.-]+$/.test(str)) {
      return str;
    }
    return `'${str.replace(/'/g, `'\''`)}'`;
  }).join(' ');
}

export const parseCurlCommand = (cmd) => {
  const args = parseBash(cmd);
  if (!args.length || args[0] !== "curl") {
    throw new Error("It's not a cURL command");
  }

  const result = {
    method: "GET",
    url: null,
    headers: {},
    data: null,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-X":
      case "--request":
        result.method = (args[++i] || "GET").toUpperCase();
        break;
      case "-H":
      case "--header": {
        const header = args[++i] || "";
        const [key, ...rest] = header.split(":");
        if (key && rest.length)
          result.headers[key.trim()] = rest.join(":").trim();
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-urlencode":
        result.data = args[++i] || "";
        if (result.method === "GET") result.method = "POST";
        break;
      case "--url":
        result.url = args[++i] || result.url;
        break;
      default:
        if (!arg.startsWith("-")) {
          result.url = result.url || arg;
        }
        break;
    }
  }

  return result;
}