// minimatch v10.2.5 — ISC License — https://github.com/isaacs/minimatch
// Vendored single-file CJS bundle via esbuild. Do not edit manually.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// node_modules/minimatch/dist/esm/index.js
var index_exports = {};
__export(index_exports, {
  AST: () => AST,
  GLOBSTAR: () => GLOBSTAR,
  Minimatch: () => Minimatch,
  braceExpand: () => braceExpand,
  defaults: () => defaults,
  escape: () => escape,
  filter: () => filter,
  makeRe: () => makeRe,
  match: () => match,
  minimatch: () => minimatch,
  sep: () => sep,
  unescape: () => unescape
});
module.exports = __toCommonJS(index_exports);

// node_modules/balanced-match/dist/esm/index.js
var balanced = (a, b, str) => {
  let ma = a instanceof RegExp ? maybeMatch(a, str) : a, mb = b instanceof RegExp ? maybeMatch(b, str) : b, r = ma !== null && mb != null && range(ma, mb, str);
  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + ma.length, r[1]),
    post: str.slice(r[1] + mb.length)
  };
}, maybeMatch = (reg, str) => {
  let m = str.match(reg);
  return m ? m[0] : null;
}, range = (a, b, str) => {
  let begs, beg, left, right, result, ai = str.indexOf(a), bi = str.indexOf(b, ai + 1), i = ai;
  if (ai >= 0 && bi > 0) {
    if (a === b)
      return [ai, bi];
    for (begs = [], left = str.length; i >= 0 && !result; ) {
      if (i === ai)
        begs.push(i), ai = str.indexOf(a, i + 1);
      else if (begs.length === 1) {
        let r = begs.pop();
        r !== void 0 && (result = [r, bi]);
      } else
        beg = begs.pop(), beg !== void 0 && beg < left && (left = beg, right = bi), bi = str.indexOf(b, i + 1);
      i = ai < bi && ai >= 0 ? ai : bi;
    }
    begs.length && right !== void 0 && (result = [left, right]);
  }
  return result;
};

// node_modules/brace-expansion/dist/esm/index.js
var escSlash = "\0SLASH" + Math.random() + "\0", escOpen = "\0OPEN" + Math.random() + "\0", escClose = "\0CLOSE" + Math.random() + "\0", escComma = "\0COMMA" + Math.random() + "\0", escPeriod = "\0PERIOD" + Math.random() + "\0", escSlashPattern = new RegExp(escSlash, "g"), escOpenPattern = new RegExp(escOpen, "g"), escClosePattern = new RegExp(escClose, "g"), escCommaPattern = new RegExp(escComma, "g"), escPeriodPattern = new RegExp(escPeriod, "g"), slashPattern = /\\\\/g, openPattern = /\\{/g, closePattern = /\\}/g, commaPattern = /\\,/g, periodPattern = /\\\./g, EXPANSION_MAX = 1e5;
function numeric(str) {
  return isNaN(str) ? str.charCodeAt(0) : parseInt(str, 10);
}
function escapeBraces(str) {
  return str.replace(slashPattern, escSlash).replace(openPattern, escOpen).replace(closePattern, escClose).replace(commaPattern, escComma).replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
  return str.replace(escSlashPattern, "\\").replace(escOpenPattern, "{").replace(escClosePattern, "}").replace(escCommaPattern, ",").replace(escPeriodPattern, ".");
}
function parseCommaParts(str) {
  if (!str)
    return [""];
  let parts = [], m = balanced("{", "}", str);
  if (!m)
    return str.split(",");
  let { pre, body, post } = m, p = pre.split(",");
  p[p.length - 1] += "{" + body + "}";
  let postParts = parseCommaParts(post);
  return post.length && (p[p.length - 1] += postParts.shift(), p.push.apply(p, postParts)), parts.push.apply(parts, p), parts;
}
function expand(str, options = {}) {
  if (!str)
    return [];
  let { max = EXPANSION_MAX } = options;
  return str.slice(0, 2) === "{}" && (str = "\\{\\}" + str.slice(2)), expand_(escapeBraces(str), max, !0).map(unescapeBraces);
}
function embrace(str) {
  return "{" + str + "}";
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}
function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}
function expand_(str, max, isTop) {
  let expansions = [], m = balanced("{", "}", str);
  if (!m)
    return [str];
  let pre = m.pre, post = m.post.length ? expand_(m.post, max, !1) : [""];
  if (/\$$/.test(m.pre))
    for (let k = 0; k < post.length && k < max; k++) {
      let expansion = pre + "{" + m.body + "}" + post[k];
      expansions.push(expansion);
    }
  else {
    let isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body), isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body), isSequence = isNumericSequence || isAlphaSequence, isOptions = m.body.indexOf(",") >= 0;
    if (!isSequence && !isOptions)
      return m.post.match(/,(?!,).*\}/) ? (str = m.pre + "{" + m.body + escClose + m.post, expand_(str, max, !0)) : [str];
    let n;
    if (isSequence)
      n = m.body.split(/\.\./);
    else if (n = parseCommaParts(m.body), n.length === 1 && n[0] !== void 0 && (n = expand_(n[0], max, !1).map(embrace), n.length === 1))
      return post.map((p) => m.pre + n[0] + p);
    let N;
    if (isSequence && n[0] !== void 0 && n[1] !== void 0) {
      let x = numeric(n[0]), y = numeric(n[1]), width = Math.max(n[0].length, n[1].length), incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1, test = lte;
      y < x && (incr *= -1, test = gte);
      let pad = n.some(isPadded);
      N = [];
      for (let i = x; test(i, y) && N.length < max; i += incr) {
        let c;
        if (isAlphaSequence)
          c = String.fromCharCode(i), c === "\\" && (c = "");
        else if (c = String(i), pad) {
          let need = width - c.length;
          if (need > 0) {
            let z = new Array(need + 1).join("0");
            i < 0 ? c = "-" + z + c.slice(1) : c = z + c;
          }
        }
        N.push(c);
      }
    } else {
      N = [];
      for (let j = 0; j < n.length; j++)
        N.push.apply(N, expand_(n[j], max, !1));
    }
    for (let j = 0; j < N.length; j++)
      for (let k = 0; k < post.length && expansions.length < max; k++) {
        let expansion = pre + N[j] + post[k];
        (!isTop || isSequence || expansion) && expansions.push(expansion);
      }
  }
  return expansions;
}

