// yaml v2.9.0 — ISC License — https://github.com/eemeli/yaml
// Vendored single-file CJS bundle via esbuild. Do not edit manually.
"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports2) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias"), DOC = /* @__PURE__ */ Symbol.for("yaml.document"), MAP = /* @__PURE__ */ Symbol.for("yaml.map"), PAIR = /* @__PURE__ */ Symbol.for("yaml.pair"), SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar"), SEQ = /* @__PURE__ */ Symbol.for("yaml.seq"), NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type"), isAlias = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === ALIAS, isDocument = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === DOC, isMap = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === MAP, isPair = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === PAIR, isScalar = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === SCALAR, isSeq = (node) => !!node && typeof node == "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node == "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return !0;
        }
      return !1;
    }
    function isNode(node) {
      if (node && typeof node == "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return !0;
        }
      return !1;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports2.ALIAS = ALIAS;
    exports2.DOC = DOC;
    exports2.MAP = MAP;
    exports2.NODE_TYPE = NODE_TYPE;
    exports2.PAIR = PAIR;
    exports2.SCALAR = SCALAR;
    exports2.SEQ = SEQ;
    exports2.hasAnchor = hasAnchor;
    exports2.isAlias = isAlias;
    exports2.isCollection = isCollection;
    exports2.isDocument = isDocument;
    exports2.isMap = isMap;
    exports2.isNode = isNode;
    exports2.isPair = isPair;
    exports2.isScalar = isScalar;
    exports2.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), BREAK = /* @__PURE__ */ Symbol("break visit"), SKIP = /* @__PURE__ */ Symbol("skip children"), REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit2(node, visitor) {
      let visitor_ = initVisitor(visitor);
      identity2.isDocument(node) ? visit_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE && (node.contents = null) : visit_(null, node, visitor_, Object.freeze([]));
    }
    visit2.BREAK = BREAK;
    visit2.SKIP = SKIP;
    visit2.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      let ctrl = callVisitor(key, node, visitor, path);
      if (identity2.isNode(ctrl) || identity2.isPair(ctrl))
        return replaceNode(key, path, ctrl), visit_(key, ctrl, visitor, path);
      if (typeof ctrl != "symbol") {
        if (identity2.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            let ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci == "number")
              i = ci - 1;
            else {
              if (ci === BREAK)
                return BREAK;
              ci === REMOVE && (node.items.splice(i, 1), i -= 1);
            }
          }
        } else if (identity2.isPair(node)) {
          path = Object.freeze(path.concat(node));
          let ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          ck === REMOVE && (node.key = null);
          let cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          cv === REMOVE && (node.value = null);
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      let visitor_ = initVisitor(visitor);
      identity2.isDocument(node) ? await visitAsync_(null, node.contents, visitor_, Object.freeze([node])) === REMOVE && (node.contents = null) : await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      let ctrl = await callVisitor(key, node, visitor, path);
      if (identity2.isNode(ctrl) || identity2.isPair(ctrl))
        return replaceNode(key, path, ctrl), visitAsync_(key, ctrl, visitor, path);
      if (typeof ctrl != "symbol") {
        if (identity2.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            let ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci == "number")
              i = ci - 1;
            else {
              if (ci === BREAK)
                return BREAK;
              ci === REMOVE && (node.items.splice(i, 1), i -= 1);
            }
          }
        } else if (identity2.isPair(node)) {
          path = Object.freeze(path.concat(node));
          let ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          ck === REMOVE && (node.key = null);
          let cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          cv === REMOVE && (node.value = null);
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      return typeof visitor == "object" && (visitor.Collection || visitor.Node || visitor.Value) ? Object.assign({
        Alias: visitor.Node,
        Map: visitor.Node,
        Scalar: visitor.Node,
        Seq: visitor.Node
      }, visitor.Value && {
        Map: visitor.Value,
        Scalar: visitor.Value,
        Seq: visitor.Value
      }, visitor.Collection && {
        Map: visitor.Collection,
        Seq: visitor.Collection
      }, visitor) : visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor == "function")
        return visitor(key, node, path);
      if (identity2.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity2.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity2.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity2.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity2.isAlias(node))
        return visitor.Alias?.(key, node, path);
    }
    function replaceNode(key, path, node) {
      let parent = path[path.length - 1];
      if (identity2.isCollection(parent))
        parent.items[key] = node;
      else if (identity2.isPair(parent))
        key === "key" ? parent.key = node : parent.value = node;
      else if (identity2.isDocument(parent))
        parent.contents = node;
      else {
        let pt = identity2.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports2.visit = visit2;
    exports2.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), visit2 = require_visit(), escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    }, escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]), Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null, this.docEnd = !1, this.yaml = Object.assign({}, _Directives.defaultYaml, yaml), this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        let copy = new _Directives(this.yaml, this.tags);
        return copy.docStart = this.docStart, copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        let res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = !0;
            break;
          case "1.2":
            this.atNextDocument = !1, this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            }, this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        this.atNextDocument && (this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" }, this.tags = Object.assign({}, _Directives.defaultTags), this.atNextDocument = !1);
        let parts = line.trim().split(/[ \t]+/), name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2 && (onError(0, "%TAG directive should contain exactly two parts"), parts.length < 2))
              return !1;
            let [handle, prefix] = parts;
            return this.tags[handle] = prefix, !0;
          }
          case "%YAML": {
            if (this.yaml.explicit = !0, parts.length !== 1)
              return onError(0, "%YAML directive should contain exactly one part"), !1;
            let [version] = parts;
            if (version === "1.1" || version === "1.2")
              return this.yaml.version = version, !0;
            {
              let isValid = /^\d+\.\d+$/.test(version);
              return onError(6, `Unsupported YAML version ${version}`, isValid), !1;
            }
          }
          default:
            return onError(0, `Unknown directive ${name}`, !0), !1;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!")
          return onError(`Not a valid tag: ${source}`), null;
        if (source[1] === "<") {
          let verbatim = source.slice(2, -1);
          return verbatim === "!" || verbatim === "!!" ? (onError(`Verbatim tags aren't resolved, so ${source} is invalid.`), null) : (source[source.length - 1] !== ">" && onError("Verbatim tags must end with a >"), verbatim);
        }
        let [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        suffix || onError(`The ${source} tag has no suffix`);
        let prefix = this.tags[handle];
        if (prefix)
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            return onError(String(error)), null;
          }
        return handle === "!" ? source : (onError(`Could not resolve tag: ${source}`), null);
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (let [handle, prefix] of Object.entries(this.tags))
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        let lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [], tagEntries = Object.entries(this.tags), tagNames;
        if (doc && tagEntries.length > 0 && identity2.isNode(doc.contents)) {
          let tags = {};
          visit2.visit(doc.contents, (_key, node) => {
            identity2.isNode(node) && node.tag && (tags[node.tag] = !0);
          }), tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (let [handle, prefix] of tagEntries)
          handle === "!!" && prefix === "tag:yaml.org,2002:" || (!doc || tagNames.some((tn) => tn.startsWith(prefix))) && lines.push(`%TAG ${handle} ${prefix}`);
        return lines.join(`
`);
      }
    };
    Directives.defaultYaml = { explicit: !1, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports2.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), visit2 = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        let msg = `Anchor must not contain whitespace or control characters: ${JSON.stringify(anchor)}`;
        throw new Error(msg);
      }
      return !0;
    }
    function anchorNames(root) {
      let anchors = /* @__PURE__ */ new Set();
      return visit2.visit(root, {
        Value(_key, node) {
          node.anchor && anchors.add(node.anchor);
        }
      }), anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; ; ++i) {
        let name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      let aliasObjects = [], sourceObjects = /* @__PURE__ */ new Map(), prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source), prevAnchors ?? (prevAnchors = anchorNames(doc));
          let anchor = findNewAnchor(prefix, prevAnchors);
          return prevAnchors.add(anchor), anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (let source of aliasObjects) {
            let ref = sourceObjects.get(source);
            if (typeof ref == "object" && ref.anchor && (identity2.isScalar(ref.node) || identity2.isCollection(ref.node)))
              ref.node.anchor = ref.anchor;
            else {
              let error = new Error("Failed to resolve repeated object (this should not happen)");
              throw error.source = source, error;
            }
          }
        },
        sourceObjects
      };
    }
    exports2.anchorIsValid = anchorIsValid;
    exports2.anchorNames = anchorNames;
    exports2.createNodeAnchors = createNodeAnchors;
    exports2.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports2) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val == "object")
        if (Array.isArray(val))
          for (let i = 0, len = val.length; i < len; ++i) {
            let v0 = val[i], v1 = applyReviver(reviver, val, String(i), v0);
            v1 === void 0 ? delete val[i] : v1 !== v0 && (val[i] = v1);
          }
        else if (val instanceof Map)
          for (let k of Array.from(val.keys())) {
            let v0 = val.get(k), v1 = applyReviver(reviver, val, k, v0);
            v1 === void 0 ? val.delete(k) : v1 !== v0 && val.set(k, v1);
          }
        else if (val instanceof Set)
          for (let v0 of Array.from(val)) {
            let v1 = applyReviver(reviver, val, v0, v0);
            v1 === void 0 ? val.delete(v0) : v1 !== v0 && (val.delete(v0), val.add(v1));
          }
        else
          for (let [k, v0] of Object.entries(val)) {
            let v1 = applyReviver(reviver, val, k, v0);
            v1 === void 0 ? delete val[k] : v1 !== v0 && (val[k] = v1);
          }
      return reviver.call(obj, key, val);
    }
    exports2.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports2) {
    "use strict";
    var identity2 = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON == "function") {
        if (!ctx || !identity2.hasAnchor(value))
          return value.toJSON(arg, ctx);
        let data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data), ctx.onCreate = (res2) => {
          data.res = res2, delete ctx.onCreate;
        };
        let res = value.toJSON(arg, ctx);
        return ctx.onCreate && ctx.onCreate(res), res;
      }
      return typeof value == "bigint" && !ctx?.keep ? Number(value) : value;
    }
    exports2.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports2) {
    "use strict";
    var applyReviver = require_applyReviver(), identity2 = require_identity(), toJS = require_toJS(), NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity2.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        let copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        return this.range && (copy.range = this.range.slice()), copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity2.isDocument(doc))
          throw new TypeError("A document argument is required");
        let ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: !0,
          mapAsMap: mapAsMap === !0,
          mapKeyWarned: !1,
          maxAliasCount: typeof maxAliasCount == "number" ? maxAliasCount : 100
        }, res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor == "function")
          for (let { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver == "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports2.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports2) {
    "use strict";
    var anchors = require_anchors(), visit2 = require_visit(), identity2 = require_identity(), Node = require_Node(), toJS = require_toJS(), Alias2 = class extends Node.NodeBase {
      constructor(source) {
        super(identity2.ALIAS), this.source = source, Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        ctx?.aliasResolveCache ? nodes = ctx.aliasResolveCache : (nodes = [], visit2.visit(doc, {
          Node: (_key, node) => {
            (identity2.isAlias(node) || identity2.hasAnchor(node)) && nodes.push(node);
          }
        }), ctx && (ctx.aliasResolveCache = nodes));
        let found;
        for (let node of nodes) {
          if (node === this)
            break;
          node.anchor === this.source && (found = node);
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        let { anchors: anchors2, doc, maxAliasCount } = ctx, source = this.resolve(doc, ctx);
        if (!source) {
          let msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (data || (toJS.toJS(source, null, ctx), data = anchors2.get(source)), data?.res === void 0) {
          let msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0 && (data.count += 1, data.aliasCount === 0 && (data.aliasCount = getAliasCount(doc, source, anchors2)), data.count * data.aliasCount > maxAliasCount)) {
          let msg = "Excessive alias count indicates a resource exhaustion attack";
          throw new ReferenceError(msg);
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        let src = `*${this.source}`;
        if (ctx) {
          if (anchors.anchorIsValid(this.source), ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            let msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity2.isAlias(node)) {
        let source = node.resolve(doc), anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity2.isCollection(node)) {
        let count = 0;
        for (let item of node.items) {
          let c = getAliasCount(doc, item, anchors2);
          c > count && (count = c);
        }
        return count;
      } else if (identity2.isPair(node)) {
        let kc = getAliasCount(doc, node.key, anchors2), vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports2.Alias = Alias2;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Node = require_Node(), toJS = require_toJS(), isScalarValue = (value) => !value || typeof value != "function" && typeof value != "object", Scalar2 = class extends Node.NodeBase {
      constructor(value) {
        super(identity2.SCALAR), this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar2.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar2.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar2.PLAIN = "PLAIN";
    Scalar2.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar2.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports2.Scalar = Scalar2;
    exports2.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports2) {
    "use strict";
    var Alias2 = require_Alias(), identity2 = require_identity(), Scalar2 = require_Scalar(), defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        let match = tags.filter((t) => t.tag === tagName), tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity2.isDocument(value) && (value = value.contents), identity2.isNode(value))
        return value;
      if (identity2.isPair(value)) {
        let map = ctx.schema[identity2.MAP].createNode?.(ctx.schema, null, ctx);
        return map.items.push(value), map;
      }
      (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt < "u" && value instanceof BigInt) && (value = value.valueOf());
      let { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx, ref;
      if (aliasDuplicateObjects && value && typeof value == "object") {
        if (ref = sourceObjects.get(value), ref)
          return ref.anchor ?? (ref.anchor = onAnchor(value)), new Alias2.Alias(ref.anchor);
        ref = { anchor: null, node: null }, sourceObjects.set(value, ref);
      }
      tagName?.startsWith("!!") && (tagName = defaultTagPrefix + tagName.slice(2));
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON == "function" && (value = value.toJSON()), !value || typeof value != "object") {
          let node2 = new Scalar2.Scalar(value);
          return ref && (ref.node = node2), node2;
        }
        tagObj = value instanceof Map ? schema[identity2.MAP] : Symbol.iterator in Object(value) ? schema[identity2.SEQ] : schema[identity2.MAP];
      }
      onTagObj && (onTagObj(tagObj), delete ctx.onTagObj);
      let node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from == "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar2.Scalar(value);
      return tagName ? node.tag = tagName : tagObj.default || (node.tag = tagObj.tag), ref && (ref.node = node), node;
    }
    exports2.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports2) {
    "use strict";
    var createNode = require_createNode(), identity2 = require_identity(), Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        let k = path[i];
        if (typeof k == "number" && Number.isInteger(k) && k >= 0) {
          let a = [];
          a[k] = v, v = a;
        } else
          v = /* @__PURE__ */ new Map([[k, v]]);
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: !1,
        keepUndefined: !1,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path == "object" && !!path[Symbol.iterator]().next().done, Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type), Object.defineProperty(this, "schema", {
          value: schema,
          configurable: !0,
          enumerable: !1,
          writable: !0
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        let copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        return schema && (copy.schema = schema), copy.items = copy.items.map((it) => identity2.isNode(it) || identity2.isPair(it) ? it.clone(schema) : it), this.range && (copy.range = this.range.slice()), copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          let [key, ...rest] = path, node = this.get(key, !0);
          if (identity2.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        let [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        let node = this.get(key, !0);
        if (identity2.isCollection(node))
          return node.deleteIn(rest);
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        let [key, ...rest] = path, node = this.get(key, !0);
        return rest.length === 0 ? !keepScalar && identity2.isScalar(node) ? node.value : node : identity2.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity2.isPair(node))
            return !1;
          let n = node.value;
          return n == null || allowScalar && identity2.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        let [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        let node = this.get(key, !0);
        return identity2.isCollection(node) ? node.hasIn(rest) : !1;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        let [key, ...rest] = path;
        if (rest.length === 0)
          this.set(key, value);
        else {
          let node = this.get(key, !0);
          if (identity2.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports2.Collection = Collection;
    exports2.collectionFromPath = collectionFromPath;
    exports2.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports2) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      return /^\n+$/.test(comment) ? comment.substring(1) : indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith(`
`) ? indentComment(comment, indent) : comment.includes(`
`) ? `
` + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports2.indentComment = indentComment;
    exports2.lineComment = lineComment;
    exports2.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports2) {
    "use strict";
    var FOLD_FLOW = "flow", FOLD_BLOCK = "block", FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      lineWidth < minContentWidth && (minContentWidth = 0);
      let endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      let folds = [], escapedFolds = {}, end = lineWidth - indent.length;
      typeof indentAtStart == "number" && (indentAtStart > lineWidth - Math.max(2, minContentWidth) ? folds.push(0) : end = lineWidth - indentAtStart);
      let split, prev, overflow = !1, i = -1, escStart = -1, escEnd = -1;
      mode === FOLD_BLOCK && (i = consumeMoreIndentedLines(text, i, indent.length), i !== -1 && (end = i + endStep));
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          switch (escStart = i, text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === `
`)
          mode === FOLD_BLOCK && (i = consumeMoreIndentedLines(text, i, indent.length)), end = i + indent.length + endStep, split = void 0;
        else {
          if (ch === " " && prev && prev !== " " && prev !== `
` && prev !== "	") {
            let next = text[i + 1];
            next && next !== " " && next !== `
` && next !== "	" && (split = i);
          }
          if (i >= end)
            if (split)
              folds.push(split), end = split + endStep, split = void 0;
            else if (mode === FOLD_QUOTED) {
              for (; prev === " " || prev === "	"; )
                prev = ch, ch = text[i += 1], overflow = !0;
              let j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j), escapedFolds[j] = !0, end = j + endStep, split = void 0;
            } else
              overflow = !0;
        }
        prev = ch;
      }
      if (overflow && onOverflow && onOverflow(), folds.length === 0)
        return text;
      onFold && onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        let fold = folds[i2], end2 = folds[i2 + 1] || text.length;
        fold === 0 ? res = `
${indent}${text.slice(0, end2)}` : (mode === FOLD_QUOTED && escapedFolds[fold] && (res += `${text[fold]}\\`), res += `
${indent}${text.slice(fold + 1, end2)}`);
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i, start = i + 1, ch = text[start];
      for (; ch === " " || ch === "	"; )
        if (i < start + indent)
          ch = text[++i];
        else {
          do
            ch = text[++i];
          while (ch && ch !== `
`);
          end = i, start = i + 1, ch = text[start];
        }
      return end;
    }
    exports2.FOLD_BLOCK = FOLD_BLOCK;
    exports2.FOLD_FLOW = FOLD_FLOW;
    exports2.FOLD_QUOTED = FOLD_QUOTED;
    exports2.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), foldFlowLines = require_foldFlowLines(), getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    }), containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return !1;
      let limit = lineWidth - indentLength, strLen = str.length;
      if (strLen <= limit)
        return !1;
      for (let i = 0, start = 0; i < strLen; ++i)
        if (str[i] === `
`) {
          if (i - start > limit)
            return !0;
          if (start = i + 1, strLen - start <= limit)
            return !1;
        }
      return !0;
    }
    function doubleQuotedString(value, ctx) {
      let json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      let { implicitKey } = ctx, minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength, indent = ctx.indent || (containsDocumentMarker(value) ? "  " : ""), str = "", start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i])
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n" && (str += json.slice(start, i) + "\\ ", i += 1, start = i, ch = "\\"), ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                let code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    code.substr(0, 2) === "00" ? str += "\\x" + code.substr(2) : str += json.substr(i, 6);
                }
                i += 5, start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength)
                i += 1;
              else {
                for (str += json.slice(start, i) + `

`; json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"'; )
                  str += `
`, i += 2;
                str += indent, json[i + 2] === " " && (str += "\\"), i += 1, start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      return str = start ? str + json.slice(start) : json, implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, !1));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === !1 || ctx.implicitKey && value.includes(`
`) || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      let indent = ctx.indent || (containsDocumentMarker(value) ? "  " : ""), res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, !1));
    }
    function quotedString(value, ctx) {
      let { singleQuote } = ctx.options, qs;
      if (singleQuote === !1)
        qs = doubleQuotedString;
      else {
        let hasDouble = value.includes('"'), hasSingle = value.includes("'");
        hasDouble && !hasSingle ? qs = singleQuotedString : hasSingle && !hasDouble ? qs = doubleQuotedString : qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp(`(^|(?<!
))
+(?!
|$)`, "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      let { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value))
        return quotedString(value, ctx);
      let indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : ""), literal = blockQuote === "literal" ? !0 : blockQuote === "folded" || type === Scalar2.Scalar.BLOCK_FOLDED ? !1 : type === Scalar2.Scalar.BLOCK_LITERAL ? !0 : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? `|
` : `>
`;
      let chomp, endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        let ch = value[endStart - 1];
        if (ch !== `
` && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart), endNlPos = end.indexOf(`
`);
      endNlPos === -1 ? chomp = "-" : value === end || endNlPos !== end.length - 1 ? (chomp = "+", onChompKeep && onChompKeep()) : chomp = "", end && (value = value.slice(0, -end.length), end[end.length - 1] === `
` && (end = end.slice(0, -1)), end = end.replace(blockEndNewlines, `$&${indent}`));
      let startWithSpace = !1, startEnd, startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        let ch = value[startEnd];
        if (ch === " ")
          startWithSpace = !0;
        else if (ch === `
`)
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      start && (value = value.substring(start.length), start = start.replace(/\n+/g, `$&${indent}`));
      let header = (startWithSpace ? indent ? "2" : "1" : "") + chomp;
      if (comment && (header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " ")), onComment && onComment()), !literal) {
        let foldedValue = value.replace(/\n+/g, `
$&`).replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`), literalFallback = !1, foldOptions = getFoldOptions(ctx, !0);
        blockQuote !== "folded" && type !== Scalar2.Scalar.BLOCK_FOLDED && (foldOptions.onOverflow = () => {
          literalFallback = !0;
        });
        let body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      return value = value.replace(/\n+/g, `$&${indent}`), `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      let { type, value } = item, { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes(`
`) || inFlow && /[[\]{},]/.test(value))
        return quotedString(value, ctx);
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value))
        return implicitKey || inFlow || !value.includes(`
`) ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      if (!implicitKey && !inFlow && type !== Scalar2.Scalar.PLAIN && value.includes(`
`))
        return blockString(item, ctx, onComment, onChompKeep);
      if (containsDocumentMarker(value)) {
        if (indent === "")
          return ctx.forceBlockIndent = !0, blockString(item, ctx, onComment, onChompKeep);
        if (implicitKey && indent === indentStep)
          return quotedString(value, ctx);
      }
      let str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        let test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str), { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, !1));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      let { implicitKey, inFlow } = ctx, ss = typeof item.value == "string" ? item : Object.assign({}, item, { value: String(item.value) }), { type } = item;
      type !== Scalar2.Scalar.QUOTE_DOUBLE && /[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value) && (type = Scalar2.Scalar.QUOTE_DOUBLE);
      let _stringify = (_type) => {
        switch (_type) {
          case Scalar2.Scalar.BLOCK_FOLDED:
          case Scalar2.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar2.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar2.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar2.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      }, res = _stringify(type);
      if (res === null) {
        let { defaultKeyType, defaultStringType } = ctx.options, t = implicitKey && defaultKeyType || defaultStringType;
        if (res = _stringify(t), res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports2.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports2) {
    "use strict";
    var anchors = require_anchors(), identity2 = require_identity(), stringifyComment = require_stringifyComment(), stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      let opt = Object.assign({
        blockQuote: !0,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: !1,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: !0,
        indentSeq: !0,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: !1,
        singleQuote: null,
        trailingComma: !1,
        trueStr: "true",
        verifyAliasOrder: !0
      }, doc.schema.toStringOptions, options), inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = !1;
          break;
        case "flow":
          inFlow = !0;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent == "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        let match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj, obj;
      if (identity2.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          let testMatch = match.filter((t) => t.test);
          testMatch.length > 0 && (match = testMatch);
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else
        obj = item, tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      if (!tagObj) {
        let name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      let props = [], anchor = (identity2.isScalar(node) || identity2.isCollection(node)) && node.anchor;
      anchor && anchors.anchorIsValid(anchor) && (anchors$1.add(anchor), props.push(`&${anchor}`));
      let tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      return tag && props.push(doc.directives.tagString(tag)), props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity2.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity2.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item))
          throw new TypeError("Cannot stringify circular structure without alias nodes");
        ctx.resolvedAliases ? ctx.resolvedAliases.add(item) : ctx.resolvedAliases = /* @__PURE__ */ new Set([item]), item = item.resolve(ctx.doc);
      }
      let tagObj, node = identity2.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      let props = stringifyProps(node, tagObj, ctx);
      props.length > 0 && (ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1);
      let str = typeof tagObj.stringify == "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity2.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      return props ? identity2.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}` : str;
    }
    exports2.createStringifyContext = createStringifyContext;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Scalar2 = require_Scalar(), stringify = require_stringify(), stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      let { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx, keyComment = identity2.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment)
          throw new Error("With simple keys, key nodes cannot have comments");
        if (identity2.isCollection(key) || !identity2.isNode(key) && typeof key == "object") {
          let msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity2.isCollection(key) || (identity2.isScalar(key) ? key.type === Scalar2.Scalar.BLOCK_FOLDED || key.type === Scalar2.Scalar.BLOCK_LITERAL : typeof key == "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: !1,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = !1, chompKeep = !1, str = stringify.stringify(key, ctx, () => keyCommentDone = !0, () => chompKeep = !0);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = !0;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null)
          return keyCommentDone && onComment && onComment(), str === "" ? "?" : explicitKey ? `? ${str}` : str;
      } else if (allNullValues && !simpleKeys || value == null && explicitKey)
        return str = `? ${str}`, keyComment && !keyCommentDone ? str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment)) : chompKeep && onChompKeep && onChompKeep(), str;
      keyCommentDone && (keyComment = null), explicitKey ? (keyComment && (str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment))), str = `? ${str}
${indent}:`) : (str = `${str}:`, keyComment && (str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment))));
      let vsb, vcb, valueComment;
      identity2.isNode(value) ? (vsb = !!value.spaceBefore, vcb = value.commentBefore, valueComment = value.comment) : (vsb = !1, vcb = null, valueComment = null, value && typeof value == "object" && (value = doc.createNode(value))), ctx.implicitKey = !1, !explicitKey && !keyComment && identity2.isScalar(value) && (ctx.indentAtStart = str.length + 1), chompKeep = !1, !indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity2.isSeq(value) && !value.flow && !value.tag && !value.anchor && (ctx.indent = ctx.indent.substring(2));
      let valueCommentDone = !1, valueStr = stringify.stringify(value, ctx, () => valueCommentDone = !0, () => chompKeep = !0), ws = " ";
      if (keyComment || vsb || vcb) {
        if (ws = vsb ? `
` : "", vcb) {
          let cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        valueStr === "" && !ctx.inFlow ? ws === `
` && valueComment && (ws = `

`) : ws += `
${ctx.indent}`;
      } else if (!explicitKey && identity2.isCollection(value)) {
        let vs0 = valueStr[0], nl0 = valueStr.indexOf(`
`), hasNewline = nl0 !== -1, flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = !1;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!" && (sp0 = valueStr.indexOf(" ", sp0 + 1)), (sp0 === -1 || nl0 < sp0) && (hasPropsLine = !0);
          }
          hasPropsLine || (ws = `
${ctx.indent}`);
        }
      } else (valueStr === "" || valueStr[0] === `
`) && (ws = "");
      return str += ws + valueStr, ctx.inFlow ? valueCommentDone && onComment && onComment() : valueComment && !valueCommentDone ? str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment)) : chompKeep && onChompKeep && onChompKeep(), str;
    }
    exports2.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports2) {
    "use strict";
    var node_process = require("process");
    function debug(logLevel, ...messages) {
      logLevel === "debug" && console.log(...messages);
    }
    function warn(logLevel, warning) {
      (logLevel === "debug" || logLevel === "warn") && (typeof node_process.emitWarning == "function" ? node_process.emitWarning(warning) : console.warn(warning));
    }
    exports2.debug = debug;
    exports2.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Scalar2 = require_Scalar(), MERGE_KEY = "<<", merge = {
      identify: (value) => value === MERGE_KEY || typeof value == "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar2.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    }, isMergeKey = (ctx, key) => (merge.identify(key) || identity2.isScalar(key) && (!key.type || key.type === Scalar2.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      let source = resolveAliasValue(ctx, value);
      if (identity2.isSeq(source))
        for (let it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (let it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      let source = resolveAliasValue(ctx, value);
      if (!identity2.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      let srcMap = source.toJSON(null, ctx, Map);
      for (let [key, value2] of srcMap)
        map instanceof Map ? map.has(key) || map.set(key, value2) : map instanceof Set ? map.add(key) : Object.prototype.hasOwnProperty.call(map, key) || Object.defineProperty(map, key, {
          value: value2,
          writable: !0,
          enumerable: !0,
          configurable: !0
        });
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity2.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports2.addMergeToJSMap = addMergeToJSMap;
    exports2.isMergeKey = isMergeKey;
    exports2.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports2) {
    "use strict";
    var log = require_log(), merge = require_merge(), stringify = require_stringify(), identity2 = require_identity(), toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity2.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        let jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map)
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        else if (map instanceof Set)
          map.add(jsKey);
        else {
          let stringKey = stringifyKey(key, jsKey, ctx), jsValue = toJS.toJS(value, stringKey, ctx);
          stringKey in map ? Object.defineProperty(map, stringKey, {
            value: jsValue,
            writable: !0,
            enumerable: !0,
            configurable: !0
          }) : map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey != "object")
        return String(jsKey);
      if (identity2.isNode(key) && ctx?.doc) {
        let strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (let node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = !0, strCtx.inStringifyKey = !0;
        let strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          jsonStr.length > 40 && (jsonStr = jsonStr.substring(0, 36) + '..."'), log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`), ctx.mapKeyWarned = !0;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports2.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports2) {
    "use strict";
    var createNode = require_createNode(), stringifyPair = require_stringifyPair(), addPairToJSMap = require_addPairToJSMap(), identity2 = require_identity();
    function createPair(key, value, ctx) {
      let k = createNode.createNode(key, void 0, ctx), v = createNode.createNode(value, void 0, ctx);
      return new Pair2(k, v);
    }
    var Pair2 = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.PAIR }), this.key = key, this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        return identity2.isNode(key) && (key = key.clone(schema)), identity2.isNode(value) && (value = value.clone(schema)), new _Pair(key, value);
      }
      toJSON(_, ctx) {
        let pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports2.Pair = Pair2;
    exports2.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), stringify = require_stringify(), stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      return (ctx.inFlow ?? collection.flow ? stringifyFlowCollection : stringifyBlockCollection)(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      let { indent, options: { commentString } } = ctx, itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null }), chompKeep = !1, lines = [];
      for (let i = 0; i < items.length; ++i) {
        let item = items[i], comment2 = null;
        if (identity2.isNode(item))
          !chompKeep && item.spaceBefore && lines.push(""), addCommentBefore(ctx, lines, item.commentBefore, chompKeep), item.comment && (comment2 = item.comment);
        else if (identity2.isPair(item)) {
          let ik = identity2.isNode(item.key) ? item.key : null;
          ik && (!chompKeep && ik.spaceBefore && lines.push(""), addCommentBefore(ctx, lines, ik.commentBefore, chompKeep));
        }
        chompKeep = !1;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = !0);
        comment2 && (str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2))), chompKeep && comment2 && (chompKeep = !1), lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0)
        str = flowChars.start + flowChars.end;
      else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          let line = lines[i];
          str += line ? `
${indent}${line}` : `
`;
        }
      }
      return comment ? (str += `
` + stringifyComment.indentComment(commentString(comment), indent), onComment && onComment()) : chompKeep && onChompKeep && onChompKeep(), str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      let { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      let itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: !0,
        type: null
      }), reqNewline = !1, linesAtValue = 0, lines = [];
      for (let i = 0; i < items.length; ++i) {
        let item = items[i], comment = null;
        if (identity2.isNode(item))
          item.spaceBefore && lines.push(""), addCommentBefore(ctx, lines, item.commentBefore, !1), item.comment && (comment = item.comment);
        else if (identity2.isPair(item)) {
          let ik = identity2.isNode(item.key) ? item.key : null;
          ik && (ik.spaceBefore && lines.push(""), addCommentBefore(ctx, lines, ik.commentBefore, !1), ik.comment && (reqNewline = !0));
          let iv = identity2.isNode(item.value) ? item.value : null;
          iv ? (iv.comment && (comment = iv.comment), iv.commentBefore && (reqNewline = !0)) : item.value == null && ik?.comment && (comment = ik.comment);
        }
        comment && (reqNewline = !0);
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes(`
`)), i < items.length - 1 ? str += "," : ctx.options.trailingComma && (ctx.options.lineWidth > 0 && (reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth)), reqNewline && (str += ",")), comment && (str += stringifyComment.lineComment(str, itemIndent, commentString(comment))), lines.push(str), linesAtValue = lines.length;
      }
      let { start, end } = flowChars;
      if (lines.length === 0)
        return start + end;
      if (!reqNewline) {
        let len = lines.reduce((sum, line) => sum + line.length + 2, 2);
        reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
      }
      if (reqNewline) {
        let str = start;
        for (let line of lines)
          str += line ? `
${indentStep}${indent}${line}` : `
`;
        return `${str}
${indent}${end}`;
      } else
        return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep && (comment = comment.replace(/^\n+/, "")), comment) {
        let ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports2.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports2) {
    "use strict";
    var stringifyCollection = require_stringifyCollection(), addPairToJSMap = require_addPairToJSMap(), Collection = require_Collection(), identity2 = require_identity(), Pair2 = require_Pair(), Scalar2 = require_Scalar();
    function findPair(items, key) {
      let k = identity2.isScalar(key) ? key.value : key;
      for (let it of items)
        if (identity2.isPair(it) && (it.key === key || it.key === k || identity2.isScalar(it.key) && it.key.value === k))
          return it;
    }
    var YAMLMap2 = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity2.MAP, schema), this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        let { keepUndefined, replacer } = ctx, map = new this(schema), add = (key, value) => {
          if (typeof replacer == "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          (value !== void 0 || keepUndefined) && map.items.push(Pair2.createPair(key, value, ctx));
        };
        if (obj instanceof Map)
          for (let [key, value] of obj)
            add(key, value);
        else if (obj && typeof obj == "object")
          for (let key of Object.keys(obj))
            add(key, obj[key]);
        return typeof schema.sortMapEntries == "function" && map.items.sort(schema.sortMapEntries), map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        identity2.isPair(pair) ? _pair = pair : !pair || typeof pair != "object" || !("key" in pair) ? _pair = new Pair2.Pair(pair, pair?.value) : _pair = new Pair2.Pair(pair.key, pair.value);
        let prev = findPair(this.items, _pair.key), sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          identity2.isScalar(prev.value) && Scalar2.isScalarValue(_pair.value) ? prev.value.value = _pair.value : prev.value = _pair.value;
        } else if (sortEntries) {
          let i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          i === -1 ? this.items.push(_pair) : this.items.splice(i, 0, _pair);
        } else
          this.items.push(_pair);
      }
      delete(key) {
        let it = findPair(this.items, key);
        return it ? this.items.splice(this.items.indexOf(it), 1).length > 0 : !1;
      }
      get(key, keepScalar) {
        let node = findPair(this.items, key)?.value;
        return (!keepScalar && identity2.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair2.Pair(key, value), !0);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        let map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        ctx?.onCreate && ctx.onCreate(map);
        for (let item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (let item of this.items)
          if (!identity2.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        return !ctx.allNullValues && this.hasAllNullValues(!1) && (ctx = Object.assign({}, ctx, { allNullValues: !0 })), stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports2.YAMLMap = YAMLMap2;
    exports2.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), YAMLMap2 = require_YAMLMap(), map = {
      collection: "map",
      default: !0,
      nodeClass: YAMLMap2.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        return identity2.isMap(map2) || onError("Expected a mapping for this tag"), map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap2.YAMLMap.from(schema, obj, ctx)
    };
    exports2.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports2) {
    "use strict";
    var createNode = require_createNode(), stringifyCollection = require_stringifyCollection(), Collection = require_Collection(), identity2 = require_identity(), Scalar2 = require_Scalar(), toJS = require_toJS(), YAMLSeq2 = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity2.SEQ, schema), this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        let idx = asItemIndex(key);
        return typeof idx != "number" ? !1 : this.items.splice(idx, 1).length > 0;
      }
      get(key, keepScalar) {
        let idx = asItemIndex(key);
        if (typeof idx != "number")
          return;
        let it = this.items[idx];
        return !keepScalar && identity2.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        let idx = asItemIndex(key);
        return typeof idx == "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        let idx = asItemIndex(key);
        if (typeof idx != "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        let prev = this.items[idx];
        identity2.isScalar(prev) && Scalar2.isScalarValue(value) ? prev.value = value : this.items[idx] = value;
      }
      toJSON(_, ctx) {
        let seq = [];
        ctx?.onCreate && ctx.onCreate(seq);
        let i = 0;
        for (let item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx ? stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        }) : JSON.stringify(this);
      }
      static from(schema, obj, ctx) {
        let { replacer } = ctx, seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer == "function") {
              let key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity2.isScalar(key) ? key.value : key;
      return idx && typeof idx == "string" && (idx = Number(idx)), typeof idx == "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports2.YAMLSeq = YAMLSeq2;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), YAMLSeq2 = require_YAMLSeq(), seq = {
      collection: "seq",
      default: !0,
      nodeClass: YAMLSeq2.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        return identity2.isSeq(seq2) || onError("Expected a sequence for this tag"), seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq2.YAMLSeq.from(schema, obj, ctx)
    };
    exports2.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports2) {
    "use strict";
    var stringifyString = require_stringifyString(), string = {
      identify: (value) => typeof value == "string",
      default: !0,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        return ctx = Object.assign({ actualString: !0 }, ctx), stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports2.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar2.Scalar(null),
      default: !0,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar2.Scalar(null),
      stringify: ({ source }, ctx) => typeof source == "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports2.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), boolTag = {
      identify: (value) => typeof value == "boolean",
      default: !0,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar2.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          let sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports2.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports2) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value == "bigint")
        return String(value);
      let num = typeof value == "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        i < 0 && (i = n.length, n += ".");
        let d = minFractionDigits - (n.length - i - 1);
        for (; d-- > 0; )
          n += "0";
      }
      return n;
    }
    exports2.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), stringifyNumber = require_stringifyNumber(), floatNaN = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    }, floatExp = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        let num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    }, float = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        let node = new Scalar2.Scalar(parseFloat(str)), dot = str.indexOf(".");
        return dot !== -1 && str[str.length - 1] === "0" && (node.minFractionDigits = str.length - dot - 1), node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber(), intIdentify = (value) => typeof value == "bigint" || Number.isInteger(value), intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      let { value } = node;
      return intIdentify(value) && value >= 0 ? prefix + value.toString(radix) : stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    }, int = {
      identify: intIdentify,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    }, intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports2) {
    "use strict";
    var map = require_map(), _null = require_null(), seq = require_seq(), string = require_string(), bool = require_bool(), float = require_float(), int = require_int(), schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), map = require_map(), seq = require_seq();
    function intIdentify(value) {
      return typeof value == "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value), jsonScalars = [
      {
        identify: (value) => typeof value == "string",
        default: !0,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar2.Scalar(null),
        default: !0,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value == "boolean",
        default: !0,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: !0,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value == "number",
        default: !0,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ], jsonError = {
      default: !0,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        return onError(`Unresolved plain scalar ${JSON.stringify(str)}`), str;
      }
    }, schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports2) {
    "use strict";
    var node_buffer = require("buffer"), Scalar2 = require_Scalar(), stringifyString = require_stringifyString(), binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: !1,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer == "function")
          return node_buffer.Buffer.from(src, "base64");
        if (typeof atob == "function") {
          let str = atob(src.replace(/[\n\r]/g, "")), buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else
          return onError("This environment does not support reading binary tags; either Buffer or atob is required"), src;
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        let buf = value, str;
        if (typeof node_buffer.Buffer == "function")
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        else if (typeof btoa == "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        if (type ?? (type = Scalar2.Scalar.BLOCK_LITERAL), type !== Scalar2.Scalar.QUOTE_DOUBLE) {
          let lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth), n = Math.ceil(str.length / lineWidth), lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth)
            lines[i] = str.substr(o, lineWidth);
          str = lines.join(type === Scalar2.Scalar.BLOCK_LITERAL ? `
` : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports2.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Pair2 = require_Pair(), Scalar2 = require_Scalar(), YAMLSeq2 = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity2.isSeq(seq))
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (!identity2.isPair(item)) {
            if (identity2.isMap(item)) {
              item.items.length > 1 && onError("Each pair must have its own sequence indicator");
              let pair = item.items[0] || new Pair2.Pair(new Scalar2.Scalar(null));
              if (item.commentBefore && (pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore), item.comment) {
                let cn = pair.value ?? pair.key;
                cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
              }
              item = pair;
            }
            seq.items[i] = identity2.isPair(item) ? item : new Pair2.Pair(item);
          }
        }
      else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      let { replacer } = ctx, pairs2 = new YAMLSeq2.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          typeof replacer == "function" && (it = replacer.call(iterable, String(i++), it));
          let key, value;
          if (Array.isArray(it))
            if (it.length === 2)
              key = it[0], value = it[1];
            else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          else if (it && it instanceof Object) {
            let keys = Object.keys(it);
            if (keys.length === 1)
              key = keys[0], value = it[key];
            else
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
          } else
            key = it;
          pairs2.items.push(Pair2.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: !1,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports2.createPairs = createPairs;
    exports2.pairs = pairs;
    exports2.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), toJS = require_toJS(), YAMLMap2 = require_YAMLMap(), YAMLSeq2 = require_YAMLSeq(), pairs = require_pairs(), YAMLOMap = class _YAMLOMap extends YAMLSeq2.YAMLSeq {
      constructor() {
        super(), this.add = YAMLMap2.YAMLMap.prototype.add.bind(this), this.delete = YAMLMap2.YAMLMap.prototype.delete.bind(this), this.get = YAMLMap2.YAMLMap.prototype.get.bind(this), this.has = YAMLMap2.YAMLMap.prototype.has.bind(this), this.set = YAMLMap2.YAMLMap.prototype.set.bind(this), this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        let map = /* @__PURE__ */ new Map();
        ctx?.onCreate && ctx.onCreate(map);
        for (let pair of this.items) {
          let key, value;
          if (identity2.isPair(pair) ? (key = toJS.toJS(pair.key, "", ctx), value = toJS.toJS(pair.value, key, ctx)) : key = toJS.toJS(pair, "", ctx), map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        let pairs$1 = pairs.createPairs(schema, iterable, ctx), omap2 = new this();
        return omap2.items = pairs$1.items, omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: !1,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        let pairs$1 = pairs.resolvePairs(seq, onError), seenKeys = [];
        for (let { key } of pairs$1.items)
          identity2.isScalar(key) && (seenKeys.includes(key.value) ? onError(`Ordered maps must not include duplicate keys: ${key.value}`) : seenKeys.push(key.value));
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports2.YAMLOMap = YAMLOMap;
    exports2.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      return source && (value ? trueTag : falseTag).test.test(source) ? source : value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === !0,
      default: !0,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar2.Scalar(!0),
      stringify: boolStringify
    }, falseTag = {
      identify: (value) => value === !1,
      default: !0,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar2.Scalar(!1),
      stringify: boolStringify
    };
    exports2.falseTag = falseTag;
    exports2.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), stringifyNumber = require_stringifyNumber(), floatNaN = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    }, floatExp = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        let num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    }, float = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        let node = new Scalar2.Scalar(parseFloat(str.replace(/_/g, ""))), dot = str.indexOf(".");
        if (dot !== -1) {
          let f = str.substring(dot + 1).replace(/_/g, "");
          f[f.length - 1] === "0" && (node.minFractionDigits = f.length);
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports2.float = float;
    exports2.floatExp = floatExp;
    exports2.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber(), intIdentify = (value) => typeof value == "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      let sign = str[0];
      if ((sign === "-" || sign === "+") && (offset += 1), str = str.substring(offset).replace(/_/g, ""), intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        let n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      let n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      let { value } = node;
      if (intIdentify(value)) {
        let str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    }, intOct = {
      identify: intIdentify,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    }, int = {
      identify: intIdentify,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    }, intHex = {
      identify: intIdentify,
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports2.int = int;
    exports2.intBin = intBin;
    exports2.intHex = intHex;
    exports2.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Pair2 = require_Pair(), YAMLMap2 = require_YAMLMap(), YAMLSet = class _YAMLSet extends YAMLMap2.YAMLMap {
      constructor(schema) {
        super(schema), this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        identity2.isPair(key) ? pair = key : key && typeof key == "object" && "key" in key && "value" in key && key.value === null ? pair = new Pair2.Pair(key.key, null) : pair = new Pair2.Pair(key, null), YAMLMap2.findPair(this.items, pair.key) || this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        let pair = YAMLMap2.findPair(this.items, key);
        return !keepPair && identity2.isPair(pair) ? identity2.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value != "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        let prev = YAMLMap2.findPair(this.items, key);
        prev && !value ? this.items.splice(this.items.indexOf(prev), 1) : !prev && value && this.items.push(new Pair2.Pair(key));
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(!0))
          return super.toString(Object.assign({}, ctx, { allNullValues: !0 }), onComment, onChompKeep);
        throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        let { replacer } = ctx, set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable)
            typeof replacer == "function" && (value = replacer.call(iterable, value, value)), set2.items.push(Pair2.createPair(value, null, ctx));
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: !1,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity2.isMap(map)) {
          if (map.hasAllNullValues(!0))
            return Object.assign(new YAMLSet(), map);
          onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports2.YAMLSet = YAMLSet;
    exports2.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports2) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      let sign = str[0], parts = sign === "-" || sign === "+" ? str.substring(1) : str, num = (n) => asBigInt ? BigInt(n) : Number(n), res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node, num = (n) => n;
      if (typeof value == "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      value < 0 && (sign = "-", value *= num(-1));
      let _60 = num(60), parts = [value % _60];
      return value < 60 ? parts.unshift(0) : (value = (value - parts[0]) / _60, parts.unshift(value % _60), value >= 60 && (value = (value - parts[0]) / _60, parts.unshift(value))), sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value == "bigint" || Number.isInteger(value),
      default: !0,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    }, floatTime = {
      identify: (value) => typeof value == "number",
      default: !0,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, !1),
      stringify: stringifySexagesimal
    }, timestamp = {
      identify: (value) => value instanceof Date,
      default: !0,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        let match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        let [, year, month, day, hour, minute, second] = match.map(Number), millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0, date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec), tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, !1);
          Math.abs(d) < 30 && (d *= 60), date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports2.floatTime = floatTime;
    exports2.intTime = intTime;
    exports2.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports2) {
    "use strict";
    var map = require_map(), _null = require_null(), seq = require_seq(), string = require_string(), binary = require_binary(), bool = require_bool2(), float = require_float2(), int = require_int2(), merge = require_merge(), omap = require_omap(), pairs = require_pairs(), set = require_set(), timestamp = require_timestamp(), schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports2.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports2) {
    "use strict";
    var map = require_map(), _null = require_null(), seq = require_seq(), string = require_string(), bool = require_bool(), float = require_float(), int = require_int(), schema = require_schema(), schema$1 = require_schema2(), binary = require_binary(), merge = require_merge(), omap = require_omap(), pairs = require_pairs(), schema$2 = require_schema3(), set = require_set(), timestamp = require_timestamp(), schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]), tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    }, coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      let schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags)
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      let tags = schemaTags;
      if (!tags)
        if (Array.isArray(customTags))
          tags = [];
        else {
          let keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      if (Array.isArray(customTags))
        for (let tag of customTags)
          tags = tags.concat(tag);
      else typeof customTags == "function" && (tags = customTags(tags.slice()));
      return addMergeTag && (tags = tags.concat(merge.merge)), tags.reduce((tags2, tag) => {
        let tagObj = typeof tag == "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          let tagName = JSON.stringify(tag), keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        return tags2.includes(tagObj) || tags2.push(tagObj), tags2;
      }, []);
    }
    exports2.coreKnownTags = coreKnownTags;
    exports2.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), map = require_map(), seq = require_seq(), string = require_string(), tags = require_tags(), sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0, Schema2 = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null, this.name = typeof schema == "string" && schema || "core", this.knownTags = resolveKnownTags ? tags.coreKnownTags : {}, this.tags = tags.getTags(customTags, this.name, merge), this.toStringOptions = toStringDefaults ?? null, Object.defineProperty(this, identity2.MAP, { value: map.map }), Object.defineProperty(this, identity2.SCALAR, { value: string.string }), Object.defineProperty(this, identity2.SEQ, { value: seq.seq }), this.sortMapEntries = typeof sortMapEntries == "function" ? sortMapEntries : sortMapEntries === !0 ? sortMapEntriesByKey : null;
      }
      clone() {
        let copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        return copy.tags = this.tags.slice(), copy;
      }
    };
    exports2.Schema = Schema2;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), stringify = require_stringify(), stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      let lines = [], hasDirectives = options.directives === !0;
      if (options.directives !== !1 && doc.directives) {
        let dir = doc.directives.toString(doc);
        dir ? (lines.push(dir), hasDirectives = !0) : doc.directives.docStart && (hasDirectives = !0);
      }
      hasDirectives && lines.push("---");
      let ctx = stringify.createStringifyContext(doc, options), { commentString } = ctx.options;
      if (doc.commentBefore) {
        lines.length !== 1 && lines.unshift("");
        let cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = !1, contentComment = null;
      if (doc.contents) {
        if (identity2.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives && lines.push(""), doc.contents.commentBefore) {
            let cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment, contentComment = doc.contents.comment;
        }
        let onChompKeep = contentComment ? void 0 : () => chompKeep = !0, body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        contentComment && (body += stringifyComment.lineComment(body, "", commentString(contentComment))), (body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---" ? lines[lines.length - 1] = `--- ${body}` : lines.push(body);
      } else
        lines.push(stringify.stringify(doc.contents, ctx));
      if (doc.directives?.docEnd)
        if (doc.comment) {
          let cs = commentString(doc.comment);
          cs.includes(`
`) ? (lines.push("..."), lines.push(stringifyComment.indentComment(cs, ""))) : lines.push(`... ${cs}`);
        } else
          lines.push("...");
      else {
        let dc = doc.comment;
        dc && chompKeep && (dc = dc.replace(/^\n+/, "")), dc && ((!chompKeep || contentComment) && lines[lines.length - 1] !== "" && lines.push(""), lines.push(stringifyComment.indentComment(commentString(dc), "")));
      }
      return lines.join(`
`) + `
`;
    }
    exports2.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports2) {
    "use strict";
    var Alias2 = require_Alias(), Collection = require_Collection(), identity2 = require_identity(), Pair2 = require_Pair(), toJS = require_toJS(), Schema2 = require_Schema(), stringifyDocument = require_stringifyDocument(), anchors = require_anchors(), applyReviver = require_applyReviver(), createNode = require_createNode(), directives = require_directives(), Document2 = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null, this.comment = null, this.errors = [], this.warnings = [], Object.defineProperty(this, identity2.NODE_TYPE, { value: identity2.DOC });
        let _replacer = null;
        typeof replacer == "function" || Array.isArray(replacer) ? _replacer = replacer : options === void 0 && replacer && (options = replacer, replacer = void 0);
        let opt = Object.assign({
          intAsBigInt: !1,
          keepSourceTokens: !1,
          logLevel: "warn",
          prettyErrors: !0,
          strict: !0,
          stringKeys: !1,
          uniqueKeys: !0,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        options?._directives ? (this.directives = options._directives.atDocument(), this.directives.yaml.explicit && (version = this.directives.yaml.version)) : this.directives = new directives.Directives({ version }), this.setSchema(version, options), this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        let copy = Object.create(_Document.prototype, {
          [identity2.NODE_TYPE]: { value: identity2.DOC }
        });
        return copy.commentBefore = this.commentBefore, copy.comment = this.comment, copy.errors = this.errors.slice(), copy.warnings = this.warnings.slice(), copy.options = Object.assign({}, this.options), this.directives && (copy.directives = this.directives.clone()), copy.schema = this.schema.clone(), copy.contents = identity2.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents, this.range && (copy.range = this.range.slice()), copy;
      }
      /** Adds a value to the document. */
      add(value) {
        assertCollection(this.contents) && this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        assertCollection(this.contents) && this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          let prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias2.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer;
        if (typeof replacer == "function")
          value = replacer.call({ "": value }, "", value), _replacer = replacer;
        else if (Array.isArray(replacer)) {
          let keyToStr = (v) => typeof v == "number" || v instanceof String || v instanceof Number, asStr = replacer.filter(keyToStr).map(String);
          asStr.length > 0 && (replacer = replacer.concat(asStr)), _replacer = replacer;
        } else options === void 0 && replacer && (options = replacer, replacer = void 0);
        let { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {}, { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        ), ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? !0,
          keepUndefined: keepUndefined ?? !1,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        }, node = createNode.createNode(value, tag, ctx);
        return flow && identity2.isCollection(node) && (node.flow = !0), setAnchors(), node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        let k = this.createNode(key, null, options), v = this.createNode(value, null, options);
        return new Pair2.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : !1;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        return Collection.isEmptyPath(path) ? this.contents == null ? !1 : (this.contents = null, !0) : assertCollection(this.contents) ? this.contents.deleteIn(path) : !1;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity2.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        return Collection.isEmptyPath(path) ? !keepScalar && identity2.isScalar(this.contents) ? this.contents.value : this.contents : identity2.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity2.isCollection(this.contents) ? this.contents.has(key) : !1;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        return Collection.isEmptyPath(path) ? this.contents !== void 0 : identity2.isCollection(this.contents) ? this.contents.hasIn(path) : !1;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        this.contents == null ? this.contents = Collection.collectionFromPath(this.schema, [key], value) : assertCollection(this.contents) && this.contents.set(key, value);
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        Collection.isEmptyPath(path) ? this.contents = value : this.contents == null ? this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value) : assertCollection(this.contents) && this.contents.setIn(path, value);
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        typeof version == "number" && (version = String(version));
        let opt;
        switch (version) {
          case "1.1":
            this.directives ? this.directives.yaml.version = "1.1" : this.directives = new directives.Directives({ version: "1.1" }), opt = { resolveKnownTags: !1, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            this.directives ? this.directives.yaml.version = version : this.directives = new directives.Directives({ version }), opt = { resolveKnownTags: !0, schema: "core" };
            break;
          case null:
            this.directives && delete this.directives, opt = null;
            break;
          default: {
            let sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema2.Schema(Object.assign(opt, options));
        else
          throw new Error("With a null YAML version, the { schema: Schema } option is required");
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        let ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === !0,
          mapKeyWarned: !1,
          maxAliasCount: typeof maxAliasCount == "number" ? maxAliasCount : 100
        }, res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor == "function")
          for (let { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver == "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: !0, jsonArg, mapAsMap: !1, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          let s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity2.isCollection(contents))
        return !0;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports2.Document = Document2;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports2) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super(), this.name = name, this.code = code, this.message = message, this.pos = pos;
      }
    }, YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    }, YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    }, prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      let { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1, lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        let trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart), ci -= trimStart - 1;
      }
      if (lineStr.length > 80 && (lineStr = lineStr.substring(0, 79) + "\u2026"), line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        prev.length > 80 && (prev = prev.substring(0, 79) + `\u2026
`), lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1, end = error.linePos[1];
        end?.line === line && end.col > col && (count = Math.max(1, Math.min(end.col - col, 80 - ci)));
        let pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports2.YAMLError = YAMLError;
    exports2.YAMLParseError = YAMLParseError;
    exports2.YAMLWarning = YAMLWarning;
    exports2.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports2) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = !1, atNewline = startOnNewline, hasSpace = startOnNewline, comment = "", commentSep = "", hasNewline = !1, reqSpace = !1, tab = null, anchor = null, tag = null, newlineAfterProp = null, comma = null, found = null, start = null;
      for (let token of tokens)
        switch (reqSpace && (token.type !== "space" && token.type !== "newline" && token.type !== "comma" && onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space"), reqSpace = !1), tab && (atNewline && token.type !== "comment" && token.type !== "newline" && onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation"), tab = null), token.type) {
          case "space":
            !flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	") && (tab = token), hasSpace = !0;
            break;
          case "comment": {
            hasSpace || onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            let cb = token.source.substring(1) || " ";
            comment ? comment += commentSep + cb : comment = cb, commentSep = "", atNewline = !1;
            break;
          }
          case "newline":
            atNewline ? comment ? comment += token.source : (!found || indicator !== "seq-item-ind") && (spaceBefore = !0) : commentSep += token.source, atNewline = !0, hasNewline = !0, (anchor || tag) && (newlineAfterProp = token), hasSpace = !0;
            break;
          case "anchor":
            anchor && onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor"), token.source.endsWith(":") && onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", !0), anchor = token, start ?? (start = token.offset), atNewline = !1, hasSpace = !1, reqSpace = !0;
            break;
          case "tag": {
            tag && onError(token, "MULTIPLE_TAGS", "A node can have at most one tag"), tag = token, start ?? (start = token.offset), atNewline = !1, hasSpace = !1, reqSpace = !0;
            break;
          }
          case indicator:
            (anchor || tag) && onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`), found && onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`), found = token, atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind", hasSpace = !1;
            break;
          case "comma":
            if (flow) {
              comma && onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`), comma = token, atNewline = !1, hasSpace = !1;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`), atNewline = !1, hasSpace = !1;
        }
      let last = tokens[tokens.length - 1], end = last ? last.offset + last.source.length : offset;
      return reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "") && onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space"), tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq") && onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation"), {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports2.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports2) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes(`
`))
            return !0;
          if (key.end) {
            for (let st of key.end)
              if (st.type === "newline")
                return !0;
          }
          return !1;
        case "flow-collection":
          for (let it of key.items) {
            for (let st of it.start)
              if (st.type === "newline")
                return !0;
            if (it.sep) {
              for (let st of it.sep)
                if (st.type === "newline")
                  return !0;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return !0;
          }
          return !1;
        default:
          return !0;
      }
    }
    exports2.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports2) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        let end = fc.end[0];
        end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc) && onError(end, "BAD_INDENT", "Flow end indicator should be more indented than parent", !0);
      }
    }
    exports2.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports2) {
    "use strict";
    var identity2 = require_identity();
    function mapIncludes(ctx, items, search) {
      let { uniqueKeys } = ctx.options;
      if (uniqueKeys === !1)
        return !1;
      let isEqual = typeof uniqueKeys == "function" ? uniqueKeys : (a, b) => a === b || identity2.isScalar(a) && identity2.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports2.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports2) {
    "use strict";
    var Pair2 = require_Pair(), YAMLMap2 = require_YAMLMap(), resolveProps = require_resolve_props(), utilContainsNewline = require_util_contains_newline(), utilFlowIndentCheck = require_util_flow_indent_check(), utilMapIncludes = require_util_map_includes(), startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      let NodeClass = tag?.nodeClass ?? YAMLMap2.YAMLMap, map = new NodeClass(ctx.schema);
      ctx.atRoot && (ctx.atRoot = !1);
      let offset = bm.offset, commentEnd = null;
      for (let collItem of bm.items) {
        let { start, key, sep, value } = collItem, keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: !0
        }), implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key && (key.type === "block-seq" ? onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key") : "indent" in key && key.indent !== bm.indent && onError(offset, "BAD_INDENT", startColMsg)), !keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end, keyProps.comment && (map.comment ? map.comment += `
` + keyProps.comment : map.comment = keyProps.comment);
            continue;
          }
          (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) && onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
        } else keyProps.found?.indent !== bm.indent && onError(offset, "BAD_INDENT", startColMsg);
        ctx.atKey = !0;
        let keyStart = keyProps.end, keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        ctx.schema.compat && utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError), ctx.atKey = !1, utilMapIncludes.mapIncludes(ctx, map.items, keyNode) && onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        let valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        if (offset = valueProps.end, valueProps.found) {
          implicitKey && (value?.type === "block-map" && !valueProps.hasNewline && onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings"), ctx.options.strict && keyProps.start < valueProps.found.offset - 1024 && onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key"));
          let valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          ctx.schema.compat && utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError), offset = valueNode.range[2];
          let pair = new Pair2.Pair(keyNode, valueNode);
          ctx.options.keepSourceTokens && (pair.srcToken = collItem), map.items.push(pair);
        } else {
          implicitKey && onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values"), valueProps.comment && (keyNode.comment ? keyNode.comment += `
` + valueProps.comment : keyNode.comment = valueProps.comment);
          let pair = new Pair2.Pair(keyNode);
          ctx.options.keepSourceTokens && (pair.srcToken = collItem), map.items.push(pair);
        }
      }
      return commentEnd && commentEnd < offset && onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content"), map.range = [bm.offset, offset, commentEnd ?? offset], map;
    }
    exports2.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports2) {
    "use strict";
    var YAMLSeq2 = require_YAMLSeq(), resolveProps = require_resolve_props(), utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      let NodeClass = tag?.nodeClass ?? YAMLSeq2.YAMLSeq, seq = new NodeClass(ctx.schema);
      ctx.atRoot && (ctx.atRoot = !1), ctx.atKey && (ctx.atKey = !1);
      let offset = bs.offset, commentEnd = null;
      for (let { start, value } of bs.items) {
        let props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: !0
        });
        if (!props.found)
          if (props.anchor || props.tag || value)
            value?.type === "block-seq" ? onError(props.end, "BAD_INDENT", "All sequence items must start at the same column") : onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          else {
            commentEnd = props.end, props.comment && (seq.comment = props.comment);
            continue;
          }
        let node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        ctx.schema.compat && utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError), offset = node.range[2], seq.items.push(node);
      }
      return seq.range = [bs.offset, offset, commentEnd ?? offset], seq;
    }
    exports2.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports2) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = !1, sep = "";
        for (let token of end) {
          let { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = !0;
              break;
            case "comment": {
              reqSpace && !hasSpace && onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              let cb = source.substring(1) || " ";
              comment ? comment += sep + cb : comment = cb, sep = "";
              break;
            }
            case "newline":
              comment && (sep += source), hasSpace = !0;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports2.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Pair2 = require_Pair(), YAMLMap2 = require_YAMLMap(), YAMLSeq2 = require_YAMLSeq(), resolveEnd = require_resolve_end(), resolveProps = require_resolve_props(), utilContainsNewline = require_util_contains_newline(), utilMapIncludes = require_util_map_includes(), blockMsg = "Block collections are not allowed within flow collections", isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      let isMap = fc.start.source === "{", fcName = isMap ? "flow map" : "flow sequence", NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap2.YAMLMap : YAMLSeq2.YAMLSeq), coll = new NodeClass(ctx.schema);
      coll.flow = !0;
      let atRoot = ctx.atRoot;
      atRoot && (ctx.atRoot = !1), ctx.atKey && (ctx.atKey = !1);
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        let collItem = fc.items[i], { start, key, sep, value } = collItem, props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: !1
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            i === 0 && props.comma ? onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`) : i < fc.items.length - 1 && onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`), props.comment && (coll.comment ? coll.comment += `
` + props.comment : coll.comment = props.comment), offset = props.end;
            continue;
          }
          !isMap && ctx.options.strict && utilContainsNewline.containsNewline(key) && onError(
            key,
            // checked by containsNewline()
            "MULTILINE_IMPLICIT_KEY",
            "Implicit keys of flow sequence pairs need to be on a single line"
          );
        }
        if (i === 0)
          props.comma && onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        else if (props.comma || onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`), props.comment) {
          let prevItemComment = "";
          loop: for (let st of start)
            switch (st.type) {
              case "comma":
              case "space":
                break;
              case "comment":
                prevItemComment = st.source.substring(1);
                break loop;
              default:
                break loop;
            }
          if (prevItemComment) {
            let prev = coll.items[coll.items.length - 1];
            identity2.isPair(prev) && (prev = prev.value ?? prev.key), prev.comment ? prev.comment += `
` + prevItemComment : prev.comment = prevItemComment, props.comment = props.comment.substring(prevItemComment.length + 1);
          }
        }
        if (!isMap && !sep && !props.found) {
          let valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode), offset = valueNode.range[2], isBlock(value) && onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = !0;
          let keyStart = props.end, keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          isBlock(key) && onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg), ctx.atKey = !1;
          let valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: !1
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (let st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              props.start < valueProps.found.offset - 1024 && onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else value && ("source" in value && value.source?.[0] === ":" ? onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`) : onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`));
          let valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          valueNode ? isBlock(value) && onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg) : valueProps.comment && (keyNode.comment ? keyNode.comment += `
` + valueProps.comment : keyNode.comment = valueProps.comment);
          let pair = new Pair2.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens && (pair.srcToken = collItem), isMap) {
            let map = coll;
            utilMapIncludes.mapIncludes(ctx, map.items, keyNode) && onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique"), map.items.push(pair);
          } else {
            let map = new YAMLMap2.YAMLMap(ctx.schema);
            map.flow = !0, map.items.push(pair);
            let endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]], coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      let expectedEnd = isMap ? "}" : "]", [ce, ...ee] = fc.end, cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        let name = fcName[0].toUpperCase() + fcName.substring(1), msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg), ce && ce.source.length !== 1 && ee.unshift(ce);
      }
      if (ee.length > 0) {
        let end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        end.comment && (coll.comment ? coll.comment += `
` + end.comment : coll.comment = end.comment), coll.range = [fc.offset, cePos, end.offset];
      } else
        coll.range = [fc.offset, cePos, cePos];
      return coll;
    }
    exports2.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Scalar2 = require_Scalar(), YAMLMap2 = require_YAMLMap(), YAMLSeq2 = require_YAMLSeq(), resolveBlockMap = require_resolve_block_map(), resolveBlockSeq = require_resolve_block_seq(), resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      let coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag), Coll = coll.constructor;
      return tagName === "!" || tagName === Coll.tagName ? (coll.tag = Coll.tagName, coll) : (tagName && (coll.tag = tagName), coll);
    }
    function composeCollection(CN, ctx, token, props, onError) {
      let tagToken = props.tag, tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      if (token.type === "block-seq") {
        let { anchor, newlineAfterProp: nl } = props, lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        lastProp && (!nl || nl.offset < lastProp.offset) && onError(lastProp, "MISSING_CHAR", "Missing newline after block sequence props");
      }
      let expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap2.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq2.YAMLSeq.tagName && expType === "seq")
        return resolveCollection(CN, ctx, token, onError, tagName);
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        let kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType)
          ctx.schema.tags.push(Object.assign({}, kt, { default: !1 })), tag = kt;
        else
          return kt ? onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, !0) : onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, !0), resolveCollection(CN, ctx, token, onError, tagName);
      }
      let coll = resolveCollection(CN, ctx, token, onError, tagName, tag), res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll, node = identity2.isNode(res) ? res : new Scalar2.Scalar(res);
      return node.range = coll.range, node.tag = tagName, tag?.format && (node.format = tag.format), node;
    }
    exports2.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      let start = scalar.offset, header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      let type = header.mode === ">" ? Scalar2.Scalar.BLOCK_FOLDED : Scalar2.Scalar.BLOCK_LITERAL, lines = scalar.source ? splitLines(scalar.source) : [], chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        let content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        let value2 = header.chomp === "+" && lines.length > 0 ? `
`.repeat(Math.max(1, lines.length - 1)) : "", end2 = start + header.length;
        return scalar.source && (end2 += scalar.source.length), { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent, offset = scalar.offset + header.length, contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        if (content === "" || content === "\r")
          header.indent === 0 && indent.length > trimIndent && (trimIndent = indent.length);
        else {
          indent.length < trimIndent && onError(offset + indent.length, "MISSING_CHAR", "Block scalars with more-indented leading empty lines must use an explicit indentation indicator"), header.indent === 0 && (trimIndent = indent.length), contentStart = i, trimIndent === 0 && !ctx.atRoot && onError(offset, "BAD_INDENT", "Block scalar values in collections must be indented");
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i)
        lines[i][0].length > trimIndent && (chompStart = i + 1);
      let value = "", sep = "", prevMoreIndented = !1;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + `
`;
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        let crlf = content[content.length - 1] === "\r";
        if (crlf && (content = content.slice(0, -1)), content && indent.length < trimIndent) {
          let message = `Block scalar lines must not be less indented than their ${header.indent ? "explicit indentation indicator" : "first line"}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message), indent = "";
        }
        type === Scalar2.Scalar.BLOCK_LITERAL ? (value += sep + indent.slice(trimIndent) + content, sep = `
`) : indent.length > trimIndent || content[0] === "	" ? (sep === " " ? sep = `
` : !prevMoreIndented && sep === `
` && (sep = `

`), value += sep + indent.slice(trimIndent) + content, sep = `
`, prevMoreIndented = !0) : content === "" ? sep === `
` ? value += `
` : sep = `
` : (value += sep + content, sep = " ", prevMoreIndented = !1);
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += `
` + lines[i][0].slice(trimIndent);
          value[value.length - 1] !== `
` && (value += `
`);
          break;
        default:
          value += `
`;
      }
      let end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header")
        return onError(props[0], "IMPOSSIBLE", "Block scalar header not found"), null;
      let { source } = props[0], mode = source[0], indent = 0, chomp = "", error = -1;
      for (let i = 1; i < source.length; ++i) {
        let ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          let n = Number(ch);
          !indent && n ? indent = n : error === -1 && (error = offset + i);
        }
      }
      error !== -1 && onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = !1, comment = "", length = source.length;
      for (let i = 1; i < props.length; ++i) {
        let token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = !0;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            strict && !hasSpace && onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters"), length += token.source.length, comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message), length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            let message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            let ts = token.source;
            ts && typeof ts == "string" && (length += ts.length);
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      let split = source.split(/\n( *)/), first = split[0], m = first.match(/^( *)/), lines = [m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first]];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports2.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports2) {
    "use strict";
    var Scalar2 = require_Scalar(), resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      let { offset, type, source, end } = scalar, _type, value, _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar2.Scalar.PLAIN, value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar2.Scalar.QUOTE_SINGLE, value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar2.Scalar.QUOTE_DOUBLE, value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          return onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`), {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      let valueEnd = offset + source.length, re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      return badChar && onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`), foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      return (source[source.length - 1] !== "'" || source.length === 1) && onError(source.length, "MISSING_CHAR", "Missing closing 'quote"), foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp(`(.*?)(?<![ 	])[ 	]*\r?
`, "sy"), line = new RegExp(`[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?
`, "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy, line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1], sep = " ", pos = first.lastIndex;
      for (line.lastIndex = pos; match = line.exec(source); )
        match[1] === "" ? sep === `
` ? res += sep : sep = `
` : (res += sep + match[1], sep = " "), pos = line.lastIndex;
      let last = /[ \t]*(.*)/sy;
      return last.lastIndex = pos, match = last.exec(source), res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        let ch = source[i];
        if (!(ch === "\r" && source[i + 1] === `
`))
          if (ch === `
`) {
            let { fold, offset } = foldNewline(source, i);
            res += fold, i = offset;
          } else if (ch === "\\") {
            let next = source[++i], cc = escapeCodes[next];
            if (cc)
              res += cc;
            else if (next === `
`)
              for (next = source[i + 1]; next === " " || next === "	"; )
                next = source[++i + 1];
            else if (next === "\r" && source[i + 1] === `
`)
              for (next = source[++i + 1]; next === " " || next === "	"; )
                next = source[++i + 1];
            else if (next === "x" || next === "u" || next === "U") {
              let length = next === "x" ? 2 : next === "u" ? 4 : 8;
              res += parseCharCode(source, i + 1, length, onError), i += length;
            } else {
              let raw = source.substr(i - 1, 2);
              onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`), res += raw;
            }
          } else if (ch === " " || ch === "	") {
            let wsStart = i, next = source[i + 1];
            for (; next === " " || next === "	"; )
              next = source[++i + 1];
            next !== `
` && !(next === "\r" && source[i + 2] === `
`) && (res += i > wsStart ? source.slice(wsStart, i + 1) : ch);
          } else
            res += ch;
      }
      return (source[source.length - 1] !== '"' || source.length === 1) && onError(source.length, "MISSING_CHAR", 'Missing closing "quote'), res;
    }
    function foldNewline(source, offset) {
      let fold = "", ch = source[offset + 1];
      for (; (ch === " " || ch === "	" || ch === `
` || ch === "\r") && !(ch === "\r" && source[offset + 2] !== `
`); )
        ch === `
` && (fold += `
`), offset += 1, ch = source[offset + 1];
      return fold || (fold = " "), { fold, offset };
    }
    var escapeCodes = {
      0: "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: `
`,
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      let cc = source.substr(offset, length), code = cc.length === length && /^[0-9a-fA-F]+$/.test(cc) ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        let raw = source.substr(offset - 2, length + 2);
        return onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`), raw;
      }
    }
    exports2.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports2) {
    "use strict";
    var identity2 = require_identity(), Scalar2 = require_Scalar(), resolveBlockScalar = require_resolve_block_scalar(), resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      let { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError), tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null, tag;
      ctx.options.stringKeys && ctx.atKey ? tag = ctx.schema[identity2.SCALAR] : tagName ? tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError) : token.type === "scalar" ? tag = findScalarTagByTest(ctx, value, token, onError) : tag = ctx.schema[identity2.SCALAR];
      let scalar;
      try {
        let res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity2.isScalar(res) ? res : new Scalar2.Scalar(res);
      } catch (error) {
        let msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), scalar = new Scalar2.Scalar(value);
      }
      return scalar.range = range, scalar.source = value, type && (scalar.type = type), tagName && (scalar.tag = tagName), tag.format && (scalar.format = tag.format), comment && (scalar.comment = comment), scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity2.SCALAR];
      let matchWithTest = [];
      for (let tag of schema.tags)
        if (!tag.collection && tag.tag === tagName)
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
      for (let tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      let kt = schema.knownTags[tagName];
      return kt && !kt.collection ? (schema.tags.push(Object.assign({}, kt, { default: !1, test: void 0 })), kt) : (onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str"), schema[identity2.SCALAR]);
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      let tag = schema.tags.find((tag2) => (tag2.default === !0 || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity2.SCALAR];
      if (schema.compat) {
        let compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity2.SCALAR];
        if (tag.tag !== compat.tag) {
          let ts = directives.tagString(tag.tag), cs = directives.tagString(compat.tag), msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, !0);
        }
      }
      return tag;
    }
    exports2.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports2) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          for (st = before[++i]; st?.type === "space"; )
            offset += st.source.length, st = before[++i];
          break;
        }
      }
      return offset;
    }
    exports2.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports2) {
    "use strict";
    var Alias2 = require_Alias(), identity2 = require_identity(), composeCollection = require_compose_collection(), composeScalar = require_compose_scalar(), resolveEnd = require_resolve_end(), utilEmptyScalarPosition = require_util_empty_scalar_position(), CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      let atKey = ctx.atKey, { spaceBefore, comment, anchor, tag } = props, node, isSrcToken = !0;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError), (anchor || tag) && onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError), anchor && (node.anchor = anchor.source.substring(1));
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError), anchor && (node.anchor = anchor.source.substring(1));
          } catch (error) {
            let message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          let message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message), isSrcToken = !1;
        }
      }
      return node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError)), anchor && node.anchor === "" && onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string"), atKey && ctx.options.stringKeys && (!identity2.isScalar(node) || typeof node.value != "string" || node.tag && node.tag !== "tag:yaml.org,2002:str") && onError(tag ?? token, "NON_STRING_KEY", "With stringKeys, all keys must be strings"), spaceBefore && (node.spaceBefore = !0), comment && (token.type === "scalar" && token.source === "" ? node.comment = comment : node.commentBefore = comment), ctx.options.keepSourceTokens && isSrcToken && (node.srcToken = token), node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      let token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      }, node = composeScalar.composeScalar(ctx, token, tag, onError);
      return anchor && (node.anchor = anchor.source.substring(1), node.anchor === "" && onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string")), spaceBefore && (node.spaceBefore = !0), comment && (node.comment = comment, node.range[2] = end), node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      let alias = new Alias2.Alias(source.substring(1));
      alias.source === "" && onError(offset, "BAD_ALIAS", "Alias cannot be an empty string"), alias.source.endsWith(":") && onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", !0);
      let valueEnd = offset + source.length, re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      return alias.range = [offset, valueEnd, re.offset], re.comment && (alias.comment = re.comment), alias;
    }
    exports2.composeEmptyNode = composeEmptyNode;
    exports2.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports2) {
    "use strict";
    var Document2 = require_Document(), composeNode = require_compose_node(), resolveEnd = require_resolve_end(), resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      let opts = Object.assign({ _directives: directives }, options), doc = new Document2.Document(void 0, opts), ctx = {
        atKey: !1,
        atRoot: !0,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      }, props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: !0
      });
      props.found && (doc.directives.docStart = !0, value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline && onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker")), doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      let contentEnd = doc.contents.range[2], re = resolveEnd.resolveEnd(end, contentEnd, !1, onError);
      return re.comment && (doc.comment = re.comment), doc.range = [offset, contentEnd, re.offset], doc;
    }
    exports2.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports2) {
    "use strict";
    var node_process = require("process"), directives = require_directives(), Document2 = require_Document(), errors2 = require_errors(), identity2 = require_identity(), composeDoc = require_compose_doc(), resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src == "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      let { offset, source } = src;
      return [offset, offset + (typeof source == "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "", atComment = !1, afterEmptyLine = !1;
      for (let i = 0; i < prelude.length; ++i) {
        let source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? `

` : `
`) + (source.substring(1) || " "), atComment = !0, afterEmptyLine = !1;
            break;
          case "%":
            prelude[i + 1]?.[0] !== "#" && (i += 1), atComment = !1;
            break;
          default:
            atComment || (afterEmptyLine = !0), atComment = !1;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null, this.atDirectives = !1, this.prelude = [], this.errors = [], this.warnings = [], this.onError = (source, code, message, warning) => {
          let pos = getErrorPos(source);
          warning ? this.warnings.push(new errors2.YAMLWarning(pos, code, message)) : this.errors.push(new errors2.YAMLParseError(pos, code, message));
        }, this.directives = new directives.Directives({ version: options.version || "1.2" }), this.options = options;
      }
      decorate(doc, afterDoc) {
        let { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          let dc = doc.contents;
          if (afterDoc)
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          else if (afterEmptyLine || doc.directives.docStart || !dc)
            doc.commentBefore = comment;
          else if (identity2.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            identity2.isPair(it) && (it = it.key);
            let cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            let cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else
          doc.errors = this.errors, doc.warnings = this.warnings;
        this.prelude = [], this.errors = [], this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = !1, endOffset = -1) {
        for (let token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        switch (node_process.env.LOG_STREAM && console.dir(token, { depth: null }), token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              let pos = getErrorPos(token);
              pos[0] += offset, this.onError(pos, "BAD_DIRECTIVE", message, warning);
            }), this.prelude.push(token.source), this.atDirectives = !0;
            break;
          case "document": {
            let doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            this.atDirectives && !doc.directives.docStart && this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line"), this.decorate(doc, !1), this.doc && (yield this.doc), this.doc = doc, this.atDirectives = !1;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            let msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message, error = new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            this.atDirectives || !this.doc ? this.errors.push(error) : this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              let msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = !0;
            let end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            if (this.decorate(this.doc, !0), end.comment) {
              let dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors2.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = !1, endOffset = -1) {
        if (this.doc)
          this.decorate(this.doc, !0), yield this.doc, this.doc = null;
        else if (forceDoc) {
          let opts = Object.assign({ _directives: this.directives }, this.options), doc = new Document2.Document(void 0, opts);
          this.atDirectives && this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line"), doc.range = [0, endOffset, endOffset], this.decorate(doc, !1), yield doc;
        }
      }
    };
    exports2.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports2) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar(), resolveFlowScalar = require_resolve_flow_scalar(), errors2 = require_errors(), stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = !0, onError) {
      if (token) {
        let _onError = (pos, code, message) => {
          let offset = typeof pos == "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors2.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      let { implicitKey = !1, indent, inFlow = !1, offset = -1, type = "PLAIN" } = context, source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: !0, lineWidth: -1 }
      }), end = context.end ?? [
        { type: "newline", offset: -1, indent, source: `
` }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          let he = source.indexOf(`
`), head = source.substring(0, he), body = source.substring(he + 1) + `
`, props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          return addEndtoBlockProps(props, end) || props.push({ type: "newline", offset: -1, indent, source: `
` }), { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = !1, implicitKey = !1, inFlow = !1, type } = context, indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent == "number" && (indent += 2), !type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            let header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      let source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: !0, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      let he = source.indexOf(`
`), head = source.substring(0, he), body = source.substring(he + 1) + `
`;
      if (token.type === "block-scalar") {
        let header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head, token.source = body;
      } else {
        let { offset } = token, indent = "indent" in token ? token.indent : -1, props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        addEndtoBlockProps(props, "end" in token ? token.end : void 0) || props.push({ type: "newline", offset: -1, indent, source: `
` });
        for (let key of Object.keys(token))
          key !== "type" && key !== "offset" && delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (let st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              return props.push(st), !0;
          }
      return !1;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type, token.source = source;
          break;
        case "block-scalar": {
          let end = token.props.slice(1), oa = source.length;
          token.props[0].type === "block-scalar-header" && (oa -= token.props[0].source.length);
          for (let tok of end)
            tok.offset += oa;
          delete token.props, Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          let nl = { type: "newline", offset: token.offset + source.length, indent: token.indent, source: `
` };
          delete token.items, Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          let indent = "indent" in token ? token.indent : -1, end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (let key of Object.keys(token))
            key !== "type" && key !== "offset" && delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports2.createScalarToken = createScalarToken;
    exports2.resolveAsScalar = resolveAsScalar;
    exports2.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports2) {
    "use strict";
    var stringify = (cst2) => "type" in cst2 ? stringifyToken(cst2) : stringifyItem(cst2);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (let tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (let item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (let item of token.items)
            res += stringifyItem(item);
          for (let st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (let st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (let st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (let st of start)
        res += st.source;
      if (key && (res += stringifyToken(key)), sep)
        for (let st of sep)
          res += st.source;
      return value && (res += stringifyToken(value)), res;
    }
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports2) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit"), SKIP = /* @__PURE__ */ Symbol("skip children"), REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit2(cst2, visitor) {
      "type" in cst2 && cst2.type === "document" && (cst2 = { start: cst2.start, value: cst2.value }), _visit(Object.freeze([]), cst2, visitor);
    }
    visit2.BREAK = BREAK;
    visit2.SKIP = SKIP;
    visit2.REMOVE = REMOVE;
    visit2.itemAtPath = (cst2, path) => {
      let item = cst2;
      for (let [field, index] of path) {
        let tok = item?.[field];
        if (tok && "items" in tok)
          item = tok.items[index];
        else
          return;
      }
      return item;
    };
    visit2.parentCollection = (cst2, path) => {
      let parent = visit2.itemAtPath(cst2, path.slice(0, -1)), field = path[path.length - 1][0], coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl == "symbol")
        return ctrl;
      for (let field of ["key", "value"]) {
        let token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            let ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci == "number")
              i = ci - 1;
            else {
              if (ci === BREAK)
                return BREAK;
              ci === REMOVE && (token.items.splice(i, 1), i -= 1);
            }
          }
          typeof ctrl == "function" && field === "key" && (ctrl = ctrl(item, path));
        }
      }
      return typeof ctrl == "function" ? ctrl(item, path) : ctrl;
    }
    exports2.visit = visit2;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports2) {
    "use strict";
    var cstScalar = require_cst_scalar(), cstStringify = require_cst_stringify(), cstVisit = require_cst_visit(), BOM = "\uFEFF", DOCUMENT = "", FLOW_END = "", SCALAR = "", isCollection = (token) => !!token && "items" in token, isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case `
`:
        case `\r
`:
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports2.createScalarToken = cstScalar.createScalarToken;
    exports2.resolveAsScalar = cstScalar.resolveAsScalar;
    exports2.setScalarValue = cstScalar.setScalarValue;
    exports2.stringify = cstStringify.stringify;
    exports2.visit = cstVisit.visit;
    exports2.BOM = BOM;
    exports2.DOCUMENT = DOCUMENT;
    exports2.FLOW_END = FLOW_END;
    exports2.SCALAR = SCALAR;
    exports2.isCollection = isCollection;
    exports2.isScalar = isScalar;
    exports2.prettyToken = prettyToken;
    exports2.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports2) {
    "use strict";
    var cst2 = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case `
`:
        case "\r":
        case "	":
          return !0;
        default:
          return !1;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef"), tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()"), flowIndicatorChars = new Set(",[]{}"), invalidAnchorChars = new Set(` ,[]{}
\r	`), isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch), Lexer = class {
      constructor() {
        this.atEnd = !1, this.blockScalarIndent = -1, this.blockScalarKeep = !1, this.buffer = "", this.flowKey = !1, this.flowLevel = 0, this.indentNext = 0, this.indentValue = 0, this.lineEndPos = null, this.next = null, this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = !1) {
        if (source) {
          if (typeof source != "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source, this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        for (; next && (incomplete || this.hasChars(1)); )
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos, ch = this.buffer[i];
        for (; ch === " " || ch === "	"; )
          ch = this.buffer[++i];
        return !ch || ch === "#" || ch === `
` ? !0 : ch === "\r" ? this.buffer[i + 1] === `
` : !1;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          for (; ch === " "; )
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            let next = this.buffer[indent + offset + 1];
            if (next === `
` || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === `
` || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          let dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        return (typeof end != "number" || end !== -1 && end < this.pos) && (end = this.buffer.indexOf(`
`, this.pos), this.lineEndPos = end), end === -1 ? this.atEnd ? this.buffer.substring(this.pos) : null : (this.buffer[end - 1] === "\r" && (end -= 1), this.buffer.substring(this.pos, end));
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        return this.buffer = this.buffer.substring(this.pos), this.pos = 0, this.lineEndPos = null, this.next = state, null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst2.BOM && (yield* this.pushCount(1), line = line.substring(1)), line[0] === "%") {
          let dirEnd = line.length, cs = line.indexOf("#");
          for (; cs !== -1; ) {
            let ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else
              cs = line.indexOf("#", cs + 1);
          }
          for (; ; ) {
            let ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          let n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(!0));
          return yield* this.pushCount(line.length - n), this.pushNewline(), "stream";
        }
        if (this.atLineEnd()) {
          let sp = yield* this.pushSpaces(!0);
          return yield* this.pushCount(line.length - sp), yield* this.pushNewline(), "stream";
        }
        return yield cst2.DOCUMENT, yield* this.parseLineStart();
      }
      *parseLineStart() {
        let ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          let s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3)))
            return yield* this.pushCount(3), this.indentValue = 0, this.indentNext = 0, s === "---" ? "doc" : "stream";
        }
        return this.indentValue = yield* this.pushSpaces(!1), this.indentNext > this.indentValue && !isEmpty(this.charAt(1)) && (this.indentNext = this.indentValue), yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        let [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          let n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(!0));
          return this.indentNext = this.indentValue + 1, this.indentValue += n, "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(!0);
        let line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            return yield* this.pushNewline(), yield* this.parseLineStart();
          case "{":
          case "[":
            return yield* this.pushCount(1), this.flowKey = !1, this.flowLevel = 1, "flow";
          case "}":
          case "]":
            return yield* this.pushCount(1), "doc";
          case "*":
            return yield* this.pushUntil(isNotAnchorChar), "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            return n += yield* this.parseBlockScalarHeader(), n += yield* this.pushSpaces(!0), yield* this.pushCount(line.length - n), yield* this.pushNewline(), yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp, indent = -1;
        do
          nl = yield* this.pushNewline(), nl > 0 ? (sp = yield* this.pushSpaces(!1), this.indentValue = indent = sp) : sp = 0, sp += yield* this.pushSpaces(!0);
        while (nl + sp > 0);
        let line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if ((indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) && !(indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}")))
          return this.flowLevel = 0, yield cst2.FLOW_END, yield* this.parseLineStart();
        let n = 0;
        for (; line[n] === ","; )
          n += yield* this.pushCount(1), n += yield* this.pushSpaces(!0), this.flowKey = !1;
        switch (n += yield* this.pushIndicators(), line[n]) {
          case void 0:
            return "flow";
          case "#":
            return yield* this.pushCount(line.length - n), "flow";
          case "{":
          case "[":
            return yield* this.pushCount(1), this.flowKey = !1, this.flowLevel += 1, "flow";
          case "}":
          case "]":
            return yield* this.pushCount(1), this.flowKey = !0, this.flowLevel -= 1, this.flowLevel ? "flow" : "doc";
          case "*":
            return yield* this.pushUntil(isNotAnchorChar), "flow";
          case '"':
          case "'":
            return this.flowKey = !0, yield* this.parseQuotedScalar();
          case ":": {
            let next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",")
              return this.flowKey = !1, yield* this.pushCount(1), yield* this.pushSpaces(!0), "flow";
          }
          // fallthrough
          default:
            return this.flowKey = !1, yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        let quote = this.charAt(0), end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'")
          for (; end !== -1 && this.buffer[end + 1] === "'"; )
            end = this.buffer.indexOf("'", end + 2);
        else
          for (; end !== -1; ) {
            let n = 0;
            for (; this.buffer[end - 1 - n] === "\\"; )
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        let qb = this.buffer.substring(0, end), nl = qb.indexOf(`
`, this.pos);
        if (nl !== -1) {
          for (; nl !== -1; ) {
            let cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf(`
`, cs);
          }
          nl !== -1 && (end = nl - (qb[nl - 1] === "\r" ? 2 : 1));
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        return yield* this.pushToIndex(end + 1, !1), this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1, this.blockScalarKeep = !1;
        let i = this.pos;
        for (; ; ) {
          let ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = !0;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1, indent = 0, ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2)
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case `
`:
              nl = i2, indent = 0;
              break;
            case "\r": {
              let next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === `
`)
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          this.blockScalarIndent === -1 ? this.indentNext = indent : this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          do {
            let cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf(`
`, cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        for (ch = this.buffer[i]; ch === " "; )
          ch = this.buffer[++i];
        if (ch === "	") {
          for (; ch === "	" || ch === " " || ch === "\r" || ch === `
`; )
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep)
          do {
            let i2 = nl - 1, ch2 = this.buffer[i2];
            ch2 === "\r" && (ch2 = this.buffer[--i2]);
            let lastChar = i2;
            for (; ch2 === " "; )
              ch2 = this.buffer[--i2];
            if (ch2 === `
` && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (!0);
        return yield cst2.SCALAR, yield* this.pushToIndex(nl + 1, !0), yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        let inFlow = this.flowLevel > 0, end = this.pos - 1, i = this.pos - 1, ch;
        for (; ch = this.buffer[++i]; )
          if (ch === ":") {
            let next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r" && (next === `
` ? (i += 1, ch = `
`, next = this.buffer[i + 1]) : end = i), next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === `
`) {
              let cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        return !ch && !this.atEnd ? this.setNext("plain-scalar") : (yield cst2.SCALAR, yield* this.pushToIndex(end + 1, !0), inFlow ? "flow" : "doc");
      }
      *pushCount(n) {
        return n > 0 ? (yield this.buffer.substr(this.pos, n), this.pos += n, n) : 0;
      }
      *pushToIndex(i, allowEmpty) {
        let s = this.buffer.slice(this.pos, i);
        return s ? (yield s, this.pos += s.length, s.length) : (allowEmpty && (yield ""), 0);
      }
      *pushIndicators() {
        let n = 0;
        loop: for (; ; ) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag(), n += yield* this.pushSpaces(!0);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar), n += yield* this.pushSpaces(!0);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              let inFlow = this.flowLevel > 0, ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                inFlow ? this.flowKey && (this.flowKey = !1) : this.indentNext = this.indentValue + 1, n += yield* this.pushCount(1), n += yield* this.pushSpaces(!0);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2, ch = this.buffer[i];
          for (; !isEmpty(ch) && ch !== ">"; )
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, !1);
        } else {
          let i = this.pos + 1, ch = this.buffer[i];
          for (; ch; )
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2]))
              ch = this.buffer[i += 3];
            else
              break;
          return yield* this.pushToIndex(i, !1);
        }
      }
      *pushNewline() {
        let ch = this.buffer[this.pos];
        return ch === `
` ? yield* this.pushCount(1) : ch === "\r" && this.charAt(1) === `
` ? yield* this.pushCount(2) : 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1, ch;
        do
          ch = this.buffer[++i];
        while (ch === " " || allowTabs && ch === "	");
        let n = i - this.pos;
        return n > 0 && (yield this.buffer.substr(this.pos, n), this.pos = i), n;
      }
      *pushUntil(test) {
        let i = this.pos, ch = this.buffer[i];
        for (; !test(ch); )
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, !1);
      }
    };
    exports2.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports2) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [], this.addNewLine = (offset) => this.lineStarts.push(offset), this.linePos = (offset) => {
          let low = 0, high = this.lineStarts.length;
          for (; low < high; ) {
            let mid = low + high >> 1;
            this.lineStarts[mid] < offset ? low = mid + 1 : high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          let start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports2.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports2) {
    "use strict";
    var node_process = require("process"), cst2 = require_cst(), lexer2 = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return !0;
      return !1;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i)
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return !0;
        default:
          return !1;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          let it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: for (; --i >= 0; )
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      for (; prev[++i]?.type === "space"; )
        ;
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start")
        for (let it of fc.items)
          it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind") && (it.key && (it.value = it.key), delete it.key, isFlowToken(it.value) ? it.value.end ? arrayPushArray(it.value.end, it.sep) : it.value.end = it.sep : arrayPushArray(it.start, it.sep), delete it.sep);
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = !0, this.atScalar = !1, this.indent = 0, this.offset = 0, this.onKeyLine = !1, this.stack = [], this.source = "", this.type = "", this.lexer = new lexer2.Lexer(), this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = !1) {
        this.onNewLine && this.offset === 0 && this.onNewLine(0);
        for (let lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        incomplete || (yield* this.end());
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        if (this.source = source, node_process.env.LOG_TOKENS && console.log("|", cst2.prettyToken(source)), this.atScalar) {
          this.atScalar = !1, yield* this.step(), this.offset += source.length;
          return;
        }
        let type = cst2.tokenType(source);
        if (type)
          if (type === "scalar")
            this.atNewLine = !1, this.atScalar = !0, this.type = "scalar";
          else {
            switch (this.type = type, yield* this.step(), type) {
              case "newline":
                this.atNewLine = !0, this.indent = 0, this.onNewLine && this.onNewLine(this.offset + source.length);
                break;
              case "space":
                this.atNewLine && source[0] === " " && (this.indent += source.length);
                break;
              case "explicit-key-ind":
              case "map-value-ind":
              case "seq-item-ind":
                this.atNewLine && (this.indent += source.length);
                break;
              case "doc-mode":
              case "flow-error-end":
                return;
              default:
                this.atNewLine = !1;
            }
            this.offset += source.length;
          }
        else {
          let message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source }), this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        for (; this.stack.length > 0; )
          yield* this.pop();
      }
      get sourceToken() {
        return {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      *step() {
        let top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          for (; this.stack.length > 0; )
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        let token = error ?? this.stack.pop();
        if (!token)
          yield { type: "error", offset: this.offset, source: "", message: "Tried to pop an empty stack" };
        else if (this.stack.length === 0)
          yield token;
        else {
          let top = this.peek(1);
          switch (token.type === "block-scalar" ? token.indent = "indent" in top ? top.indent : 0 : token.type === "flow-collection" && top.type === "document" && (token.indent = 0), token.type === "flow-collection" && fixFlowSeqItems(token), top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              let it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] }), this.onKeyLine = !0;
                return;
              } else if (it.sep)
                it.value = token;
              else {
                Object.assign(it, { key: token, sep: [] }), this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              let it = top.items[top.items.length - 1];
              it.value ? top.items.push({ start: [], value: token }) : it.value = token;
              break;
            }
            case "flow-collection": {
              let it = top.items[top.items.length - 1];
              !it || it.value ? top.items.push({ start: [], key: token, sep: [] }) : it.sep ? it.value = token : Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop(), yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            let last = token.items[token.items.length - 1];
            last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent)) && (top.type === "document" ? top.end = last.start : top.items.push({ start: last.start }), token.items.splice(-1, 1));
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            let doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            this.type === "doc-start" && doc.start.push(this.sourceToken), this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            findNonEmptyIndex(doc.start) !== -1 ? (yield* this.pop(), yield* this.step()) : doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        let bv = this.startBlockValue(doc);
        bv ? this.stack.push(bv) : yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML document`,
          source: this.source
        };
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          let prev = getPrevProps(this.peek(2)), start = getFirstKeyStartProps(prev), sep;
          scalar.end ? (sep = scalar.end, sep.push(this.sourceToken), delete scalar.end) : sep = [this.sourceToken];
          let map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = !0, this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            if (scalar.source = this.source, this.atNewLine = !0, this.indent = 0, this.onNewLine) {
              let nl = this.source.indexOf(`
`) + 1;
              for (; nl !== 0; )
                this.onNewLine(this.offset + nl), nl = this.source.indexOf(`
`, nl) + 1;
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop(), yield* this.step();
        }
      }
      *blockMap(map) {
        let it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            if (this.onKeyLine = !1, it.value) {
              let end = "end" in it.value ? it.value.end : void 0;
              (Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment" ? end?.push(this.sourceToken) : map.items.push({ start: [this.sourceToken] });
            } else it.sep ? it.sep.push(this.sourceToken) : it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              map.items.push({ start: [this.sourceToken] });
            else if (it.sep)
              it.sep.push(this.sourceToken);
            else {
              if (this.atIndentedComment(it.start, map.indent)) {
                let end = map.items[map.items.length - 2]?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start), end.push(this.sourceToken), map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          let atMapIndent = !this.onKeyLine && this.indent === map.indent, atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind", start = [];
          if (atNextItem && it.sep && !it.value) {
            let nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              let st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  st.indent > map.indent && (nl.length = 0);
                  break;
                default:
                  nl.length = 0;
              }
            }
            nl.length >= 2 && (start = it.sep.splice(nl[1]));
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              atNextItem || it.value ? (start.push(this.sourceToken), map.items.push({ start }), this.onKeyLine = !0) : it.sep ? it.sep.push(this.sourceToken) : it.start.push(this.sourceToken);
              return;
            case "explicit-key-ind":
              !it.sep && !it.explicitKey ? (it.start.push(this.sourceToken), it.explicitKey = !0) : atNextItem || it.value ? (start.push(this.sourceToken), map.items.push({ start, explicitKey: !0 })) : this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [this.sourceToken], explicitKey: !0 }]
              }), this.onKeyLine = !0;
              return;
            case "map-value-ind":
              if (it.explicitKey)
                if (it.sep)
                  if (it.value)
                    map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                  else if (includesToken(it.sep, "map-value-ind"))
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start, key: null, sep: [this.sourceToken] }]
                    });
                  else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                    let start2 = getFirstKeyStartProps(it.start), key = it.key, sep = it.sep;
                    sep.push(this.sourceToken), delete it.key, delete it.sep, this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key, sep }]
                    });
                  } else start.length > 0 ? it.sep = it.sep.concat(start, this.sourceToken) : it.sep.push(this.sourceToken);
                else if (includesToken(it.start, "newline"))
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                else {
                  let start2 = getFirstKeyStartProps(it.start);
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                  });
                }
              else
                it.sep ? it.value || atNextItem ? map.items.push({ start, key: null, sep: [this.sourceToken] }) : includesToken(it.sep, "map-value-ind") ? this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [], key: null, sep: [this.sourceToken] }]
                }) : it.sep.push(this.sourceToken) : Object.assign(it, { key: null, sep: [this.sourceToken] });
              this.onKeyLine = !0;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              let fs = this.flowScalar(this.type);
              atNextItem || it.value ? (map.items.push({ start, key: fs, sep: [] }), this.onKeyLine = !0) : it.sep ? this.stack.push(fs) : (Object.assign(it, { key: fs, sep: [] }), this.onKeyLine = !0);
              return;
            }
            default: {
              let bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else atMapIndent && map.items.push({ start });
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop(), yield* this.step();
      }
      *blockSequence(seq) {
        let it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              let end = "end" in it.value ? it.value.end : void 0;
              (Array.isArray(end) ? end[end.length - 1] : void 0)?.type === "comment" ? end?.push(this.sourceToken) : seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                let end = seq.items[seq.items.length - 2]?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start), end.push(this.sourceToken), seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            it.value || includesToken(it.start, "seq-item-ind") ? seq.items.push({ start: [this.sourceToken] }) : it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          let bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop(), yield* this.step();
      }
      *flowCollection(fc) {
        let it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do
            yield* this.pop(), top = this.peek(1);
          while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              !it || it.sep ? fc.items.push({ start: [this.sourceToken] }) : it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              !it || it.value ? fc.items.push({ start: [], key: null, sep: [this.sourceToken] }) : it.sep ? it.sep.push(this.sourceToken) : Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              !it || it.value ? fc.items.push({ start: [this.sourceToken] }) : it.sep ? it.sep.push(this.sourceToken) : it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              let fs = this.flowScalar(this.type);
              !it || it.value ? fc.items.push({ start: [], key: fs, sep: [] }) : it.sep ? this.stack.push(fs) : Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          let bv = this.startBlockValue(fc);
          bv ? this.stack.push(bv) : (yield* this.pop(), yield* this.step());
        } else {
          let parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep))
            yield* this.pop(), yield* this.step();
          else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            let prev = getPrevProps(parent), start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            let sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            let map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = !0, this.stack[this.stack.length - 1] = map;
          } else
            yield* this.lineEnd(fc);
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf(`
`) + 1;
          for (; nl !== 0; )
            this.onNewLine(this.offset + nl), nl = this.source.indexOf(`
`, nl) + 1;
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = !0;
            let prev = getPrevProps(parent), start = getFirstKeyStartProps(prev);
            return start.push(this.sourceToken), {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: !0 }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = !0;
            let prev = getPrevProps(parent), start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        return this.type !== "comment" || this.indent <= indent ? !1 : start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        this.type !== "doc-mode" && (docEnd.end ? docEnd.end.push(this.sourceToken) : docEnd.end = [this.sourceToken], this.type === "newline" && (yield* this.pop()));
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop(), yield* this.step();
            break;
          case "newline":
            this.onKeyLine = !1;
          default:
            token.end ? token.end.push(this.sourceToken) : token.end = [this.sourceToken], this.type === "newline" && (yield* this.pop());
        }
      }
    };
    exports2.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports2) {
    "use strict";
    var composer2 = require_composer(), Document2 = require_Document(), errors2 = require_errors(), log = require_log(), identity2 = require_identity(), lineCounter2 = require_line_counter(), parser2 = require_parser();
    function parseOptions(options) {
      let prettyErrors = options.prettyErrors !== !1;
      return { lineCounter: options.lineCounter || prettyErrors && new lineCounter2.LineCounter() || null, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      let { lineCounter: lineCounter3, prettyErrors } = parseOptions(options), parser$1 = new parser2.Parser(lineCounter3?.addNewLine), composer$1 = new composer2.Composer(options), docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter3)
        for (let doc of docs)
          doc.errors.forEach(errors2.prettifyError(source, lineCounter3)), doc.warnings.forEach(errors2.prettifyError(source, lineCounter3));
      return docs.length > 0 ? docs : Object.assign([], { empty: !0 }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      let { lineCounter: lineCounter3, prettyErrors } = parseOptions(options), parser$1 = new parser2.Parser(lineCounter3?.addNewLine), composer$1 = new composer2.Composer(options), doc = null;
      for (let _doc of composer$1.compose(parser$1.parse(source), !0, source.length))
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors2.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      return prettyErrors && lineCounter3 && (doc.errors.forEach(errors2.prettifyError(source, lineCounter3)), doc.warnings.forEach(errors2.prettifyError(source, lineCounter3))), doc;
    }
    function parse(src, reviver, options) {
      let _reviver;
      typeof reviver == "function" ? _reviver = reviver : options === void 0 && reviver && typeof reviver == "object" && (options = reviver);
      let doc = parseDocument(src, options);
      if (!doc)
        return null;
      if (doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning)), doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer == "function" || Array.isArray(replacer) ? _replacer = replacer : options === void 0 && replacer && (options = replacer), typeof options == "string" && (options = options.length), typeof options == "number") {
        let indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        let { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return;
      }
      return identity2.isDocument(value) && !_replacer ? value.toString(options) : new Document2.Document(value, _replacer, options).toString(options);
    }
    exports2.parse = parse;
    exports2.parseAllDocuments = parseAllDocuments;
    exports2.parseDocument = parseDocument;
    exports2.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var composer = require_composer(), Document = require_Document(), Schema = require_Schema(), errors = require_errors(), Alias = require_Alias(), identity = require_identity(), Pair = require_Pair(), Scalar = require_Scalar(), YAMLMap = require_YAMLMap(), YAMLSeq = require_YAMLSeq(), cst = require_cst(), lexer = require_lexer(), lineCounter = require_line_counter(), parser = require_parser(), publicApi = require_public_api(), visit = require_visit();
exports.Composer = composer.Composer;
exports.Document = Document.Document;
exports.Schema = Schema.Schema;
exports.YAMLError = errors.YAMLError;
exports.YAMLParseError = errors.YAMLParseError;
exports.YAMLWarning = errors.YAMLWarning;
exports.Alias = Alias.Alias;
exports.isAlias = identity.isAlias;
exports.isCollection = identity.isCollection;
exports.isDocument = identity.isDocument;
exports.isMap = identity.isMap;
exports.isNode = identity.isNode;
exports.isPair = identity.isPair;
exports.isScalar = identity.isScalar;
exports.isSeq = identity.isSeq;
exports.Pair = Pair.Pair;
exports.Scalar = Scalar.Scalar;
exports.YAMLMap = YAMLMap.YAMLMap;
exports.YAMLSeq = YAMLSeq.YAMLSeq;
exports.CST = cst;
exports.Lexer = lexer.Lexer;
exports.LineCounter = lineCounter.LineCounter;
exports.Parser = parser.Parser;
exports.parse = publicApi.parse;
exports.parseAllDocuments = publicApi.parseAllDocuments;
exports.parseDocument = publicApi.parseDocument;
exports.stringify = publicApi.stringify;
exports.visit = visit.visit;
exports.visitAsync = visit.visitAsync;
