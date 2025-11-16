import { iterate } from "#src/app/utils.js";

export class ObjectSimilarity {

  constructor(options = {}) {
    this.depth = options.depth ?? 3;
    this.shingleWindow = options.shingleWindow ?? 4;

    this.includeValues = options.includeValues ?? false;
    this.includePrimitiveValues = options.includePrimitiveValues ?? true;
    this.deepValues = options.deepValues ?? false;

    this._crc32_table = this._make_crc32_table();
    this._textEncoder = new TextEncoder();
  }

  /**
   * Full hybrid similarity:
   *   α * Jaccard(tokens) + (1-α) * Dice(key similarity)
   * Good for structural comparisons of arbitrary JS objects.
   */
  hybridSimilarity(obj1, obj2, alpha = 0.3) {
    const t1 = this._objectToTokens(obj1, this.depth).sort();
    const t2 = this._objectToTokens(obj2, this.depth).sort();

    const j = this._jaccardTokens(t1, t2);
    const f = this._fuzzyKeySimilarity(t1, t2);

    return alpha * j + (1 - alpha) * f;
  }

  /**
   * Pure Jaccard
   */
  jaccardSimilarity(obj1, obj2) {
    const t1 = this._objectToTokens(obj1, this.depth).sort();
    const t2 = this._objectToTokens(obj2, this.depth).sort();
    return this._jaccardTokens(t1, t2);
  }

  /**
   * Compute SimHash for > future use (large objects)
   */
  simhashObject(obj) {
    const tokens = this._objectToTokens(obj, this.depth).sort();
    return this._simhash64(tokens);
  }

  _objectToTokens(obj, maxDepth = 2, prefix = "") {
    const tokens = [];
    const seen = new WeakSet();

    const walk = (value, path, depth) => {
      if (depth > maxDepth) return;

      if (value === null) {
        tokens.push(`${path}=null`);
        return;
      }

      const t = typeof value;

      if (t !== "object") {
        if (this.includeValues) {
          tokens.push(`${path}=${String(value)}`);
        } else if (this.includePrimitiveValues) {
          tokens.push(`${path}:${t}`);
        } else {
          tokens.push(path);
        }
        return;
      }

      if (seen.has(value)) {
        tokens.push(`${path}=[Circular]`);
        return;
      }
      seen.add(value);

      if (this.deepValues) {
        try {
          const json = JSON.stringify(value);
          if (json.length > 200) {
            const hv = this._crc32(json);
            tokens.push(`${path}=${hv}`);
          } else {
            tokens.push(`${path}=${json}`);
          }
        } catch {
          tokens.push(`${path}={nonSerializable}`);
        }
        return;
      }

      let hadChildren = false;
      try {
        for (const [key, child] of iterate(value)) {
          hadChildren = true;
          const subPath = path ? `${path}.${String(key)}` : String(key);
          walk(child, subPath, depth + 1);
        }
      } catch {
        tokens.push(`${path}=<error>`);
        return;
      }

      if (!hadChildren) {
        tokens.push(`${path}={}`);
      }
    };

    walk(obj, prefix, 0);
    return tokens;
  }

  _jaccardTokens(tokens1, tokens2) {
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    const union = new Set([...set1, ...set2]).size;
    return union === 0 ? 1 : intersection / union;
  }

  _extractKey(token) {
    const i = token.indexOf(":");
    return i === -1 ? token : token.slice(0, i);
  }

  _dice(a, b) {
    if (a === b) return 1;

    if (a.length < 2 || b.length < 2) {
      return a === b ? 1 : 0;
    }

    const bigrams = (s) => {
      const out = [];
      for (let i = 0; i < s.length - 1; i++) {
        out.push(s.slice(i, i+2));
      }
      return out;
    };

    const A = new Set(bigrams(a));
    const B = new Set(bigrams(b));

    let intersection = 0;
    for (const g of A) if (B.has(g)) intersection++;

    return (2 * intersection) / (A.size + B.size);
  }

  _fuzzyKeySimilarity(tokens1, tokens2) {
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let total = 0;

    for (const t1 of tokens1) {
      const k1 = this._extractKey(t1);
      let best = 0;

      for (const t2 of tokens2) {
        const k2 = this._extractKey(t2);
        const score = this._dice(k1, k2);
        if (score > best) best = score;
      }

      total += best;
    }

    return total / tokens1.length;
  }

  hamming(a, b) {
    let x = a ^ b;
    let c = 0;
    while (x) {
      x &= x - 1n;
      c++;
    }
    return c;
  }

  similaritySimhash(h1, h2) {
    return 1 - (this.hamming(h1, h2) / 64);
  }

  _hash64(token) {
    const lower = this._crc32(token);
    const upper = this._crc32("X" + token);
    return (BigInt(upper) << 32n) | BigInt(lower);
  }

  _simhash64(tokens) {
    const w = this.shingleWindow;

    const shingles = [];
    for (let i = 0; i < tokens.length - (w - 1); i++) {
      shingles.push(tokens.slice(i, i + w).join("|"));
    }

    if (shingles.length === 0) {
      return this._hash64(tokens.join("|"));
    }

    const vec = new Array(64).fill(0);

    for (const s of shingles) {
      const h = this._hash64(s);
      for (let i = 0n; i < 64n; i++) {
        if ((h >> i) & 1n) vec[Number(i)] += 1;
        else vec[Number(i)] -= 1;
      }
    }

    let out = 0n;
    for (let i = 0; i < 64; i++) {
      if (vec[i] > 0) out |= 1n << BigInt(i);
    }
    return out;
  }

  _crc32(str) {
    let crc = 0xffffffff;
    for (const c of this._textEncoder.encode(str)) {
      crc = (crc >>> 8) ^ this._crc32_table[(crc ^ c) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  _make_crc32_table() {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1)
          ? (0xEDB88320 ^ (c >>> 1))
          : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  }
}