// node_modules/minimatch/dist/esm/assert-valid-pattern.js
var assertValidPattern = (pattern) => {
  if (typeof pattern != "string")
    throw new TypeError("invalid pattern");
  if (pattern.length > 65536)
    throw new TypeError("pattern is too long");
};

// node_modules/minimatch/dist/esm/brace-expressions.js
var posixClasses = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", !0],
  "[:alpha:]": ["\\p{L}\\p{Nl}", !0],
  "[:ascii:]": ["\\x00-\\x7f", !1],
  "[:blank:]": ["\\p{Zs}\\t", !0],
  "[:cntrl:]": ["\\p{Cc}", !0],
  "[:digit:]": ["\\p{Nd}", !0],
  "[:graph:]": ["\\p{Z}\\p{C}", !0, !0],
  "[:lower:]": ["\\p{Ll}", !0],
  "[:print:]": ["\\p{C}", !0],
  "[:punct:]": ["\\p{P}", !0],
  "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", !0],
  "[:upper:]": ["\\p{Lu}", !0],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", !0],
  "[:xdigit:]": ["A-Fa-f0-9", !1]
}, braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&"), regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), rangesToString = (ranges) => ranges.join(""), parseClass = (glob, position) => {
  let pos = position;
  if (glob.charAt(pos) !== "[")
    throw new Error("not in a brace expression");
  let ranges = [], negs = [], i = pos + 1, sawStart = !1, uflag = !1, escaping = !1, negate = !1, endPos = pos, rangeStart = "";
  WHILE: for (; i < glob.length; ) {
    let c = glob.charAt(i);
    if ((c === "!" || c === "^") && i === pos + 1) {
      negate = !0, i++;
      continue;
    }
    if (c === "]" && sawStart && !escaping) {
      endPos = i + 1;
      break;
    }
    if (sawStart = !0, c === "\\" && !escaping) {
      escaping = !0, i++;
      continue;
    }
    if (c === "[" && !escaping) {
      for (let [cls, [unip, u, neg]] of Object.entries(posixClasses))
        if (glob.startsWith(cls, i)) {
          if (rangeStart)
            return ["$.", !1, glob.length - pos, !0];
          i += cls.length, neg ? negs.push(unip) : ranges.push(unip), uflag = uflag || u;
          continue WHILE;
        }
    }
    if (escaping = !1, rangeStart) {
      c > rangeStart ? ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c)) : c === rangeStart && ranges.push(braceEscape(c)), rangeStart = "", i++;
      continue;
    }
    if (glob.startsWith("-]", i + 1)) {
      ranges.push(braceEscape(c + "-")), i += 2;
      continue;
    }
    if (glob.startsWith("-", i + 1)) {
      rangeStart = c, i += 2;
      continue;
    }
    ranges.push(braceEscape(c)), i++;
  }
  if (endPos < i)
    return ["", !1, 0, !1];
  if (!ranges.length && !negs.length)
    return ["$.", !1, glob.length - pos, !0];
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    let r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regexpEscape(r), !1, endPos - pos, !1];
  }
  let sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]", snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
  return [ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs, uflag, endPos - pos, !0];
};

// node_modules/minimatch/dist/esm/unescape.js
var unescape = (s, { windowsPathsNoEscape = !1, magicalBraces = !0 } = {}) => magicalBraces ? windowsPathsNoEscape ? s.replace(/\[([^/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\])\]/g, "$1$2").replace(/\\([^/])/g, "$1") : windowsPathsNoEscape ? s.replace(/\[([^/\\{}])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\{}])\]/g, "$1$2").replace(/\\([^/{}])/g, "$1");

