
export const dispatchGlobalApiEvent = (event, data) => {
  window.electronAPI.sendMessage({ event, sessionId: null, data });
}

export const dispatchEvent = (name, data) => {
  window.dispatchEvent(new CustomEvent(name, { detail: { data } }));
}

export const highlightTab = (tabKey, highlight) => {
  dispatchEvent(`highlightTab`, { tabKey, highlight });
}

export const showNotification = (data) => {
  dispatchEvent("notification", data);
}

export const copyToClipboard = (text, onCopied) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      () => onCopied(),
      (err) => alert("Error")
    );
  } else {
    let textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      if (document.execCommand("copy")) {
        onCopied()
      } else {
        alert("Error");
      }
    } catch (err) {
      alert("Error")
    } finally {
      document.body.removeChild(textarea);
    }
  }
}


export function base64urlEncode(data) {
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}


export const base64urlEncodeJSON = (obj) => {
  return base64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
}


export const base64urlDecode = (str) => {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  const base64 = str + "=".repeat(pad);
  const bin = atob(base64);

  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}


export async function verifyJwt(token, secret) {
  let errors = [];
  let payload;
  const [headerB64, payloadB64, signatureB64 = ""] = token.split(".");
  if (!headerB64 || !payloadB64) throw new Error("Invalid JWT format");
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));

  if (header.alg === "none") {
    if (signatureB64 !== "") {
      errors.push("Unexpected signature for alg=none");
    }
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      errors.push("Token expired");
    }
  } else {
    const alg = `SHA-${header.alg.substring(2)}`;
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: { name: alg } },
      false,
      ["verify"]
    );

    const signature = base64urlDecode(signatureB64);
    const valid = await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(data));
    if (!valid) {
      errors.push("Invalid signature");
    }

    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      errors.push("Token expired");
    }
  }
  return { errors, payload, algorithm: header.alg };
}


async function signData(algorithm, data, secret) {
  const enc = new TextEncoder();
  const dataBuffer = enc.encode(data);
  if (algorithm === "none") {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: { name: algorithm } },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, dataBuffer);
  return base64urlEncode(signature);

}


export async function createJwt(payload, secret, options = {}) {
  const alg = options.algorithm || "SHA-256";
  const header = {
    alg: alg !== "none" ? `HS${alg.split("-")[1]}` : alg,
    typ: "JWT"
  };

  if (options.expiresIn) {
    const now = Math.floor(Date.now() / 1000);
    payload = { ...payload, exp: now + options.expiresIn };
  }

  const headerEncoded = base64urlEncodeJSON(header);
  const payloadEncoded = base64urlEncodeJSON(payload);
  const data = `${headerEncoded}.${payloadEncoded}`;

  const signatureEncoded = await signData(alg, data, secret);
  return `${data}.${signatureEncoded}`;
}

export const jsonStringify = (obj, pretty) => {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === "bigint") {
      return value.toString() + "n";
    }
    return value;
  }, pretty ? 2 : 0);
};
