import { textMatches, replaceVars, bashEscape, parseCurlCommand } from "#src/common/utils.js";

export class NetworkMessage {
  bodySparator = "◖─────────────────────────────────────────────────────────────◗";

  _parse({ r, id, reqId, pageId, type }, parseFirstLine) {
    let firstLine, headers;
    this.id = id;
    this.pageId = pageId;
    this.reqId = reqId;
    this.type = type;
    try {
      const o = JSON.parse(r);
      firstLine = o[0];
      headers = o[1];
      const body = o.length > 2 ? o[o.length - 1] : undefined;
      this.data = typeof body === 'object' ? JSON.stringify(body) : body;
      if (o.length === 3 && this.data === this.bodySparator) {
        this.data = null;
      }
    } catch (e) {
      const [h, d] = r.split("\n\n");
      headers = h.split("\n");
      if (headers.length == 0) {
        this.parsingError();
      }
      firstLine = headers.shift();
      this.data = d;
    }
    if (Array.isArray(headers)) {
      this.headers = {};
      for (const header of headers) {
        const [k, v] = header.split(/:(.+)/);
        this.headers[k.trim()] = v.trim();
      }
    } else {
      this.headers = headers;
    }
    parseFirstLine(firstLine);
  }

  parsingError(message) {
    throw new Error(`Parsing error${message ? ": " + message : ""}`);
  }

  _serialize(format, firstLine) {
    let out;
    switch (format) {
      case "text":
        out = [
          firstLine,
          ...Object.keys(this.headers).map(k => `${k}: ${this.headers[k]}`),
          ...(this.data ? ["", this.data] : [])
        ];
        return out.join("\n");  // @TODO shall we use \r\n ?
      case "json":
        out = [
          firstLine,
          this.headers,
        ];
        if (this.data) {
          let d;
          try {
            d = JSON.parse(this.data);
          } catch (e) {
            d = this.data;
          }
          out.push(this.bodySparator, d);
        }
        return JSON.stringify(out, null, 2);
    }
  }

  vheaders(vars) {
    const h = {};
    for (const n in this.headers) {
      h[replaceVars(n, vars)] = replaceVars(this.headers[n], vars);
    }
    return h;
  }

  vdata(vars) {
    if (!this.data) {
      return this.data;
    }
    return replaceVars(this.data, vars);
  }
}

export class Request extends NetworkMessage {
  constructor(r, id, pageId, type) {
    super();
    this.httpMethods = [
      "GET",
      "HEAD",
      "OPTIONS",
      "TRACE",
      "PUT",
      "DELETE",
      "POST",
      "PATCH",
      "CONNECT",
    ];
    this.response = null;
    this.blocked = false;
    this.color = null;
    let req;
    try {
      req = parseCurlCommand(r);
    } catch {
      req = r;
    }
    if (typeof req === 'object') {
      this.id = req.id;
      this.pageId = req.pageId;
      // HTTP 1.1 is enfoced in the Chrome cli options
      this.httpVersion = req.httpVersion || "HTTP/1.1";
      this.type = req.type;
      this.method = req.method;
      this.url = req.url;
      this.headers = req.headers || {};
      this.data = req.data;
      this.blocked = req.blocked;
      this.response = req.response || null;
    } else {
      this._parse({ r: req, id, pageId, type }, (firstLine) => {
        if (typeof firstLine !== 'string') {
          firstLine = this._parseFirstLineArray(firstLine);
        }
        const tokens = firstLine.split(" ").filter(t => t !== "");
        if (tokens.length < 3) {
          this.parsingError("request's first line");
        }
        this.method = tokens.splice(0, 1)[0];
        this.httpVersion = tokens.splice(tokens.length - 1, 1)[0];
        if (!this.httpVersion.startsWith("HTTP/")) {
          this.parsingError("http version");
        }
        this.url = tokens.join(" ");

      });

      // HTTP 1.1 is enfoced in the Chrome cli options
      this.httpVersion = "HTTP/1.1";
      this.validate();
    }
  }

  _parseFirstLineArray(arr) {
    let i = 1;
    let auth = "";
    let hash = "";
    let pars = "";
    if (typeof arr[i] === 'object') {
      auth = `${arr[i].username}:${arr[i].password}@`;
      i++;
    }
    const purl = new URL(arr[i++]);
    const fullUrl = `${purl.protocol}//${auth}${purl.host}${arr[i++]}`;
    if (arr[i].length > 0) {
      pars = `?${arr[i].join("&")}`
    }
    if (arr.length - 1 > ++i) {
      hash = arr[i];
    }
    return `${arr[0]} ${fullUrl}${pars}${hash} ${arr[arr.length - 1]}`;
  }

  serialize(format) {
    if (format === "curl") {
      const cmd = ["curl"];
      if (this.method !== "GET") {
        cmd.push("-X", this.method);
      }
      for (const hdr in this.headers) {
        cmd.push("-H", `${hdr}: ${this.headers[hdr]}`);
      }
      if (this.data) {
        cmd.push("--data", this.data);
      }
      cmd.push(this.url);
      return bashEscape(cmd);
    }
    let firstLine = `${this.method} ${this.url} ${this.httpVersion}`;
    if (format === "json+") {
      const purl = new URL(this.url);
      const params = [];
      for (const [key, value] of purl.searchParams.entries()) {
        params.push(`${key}=${value}`);
      }
      firstLine = [
        this.method,
        ...(purl.username || purl.password ? [
          { username: purl.username || "", password: purl.password || "" }
        ] : []),
        purl.origin,
        purl.pathname,
        params,
        ...(purl.hash ? [purl.hash] : []),
        this.httpVersion
      ];
      return this._serialize("json", firstLine);
    }
    return this._serialize(format, firstLine);
  }

  compare(request) {
    if (this.headers) {
      if (!request.headers) {
        return false;
      }
      for (const h in this.headers) {
        if (request.headers[h] !== this.headers[h]) {
          return false;
        }
      }
    }
    if (
      request.data != this.data
      || request.method != this.method
      || request.url != this.url
    ) {
      return false;
    }
    return true;
  }

  matches(pattern, options) {
    const resp = this.response ? ` ${this.response.serialize("text")}` : "";
    const t = `${this.serialize("text")}${resp}`;
    return textMatches(t, pattern, { exactMatch: false, ...options });
  }

  vurl(vars) {
    return replaceVars(this.url, vars);
  }

  validate() {
    if (!this.url) {
      this.parsingError("url");
    }
    if (!this.httpMethods.includes(this.method)) {
      this.parsingError(`method ${this.method} not recognised`);
    }
  }
}


export class Response extends NetworkMessage {

  constructor(r, reqId, pageId) {
    super();
    if (typeof r == 'object') {
      this.reqId = r.reqId;
      this.pageId = r.pageId;
      // HTTP 1.1 is enfoced in the Chrome cli options
      this.httpVersion = r.httpVersion || "HTTP/1.1";
      this.statusCode = r.statusCode ? Number(r.statusCode) : undefined;
      this.headers = r.headers;
      this.data = r.data;
    } else {
      this._parse({ r, reqId, pageId }, (firstLine) => {
        this.statusCode = Number(firstLine.trim());
      });
      // HTTP 1.1 is enfoced in the Chrome cli options
      this.httpVersion = "HTTP/1.1";
      this.validate();
    }
  }

  serialize(format) {
    return this._serialize(format, `${this.statusCode}`);
  }

  validate() {
    if (!this.statusCode || this.statusCode < 100 || this.statusCode > 599) {
      this.parsingError("status code");
    }
  }

}