// node_modules/minimatch/dist/esm/ast.js
var _a, types = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]), isExtglobType = (c) => types.has(c), isExtglobAST = (c) => isExtglobType(c.type), adoptionMap = /* @__PURE__ */ new Map([
  ["!", ["@"]],
  ["?", ["?", "@"]],
  ["@", ["@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@"]]
]), adoptionWithSpaceMap = /* @__PURE__ */ new Map([
  ["!", ["?"]],
  ["@", ["?"]],
  ["+", ["?", "*"]]
]), adoptionAnyMap = /* @__PURE__ */ new Map([
  ["!", ["?", "@"]],
  ["?", ["?", "@"]],
  ["@", ["?", "@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@", "?", "*"]]
]), usurpMap = /* @__PURE__ */ new Map([
  ["!", /* @__PURE__ */ new Map([["!", "@"]])],
  [
    "?",
    /* @__PURE__ */ new Map([
      ["*", "*"],
      ["+", "*"]
    ])
  ],
  [
    "@",
    /* @__PURE__ */ new Map([
      ["!", "!"],
      ["?", "?"],
      ["@", "@"],
      ["*", "*"],
      ["+", "+"]
    ])
  ],
  [
    "+",
    /* @__PURE__ */ new Map([
      ["?", "*"],
      ["*", "*"]
    ])
  ]
]), startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))", startNoDot = "(?!\\.)", addPatternStart = /* @__PURE__ */ new Set(["[", "."]), justDots = /* @__PURE__ */ new Set(["..", "."]), reSpecials = new Set("().*{}+?[]^$\\!"), regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), qmark = "[^/]", star = qmark + "*?", starNoEmpty = qmark + "+?", ID = 0, AST = class {
  type;
  #root;
  #hasMagic;
  #uflag = !1;
  #parts = [];
  #parent;
  #parentIndex;
  #negs;
  #filledNegs = !1;
  #options;
  #toString;
  // set to true if it's an extglob with no children
  // (which really means one child of '')
  #emptyExt = !1;
  id = ++ID;
  get depth() {
    return (this.#parent?.depth ?? -1) + 1;
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return {
      "@@type": "AST",
      id: this.id,
      type: this.type,
      root: this.#root.id,
      parent: this.#parent?.id,
      depth: this.depth,
      partsLength: this.#parts.length,
      parts: this.#parts
    };
  }
  constructor(type, parent, options = {}) {
    this.type = type, type && (this.#hasMagic = !0), this.#parent = parent, this.#root = this.#parent ? this.#parent.#root : this, this.#options = this.#root === this ? options : this.#root.#options, this.#negs = this.#root === this ? [] : this.#root.#negs, type === "!" && !this.#root.#filledNegs && this.#negs.push(this), this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
  }
  get hasMagic() {
    if (this.#hasMagic !== void 0)
      return this.#hasMagic;
    for (let p of this.#parts)
      if (typeof p != "string" && (p.type || p.hasMagic))
        return this.#hasMagic = !0;
    return this.#hasMagic;
  }
  // reconstructs the pattern
  toString() {
    return this.#toString !== void 0 ? this.#toString : this.type ? this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")" : this.#toString = this.#parts.map((p) => String(p)).join("");
  }
  #fillNegs() {
    if (this !== this.#root)
      throw new Error("should only call on root");
    if (this.#filledNegs)
      return this;
    this.toString(), this.#filledNegs = !0;
    let n;
    for (; n = this.#negs.pop(); ) {
      if (n.type !== "!")
        continue;
      let p = n, pp = p.#parent;
      for (; pp; ) {
        for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++)
          for (let part of n.#parts) {
            if (typeof part == "string")
              throw new Error("string part in extglob AST??");
            part.copyIn(pp.#parts[i]);
          }
        p = pp, pp = p.#parent;
      }
    }
    return this;
  }
  push(...parts) {
    for (let p of parts)
      if (p !== "") {
        if (typeof p != "string" && !(p instanceof _a && p.#parent === this))
          throw new Error("invalid part: " + p);
        this.#parts.push(p);
      }
  }
  toJSON() {
    let ret = this.type === null ? this.#parts.slice().map((p) => typeof p == "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
    return this.isStart() && !this.type && ret.unshift([]), this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!") && ret.push({}), ret;
  }
  isStart() {
    if (this.#root === this)
      return !0;
    if (!this.#parent?.isStart())
      return !1;
    if (this.#parentIndex === 0)
      return !0;
    let p = this.#parent;
    for (let i = 0; i < this.#parentIndex; i++) {
      let pp = p.#parts[i];
      if (!(pp instanceof _a && pp.type === "!"))
        return !1;
    }
    return !0;
  }
  isEnd() {
    if (this.#root === this || this.#parent?.type === "!")
      return !0;
    if (!this.#parent?.isEnd())
      return !1;
    if (!this.type)
      return this.#parent?.isEnd();
    let pl = this.#parent ? this.#parent.#parts.length : 0;
    return this.#parentIndex === pl - 1;
  }
  copyIn(part) {
    typeof part == "string" ? this.push(part) : this.push(part.clone(this));
  }
  clone(parent) {
    let c = new _a(this.type, parent);
    for (let p of this.#parts)
      c.copyIn(p);
    return c;
  }
  static #parseAST(str, ast, pos, opt, extDepth) {
    let maxDepth = opt.maxExtglobRecursion ?? 2, escaping = !1, inBrace = !1, braceStart = -1, braceNeg = !1;
    if (ast.type === null) {
      let i2 = pos, acc2 = "";
      for (; i2 < str.length; ) {
        let c = str.charAt(i2++);
        if (escaping || c === "\\") {
          escaping = !escaping, acc2 += c;
          continue;
        }
        if (inBrace) {
          i2 === braceStart + 1 ? (c === "^" || c === "!") && (braceNeg = !0) : c === "]" && !(i2 === braceStart + 2 && braceNeg) && (inBrace = !1), acc2 += c;
          continue;
        } else if (c === "[") {
          inBrace = !0, braceStart = i2, braceNeg = !1, acc2 += c;
          continue;
        }
        if (!opt.noext && isExtglobType(c) && str.charAt(i2) === "(" && extDepth <= maxDepth) {
          ast.push(acc2), acc2 = "";
          let ext2 = new _a(c, ast);
          i2 = _a.#parseAST(str, ext2, i2, opt, extDepth + 1), ast.push(ext2);
          continue;
        }
        acc2 += c;
      }
      return ast.push(acc2), i2;
    }
    let i = pos + 1, part = new _a(null, ast), parts = [], acc = "";
    for (; i < str.length; ) {
      let c = str.charAt(i++);
      if (escaping || c === "\\") {
        escaping = !escaping, acc += c;
        continue;
      }
      if (inBrace) {
        i === braceStart + 1 ? (c === "^" || c === "!") && (braceNeg = !0) : c === "]" && !(i === braceStart + 2 && braceNeg) && (inBrace = !1), acc += c;
        continue;
      } else if (c === "[") {
        inBrace = !0, braceStart = i, braceNeg = !1, acc += c;
        continue;
      }
      if (!opt.noext && isExtglobType(c) && str.charAt(i) === "(" && /* c8 ignore start - the maxDepth is sufficient here */
      (extDepth <= maxDepth || ast && ast.#canAdoptType(c))) {
        let depthAdd = ast && ast.#canAdoptType(c) ? 0 : 1;
        part.push(acc), acc = "";
        let ext2 = new _a(c, part);
        part.push(ext2), i = _a.#parseAST(str, ext2, i, opt, extDepth + depthAdd);
        continue;
      }
      if (c === "|") {
        part.push(acc), acc = "", parts.push(part), part = new _a(null, ast);
        continue;
      }
      if (c === ")")
        return acc === "" && ast.#parts.length === 0 && (ast.#emptyExt = !0), part.push(acc), acc = "", ast.push(...parts, part), i;
      acc += c;
    }
    return ast.type = null, ast.#hasMagic = void 0, ast.#parts = [str.substring(pos - 1)], i;
  }
  #canAdoptWithSpace(child) {
    return this.#canAdopt(child, adoptionWithSpaceMap);
  }
  #canAdopt(child, map = adoptionMap) {
    if (!child || typeof child != "object" || child.type !== null || child.#parts.length !== 1 || this.type === null)
      return !1;
    let gc = child.#parts[0];
    return !gc || typeof gc != "object" || gc.type === null ? !1 : this.#canAdoptType(gc.type, map);
  }
  #canAdoptType(c, map = adoptionAnyMap) {
    return !!map.get(this.type)?.includes(c);
  }
  #adoptWithSpace(child, index) {
    let gc = child.#parts[0], blank = new _a(null, gc, this.options);
    blank.#parts.push(""), gc.push(blank), this.#adopt(child, index);
  }
  #adopt(child, index) {
    let gc = child.#parts[0];
    this.#parts.splice(index, 1, ...gc.#parts);
    for (let p of gc.#parts)
      typeof p == "object" && (p.#parent = this);
    this.#toString = void 0;
  }
  #canUsurpType(c) {
    return !!usurpMap.get(this.type)?.has(c);
  }
  #canUsurp(child) {
    if (!child || typeof child != "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1)
      return !1;
    let gc = child.#parts[0];
    return !gc || typeof gc != "object" || gc.type === null ? !1 : this.#canUsurpType(gc.type);
  }
  #usurp(child) {
    let m = usurpMap.get(this.type), gc = child.#parts[0], nt = m?.get(gc.type);
    if (!nt)
      return !1;
    this.#parts = gc.#parts;
    for (let p of this.#parts)
      typeof p == "object" && (p.#parent = this);
    this.type = nt, this.#toString = void 0, this.#emptyExt = !1;
  }
  static fromGlob(pattern, options = {}) {
    let ast = new _a(null, void 0, options);
    return _a.#parseAST(pattern, ast, 0, options, 0), ast;
  }
  // returns the regular expression if there's magic, or the unescaped
  // string if not.
  toMMPattern() {
    if (this !== this.#root)
      return this.#root.toMMPattern();
    let glob = this.toString(), [re, body, hasMagic, uflag] = this.toRegExpSource();
    if (!(hasMagic || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob.toUpperCase() !== glob.toLowerCase()))
      return body;
    let flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
    return Object.assign(new RegExp(`^${re}$`, flags), {
      _src: re,
      _glob: glob
    });
  }
  get options() {
    return this.#options;
  }
  // returns the string match, the regexp source, whether there's magic
  // in the regexp (so a regular expression is required) and whether or
  // not the uflag is needed for the regular expression (for posix classes)
  // TODO: instead of injecting the start/end at this point, just return
  // the BODY of the regexp, along with the start/end portions suitable
  // for binding the start/end in either a joined full-path makeRe context
  // (where we bind to (^|/), or a standalone matchPart context (where
  // we bind to ^, and not /).  Otherwise slashes get duped!
  //
  // In part-matching mode, the start is:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: ^(?!\.\.?$)
  // - if dots allowed or not possible: ^
  // - if dots possible and not allowed: ^(?!\.)
  // end is:
  // - if not isEnd(): nothing
  // - else: $
  //
  // In full-path matching mode, we put the slash at the START of the
  // pattern, so start is:
  // - if first pattern: same as part-matching mode
  // - if not isStart(): nothing
  // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
  // - if dots allowed or not possible: /
  // - if dots possible and not allowed: /(?!\.)
  // end is:
  // - if last pattern, same as part-matching mode
  // - else nothing
  //
  // Always put the (?:$|/) on negated tails, though, because that has to be
  // there to bind the end of the negated pattern portion, and it's easier to
  // just stick it in now rather than try to inject it later in the middle of
  // the pattern.
  //
  // We can just always return the same end, and leave it up to the caller
  // to know whether it's going to be used joined or in parts.
  // And, if the start is adjusted slightly, can do the same there:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
  // - if dots allowed or not possible: (?:/|^)
  // - if dots possible and not allowed: (?:/|^)(?!\.)
  //
  // But it's better to have a simpler binding without a conditional, for
  // performance, so probably better to return both start options.
  //
  // Then the caller just ignores the end if it's not the first pattern,
  // and the start always gets applied.
  //
  // But that's always going to be $ if it's the ending pattern, or nothing,
  // so the caller can just attach $ at the end of the pattern when building.
  //
  // So the todo is:
  // - better detect what kind of start is needed
  // - return both flavors of starting pattern
  // - attach $ at the end of the pattern when creating the actual RegExp
  //
  // Ah, but wait, no, that all only applies to the root when the first pattern
  // is not an extglob. If the first pattern IS an extglob, then we need all
  // that dot prevention biz to live in the extglob portions, because eg
  // +(*|.x*) can match .xy but not .yx.
  //
  // So, return the two flavors if it's #root and the first child is not an
  // AST, otherwise leave it to the child AST to handle it, and there,
  // use the (?:^|/) style of start binding.
  //
  // Even simplified further:
  // - Since the start for a join is eg /(?!\.) and the start for a part
  // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
  // or start or whatever) and prepend ^ or / at the Regexp construction.
  toRegExpSource(allowDot) {
    let dot = allowDot ?? !!this.#options.dot;
    if (this.#root === this && (this.#flatten(), this.#fillNegs()), !isExtglobAST(this)) {
      let noEmpty = this.isStart() && this.isEnd() && !this.#parts.some((s) => typeof s != "string"), src = this.#parts.map((p) => {
        let [re, _, hasMagic, uflag] = typeof p == "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
        return this.#hasMagic = this.#hasMagic || hasMagic, this.#uflag = this.#uflag || uflag, re;
      }).join(""), start2 = "";
      if (this.isStart() && typeof this.#parts[0] == "string" && !(this.#parts.length === 1 && justDots.has(this.#parts[0]))) {
        let aps = addPatternStart, needNoTrav = (
          // dots are allowed, and the pattern starts with [ or .
          dot && aps.has(src.charAt(0)) || // the pattern starts with \., and then [ or .
          src.startsWith("\\.") && aps.has(src.charAt(2)) || // the pattern starts with \.\., and then [ or .
          src.startsWith("\\.\\.") && aps.has(src.charAt(4))
        ), needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
        start2 = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
      }
      let end = "";
      return this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!" && (end = "(?:$|\\/)"), [
        start2 + src + end,
        unescape(src),
        this.#hasMagic = !!this.#hasMagic,
        this.#uflag
      ];
    }
    let repeated = this.type === "*" || this.type === "+", start = this.type === "!" ? "(?:(?!(?:" : "(?:", body = this.#partsToRegExp(dot);
    if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
      let s = this.toString(), me = this;
      return me.#parts = [s], me.type = null, me.#hasMagic = void 0, [s, unescape(this.toString()), !1, !1];
    }
    let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ? "" : this.#partsToRegExp(!0);
    bodyDotAllowed === body && (bodyDotAllowed = ""), bodyDotAllowed && (body = `(?:${body})(?:${bodyDotAllowed})*?`);
    let final = "";
    if (this.type === "!" && this.#emptyExt)
      final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
    else {
      let close = this.type === "!" ? (
        // !() must match something,but !(x) can match ''
        "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star + ")"
      ) : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? ")?" : `)${this.type}`;
      final = start + body + close;
    }
    return [
      final,
      unescape(body),
      this.#hasMagic = !!this.#hasMagic,
      this.#uflag
    ];
  }
  #flatten() {
    if (isExtglobAST(this)) {
      let iterations = 0, done = !1;
      do {
        done = !0;
        for (let i = 0; i < this.#parts.length; i++) {
          let c = this.#parts[i];
          typeof c == "object" && (c.#flatten(), this.#canAdopt(c) ? (done = !1, this.#adopt(c, i)) : this.#canAdoptWithSpace(c) ? (done = !1, this.#adoptWithSpace(c, i)) : this.#canUsurp(c) && (done = !1, this.#usurp(c)));
        }
      } while (!done && ++iterations < 10);
    } else
      for (let p of this.#parts)
        typeof p == "object" && p.#flatten();
    this.#toString = void 0;
  }
  #partsToRegExp(dot) {
    return this.#parts.map((p) => {
      if (typeof p == "string")
        throw new Error("string type in extglob ast??");
      let [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
      return this.#uflag = this.#uflag || uflag, re;
    }).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
  }
  static #parseGlob(glob, hasMagic, noEmpty = !1) {
    let escaping = !1, re = "", uflag = !1, inStar = !1;
    for (let i = 0; i < glob.length; i++) {
      let c = glob.charAt(i);
      if (escaping) {
        escaping = !1, re += (reSpecials.has(c) ? "\\" : "") + c;
        continue;
      }
      if (c === "*") {
        if (inStar)
          continue;
        inStar = !0, re += noEmpty && /^[*]+$/.test(glob) ? starNoEmpty : star, hasMagic = !0;
        continue;
      } else
        inStar = !1;
      if (c === "\\") {
        i === glob.length - 1 ? re += "\\\\" : escaping = !0;
        continue;
      }
      if (c === "[") {
        let [src, needUflag, consumed, magic] = parseClass(glob, i);
        if (consumed) {
          re += src, uflag = uflag || needUflag, i += consumed - 1, hasMagic = hasMagic || magic;
          continue;
        }
      }
      if (c === "?") {
        re += qmark, hasMagic = !0;
        continue;
      }
      re += regExpEscape(c);
    }
    return [re, unescape(glob), !!hasMagic, uflag];
  }
};
_a = AST;

// node_modules/minimatch/dist/esm/escape.js
var escape = (s, { windowsPathsNoEscape = !1, magicalBraces = !1 } = {}) => magicalBraces ? windowsPathsNoEscape ? s.replace(/[?*()[\]{}]/g, "[$&]") : s.replace(/[?*()[\]\\{}]/g, "\\$&") : windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");

// node_modules/minimatch/dist/esm/index.js
var minimatch = (p, pattern, options = {}) => (assertValidPattern(pattern), !options.nocomment && pattern.charAt(0) === "#" ? !1 : new Minimatch(pattern, options).match(p)), starDotExtRE = /^\*+([^+@!?*[(]*)$/, starDotExtTest = (ext2) => (f) => !f.startsWith(".") && f.endsWith(ext2), starDotExtTestDot = (ext2) => (f) => f.endsWith(ext2), starDotExtTestNocase = (ext2) => (ext2 = ext2.toLowerCase(), (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext2)), starDotExtTestNocaseDot = (ext2) => (ext2 = ext2.toLowerCase(), (f) => f.toLowerCase().endsWith(ext2)), starDotStarRE = /^\*+\.\*+$/, starDotStarTest = (f) => !f.startsWith(".") && f.includes("."), starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes("."), dotStarRE = /^\.\*+$/, dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith("."), starRE = /^\*+$/, starTest = (f) => f.length !== 0 && !f.startsWith("."), starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..", qmarksRE = /^\?+([^+@!?*[(]*)?$/, qmarksTestNocase = ([$0, ext2 = ""]) => {
  let noext = qmarksTestNoExt([$0]);
  return ext2 ? (ext2 = ext2.toLowerCase(), (f) => noext(f) && f.toLowerCase().endsWith(ext2)) : noext;
}, qmarksTestNocaseDot = ([$0, ext2 = ""]) => {
  let noext = qmarksTestNoExtDot([$0]);
  return ext2 ? (ext2 = ext2.toLowerCase(), (f) => noext(f) && f.toLowerCase().endsWith(ext2)) : noext;
}, qmarksTestDot = ([$0, ext2 = ""]) => {
  let noext = qmarksTestNoExtDot([$0]);
  return ext2 ? (f) => noext(f) && f.endsWith(ext2) : noext;
}, qmarksTest = ([$0, ext2 = ""]) => {
  let noext = qmarksTestNoExt([$0]);
  return ext2 ? (f) => noext(f) && f.endsWith(ext2) : noext;
}, qmarksTestNoExt = ([$0]) => {
  let len = $0.length;
  return (f) => f.length === len && !f.startsWith(".");
}, qmarksTestNoExtDot = ([$0]) => {
  let len = $0.length;
  return (f) => f.length === len && f !== "." && f !== "..";
}, defaultPlatform = typeof process == "object" && process ? typeof process.env == "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix", path = {
  win32: { sep: "\\" },
  posix: { sep: "/" }
}, sep = defaultPlatform === "win32" ? path.win32.sep : path.posix.sep;
minimatch.sep = sep;
var GLOBSTAR = /* @__PURE__ */ Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
var qmark2 = "[^/]", star2 = qmark2 + "*?", twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?", twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?", filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
var ext = (a, b = {}) => Object.assign({}, a, b), defaults = (def) => {
  if (!def || typeof def != "object" || !Object.keys(def).length)
    return minimatch;
  let orig = minimatch;
  return Object.assign((p, pattern, options = {}) => orig(p, pattern, ext(def, options)), {
    Minimatch: class extends orig.Minimatch {
      constructor(pattern, options = {}) {
        super(pattern, ext(def, options));
      }
      static defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      }
    },
    AST: class extends orig.AST {
      /* c8 ignore start */
      constructor(type, parent, options = {}) {
        super(type, parent, ext(def, options));
      }
      /* c8 ignore stop */
      static fromGlob(pattern, options = {}) {
        return orig.AST.fromGlob(pattern, ext(def, options));
      }
    },
    unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
    escape: (s, options = {}) => orig.escape(s, ext(def, options)),
    filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
    defaults: (options) => orig.defaults(ext(def, options)),
    makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
    braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
    match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
    sep: orig.sep,
    GLOBSTAR
  });
};
minimatch.defaults = defaults;
var braceExpand = (pattern, options = {}) => (assertValidPattern(pattern), options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern) ? [pattern] : expand(pattern, { max: options.braceExpandMax }));
minimatch.braceExpand = braceExpand;
var makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
var match = (list, pattern, options = {}) => {
  let mm = new Minimatch(pattern, options);
  return list = list.filter((f) => mm.match(f)), mm.options.nonull && !list.length && list.push(pattern), list;
};
minimatch.match = match;
var globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/, regExpEscape2 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"), Minimatch = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(pattern, options = {}) {
    assertValidPattern(pattern), options = options || {}, this.options = options, this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200, this.pattern = pattern, this.platform = options.platform || defaultPlatform, this.isWindows = this.platform === "win32";
    let awe = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options[awe] === !1, this.windowsPathsNoEscape && (this.pattern = this.pattern.replace(/\\/g, "/")), this.preserveMultipleSlashes = !!options.preserveMultipleSlashes, this.regexp = null, this.negate = !1, this.nonegate = !!options.nonegate, this.comment = !1, this.empty = !1, this.partial = !!options.partial, this.nocase = !!this.options.nocase, this.windowsNoMagicRoot = options.windowsNoMagicRoot !== void 0 ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase), this.globSet = [], this.globParts = [], this.set = [], this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1)
      return !0;
    for (let pattern of this.set)
      for (let part of pattern)
        if (typeof part != "string")
          return !0;
    return !1;
  }
  debug(..._) {
  }
  make() {
    let pattern = this.pattern, options = this.options;
    if (!options.nocomment && pattern.charAt(0) === "#") {
      this.comment = !0;
      return;
    }
    if (!pattern) {
      this.empty = !0;
      return;
    }
    this.parseNegate(), this.globSet = [...new Set(this.braceExpand())], options.debug && (this.debug = (...args) => console.error(...args)), this.debug(this.pattern, this.globSet);
    let rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
    this.globParts = this.preprocess(rawGlobParts), this.debug(this.pattern, this.globParts);
    let set = this.globParts.map((s, _, __) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        let isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]), isDrive = /^[a-z]:/i.test(s[0]);
        if (isUNC)
          return [
            ...s.slice(0, 4),
            ...s.slice(4).map((ss) => this.parse(ss))
          ];
        if (isDrive)
          return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
      }
      return s.map((ss) => this.parse(ss));
    });
    if (this.debug(this.pattern, set), this.set = set.filter((s) => s.indexOf(!1) === -1), this.isWindows)
      for (let i = 0; i < this.set.length; i++) {
        let p = this.set[i];
        p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] == "string" && /^[a-z]:$/i.test(p[3]) && (p[2] = "?");
      }
    this.debug(this.pattern, this.set);
  }
  // various transforms to equivalent pattern sets that are
  // faster to process in a filesystem walk.  The goal is to
  // eliminate what we can, and push all ** patterns as far
  // to the right as possible, even if it increases the number
  // of patterns that we have to process.
  preprocess(globParts) {
    if (this.options.noglobstar)
      for (let partset of globParts)
        for (let j = 0; j < partset.length; j++)
          partset[j] === "**" && (partset[j] = "*");
    let { optimizationLevel = 1 } = this.options;
    return optimizationLevel >= 2 ? (globParts = this.firstPhasePreProcess(globParts), globParts = this.secondPhasePreProcess(globParts)) : optimizationLevel >= 1 ? globParts = this.levelOneOptimize(globParts) : globParts = this.adjascentGlobstarOptimize(globParts), globParts;
  }
  // just get rid of adjascent ** portions
  adjascentGlobstarOptimize(globParts) {
    return globParts.map((parts) => {
      let gs = -1;
      for (; (gs = parts.indexOf("**", gs + 1)) !== -1; ) {
        let i = gs;
        for (; parts[i + 1] === "**"; )
          i++;
        i !== gs && parts.splice(gs, i - gs);
      }
      return parts;
    });
  }
  // get rid of adjascent ** and resolve .. portions
  levelOneOptimize(globParts) {
    return globParts.map((parts) => (parts = parts.reduce((set, part) => {
      let prev = set[set.length - 1];
      return part === "**" && prev === "**" ? set : part === ".." && prev && prev !== ".." && prev !== "." && prev !== "**" ? (set.pop(), set) : (set.push(part), set);
    }, []), parts.length === 0 ? [""] : parts));
  }
  levelTwoFileOptimize(parts) {
    Array.isArray(parts) || (parts = this.slashSplit(parts));
    let didSomething = !1;
    do {
      if (didSomething = !1, !this.preserveMultipleSlashes) {
        for (let i = 1; i < parts.length - 1; i++) {
          let p = parts[i];
          i === 1 && p === "" && parts[0] === "" || (p === "." || p === "") && (didSomething = !0, parts.splice(i, 1), i--);
        }
        parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "") && (didSomething = !0, parts.pop());
      }
      let dd = 0;
      for (; (dd = parts.indexOf("..", dd + 1)) !== -1; ) {
        let p = parts[dd - 1];
        p && p !== "." && p !== ".." && p !== "**" && !(this.isWindows && /^[a-z]:$/i.test(p)) && (didSomething = !0, parts.splice(dd - 1, 2), dd -= 2);
      }
    } while (didSomething);
    return parts.length === 0 ? [""] : parts;
  }
  // First phase: single-pattern processing
  // <pre> is 1 or more portions
  // <rest> is 1 or more portions
  // <p> is any portion other than ., .., '', or **
  // <e> is . or ''
  //
  // **/.. is *brutal* for filesystem walking performance, because
  // it effectively resets the recursive walk each time it occurs,
  // and ** cannot be reduced out by a .. pattern part like a regexp
  // or most strings (other than .., ., and '') can be.
  //
  // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
  // <pre>/<e>/<rest> -> <pre>/<rest>
  // <pre>/<p>/../<rest> -> <pre>/<rest>
  // **/**/<rest> -> **/<rest>
  //
  // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
  // this WOULD be allowed if ** did follow symlinks, or * didn't
  firstPhasePreProcess(globParts) {
    let didSomething = !1;
    do {
      didSomething = !1;
      for (let parts of globParts) {
        let gs = -1;
        for (; (gs = parts.indexOf("**", gs + 1)) !== -1; ) {
          let gss = gs;
          for (; parts[gss + 1] === "**"; )
            gss++;
          gss > gs && parts.splice(gs + 1, gss - gs);
          let next = parts[gs + 1], p = parts[gs + 2], p2 = parts[gs + 3];
          if (next !== ".." || !p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..")
            continue;
          didSomething = !0, parts.splice(gs, 1);
          let other = parts.slice(0);
          other[gs] = "**", globParts.push(other), gs--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let i = 1; i < parts.length - 1; i++) {
            let p = parts[i];
            i === 1 && p === "" && parts[0] === "" || (p === "." || p === "") && (didSomething = !0, parts.splice(i, 1), i--);
          }
          parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "") && (didSomething = !0, parts.pop());
        }
        let dd = 0;
        for (; (dd = parts.indexOf("..", dd + 1)) !== -1; ) {
          let p = parts[dd - 1];
          if (p && p !== "." && p !== ".." && p !== "**") {
            didSomething = !0;
            let splin = dd === 1 && parts[dd + 1] === "**" ? ["."] : [];
            parts.splice(dd - 1, 2, ...splin), parts.length === 0 && parts.push(""), dd -= 2;
          }
        }
      }
    } while (didSomething);
    return globParts;
  }
  // second phase: multi-pattern dedupes
  // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
  // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
  // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
  //
  // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
  // ^-- not valid because ** doens't follow symlinks
  secondPhasePreProcess(globParts) {
    for (let i = 0; i < globParts.length - 1; i++)
      for (let j = i + 1; j < globParts.length; j++) {
        let matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
        if (matched) {
          globParts[i] = [], globParts[j] = matched;
          break;
        }
      }
    return globParts.filter((gs) => gs.length);
  }
  partsMatch(a, b, emptyGSMatch = !1) {
    let ai = 0, bi = 0, result = [], which = "";
    for (; ai < a.length && bi < b.length; )
      if (a[ai] === b[bi])
        result.push(which === "b" ? b[bi] : a[ai]), ai++, bi++;
      else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1])
        result.push(a[ai]), ai++;
      else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1])
        result.push(b[bi]), bi++;
      else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
        if (which === "b")
          return !1;
        which = "a", result.push(a[ai]), ai++, bi++;
      } else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
        if (which === "a")
          return !1;
        which = "b", result.push(b[bi]), ai++, bi++;
      } else
        return !1;
    return a.length === b.length && result;
  }
  parseNegate() {
    if (this.nonegate)
      return;
    let pattern = this.pattern, negate = !1, negateOffset = 0;
    for (let i = 0; i < pattern.length && pattern.charAt(i) === "!"; i++)
      negate = !negate, negateOffset++;
    negateOffset && (this.pattern = pattern.slice(negateOffset)), this.negate = negate;
  }
  // set partial to true to test if, for example,
  // "/a/b" matches the start of "/*/b/*/d"
  // Partial means, if you run out of file before you run
  // out of pattern, then that's fine, as long as all
  // the parts match.
  matchOne(file, pattern, partial = !1) {
    let fileStartIndex = 0, patternStartIndex = 0;
    if (this.isWindows) {
      let fileDrive = typeof file[0] == "string" && /^[a-z]:$/i.test(file[0]), fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]), patternDrive = typeof pattern[0] == "string" && /^[a-z]:$/i.test(pattern[0]), patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] == "string" && /^[a-z]:$/i.test(pattern[3]), fdi = fileUNC ? 3 : fileDrive ? 0 : void 0, pdi = patternUNC ? 3 : patternDrive ? 0 : void 0;
      if (typeof fdi == "number" && typeof pdi == "number") {
        let [fd, pd] = [
          file[fdi],
          pattern[pdi]
        ];
        fd.toLowerCase() === pd.toLowerCase() && (pattern[pdi] = fd, patternStartIndex = pdi, fileStartIndex = fdi);
      }
    }
    let { optimizationLevel = 1 } = this.options;
    return optimizationLevel >= 2 && (file = this.levelTwoFileOptimize(file)), pattern.includes(GLOBSTAR) ? this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex) : this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
  }
  #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
    let firstgs = pattern.indexOf(GLOBSTAR, patternIndex), lastgs = pattern.lastIndexOf(GLOBSTAR), [head, body, tail] = partial ? [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1),
      []
    ] : [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1, lastgs),
      pattern.slice(lastgs + 1)
    ];
    if (head.length) {
      let fileHead = file.slice(fileIndex, fileIndex + head.length);
      if (!this.#matchOne(fileHead, head, partial, 0, 0))
        return !1;
      fileIndex += head.length, patternIndex += head.length;
    }
    let fileTailMatch = 0;
    if (tail.length) {
      if (tail.length + fileIndex > file.length)
        return !1;
      let tailStart = file.length - tail.length;
      if (this.#matchOne(file, tail, partial, tailStart, 0))
        fileTailMatch = tail.length;
      else {
        if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length || (tailStart--, !this.#matchOne(file, tail, partial, tailStart, 0)))
          return !1;
        fileTailMatch = tail.length + 1;
      }
    }
    if (!body.length) {
      let sawSome = !!fileTailMatch;
      for (let i2 = fileIndex; i2 < file.length - fileTailMatch; i2++) {
        let f = String(file[i2]);
        if (sawSome = !0, f === "." || f === ".." || !this.options.dot && f.startsWith("."))
          return !1;
      }
      return partial || sawSome;
    }
    let bodySegments = [[[], 0]], currentBody = bodySegments[0], nonGsParts = 0, nonGsPartsSums = [0];
    for (let b of body)
      b === GLOBSTAR ? (nonGsPartsSums.push(nonGsParts), currentBody = [[], 0], bodySegments.push(currentBody)) : (currentBody[0].push(b), nonGsParts++);
    let i = bodySegments.length - 1, fileLength = file.length - fileTailMatch;
    for (let b of bodySegments)
      b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
    return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
  }
  // return false for "nope, not matching"
  // return null for "not matching, cannot keep trying"
  #matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
    let bs = bodySegments[bodyIndex];
    if (!bs) {
      for (let i = fileIndex; i < file.length; i++) {
        sawTail = !0;
        let f = file[i];
        if (f === "." || f === ".." || !this.options.dot && f.startsWith("."))
          return !1;
      }
      return sawTail;
    }
    let [body, after] = bs;
    for (; fileIndex <= after; ) {
      if (this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0) && globStarDepth < this.maxGlobstarRecursion) {
        let sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
        if (sub !== !1)
          return sub;
      }
      let f = file[fileIndex];
      if (f === "." || f === ".." || !this.options.dot && f.startsWith("."))
        return !1;
      fileIndex++;
    }
    return partial || null;
  }
  #matchOne(file, pattern, partial, fileIndex, patternIndex) {
    let fi, pi, pl, fl;
    for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
      this.debug("matchOne loop");
      let p = pattern[pi], f = file[fi];
      if (this.debug(pattern, p, f), p === !1 || p === GLOBSTAR)
        return !1;
      let hit;
      if (typeof p == "string" ? (hit = f === p, this.debug("string match", p, f, hit)) : (hit = p.test(f), this.debug("pattern match", p, f, hit)), !hit)
        return !1;
    }
    if (fi === fl && pi === pl)
      return !0;
    if (fi === fl)
      return partial;
    if (pi === pl)
      return fi === fl - 1 && file[fi] === "";
    throw new Error("wtf?");
  }
  braceExpand() {
    return braceExpand(this.pattern, this.options);
  }
  parse(pattern) {
    assertValidPattern(pattern);
    let options = this.options;
    if (pattern === "**")
      return GLOBSTAR;
    if (pattern === "")
      return "";
    let m, fastTest = null;
    (m = pattern.match(starRE)) ? fastTest = options.dot ? starTestDot : starTest : (m = pattern.match(starDotExtRE)) ? fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]) : (m = pattern.match(qmarksRE)) ? fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m) : (m = pattern.match(starDotStarRE)) ? fastTest = options.dot ? starDotStarTestDot : starDotStarTest : (m = pattern.match(dotStarRE)) && (fastTest = dotStarTest);
    let re = AST.fromGlob(pattern, this.options).toMMPattern();
    return fastTest && typeof re == "object" && Reflect.defineProperty(re, "test", { value: fastTest }), re;
  }
  makeRe() {
    if (this.regexp || this.regexp === !1)
      return this.regexp;
    let set = this.set;
    if (!set.length)
      return this.regexp = !1, this.regexp;
    let options = this.options, twoStar = options.noglobstar ? star2 : options.dot ? twoStarDot : twoStarNoDot, flags = new Set(options.nocase ? ["i"] : []), re = set.map((pattern) => {
      let pp = pattern.map((p) => {
        if (p instanceof RegExp)
          for (let f of p.flags.split(""))
            flags.add(f);
        return typeof p == "string" ? regExpEscape2(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
      });
      pp.forEach((p, i) => {
        let next = pp[i + 1], prev = pp[i - 1];
        p !== GLOBSTAR || prev === GLOBSTAR || (prev === void 0 ? next !== void 0 && next !== GLOBSTAR ? pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next : pp[i] = twoStar : next === void 0 ? pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + ")?" : next !== GLOBSTAR && (pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next, pp[i + 1] = GLOBSTAR));
      });
      let filtered = pp.filter((p) => p !== GLOBSTAR);
      if (this.partial && filtered.length >= 1) {
        let prefixes = [];
        for (let i = 1; i <= filtered.length; i++)
          prefixes.push(filtered.slice(0, i).join("/"));
        return "(?:" + prefixes.join("|") + ")";
      }
      return filtered.join("/");
    }).join("|"), [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
    re = "^" + open + re + close + "$", this.partial && (re = "^(?:\\/|" + open + re.slice(1, -1) + close + ")$"), this.negate && (re = "^(?!" + re + ").+$");
    try {
      this.regexp = new RegExp(re, [...flags].join(""));
    } catch {
      this.regexp = !1;
    }
    return this.regexp;
  }
  slashSplit(p) {
    return this.preserveMultipleSlashes ? p.split("/") : this.isWindows && /^\/\/[^/]+/.test(p) ? ["", ...p.split(/\/+/)] : p.split(/\/+/);
  }
  match(f, partial = this.partial) {
    if (this.debug("match", f, this.pattern), this.comment)
      return !1;
    if (this.empty)
      return f === "";
    if (f === "/" && partial)
      return !0;
    let options = this.options;
    this.isWindows && (f = f.split("\\").join("/"));
    let ff = this.slashSplit(f);
    this.debug(this.pattern, "split", ff);
    let set = this.set;
    this.debug(this.pattern, "set", set);
    let filename = ff[ff.length - 1];
    if (!filename)
      for (let i = ff.length - 2; !filename && i >= 0; i--)
        filename = ff[i];
    for (let pattern of set) {
      let file = ff;
      if (options.matchBase && pattern.length === 1 && (file = [filename]), this.matchOne(file, pattern, partial))
        return options.flipNegate ? !0 : !this.negate;
    }
    return options.flipNegate ? !1 : this.negate;
  }
  static defaults(def) {
    return minimatch.defaults(def).Minimatch;
  }
};
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AST,
  GLOBSTAR,
  Minimatch,
  braceExpand,
  defaults,
  escape,
  filter,
  makeRe,
  match,
  minimatch,
  sep,
  unescape
});
