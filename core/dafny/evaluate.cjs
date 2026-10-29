// Compiled from evaluate.dfy by `pnpm build-dafny`. Do not edit.
// Dafny program evaluate.dfy compiled into JavaScript
// Copyright by the contributors to the Dafny Project
// SPDX-License-Identifier: MIT

const BigNumber = require('bignumber.js');
BigNumber.config({ MODULO_MODE: BigNumber.EUCLID })
let _dafny = (function() {
  let $module = {};
  $module.areEqual = function(a, b) {
    if (typeof a === 'string' && b instanceof _dafny.Seq) {
      // Seq.equals(string) works as expected,
      // and the catch-all else block handles that direction.
      // But the opposite direction doesn't work; handle it here.
      return b.equals(a);
    } else if (typeof a === 'number' && BigNumber.isBigNumber(b)) {
      // This conditional would be correct even without the `typeof a` part,
      // but in most cases it's probably faster to short-circuit on a `typeof`
      // than to call `isBigNumber`. (But it remains to properly test this.)
      return b.isEqualTo(a);
    } else if (typeof a !== 'object' || a === null || b === null) {
      return a === b;
    } else if (BigNumber.isBigNumber(a)) {
      return a.isEqualTo(b);
    } else if (a._tname !== undefined || (Array.isArray(a) && a.constructor.name == "Array")) {
      return a === b;  // pointer equality
    } else {
      return a.equals(b);  // value-type equality
    }
  }
  $module.toString = function(a) {
    if (a === null) {
      return "null";
    } else if (typeof a === "number") {
      return a.toFixed();
    } else if (BigNumber.isBigNumber(a)) {
      return a.toFixed();
    } else if (a._tname !== undefined) {
      return a._tname;
    } else {
      return a.toString();
    }
  }
  $module.escapeCharacter = function(cp) {
    let s = String.fromCodePoint(cp.value)
    switch (s) {
      case '\n': return "\\n";
      case '\r': return "\\r";
      case '\t': return "\\t";
      case '\0': return "\\0";
      case '\'': return "\\'";
      case '\"': return "\\\"";
      case '\\': return "\\\\";
      default: return s;
    };
  }
  $module.NewObject = function() {
    return { _tname: "object" };
  }
  $module.InstanceOfTrait = function(obj, trait) {
    return obj._parentTraits !== undefined && obj._parentTraits().includes(trait);
  }
  $module.Rtd_bool = class {
    static get Default() { return false; }
  }
  $module.Rtd_char = class {
    static get Default() { return 'D'; }  // See CharType.DefaultValue in Dafny source code
  }
  $module.Rtd_codepoint = class {
    static get Default() { return new _dafny.CodePoint('D'.codePointAt(0)); }
  }
  $module.Rtd_int = class {
    static get Default() { return BigNumber(0); }
  }
  $module.Rtd_number = class {
    static get Default() { return 0; }
  }
  $module.Rtd_ref = class {
    static get Default() { return null; }
  }
  $module.Rtd_array = class {
    static get Default() { return []; }
  }
  $module.ZERO = new BigNumber(0);
  $module.ONE = new BigNumber(1);
  $module.NUMBER_LIMIT = new BigNumber(0x20).multipliedBy(0x1000000000000);  // 2^53
  $module.Tuple = class Tuple extends Array {
    constructor(...elems) {
      super(...elems);
    }
    toString() {
      return "(" + arrayElementsToString(this) + ")";
    }
    equals(other) {
      if (this === other) {
        return true;
      }
      for (let i = 0; i < this.length; i++) {
        if (!_dafny.areEqual(this[i], other[i])) {
          return false;
        }
      }
      return true;
    }
    static Default(...values) {
      return Tuple.of(...values);
    }
    static Rtd(...rtdArgs) {
      return {
        Default: Tuple.from(rtdArgs, rtd => rtd.Default)
      };
    }
  }
  $module.Set = class Set extends Array {
    constructor() {
      super();
    }
    static get Default() {
      return Set.Empty;
    }
    toString() {
      return "{" + arrayElementsToString(this) + "}";
    }
    static get Empty() {
      if (this._empty === undefined) {
        this._empty = new Set();
      }
      return this._empty;
    }
    static fromElements(...elmts) {
      let s = new Set();
      for (let k of elmts) {
        s.add(k);
      }
      return s;
    }
    contains(k) {
      for (let i = 0; i < this.length; i++) {
        if (_dafny.areEqual(this[i], k)) {
          return true;
        }
      }
      return false;
    }
    add(k) {  // mutates the Set; use only during construction
      if (!this.contains(k)) {
        this.push(k);
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.length !== other.length) {
        return false;
      }
      for (let e of this) {
        if (!other.contains(e)) {
          return false;
        }
      }
      return true;
    }
    get Elements() {
      return this;
    }
    Union(that) {
      if (this.length === 0) {
        return that;
      } else if (that.length === 0) {
        return this;
      } else {
        let s = Set.of(...this);
        for (let k of that) {
          s.add(k);
        }
        return s;
      }
    }
    Intersect(that) {
      if (this.length === 0) {
        return this;
      } else if (that.length === 0) {
        return that;
      } else {
        let s = new Set();
        for (let k of this) {
          if (that.contains(k)) {
            s.push(k);
          }
        }
        return s;
      }
    }
    Difference(that) {
      if (this.length == 0 || that.length == 0) {
        return this;
      } else {
        let s = new Set();
        for (let k of this) {
          if (!that.contains(k)) {
            s.push(k);
          }
        }
        return s;
      }
    }
    IsDisjointFrom(that) {
      for (let k of this) {
        if (that.contains(k)) {
          return false;
        }
      }
      return true;
    }
    IsSubsetOf(that) {
      if (that.length < this.length) {
        return false;
      }
      for (let k of this) {
        if (!that.contains(k)) {
          return false;
        }
      }
      return true;
    }
    IsProperSubsetOf(that) {
      if (that.length <= this.length) {
        return false;
      }
      for (let k of this) {
        if (!that.contains(k)) {
          return false;
        }
      }
      return true;
    }
    get AllSubsets() {
      return this.AllSubsets_();
    }
    *AllSubsets_() {
      // Start by putting all set elements into a list, but don't include null
      let elmts = Array.of(...this);
      let n = elmts.length;
      let which = new Array(n);
      which.fill(false);
      let a = [];
      while (true) {
        yield Set.of(...a);
        // "add 1" to "which", as if doing a carry chain.  For every digit changed, change the membership of the corresponding element in "a".
        let i = 0;
        for (; i < n && which[i]; i++) {
          which[i] = false;
          // remove elmts[i] from a
          for (let j = 0; j < a.length; j++) {
            if (_dafny.areEqual(a[j], elmts[i])) {
              // move the last element of a into slot j
              a[j] = a[-1];
              a.pop();
              break;
            }
          }
        }
        if (i === n) {
          // we have cycled through all the subsets
          break;
        }
        which[i] = true;
        a.push(elmts[i]);
      }
    }
  }
  $module.MultiSet = class MultiSet extends Array {
    constructor() {
      super();
    }
    static get Default() {
      return MultiSet.Empty;
    }
    toString() {
      let s = "multiset{";
      let sep = "";
      for (let e of this) {
        let [k, n] = e;
        let ks = _dafny.toString(k);
        while (!n.isZero()) {
          n = n.minus(1);
          s += sep + ks;
          sep = ", ";
        }
      }
      s += "}";
      return s;
    }
    static get Empty() {
      if (this._empty === undefined) {
        this._empty = new MultiSet();
      }
      return this._empty;
    }
    static fromElements(...elmts) {
      let s = new MultiSet();
      for (let e of elmts) {
        s.add(e, _dafny.ONE);
      }
      return s;
    }
    static FromArray(arr) {
      let s = new MultiSet();
      for (let e of arr) {
        s.add(e, _dafny.ONE);
      }
      return s;
    }
    cardinality() {
      let c = _dafny.ZERO;
      for (let e of this) {
        let [k, n] = e;
        c = c.plus(n);
      }
      return c;
    }
    clone() {
      let s = new MultiSet();
      for (let e of this) {
        let [k, n] = e;
        s.push([k, n]);  // make sure to create a new array [k, n] here
      }
      return s;
    }
    findIndex(k) {
      for (let i = 0; i < this.length; i++) {
        if (_dafny.areEqual(this[i][0], k)) {
          return i;
        }
      }
      return this.length;
    }
    get(k) {
      let i = this.findIndex(k);
      if (i === this.length) {
        return _dafny.ZERO;
      } else {
        return this[i][1];
      }
    }
    contains(k) {
      return !this.get(k).isZero();
    }
    add(k, n) {
      let i = this.findIndex(k);
      if (i === this.length) {
        this.push([k, n]);
      } else {
        let m = this[i][1];
        this[i] = [k, m.plus(n)];
      }
    }
    update(k, n) {
      let i = this.findIndex(k);
      if (i < this.length && this[i][1].isEqualTo(n)) {
        return this;
      } else if (i === this.length && n.isZero()) {
        return this;
      } else if (i === this.length) {
        let m = this.slice();
        m.push([k, n]);
        return m;
      } else {
        let m = this.slice();
        m[i] = [k, n];
        return m;
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      }
      for (let e of this) {
        let [k, n] = e;
        let m = other.get(k);
        if (!n.isEqualTo(m)) {
          return false;
        }
      }
      return this.cardinality().isEqualTo(other.cardinality());
    }
    get Elements() {
      return this.Elements_();
    }
    *Elements_() {
      for (let i = 0; i < this.length; i++) {
        let [k, n] = this[i];
        while (!n.isZero()) {
          yield k;
          n = n.minus(1);
        }
      }
    }
    get UniqueElements() {
      return this.UniqueElements_();
    }
    *UniqueElements_() {
      for (let e of this) {
        let [k, n] = e;
        if (!n.isZero()) {
          yield k;
        }
      }
    }
    Union(that) {
      if (this.length === 0) {
        return that;
      } else if (that.length === 0) {
        return this;
      } else {
        let s = this.clone();
        for (let e of that) {
          let [k, n] = e;
          s.add(k, n);
        }
        return s;
      }
    }
    Intersect(that) {
      if (this.length === 0) {
        return this;
      } else if (that.length === 0) {
        return that;
      } else {
        let s = new MultiSet();
        for (let e of this) {
          let [k, n] = e;
          let m = that.get(k);
          if (!m.isZero()) {
            s.push([k, m.isLessThan(n) ? m : n]);
          }
        }
        return s;
      }
    }
    Difference(that) {
      if (this.length === 0 || that.length === 0) {
        return this;
      } else {
        let s = new MultiSet();
        for (let e of this) {
          let [k, n] = e;
          let d = n.minus(that.get(k));
          if (d.isGreaterThan(0)) {
            s.push([k, d]);
          }
        }
        return s;
      }
    }
    IsDisjointFrom(that) {
      let intersection = this.Intersect(that);
      return intersection.cardinality().isZero();
    }
    IsSubsetOf(that) {
      for (let e of this) {
        let [k, n] = e;
        let m = that.get(k);
        if (!n.isLessThanOrEqualTo(m)) {
          return false;
        }
      }
      return true;
    }
    IsProperSubsetOf(that) {
      return this.IsSubsetOf(that) && this.cardinality().isLessThan(that.cardinality());
    }
  }
  $module.CodePoint = class CodePoint {
    constructor(value) {
      this.value = value
    }
    equals(other) {
      if (this === other) {
        return true;
      }
      return this.value === other.value
    }
    isLessThan(other) {
      return this.value < other.value
    }
    isLessThanOrEqual(other) {
      return this.value <= other.value
    }
    toString() {
      return "'" + $module.escapeCharacter(this) + "'";
    }
    static isCodePoint(i) {
      return (
        (_dafny.ZERO.isLessThanOrEqualTo(i) && i.isLessThan(new BigNumber(0xD800))) ||
        (new BigNumber(0xE000).isLessThanOrEqualTo(i) && i.isLessThan(new BigNumber(0x11_0000))))
    }
  }
  $module.Seq = class Seq extends Array {
    constructor(...elems) {
      super(...elems);
    }
    static get Default() {
      return Seq.of();
    }
    static Create(n, init) {
      return Seq.from({length: n}, (_, i) => init(new BigNumber(i)));
    }
    static UnicodeFromString(s) {
      return new Seq(...([...s].map(c => new _dafny.CodePoint(c.codePointAt(0)))))
    }
    toString() {
      return "[" + arrayElementsToString(this) + "]";
    }
    toVerbatimString(asLiteral) {
      if (asLiteral) {
        return '"' + this.map(c => _dafny.escapeCharacter(c)).join("") + '"';
      } else {
        return this.map(c => String.fromCodePoint(c.value)).join("");
      }
    }
    static update(s, i, v) {
      if (typeof s === "string") {
        let p = s.slice(0, i);
        let q = s.slice(i.toNumber() + 1);
        return p.concat(v, q);
      } else {
        let t = s.slice();
        t[i] = v;
        return t;
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.length !== other.length) {
        return false;
      }
      for (let i = 0; i < this.length; i++) {
        if (!_dafny.areEqual(this[i], other[i])) {
          return false;
        }
      }
      return true;
    }
    static contains(s, k) {
      if (typeof s === "string") {
        return s.includes(k);
      } else {
        for (let x of s) {
          if (_dafny.areEqual(x, k)) {
            return true;
          }
        }
        return false;
      }
    }
    get Elements() {
      return this;
    }
    get UniqueElements() {
      return _dafny.Set.fromElements(...this);
    }
    static Concat(a, b) {
      if (typeof a === "string" || typeof b === "string") {
        // string concatenation, so make sure both operands are strings before concatenating
        if (typeof a !== "string") {
          // a must be a Seq
          a = a.join("");
        }
        if (typeof b !== "string") {
          // b must be a Seq
          b = b.join("");
        }
        return a + b;
      } else {
        // ordinary concatenation
        let r = Seq.of(...a);
        r.push(...b);
        return r;
      }
    }
    static JoinIfPossible(x) {
      try { return x.join(""); } catch(_error) { return x; }
    }
    static IsPrefixOf(a, b) {
      if (b.length < a.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!_dafny.areEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
    static IsProperPrefixOf(a, b) {
      if (b.length <= a.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!_dafny.areEqual(a[i], b[i])) {
          return false;
        }
      }
      return true;
    }
  }
  $module.Map = class Map extends Array {
    constructor() {
      super();
    }
    static get Default() {
      return Map.of();
    }
    toString() {
      return "map[" + this.map(maplet => _dafny.toString(maplet[0]) + " := " + _dafny.toString(maplet[1])).join(", ") + "]";
    }
    static get Empty() {
      if (this._empty === undefined) {
        this._empty = new Map();
      }
      return this._empty;
    }
    findIndex(k) {
      for (let i = 0; i < this.length; i++) {
        if (_dafny.areEqual(this[i][0], k)) {
          return i;
        }
      }
      return this.length;
    }
    get(k) {
      let i = this.findIndex(k);
      if (i === this.length) {
        return undefined;
      } else {
        return this[i][1];
      }
    }
    contains(k) {
      return this.findIndex(k) < this.length;
    }
    update(k, v) {
      let m = this.slice();
      m.updateUnsafe(k, v);
      return m;
    }
    // Similar to update, but make the modification in-place.
    // Meant to be used in the map constructor.
    updateUnsafe(k, v) {
      let m = this;
      let i = m.findIndex(k);
      m[i] = [k, v];
      return m;
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.length !== other.length) {
        return false;
      }
      for (let e of this) {
        let [k, v] = e;
        let w = other.get(k);
        if (w === undefined || !_dafny.areEqual(v, w)) {
          return false;
        }
      }
      return true;
    }
    get Keys() {
      let s = new _dafny.Set();
      for (let e of this) {
        let [k, v] = e;
        s.push(k);
      }
      return s;
    }
    get Values() {
      let s = new _dafny.Set();
      for (let e of this) {
        let [k, v] = e;
        s.add(v);
      }
      return s;
    }
    get Items() {
      let s = new _dafny.Set();
      for (let e of this) {
        let [k, v] = e;
        s.push(_dafny.Tuple.of(k, v));
      }
      return s;
    }
    Merge(that) {
      let m = that.slice();
      for (let e of this) {
        let [k, v] = e;
        let i = m.findIndex(k);
        if (i == m.length) {
          m[i] = [k, v];
        }
      }
      return m;
    }
    Subtract(keys) {
      if (this.length === 0 || keys.length === 0) {
        return this;
      }
      let m = new Map();
      for (let e of this) {
        let [k, v] = e;
        if (!keys.contains(k)) {
          m[m.length] = e;
        }
      }
      return m;
    }
  }
  $module.newArray = function(initValue, ...dims) {
    return { dims: dims, elmts: buildArray(initValue, ...dims) };
  }
  $module.BigOrdinal = class BigOrdinal {
    static get Default() {
      return _dafny.ZERO;
    }
    static IsLimit(ord) {
      return ord.isZero();
    }
    static IsSucc(ord) {
      return ord.isGreaterThan(0);
    }
    static Offset(ord) {
      return ord;
    }
    static IsNat(ord) {
      return true;  // at run time, every ORDINAL is a natural number
    }
  }
  $module.BigRational = class BigRational {
    static get ZERO() {
      if (this._zero === undefined) {
        this._zero = new BigRational(_dafny.ZERO);
      }
      return this._zero;
    }
    constructor (n, d) {
      // requires d === undefined || 1 <= d
      this.num = n;
      this.den = d === undefined ? _dafny.ONE : d;
      // invariant 1 <= den || (num == 0 && den == 0)
    }
    static get Default() {
      return _dafny.BigRational.ZERO;
    }
    // We need to deal with the special case `num == 0 && den == 0`, because
    // that's what C#'s default struct constructor will produce for BigRational. :(
    // To deal with it, we ignore `den` when `num` is 0.
    toString() {
      if (this.num.isZero() || this.den.isEqualTo(1)) {
        return this.num.toFixed() + ".0";
      }
      let answer = this.dividesAPowerOf10(this.den);
      if (answer !== undefined) {
        let n = this.num.multipliedBy(answer[0]);
        let log10 = answer[1];
        let sign, digits;
        if (this.num.isLessThan(0)) {
          sign = "-"; digits = n.negated().toFixed();
        } else {
          sign = ""; digits = n.toFixed();
        }
        if (log10 < digits.length) {
          let digitCount = digits.length - log10;
          return sign + digits.slice(0, digitCount) + "." + digits.slice(digitCount);
        } else {
          return sign + "0." + "0".repeat(log10 - digits.length) + digits;
        }
      } else {
        return "(" + this.num.toFixed() + ".0 / " + this.den.toFixed() + ".0)";
      }
    }
    isPowerOf10(x) {
      if (x.isZero()) {
        return undefined;
      }
      let log10 = 0;
      while (true) {  // invariant: x != 0 && x * 10^log10 == old(x)
        if (x.isEqualTo(1)) {
          return log10;
        } else if (x.mod(10).isZero()) {
          log10++;
          x = x.dividedToIntegerBy(10);
        } else {
          return undefined;
        }
      }
    }
    dividesAPowerOf10(i) {
      let factor = _dafny.ONE;
      let log10 = 0;
      if (i.isLessThanOrEqualTo(_dafny.ZERO)) {
        return undefined;
      }

      // invariant: 1 <= i && i * 10^log10 == factor * old(i)
      while (i.mod(10).isZero()) {
        i = i.dividedToIntegerBy(10);
       log10++;
      }

      while (i.mod(5).isZero()) {
        i = i.dividedToIntegerBy(5);
        factor = factor.multipliedBy(2);
        log10++;
      }
      while (i.mod(2).isZero()) {
        i = i.dividedToIntegerBy(2);
        factor = factor.multipliedBy(5);
        log10++;
      }

      if (i.isEqualTo(_dafny.ONE)) {
        return [factor, log10];
      } else {
        return undefined;
      }
    }
    toBigNumber() {
      if (this.num.isZero() || this.den.isEqualTo(1)) {
        return this.num;
      } else if (this.num.isGreaterThan(0)) {
        return this.num.dividedToIntegerBy(this.den);
      } else {
        return this.num.minus(this.den).plus(1).dividedToIntegerBy(this.den);
      }
    }
    isInteger() {
      return this.equals(new _dafny.BigRational(this.toBigNumber(), _dafny.ONE));
    }
    // Returns values such that aa/dd == a and bb/dd == b.
    normalize(b) {
      let a = this;
      let aa, bb, dd;
      if (a.num.isZero()) {
        aa = a.num;
        bb = b.num;
        dd = b.den;
      } else if (b.num.isZero()) {
        aa = a.num;
        dd = a.den;
        bb = b.num;
      } else {
        let gcd = BigNumberGcd(a.den, b.den);
        let xx = a.den.dividedToIntegerBy(gcd);
        let yy = b.den.dividedToIntegerBy(gcd);
        // We now have a == a.num / (xx * gcd) and b == b.num / (yy * gcd).
        aa = a.num.multipliedBy(yy);
        bb = b.num.multipliedBy(xx);
        dd = a.den.multipliedBy(yy);
      }
      return [aa, bb, dd];
    }
    compareTo(that) {
      // simple things first
      let asign = this.num.isZero() ? 0 : this.num.isLessThan(0) ? -1 : 1;
      let bsign = that.num.isZero() ? 0 : that.num.isLessThan(0) ? -1 : 1;
      if (asign < 0 && 0 <= bsign) {
        return -1;
      } else if (asign <= 0 && 0 < bsign) {
        return -1;
      } else if (bsign < 0 && 0 <= asign) {
        return 1;
      } else if (bsign <= 0 && 0 < asign) {
        return 1;
      }
      let [aa, bb, dd] = this.normalize(that);
      if (aa.isLessThan(bb)) {
        return -1;
      } else if (aa.isEqualTo(bb)){
        return 0;
      } else {
        return 1;
      }
    }
    equals(that) {
      return this.compareTo(that) === 0;
    }
    isLessThan(that) {
      return this.compareTo(that) < 0;
    }
    isAtMost(that) {
      return this.compareTo(that) <= 0;
    }
    plus(b) {
      let [aa, bb, dd] = this.normalize(b);
      return new BigRational(aa.plus(bb), dd);
    }
    minus(b) {
      let [aa, bb, dd] = this.normalize(b);
      return new BigRational(aa.minus(bb), dd);
    }
    negated() {
      return new BigRational(this.num.negated(), this.den);
    }
    multipliedBy(b) {
      return new BigRational(this.num.multipliedBy(b.num), this.den.multipliedBy(b.den));
    }
    dividedBy(b) {
      let a = this;
      // Compute the reciprocal of b
      let bReciprocal;
      if (b.num.isGreaterThan(0)) {
        bReciprocal = new BigRational(b.den, b.num);
      } else {
        // this is the case b.num < 0
        bReciprocal = new BigRational(b.den.negated(), b.num.negated());
      }
      return a.multipliedBy(bReciprocal);
    }
  }
  $module.EuclideanDivisionNumber = function(a, b) {
    if (0 <= a) {
      if (0 <= b) {
        // +a +b: a/b
        return Math.floor(a / b);
      } else {
        // +a -b: -(a/(-b))
        return -Math.floor(a / -b);
      }
    } else {
      if (0 <= b) {
        // -a +b: -((-a-1)/b) - 1
        return -Math.floor((-a-1) / b) - 1;
      } else {
        // -a -b: ((-a-1)/(-b)) + 1
        return Math.floor((-a-1) / -b) + 1;
      }
    }
  }
  $module.EuclideanDivision = function(a, b) {
    if (a.isGreaterThanOrEqualTo(0)) {
      if (b.isGreaterThanOrEqualTo(0)) {
        // +a +b: a/b
        return a.dividedToIntegerBy(b);
      } else {
        // +a -b: -(a/(-b))
        return a.dividedToIntegerBy(b.negated()).negated();
      }
    } else {
      if (b.isGreaterThanOrEqualTo(0)) {
        // -a +b: -((-a-1)/b) - 1
        return a.negated().minus(1).dividedToIntegerBy(b).negated().minus(1);
      } else {
        // -a -b: ((-a-1)/(-b)) + 1
        return a.negated().minus(1).dividedToIntegerBy(b.negated()).plus(1);
      }
    }
  }
  $module.EuclideanModuloNumber = function(a, b) {
    let bp = Math.abs(b);
    if (0 <= a) {
      // +a: a % bp
      return a % bp;
    } else {
      // c = ((-a) % bp)
      // -a: bp - c if c > 0
      // -a: 0 if c == 0
      let c = (-a) % bp;
      return c === 0 ? c : bp - c;
    }
  }
  $module.ShiftLeft = function(b, n) {
    return b.multipliedBy(new BigNumber(2).exponentiatedBy(n));
  }
  $module.ShiftRight = function(b, n) {
    return b.dividedToIntegerBy(new BigNumber(2).exponentiatedBy(n));
  }
  $module.RotateLeft = function(b, n, w) {  // truncate(b << n) | (b >> (w - n))
    let x = _dafny.ShiftLeft(b, n).mod(new BigNumber(2).exponentiatedBy(w));
    let y = _dafny.ShiftRight(b, w - n);
    return x.plus(y);
  }
  $module.RotateRight = function(b, n, w) {  // (b >> n) | truncate(b << (w - n))
    let x = _dafny.ShiftRight(b, n);
    let y = _dafny.ShiftLeft(b, w - n).mod(new BigNumber(2).exponentiatedBy(w));;
    return x.plus(y);
  }
  $module.BitwiseAnd = function(a, b) {
    let r = _dafny.ZERO;
    const m = _dafny.NUMBER_LIMIT;  // 2^53
    let h = _dafny.ONE;
    while (!a.isZero() && !b.isZero()) {
      let a0 = a.mod(m);
      let b0 = b.mod(m);
      r = r.plus(h.multipliedBy(a0 & b0));
      a = a.dividedToIntegerBy(m);
      b = b.dividedToIntegerBy(m);
      h = h.multipliedBy(m);
    }
    return r;
  }
  $module.BitwiseOr = function(a, b) {
    let r = _dafny.ZERO;
    const m = _dafny.NUMBER_LIMIT;  // 2^53
    let h = _dafny.ONE;
    while (!a.isZero() && !b.isZero()) {
      let a0 = a.mod(m);
      let b0 = b.mod(m);
      r = r.plus(h.multipliedBy(a0 | b0));
      a = a.dividedToIntegerBy(m);
      b = b.dividedToIntegerBy(m);
      h = h.multipliedBy(m);
    }
    r = r.plus(h.multipliedBy(a | b));
    return r;
  }
  $module.BitwiseXor = function(a, b) {
    let r = _dafny.ZERO;
    const m = _dafny.NUMBER_LIMIT;  // 2^53
    let h = _dafny.ONE;
    while (!a.isZero() && !b.isZero()) {
      let a0 = a.mod(m);
      let b0 = b.mod(m);
      r = r.plus(h.multipliedBy(a0 ^ b0));
      a = a.dividedToIntegerBy(m);
      b = b.dividedToIntegerBy(m);
      h = h.multipliedBy(m);
    }
    r = r.plus(h.multipliedBy(a | b));
    return r;
  }
  $module.BitwiseNot = function(a, bits) {
    let r = _dafny.ZERO;
    let h = _dafny.ONE;
    for (let i = 0; i < bits; i++) {
      let bit = a.mod(2);
      if (bit.isZero()) {
        r = r.plus(h);
      }
      a = a.dividedToIntegerBy(2);
      h = h.multipliedBy(2);
    }
    return r;
  }
  $module.Quantifier = function(vals, frall, pred) {
    for (let u of vals) {
      if (pred(u) !== frall) { return !frall; }
    }
    return frall;
  }
  $module.PlusChar = function(a, b) {
    return String.fromCharCode(a.charCodeAt(0) + b.charCodeAt(0));
  }
  $module.UnicodePlusChar = function(a, b) {
    return new _dafny.CodePoint(a.value + b.value);
  }
  $module.MinusChar = function(a, b) {
    return String.fromCharCode(a.charCodeAt(0) - b.charCodeAt(0));
  }
  $module.UnicodeMinusChar = function(a, b) {
    return new _dafny.CodePoint(a.value - b.value);
  }
  $module.AllBooleans = function*() {
    yield false;
    yield true;
  }
  $module.AllChars = function*() {
    for (let i = 0; i < 0x10000; i++) {
      yield String.fromCharCode(i);
    }
  }
  $module.AllUnicodeChars = function*() {
    for (let i = 0; i < 0xD800; i++) {
      yield new _dafny.CodePoint(i);
    }
    for (let i = 0xE0000; i < 0x110000; i++) {
      yield new _dafny.CodePoint(i);
    }
  }
  $module.AllIntegers = function*() {
    yield _dafny.ZERO;
    for (let j = _dafny.ONE;; j = j.plus(1)) {
      yield j;
      yield j.negated();
    }
  }
  $module.IntegerRange = function*(lo, hi) {
    if (lo === null) {
      while (true) {
        hi = hi.minus(1);
        yield hi;
      }
    } else if (hi === null) {
      while (true) {
        yield lo;
        lo = lo.plus(1);
      }
    } else {
      while (lo.isLessThan(hi)) {
        yield lo;
        lo = lo.plus(1);
      }
    }
  }
  $module.SingleValue = function*(v) {
    yield v;
  }
  $module.HaltException = class HaltException extends Error {
    constructor(message) {
      super(message)
    }
  }
  $module.HandleHaltExceptions = function(f) {
    try {
      f()
    } catch (e) {
      if (e instanceof _dafny.HaltException) {
        process.stdout.write("[Program halted] " + e.message + "\n")
        process.exitCode = 1
      } else {
        throw e
      }
    }
  }
  $module.FromMainArguments = function(args) {
    var a = [...args];
    a.splice(0, 2, args[0] + " " + args[1]);
    return a;
  }
  $module.UnicodeFromMainArguments = function(args) {
    return $module.FromMainArguments(args).map(_dafny.Seq.UnicodeFromString);
  }
  return $module;

  // What follows are routines private to the Dafny runtime
  function buildArray(initValue, ...dims) {
    if (dims.length === 0) {
      return initValue;
    } else {
      let a = Array(dims[0].toNumber());
      let b = Array.from(a, (x) => buildArray(initValue, ...dims.slice(1)));
      return b;
    }
  }
  function arrayElementsToString(a) {
    // like `a.join(", ")`, but calling _dafny.toString(x) on every element x instead of x.toString()
    let s = "";
    let sep = "";
    for (let x of a) {
      s += sep + _dafny.toString(x);
      sep = ", ";
    }
    return s;
  }
  function BigNumberGcd(a, b){  // gcd of two non-negative BigNumber's
    while (true) {
      if (a.isZero()) {
        return b;
      } else if (b.isZero()) {
        return a;
      }
      if (a.isLessThan(b)) {
        b = b.modulo(a);
      } else {
        a = a.modulo(b);
      }
    }
  }
})();
// Dafny program systemModulePopulator.dfy compiled into JavaScript
let _System = (function() {
  let $module = {};

  $module.nat = class nat {
    constructor () {
    }
    static get Default() {
      return _dafny.ZERO;
    }
    static _Is(__source) {
      let _0_x = (__source);
      return (_dafny.ZERO).isLessThanOrEqualTo(_0_x);
    }
  };

  return $module;
})(); // end of module _System
let Resolve = (function() {
  let $module = {};

  $module.__default = class __default {
    constructor () {
      this._tname = "Resolve._default";
    }
    _parentTraits() {
      return [];
    }
    static FindFact(sp, k) {
      if (((sp).dtor_facts).contains(k)) {
        return Resolve.Option.create_Some(((sp).dtor_facts).get(k));
      } else {
        return Resolve.Option.create_None();
      }
    };
    static FindCollection(sp, k) {
      if (((sp).dtor_collections).contains(k)) {
        return Resolve.Option.create_Some(((sp).dtor_collections).get(k));
      } else {
        return Resolve.Option.create_None();
      }
    };
    static FindComputed(sp, k) {
      if (((sp).dtor_computed).contains(k)) {
        return Resolve.Option.create_Some(((sp).dtor_computed).get(k));
      } else {
        return Resolve.Option.create_None();
      }
    };
    static Get(m, k) {
      if ((m).contains(k)) {
        return (m).get(k);
      } else {
        return Resolve.__default.Missing;
      }
    };
    static ListOf(c, k) {
      if (((c).dtor_items).contains(k)) {
        return ((c).dtor_items).get(k);
      } else {
        return _dafny.Seq.of();
      }
    };
    static Words(k) {
      return _dafny.Seq.Create(new BigNumber((k).length), ((_0_k) => function (_1_i) {
        return ((((_0_k)[_1_i]) === ('_')) ? (' ') : ((_0_k)[_1_i]));
      })(k)).join('');
    };
    static Known(b) {
      return Resolve.Answer.create_Answer(((b) ? (Resolve.Tri.create_Yes()) : (Resolve.Tri.create_No())), _dafny.Seq.of());
    };
    static Unknown(what) {
      return Resolve.Answer.create_Answer(Resolve.Tri.create_Unk(), _dafny.Seq.of(what));
    };
    static OpenUnknowns(parts) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((parts).length)).isEqualTo(_dafny.ZERO)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, ((_dafny.areEqual(((parts)[_dafny.ZERO]).dtor_value, Resolve.Tri.create_Unk())) ? (((parts)[_dafny.ZERO]).dtor_unknowns) : (_dafny.Seq.of())));
          let _in0 = (parts).slice(_dafny.ONE);
          parts = _in0;
          continue TAIL_CALL_START;
        }
      }
    };
    static Combine(parts, decisive) {
      if (Resolve.__default.Has(parts, decisive)) {
        return Resolve.Answer.create_Answer(decisive, _dafny.Seq.of());
      } else if (!(Resolve.__default.Has(parts, Resolve.Tri.create_Unk()))) {
        return Resolve.Answer.create_Answer(((_dafny.areEqual(decisive, Resolve.Tri.create_No())) ? (Resolve.Tri.create_Yes()) : (Resolve.Tri.create_No())), _dafny.Seq.of());
      } else {
        return Resolve.Answer.create_Answer(Resolve.Tri.create_Unk(), Resolve.__default.OpenUnknowns(parts));
      }
    };
    static Has(parts, t) {
      if ((new BigNumber((parts).length)).isEqualTo(_dafny.ZERO)) {
        return false;
      } else {
        return (_dafny.areEqual(((parts)[_dafny.ZERO]).dtor_value, t)) || (Resolve.__default.Has((parts).slice(_dafny.ONE), t));
      }
    };
    static Flip(a) {
      if (_dafny.areEqual((a).dtor_value, Resolve.Tri.create_Unk())) {
        return a;
      } else {
        return Resolve.__default.Known(_dafny.areEqual((a).dtor_value, Resolve.Tri.create_No()));
      }
    };
    static AllUnknowns(parts) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((parts).length)).isEqualTo(_dafny.ZERO)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, ((parts)[_dafny.ZERO]).dtor_unknowns);
          let _in0 = (parts).slice(_dafny.ONE);
          parts = _in0;
          continue TAIL_CALL_START;
        }
      }
    };
    static SumOf(parts) {
      let _0___accumulator = new _dafny.BigRational(new BigNumber("0"));
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((parts).length)).isEqualTo(_dafny.ZERO)) {
          return (new _dafny.BigRational(new BigNumber("0"))).plus(_0___accumulator);
        } else {
          _0___accumulator = (_0___accumulator).plus((((parts)[_dafny.ZERO]).dtor_n).dtor_v);
          let _in0 = (parts).slice(_dafny.ONE);
          parts = _in0;
          continue TAIL_CALL_START;
        }
      }
    };
    static Total(parts) {
      if (Resolve.__default.HasNone(parts)) {
        return Resolve.Num.create_Num(Resolve.Option.create_None(), Resolve.__default.AllUnknowns(parts));
      } else {
        return Resolve.Num.create_Num(Resolve.Option.create_Some(Resolve.__default.SumOf(parts)), _dafny.Seq.of());
      }
    };
    static HasNone(parts) {
      if ((new BigNumber((parts).length)).isEqualTo(_dafny.ZERO)) {
        return false;
      } else {
        return ((((parts)[_dafny.ZERO]).dtor_n).is_None) || (Resolve.__default.HasNone((parts).slice(_dafny.ONE)));
      }
    };
    static AtLeast(x, bar) {
      if (((x).dtor_n).is_None) {
        return Resolve.Answer.create_Answer(Resolve.Tri.create_Unk(), (x).dtor_unknowns);
      } else {
        return Resolve.__default.Known((bar).isAtMost(((x).dtor_n).dtor_v));
      }
    };
    static ReadFact(sp, key, raw) {
      if ((((sp).dtor_maps).contains(key)) && ((((sp).dtor_maps).get(key)).contains((raw).dtor_word))) {
        return (((sp).dtor_maps).get(key)).get((raw).dtor_word);
      } else if ((((sp).dtor_facts).contains(key)) && ((_dafny.ZERO).isLessThan(new BigNumber(((((sp).dtor_facts).get(key)).dtor_values).length)))) {
        return (raw).dtor_word;
      } else {
        return (raw).dtor_text;
      }
    };
    static Label(key, f) {
      return _dafny.Seq.Concat(((((f).dtor_who).is_Some) ? (_dafny.Seq.Concat(_dafny.Seq.Concat(Resolve.__default.Words(key), " for "), ((f).dtor_who).dtor_v)) : (Resolve.__default.Words(key))), ((((f).dtor_unrecognised).is_Some) ? (_dafny.Seq.Concat(_dafny.Seq.Concat(" (unrecognised value \"", ((f).dtor_unrecognised).dtor_v), "\")")) : ("")));
    };
    static FactNum(key, f) {
      if (((f).dtor_n).is_None) {
        return Resolve.Num.create_Num(Resolve.Option.create_None(), _dafny.Seq.of(Resolve.__default.Label(key, f)));
      } else {
        return Resolve.Num.create_Num((f).dtor_n, _dafny.Seq.of());
      }
    };
    static FactOf(sp, c, key, item) {
      let _0_decl = Resolve.__default.FindFact(sp, key);
      let _1_perItem = (!(((_0_decl).is_Some) && (_dafny.areEqual(((_0_decl).dtor_v).dtor_per, "case")))) && ((item).is_Some);
      let _2_who = ((_1_perItem) ? (Resolve.Option.create_Some(((item).dtor_v).dtor_name)) : (Resolve.Option.create_None()));
      let _3_raw = ((_1_perItem) ? (Resolve.__default.Get(((item).dtor_v).dtor_facts, key)) : (Resolve.__default.Get((c).dtor_facts, key)));
      if (((_0_decl).is_Some) && (((_0_decl).dtor_v).dtor_numeric)) {
        return Resolve.FactRead.create_FactRead(((((_3_raw).dtor_num).is_None) ? ("unknown") : ("number")), (_3_raw).dtor_num, _2_who, Resolve.Option.create_None());
      } else {
        let _4_value = Resolve.__default.ReadFact(sp, key, _3_raw);
        if ((((!_dafny.areEqual(_4_value, "unknown")) && ((_0_decl).is_Some)) && ((_dafny.ZERO).isLessThan(new BigNumber((((_0_decl).dtor_v).dtor_values).length)))) && (!_dafny.Seq.contains(((_0_decl).dtor_v).dtor_values, _4_value))) {
          return Resolve.FactRead.create_FactRead("unknown", Resolve.Option.create_None(), _2_who, Resolve.Option.create_Some(_4_value));
        } else {
          return Resolve.FactRead.create_FactRead(_4_value, Resolve.Option.create_None(), _2_who, Resolve.Option.create_None());
        }
      }
    };
    static ComputedValues(sp, key) {
      let _0_d = Resolve.__default.FindComputed(sp, key);
      if (((_0_d).is_Some) && ((((_0_d).dtor_v).dtor_values).is_Some)) {
        return (((_0_d).dtor_v).dtor_values).dtor_v;
      } else {
        return _dafny.Seq.of("yes", "no");
      }
    };
    static Fuel(sp) {
      return ((new BigNumber(((sp).dtor_collections).length)).plus(new BigNumber(((sp).dtor_computed).length))).plus(_dafny.ONE);
    };
    static Looked(tbl, list, i) {
      if (((tbl).contains(list)) && ((i).isLessThan(new BigNumber(((tbl).get(list)).length)))) {
        return Resolve.Option.create_Some(((tbl).get(list))[i]);
      } else {
        return Resolve.Option.create_None();
      }
    };
    static Ev(sp, c, tbl, fuel, cond, item) {
      let _source0 = cond;
      {
        if (_source0.is_All) {
          let _0_ps = (_source0).parts;
          return Resolve.__default.Combine(_dafny.Seq.Create(new BigNumber((_0_ps).length), ((_1_sp, _2_c, _3_tbl, _4_fuel, _5_ps, _6_item) => function (_7_i) {
            return Resolve.__default.Ev(_1_sp, _2_c, _3_tbl, _4_fuel, (_5_ps)[_7_i], _6_item);
          })(sp, c, tbl, fuel, _0_ps, item)), Resolve.Tri.create_No());
        }
      }
      {
        if (_source0.is_Any) {
          let _8_ps = (_source0).parts;
          return Resolve.__default.Combine(_dafny.Seq.Create(new BigNumber((_8_ps).length), ((_9_sp, _10_c, _11_tbl, _12_fuel, _13_ps, _14_item) => function (_15_i) {
            return Resolve.__default.Ev(_9_sp, _10_c, _11_tbl, _12_fuel, (_13_ps)[_15_i], _14_item);
          })(sp, c, tbl, fuel, _8_ps, item)), Resolve.Tri.create_Yes());
        }
      }
      {
        if (_source0.is_Not) {
          let _16_x = (_source0).c;
          return Resolve.__default.Flip(Resolve.__default.Ev(sp, c, tbl, fuel, _16_x, item));
        }
      }
      {
        if (_source0.is_SomeItem) {
          let _17_list = (_source0).list;
          let _18_where = (_source0).where;
          return Resolve.__default.SomeOf(sp, c, tbl, fuel, _17_list, _18_where);
        }
      }
      {
        if (_source0.is_SumAtLeast) {
          let _19_ts = (_source0).terms;
          let _20_bar = (_source0).bar;
          return Resolve.__default.AtLeast(Resolve.__default.Total(_dafny.Seq.Create(new BigNumber((_19_ts).length), ((_21_sp, _22_c, _23_tbl, _24_fuel, _25_ts, _26_item) => function (_27_i) {
            return Resolve.__default.Tm(_21_sp, _22_c, _23_tbl, _24_fuel, (_25_ts)[_27_i], _26_item);
          })(sp, c, tbl, fuel, _19_ts, item))), _20_bar);
        }
      }
      {
        if (_source0.is_FactAtLeast) {
          let _28_key = (_source0).key;
          let _29_bar = (_source0).bar;
          return Resolve.__default.AtLeast(Resolve.__default.FactNum(_28_key, Resolve.__default.FactOf(sp, c, _28_key, item)), _29_bar);
        }
      }
      {
        if (_source0.is_FactIsUnknown) {
          let _30_key = (_source0).key;
          return Resolve.__default.Known(_dafny.areEqual((Resolve.__default.FactOf(sp, c, _30_key, item)).dtor_value, "unknown"));
        }
      }
      {
        if (_source0.is_FactIs) {
          let _31_key = (_source0).key;
          let _32_v = (_source0).value;
          let _33_f = Resolve.__default.FactOf(sp, c, _31_key, item);
          if (_dafny.areEqual((_33_f).dtor_value, "unknown")) {
            return Resolve.__default.Unknown(Resolve.__default.Label(_31_key, _33_f));
          } else {
            return Resolve.__default.Known(_dafny.areEqual((_33_f).dtor_value, _32_v));
          }
        }
      }
      {
        if (_source0.is_FactIn) {
          let _34_key = (_source0).key;
          let _35_vs = (_source0).values;
          let _36_f = Resolve.__default.FactOf(sp, c, _34_key, item);
          if (_dafny.areEqual((_36_f).dtor_value, "unknown")) {
            return Resolve.__default.Unknown(Resolve.__default.Label(_34_key, _36_f));
          } else {
            return Resolve.__default.Known(_dafny.Seq.contains(_35_vs, (_36_f).dtor_value));
          }
        }
      }
      {
        if (_source0.is_ComputedAtLeast) {
          let _37_key = (_source0).key;
          let _38_bar = (_source0).bar;
          return Resolve.__default.AtLeast((((fuel).isEqualTo(_dafny.ZERO)) ? (Resolve.Num.create_Num(Resolve.Option.create_None(), _dafny.Seq.of(Resolve.__default.Words(_37_key)))) : (Resolve.__default.ComputedNum(sp, c, tbl, (fuel).minus(_dafny.ONE), _37_key))), _38_bar);
        }
      }
      {
        let _39_key = (_source0).key;
        let _40_v = (_source0).value;
        let _41_t = (Resolve.__default.Get((c).dtor_computed, _39_key)).dtor_word;
        if ((!_dafny.areEqual(_41_t, "unknown")) && (!_dafny.Seq.contains(Resolve.__default.ComputedValues(sp, _39_key), _41_t))) {
          return Resolve.__default.Unknown(_dafny.Seq.Concat(_dafny.Seq.Concat(_dafny.Seq.Concat(Resolve.__default.Words(_39_key), " (unrecognised value \""), _41_t), "\")"));
        } else if (_dafny.areEqual(_41_t, "unknown")) {
          return Resolve.__default.Unknown(Resolve.__default.Words(_39_key));
        } else {
          return Resolve.__default.Known(_dafny.areEqual(_41_t, _40_v));
        }
      }
    };
    static Counts(sp, c, tbl, fuel, list, x) {
      let _0_col = Resolve.__default.FindCollection(sp, list);
      if (((_0_col).is_Some) && ((((_0_col).dtor_v).dtor_countsWhen).is_Some)) {
        return Resolve.__default.Ev(sp, c, tbl, fuel, (((_0_col).dtor_v).dtor_countsWhen).dtor_v, Resolve.Option.create_Some(x));
      } else {
        return Resolve.__default.Known(true);
      }
    };
    static NoFuel(list) {
      return Resolve.__default.Unknown(_dafny.Seq.Concat("who counts in ", Resolve.__default.Words(list)));
    };
    static EmptyOk(sp, c, tbl, fuel, e) {
      return Resolve.__default.Ev(sp, c, tbl, fuel, e, Resolve.Option.create_None());
    };
    static SomeOf(sp, c, tbl, fuel, list, where) {
      let _0_items = Resolve.__default.ListOf(c, list);
      let _1_cs = _dafny.Seq.Create(new BigNumber((_0_items).length), ((_2_tbl, _3_list, _4_fuel, _5_sp, _6_c, _7_items) => function (_8_i) {
        return (((Resolve.__default.Looked(_2_tbl, _3_list, _8_i)).is_Some) ? ((Resolve.__default.Looked(_2_tbl, _3_list, _8_i)).dtor_v) : ((((_4_fuel).isEqualTo(_dafny.ZERO)) ? (Resolve.__default.NoFuel(_3_list)) : (Resolve.__default.Counts(_5_sp, _6_c, _2_tbl, (_4_fuel).minus(_dafny.ONE), _3_list, (_7_items)[_8_i])))));
      })(tbl, list, fuel, sp, c, _0_items));
      let _9_hit = Resolve.__default.Combine(_dafny.Seq.Create(new BigNumber((_0_items).length), ((_10_cs, _11_sp, _12_c, _13_tbl, _14_fuel, _15_where, _16_items) => function (_17_i) {
        return Resolve.__default.Combine(_dafny.Seq.of((_10_cs)[_17_i], Resolve.__default.Ev(_11_sp, _12_c, _13_tbl, _14_fuel, _15_where, Resolve.Option.create_Some((_16_items)[_17_i]))), Resolve.Tri.create_No());
      })(_1_cs, sp, c, tbl, fuel, where, _0_items)), Resolve.Tri.create_Yes());
      let _18_col = Resolve.__default.FindCollection(sp, list);
      if ((_dafny.areEqual((_9_hit).dtor_value, Resolve.Tri.create_Yes())) || (Resolve.__default.Has(_1_cs, Resolve.Tri.create_Yes()))) {
        return _9_hit;
      } else if (((((_18_col).is_Some) && ((((_18_col).dtor_v).dtor_emptyOk).is_Some)) && ((_dafny.ZERO).isLessThan(fuel))) && (_dafny.areEqual((Resolve.__default.EmptyOk(sp, c, tbl, (fuel).minus(_dafny.ONE), (((_18_col).dtor_v).dtor_emptyOk).dtor_v)).dtor_value, Resolve.Tri.create_Yes()))) {
        return _9_hit;
      } else {
        return Resolve.__default.Unknown(Resolve.__default.WhichItems(sp, list));
      }
    };
    static WhichItems(sp, list) {
      let _0_col = Resolve.__default.FindCollection(sp, list);
      if (((_0_col).is_Some) && ((((_0_col).dtor_v).dtor_unknownWhenEmpty).is_Some)) {
        return (((_0_col).dtor_v).dtor_unknownWhenEmpty).dtor_v;
      } else {
        return _dafny.Seq.Concat(_dafny.Seq.Concat("which ", Resolve.__default.Words(list)), " there are");
      }
    };
    static Tm(sp, c, tbl, fuel, t, item) {
      let _source0 = t;
      {
        if (_source0.is_TFact) {
          let _0_key = (_source0).key;
          return Resolve.__default.FactNum(_0_key, Resolve.__default.FactOf(sp, c, _0_key, item));
        }
      }
      {
        if (_source0.is_TComputed) {
          let _1_key = (_source0).key;
          if ((fuel).isEqualTo(_dafny.ZERO)) {
            return Resolve.Num.create_Num(Resolve.Option.create_None(), _dafny.Seq.of(Resolve.__default.Words(_1_key)));
          } else {
            return Resolve.__default.ComputedNum(sp, c, tbl, (fuel).minus(_dafny.ONE), _1_key);
          }
        }
      }
      {
        let _2_list = (_source0).list;
        let _3_of = (_source0).of;
        let _4_where = (_source0).where;
        let _5_col = Resolve.__default.FindCollection(sp, _2_list);
        if ((!((c).dtor_items).contains(_2_list)) && (!(((((_5_col).is_Some) && ((((_5_col).dtor_v).dtor_emptyOk).is_Some)) && ((_dafny.ZERO).isLessThan(fuel))) && (_dafny.areEqual((Resolve.__default.EmptyOk(sp, c, tbl, (fuel).minus(_dafny.ONE), (((_5_col).dtor_v).dtor_emptyOk).dtor_v)).dtor_value, Resolve.Tri.create_Yes()))))) {
          return Resolve.Num.create_Num(Resolve.Option.create_None(), _dafny.Seq.of(Resolve.__default.WhichItems(sp, _2_list)));
        } else {
          let _6_items = Resolve.__default.ListOf(c, _2_list);
          return Resolve.__default.Total(_dafny.Seq.Create(new BigNumber((_6_items).length), ((_7_tbl, _8_list, _9_fuel, _10_sp, _11_c, _12_items, _13_where, _14_of) => function (_15_i) {
            return function (_pat_let0_0) {
              return function (_16_inc) {
                return ((_dafny.areEqual((_16_inc).dtor_value, Resolve.Tri.create_No())) ? (Resolve.Num.create_Num(Resolve.Option.create_Some(new _dafny.BigRational(new BigNumber("0"))), _dafny.Seq.of())) : (((_dafny.areEqual((_16_inc).dtor_value, Resolve.Tri.create_Unk())) ? (Resolve.Num.create_Num(Resolve.Option.create_None(), (_16_inc).dtor_unknowns)) : (Resolve.__default.FactNum(_14_of, Resolve.__default.FactOf(_10_sp, _11_c, _14_of, Resolve.Option.create_Some((_12_items)[_15_i])))))));
              }(_pat_let0_0);
            }(Resolve.__default.Combine(_dafny.Seq.of((((Resolve.__default.Looked(_7_tbl, _8_list, _15_i)).is_Some) ? ((Resolve.__default.Looked(_7_tbl, _8_list, _15_i)).dtor_v) : ((((_9_fuel).isEqualTo(_dafny.ZERO)) ? (Resolve.__default.NoFuel(_8_list)) : (Resolve.__default.Counts(_10_sp, _11_c, _7_tbl, (_9_fuel).minus(_dafny.ONE), _8_list, (_12_items)[_15_i]))))), (((_13_where).is_Some) ? (Resolve.__default.Ev(_10_sp, _11_c, _7_tbl, _9_fuel, (_13_where).dtor_v, Resolve.Option.create_Some((_12_items)[_15_i]))) : (Resolve.__default.Known(true)))), Resolve.Tri.create_No()));
          })(tbl, _2_list, fuel, sp, c, _6_items, _4_where, _3_of)));
        }
      }
    };
    static ComputedNum(sp, c, tbl, fuel, key) {
      let _0_d = Resolve.__default.FindComputed(sp, key);
      if (((_0_d).is_Some) && ((((_0_d).dtor_v).dtor_sum).is_Some)) {
        let _1_ts = (((_0_d).dtor_v).dtor_sum).dtor_v;
        return Resolve.__default.Total(_dafny.Seq.Create(new BigNumber((_1_ts).length), ((_2_sp, _3_c, _4_tbl, _5_fuel, _6_ts) => function (_7_i) {
          return Resolve.__default.Tm(_2_sp, _3_c, _4_tbl, _5_fuel, (_6_ts)[_7_i], Resolve.Option.create_None());
        })(sp, c, tbl, fuel, _1_ts)));
      } else {
        let _8_n = (Resolve.__default.Get((c).dtor_computed, key)).dtor_num;
        if ((_8_n).is_None) {
          return Resolve.Num.create_Num(Resolve.Option.create_None(), _dafny.Seq.of(Resolve.__default.Words(key)));
        } else {
          return Resolve.Num.create_Num(_8_n, _dafny.Seq.of());
        }
      }
    };
    static Rank(order, o) {
      if ((new BigNumber((order).length)).isEqualTo(_dafny.ZERO)) {
        return new BigNumber(-1);
      } else if (_dafny.areEqual((order)[_dafny.ZERO], o)) {
        return _dafny.ZERO;
      } else {
        let _0_r = Resolve.__default.Rank((order).slice(_dafny.ONE), o);
        if ((_0_r).isLessThan(_dafny.ZERO)) {
          return new BigNumber(-1);
        } else {
          return (_0_r).plus(_dafny.ONE);
        }
      }
    };
    static Indices(answers, want, from) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((answers).length)).isLessThanOrEqualTo(from)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, ((_dafny.areEqual(((answers)[from]).dtor_value, want)) ? (_dafny.Seq.of(from)) : (_dafny.Seq.of())));
          let _in0 = answers;
          let _in1 = want;
          let _in2 = (from).plus(_dafny.ONE);
          answers = _in0;
          want = _in1;
          from = _in2;
          continue TAIL_CALL_START;
        }
      }
    };
    static Best(order, cands, o) {
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((cands).length)).isEqualTo(_dafny.ZERO)) {
          return o;
        } else {
          let _in0 = order;
          let _in1 = (cands).slice(_dafny.ONE);
          let _in2 = (((Resolve.__default.Rank(order, ((cands)[_dafny.ZERO]).dtor_outcome)).isLessThan(Resolve.__default.Rank(order, o))) ? (((cands)[_dafny.ZERO]).dtor_outcome) : (o));
          order = _in0;
          cands = _in1;
          o = _in2;
          continue TAIL_CALL_START;
        }
      }
    };
    static Lowest(order) {
      if ((new BigNumber((order).length)).isEqualTo(_dafny.ZERO)) {
        return "";
      } else {
        return (order)[(new BigNumber((order).length)).minus(_dafny.ONE)];
      }
    };
    static CountTable(sp, c) {
      let _pat_let_tv0 = sp;
      let _pat_let_tv1 = c;
      return function () {
        let _coll0 = new _dafny.Map();
        for (const _compr_0 of ((sp).dtor_collections).Keys.Elements) {
          let _0_k = _compr_0;
          if ((((sp).dtor_collections).contains(_0_k)) && (((((sp).dtor_collections).get(_0_k)).dtor_countsWhen).is_Some)) {
            _coll0.push([_0_k,function (_pat_let1_0) {
              return function (_1_items) {
                return _dafny.Seq.Create(new BigNumber((_1_items).length), ((_2_sp, _3_c, _4_k, _5_items) => function (_6_i) {
                  return Resolve.__default.Counts(_2_sp, _3_c, _dafny.Map.Empty.slice(), (Resolve.__default.Fuel(_2_sp)).minus(_dafny.ONE), _4_k, (_5_items)[_6_i]);
                })(_pat_let_tv0, _pat_let_tv1, _0_k, _1_items));
              }(_pat_let1_0);
            }(Resolve.__default.ListOf(c, _0_k))]);
          }
        }
        return _coll0;
      }();
    };
    static RuleAnswers(sp, c, tbl) {
      return _dafny.Seq.Create(new BigNumber(((sp).dtor_rules).length), ((_0_sp, _1_c, _2_tbl) => function (_3_i) {
        return Resolve.__default.Ev(_0_sp, _1_c, _2_tbl, Resolve.__default.Fuel(_0_sp), (((_0_sp).dtor_rules)[_3_i]).dtor_when, Resolve.Option.create_None());
      })(sp, c, tbl));
    };
    static Candidates(sp, applied, might) {
      return _dafny.Seq.Concat(_dafny.Seq.Create(new BigNumber((applied).length), ((_0_applied, _1_sp) => function (_2_i) {
        return Resolve.Candidate.create_Candidate(((((_0_applied)[_2_i]).isLessThan(new BigNumber(((_1_sp).dtor_rules).length))) ? ((((_1_sp).dtor_rules)[(_0_applied)[_2_i]]).dtor_outcome) : ("")), (_0_applied)[_2_i]);
      })(applied, sp)), _dafny.Seq.Create(new BigNumber((might).length), ((_3_sp, _4_might) => function (_5_i) {
        return Resolve.Candidate.create_Candidate((_3_sp).dtor_unknownsThen, (_4_might)[_5_i]);
      })(sp, might)));
    };
    static DecidedBy(cands, o) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((cands).length)).isEqualTo(_dafny.ZERO)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, ((_dafny.areEqual(((cands)[_dafny.ZERO]).dtor_outcome, o)) ? (_dafny.Seq.of(((cands)[_dafny.ZERO]).dtor_rule)) : (_dafny.Seq.of())));
          let _in0 = (cands).slice(_dafny.ONE);
          let _in1 = o;
          cands = _in0;
          o = _in1;
          continue TAIL_CALL_START;
        }
      }
    };
    static CountsFor(tbl, keys) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        if ((new BigNumber((keys).length)).isEqualTo(_dafny.ZERO)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, ((!(tbl).contains((keys)[_dafny.ZERO])) ? (_dafny.Seq.of()) : (_dafny.Seq.of(_dafny.Seq.Create(new BigNumber(((tbl).get((keys)[_dafny.ZERO])).length), ((_1_tbl, _2_keys) => function (_3_i) {
            return (((_1_tbl).get((_2_keys)[_dafny.ZERO]))[_3_i]).dtor_value;
          })(tbl, keys))))));
          let _in0 = tbl;
          let _in1 = (keys).slice(_dafny.ONE);
          tbl = _in0;
          keys = _in1;
          continue TAIL_CALL_START;
        }
      }
    };
    static SumsFor(sp, c, tbl, keys) {
      let _0___accumulator = _dafny.Seq.of();
      TAIL_CALL_START: while (true) {
        let _pat_let_tv0 = sp;
        let _pat_let_tv1 = c;
        let _pat_let_tv2 = tbl;
        let _pat_let_tv3 = sp;
        let _pat_let_tv4 = keys;
        if ((new BigNumber((keys).length)).isEqualTo(_dafny.ZERO)) {
          return _dafny.Seq.Concat(_0___accumulator, _dafny.Seq.of());
        } else {
          _0___accumulator = _dafny.Seq.Concat(_0___accumulator, function (_pat_let2_0) {
            return function (_1_d) {
              return ((((_1_d).is_None) || ((((_1_d).dtor_v).dtor_sum).is_None)) ? (_dafny.Seq.of()) : (_dafny.Seq.of((Resolve.__default.ComputedNum(_pat_let_tv0, _pat_let_tv1, _pat_let_tv2, (Resolve.__default.Fuel(_pat_let_tv3)).minus(_dafny.ONE), (_pat_let_tv4)[_dafny.ZERO])).dtor_n)));
            }(_pat_let2_0);
          }(Resolve.__default.FindComputed(sp, (keys)[_dafny.ZERO])));
          let _in0 = sp;
          let _in1 = c;
          let _in2 = tbl;
          let _in3 = (keys).slice(_dafny.ONE);
          sp = _in0;
          c = _in1;
          tbl = _in2;
          keys = _in3;
          continue TAIL_CALL_START;
        }
      }
    };
    static Evaluate(sp, c) {
      let _0_tbl = Resolve.__default.CountTable(sp, c);
      let _1_answers = Resolve.__default.RuleAnswers(sp, c, _0_tbl);
      let _2_applied = Resolve.__default.Indices(_1_answers, Resolve.Tri.create_Yes(), _dafny.ZERO);
      let _3_might = Resolve.__default.Indices(_1_answers, Resolve.Tri.create_Unk(), _dafny.ZERO);
      let _4_cands = Resolve.__default.Candidates(sp, _2_applied, _3_might);
      let _5_best = Resolve.__default.Best((sp).dtor_order, _4_cands, Resolve.__default.Lowest((sp).dtor_order));
      return Resolve.Result.create_Result(_5_best, _2_applied, _3_might, _dafny.Seq.Create(new BigNumber((_3_might).length), ((_6_might, _7_answers) => function (_8_i) {
  return ((((_6_might)[_8_i]).isLessThan(new BigNumber((_7_answers).length))) ? (((_7_answers)[(_6_might)[_8_i]]).dtor_unknowns) : (_dafny.Seq.of()));
})(_3_might, _1_answers)), Resolve.__default.DecidedBy(_4_cands, _5_best), Resolve.__default.CountsFor(_0_tbl, (sp).dtor_listOrder), Resolve.__default.SumsFor(sp, c, _0_tbl, (sp).dtor_sumOrder));
    };
    static FactUnknown(sp, key, raw) {
      let _0_decl = Resolve.__default.FindFact(sp, key);
      if (((_0_decl).is_Some) && (((_0_decl).dtor_v).dtor_numeric)) {
        return ((raw).dtor_num).is_None;
      } else {
        let _1_v = Resolve.__default.ReadFact(sp, key, raw);
        return (_dafny.areEqual(_1_v, "unknown")) || ((((_0_decl).is_Some) && ((_dafny.ZERO).isLessThan(new BigNumber((((_0_decl).dtor_v).dtor_values).length)))) && (!_dafny.Seq.contains(((_0_decl).dtor_v).dtor_values, _1_v)));
      }
    };
    static ComputedUnknown(sp, key, raw) {
      return (((raw).dtor_num).is_None) && ((_dafny.areEqual((raw).dtor_word, "unknown")) || (!_dafny.Seq.contains(Resolve.__default.ComputedValues(sp, key), (raw).dtor_word)));
    };
    static FreeC(cond) {
      let _source0 = cond;
      {
        if (_source0.is_All) {
          let _0_ps = (_source0).parts;
          return _dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((_0_ps).length)), true, function (_forall_var_0) {
            let _1_i = _forall_var_0;
            return !(((_dafny.ZERO).isLessThanOrEqualTo(_1_i)) && ((_1_i).isLessThan(new BigNumber((_0_ps).length)))) || (Resolve.__default.FreeC((_0_ps)[_1_i]));
          });
        }
      }
      {
        if (_source0.is_Any) {
          let _2_ps = (_source0).parts;
          return _dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((_2_ps).length)), true, function (_forall_var_1) {
            let _3_i = _forall_var_1;
            return !(((_dafny.ZERO).isLessThanOrEqualTo(_3_i)) && ((_3_i).isLessThan(new BigNumber((_2_ps).length)))) || (Resolve.__default.FreeC((_2_ps)[_3_i]));
          });
        }
      }
      {
        if (_source0.is_Not) {
          let _4_x = (_source0).c;
          return Resolve.__default.FreeC(_4_x);
        }
      }
      {
        if (_source0.is_SomeItem) {
          let _5_where = (_source0).where;
          return Resolve.__default.FreeC(_5_where);
        }
      }
      {
        if (_source0.is_SumAtLeast) {
          let _6_ts = (_source0).terms;
          return _dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((_6_ts).length)), true, function (_forall_var_2) {
            let _7_i = _forall_var_2;
            return !(((_dafny.ZERO).isLessThanOrEqualTo(_7_i)) && ((_7_i).isLessThan(new BigNumber((_6_ts).length)))) || (Resolve.__default.FreeT((_6_ts)[_7_i]));
          });
        }
      }
      {
        if (_source0.is_FactIsUnknown) {
          return false;
        }
      }
      {
        return true;
      }
    };
    static FreeT(t) {
      let _source0 = t;
      {
        if (_source0.is_TSumOver) {
          let _0_where = (_source0).where;
          return ((_0_where).is_None) || (Resolve.__default.FreeC((_0_where).dtor_v));
        }
      }
      {
        return true;
      }
    };
    static FreeSpec(sp) {
      return ((_dafny.Quantifier(((sp).dtor_collections).Keys.Elements, true, function (_forall_var_0) {
        let _0_k = _forall_var_0;
        return !(((sp).dtor_collections).contains(_0_k)) || ((!(((((sp).dtor_collections).get(_0_k)).dtor_emptyOk).is_Some) || (Resolve.__default.FreeC(((((sp).dtor_collections).get(_0_k)).dtor_emptyOk).dtor_v))) && (!(((((sp).dtor_collections).get(_0_k)).dtor_countsWhen).is_Some) || (Resolve.__default.FreeC(((((sp).dtor_collections).get(_0_k)).dtor_countsWhen).dtor_v))));
      })) && (_dafny.Quantifier(((sp).dtor_computed).Keys.Elements, true, function (_forall_var_1) {
        let _1_k = _forall_var_1;
        return !(((sp).dtor_computed).contains(_1_k)) || (!(((((sp).dtor_computed).get(_1_k)).dtor_sum).is_Some) || (_dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((((((sp).dtor_computed).get(_1_k)).dtor_sum).dtor_v).length)), true, function (_forall_var_2) {
          let _2_j = _forall_var_2;
          return !(((_dafny.ZERO).isLessThanOrEqualTo(_2_j)) && ((_2_j).isLessThan(new BigNumber((((((sp).dtor_computed).get(_1_k)).dtor_sum).dtor_v).length)))) || (Resolve.__default.FreeT((((((sp).dtor_computed).get(_1_k)).dtor_sum).dtor_v)[_2_j]));
        })));
      }))) && (_dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber(((sp).dtor_rules).length)), true, function (_forall_var_3) {
        let _3_i = _forall_var_3;
        return !(((_dafny.ZERO).isLessThanOrEqualTo(_3_i)) && ((_3_i).isLessThan(new BigNumber(((sp).dtor_rules).length)))) || (Resolve.__default.FreeC((((sp).dtor_rules)[_3_i]).dtor_when));
      }));
    };
    static AnswersRefine(a, a_k) {
      return ((new BigNumber((a).length)).isEqualTo(new BigNumber((a_k).length))) && (_dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((a).length)), true, function (_forall_var_0) {
        let _0_i = _forall_var_0;
        return !(((_dafny.ZERO).isLessThanOrEqualTo(_0_i)) && ((_0_i).isLessThan(new BigNumber((a).length)))) || (!(!_dafny.areEqual(((a)[_0_i]).dtor_value, Resolve.Tri.create_Unk())) || (_dafny.areEqual(((a_k)[_0_i]).dtor_value, ((a)[_0_i]).dtor_value)));
      }));
    };
    static NumsRefine(a, a_k) {
      return ((new BigNumber((a).length)).isEqualTo(new BigNumber((a_k).length))) && (_dafny.Quantifier(_dafny.IntegerRange(_dafny.ZERO, new BigNumber((a).length)), true, function (_forall_var_0) {
        let _0_i = _forall_var_0;
        return !(((_dafny.ZERO).isLessThanOrEqualTo(_0_i)) && ((_0_i).isLessThan(new BigNumber((a).length)))) || (!((((a)[_0_i]).dtor_n).is_Some) || (_dafny.areEqual(((a_k)[_0_i]).dtor_n, ((a)[_0_i]).dtor_n)));
      }));
    };
    static get Missing() {
      return Resolve.Raw.create_Raw("unknown", "unknown", Resolve.Option.create_None());
    };
  };

  $module.Option = class Option {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_None() {
      let $dt = new Option(0);
      return $dt;
    }
    static create_Some(v) {
      let $dt = new Option(1);
      $dt.v = v;
      return $dt;
    }
    get is_None() { return this.$tag === 0; }
    get is_Some() { return this.$tag === 1; }
    get dtor_v() { return this.v; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Option.None";
      } else if (this.$tag === 1) {
        return "Resolve.Option.Some" + "(" + _dafny.toString(this.v) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0;
      } else if (this.$tag === 1) {
        return other.$tag === 1 && _dafny.areEqual(this.v, other.v);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Option.create_None();
    }
    static Rtd() {
      return class {
        static get Default() {
          return Option.Default();
        }
      };
    }
  }

  $module.Tri = class Tri {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Yes() {
      let $dt = new Tri(0);
      return $dt;
    }
    static create_No() {
      let $dt = new Tri(1);
      return $dt;
    }
    static create_Unk() {
      let $dt = new Tri(2);
      return $dt;
    }
    get is_Yes() { return this.$tag === 0; }
    get is_No() { return this.$tag === 1; }
    get is_Unk() { return this.$tag === 2; }
    static get AllSingletonConstructors() {
      return this.AllSingletonConstructors_();
    }
    static *AllSingletonConstructors_() {
      yield Tri.create_Yes();
      yield Tri.create_No();
      yield Tri.create_Unk();
    }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Tri.Yes";
      } else if (this.$tag === 1) {
        return "Resolve.Tri.No";
      } else if (this.$tag === 2) {
        return "Resolve.Tri.Unk";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0;
      } else if (this.$tag === 1) {
        return other.$tag === 1;
      } else if (this.$tag === 2) {
        return other.$tag === 2;
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Tri.create_Yes();
    }
    static Rtd() {
      return class {
        static get Default() {
          return Tri.Default();
        }
      };
    }
  }

  $module.Raw = class Raw {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Raw(text, word, num) {
      let $dt = new Raw(0);
      $dt.text = text;
      $dt.word = word;
      $dt.num = num;
      return $dt;
    }
    get is_Raw() { return this.$tag === 0; }
    get dtor_text() { return this.text; }
    get dtor_word() { return this.word; }
    get dtor_num() { return this.num; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Raw.Raw" + "(" + _dafny.toString(this.text) + ", " + _dafny.toString(this.word) + ", " + _dafny.toString(this.num) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.text, other.text) && _dafny.areEqual(this.word, other.word) && _dafny.areEqual(this.num, other.num);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Raw.create_Raw("", "", Resolve.Option.Default());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Raw.Default();
        }
      };
    }
  }

  $module.Item = class Item {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Item(name, facts) {
      let $dt = new Item(0);
      $dt.name = name;
      $dt.facts = facts;
      return $dt;
    }
    get is_Item() { return this.$tag === 0; }
    get dtor_name() { return this.name; }
    get dtor_facts() { return this.facts; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Item.Item" + "(" + _dafny.toString(this.name) + ", " + _dafny.toString(this.facts) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.name, other.name) && _dafny.areEqual(this.facts, other.facts);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Item.create_Item("", _dafny.Map.Empty);
    }
    static Rtd() {
      return class {
        static get Default() {
          return Item.Default();
        }
      };
    }
  }

  $module.Case = class Case {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Case(facts, items, computed) {
      let $dt = new Case(0);
      $dt.facts = facts;
      $dt.items = items;
      $dt.computed = computed;
      return $dt;
    }
    get is_Case() { return this.$tag === 0; }
    get dtor_facts() { return this.facts; }
    get dtor_items() { return this.items; }
    get dtor_computed() { return this.computed; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Case.Case" + "(" + _dafny.toString(this.facts) + ", " + _dafny.toString(this.items) + ", " + _dafny.toString(this.computed) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.facts, other.facts) && _dafny.areEqual(this.items, other.items) && _dafny.areEqual(this.computed, other.computed);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Case.create_Case(_dafny.Map.Empty, _dafny.Map.Empty, _dafny.Map.Empty);
    }
    static Rtd() {
      return class {
        static get Default() {
          return Case.Default();
        }
      };
    }
  }

  $module.Term = class Term {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_TFact(key) {
      let $dt = new Term(0);
      $dt.key = key;
      return $dt;
    }
    static create_TComputed(key) {
      let $dt = new Term(1);
      $dt.key = key;
      return $dt;
    }
    static create_TSumOver(list, of, where) {
      let $dt = new Term(2);
      $dt.list = list;
      $dt.of = of;
      $dt.where = where;
      return $dt;
    }
    get is_TFact() { return this.$tag === 0; }
    get is_TComputed() { return this.$tag === 1; }
    get is_TSumOver() { return this.$tag === 2; }
    get dtor_key() { return this.key; }
    get dtor_list() { return this.list; }
    get dtor_of() { return this.of; }
    get dtor_where() { return this.where; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Term.TFact" + "(" + _dafny.toString(this.key) + ")";
      } else if (this.$tag === 1) {
        return "Resolve.Term.TComputed" + "(" + _dafny.toString(this.key) + ")";
      } else if (this.$tag === 2) {
        return "Resolve.Term.TSumOver" + "(" + _dafny.toString(this.list) + ", " + _dafny.toString(this.of) + ", " + _dafny.toString(this.where) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.key, other.key);
      } else if (this.$tag === 1) {
        return other.$tag === 1 && _dafny.areEqual(this.key, other.key);
      } else if (this.$tag === 2) {
        return other.$tag === 2 && _dafny.areEqual(this.list, other.list) && _dafny.areEqual(this.of, other.of) && _dafny.areEqual(this.where, other.where);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Term.create_TFact("");
    }
    static Rtd() {
      return class {
        static get Default() {
          return Term.Default();
        }
      };
    }
  }

  $module.Condition = class Condition {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_All(parts) {
      let $dt = new Condition(0);
      $dt.parts = parts;
      return $dt;
    }
    static create_Any(parts) {
      let $dt = new Condition(1);
      $dt.parts = parts;
      return $dt;
    }
    static create_Not(c) {
      let $dt = new Condition(2);
      $dt.c = c;
      return $dt;
    }
    static create_SomeItem(list, where) {
      let $dt = new Condition(3);
      $dt.list = list;
      $dt.where = where;
      return $dt;
    }
    static create_FactIs(key, value) {
      let $dt = new Condition(4);
      $dt.key = key;
      $dt.value = value;
      return $dt;
    }
    static create_FactIn(key, values) {
      let $dt = new Condition(5);
      $dt.key = key;
      $dt.values = values;
      return $dt;
    }
    static create_FactIsUnknown(key) {
      let $dt = new Condition(6);
      $dt.key = key;
      return $dt;
    }
    static create_FactAtLeast(key, bar) {
      let $dt = new Condition(7);
      $dt.key = key;
      $dt.bar = bar;
      return $dt;
    }
    static create_ComputedIs(key, value) {
      let $dt = new Condition(8);
      $dt.key = key;
      $dt.value = value;
      return $dt;
    }
    static create_ComputedAtLeast(key, bar) {
      let $dt = new Condition(9);
      $dt.key = key;
      $dt.bar = bar;
      return $dt;
    }
    static create_SumAtLeast(terms, bar) {
      let $dt = new Condition(10);
      $dt.terms = terms;
      $dt.bar = bar;
      return $dt;
    }
    get is_All() { return this.$tag === 0; }
    get is_Any() { return this.$tag === 1; }
    get is_Not() { return this.$tag === 2; }
    get is_SomeItem() { return this.$tag === 3; }
    get is_FactIs() { return this.$tag === 4; }
    get is_FactIn() { return this.$tag === 5; }
    get is_FactIsUnknown() { return this.$tag === 6; }
    get is_FactAtLeast() { return this.$tag === 7; }
    get is_ComputedIs() { return this.$tag === 8; }
    get is_ComputedAtLeast() { return this.$tag === 9; }
    get is_SumAtLeast() { return this.$tag === 10; }
    get dtor_parts() { return this.parts; }
    get dtor_c() { return this.c; }
    get dtor_list() { return this.list; }
    get dtor_where() { return this.where; }
    get dtor_key() { return this.key; }
    get dtor_value() { return this.value; }
    get dtor_values() { return this.values; }
    get dtor_bar() { return this.bar; }
    get dtor_terms() { return this.terms; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Condition.All" + "(" + _dafny.toString(this.parts) + ")";
      } else if (this.$tag === 1) {
        return "Resolve.Condition.Any" + "(" + _dafny.toString(this.parts) + ")";
      } else if (this.$tag === 2) {
        return "Resolve.Condition.Not" + "(" + _dafny.toString(this.c) + ")";
      } else if (this.$tag === 3) {
        return "Resolve.Condition.SomeItem" + "(" + _dafny.toString(this.list) + ", " + _dafny.toString(this.where) + ")";
      } else if (this.$tag === 4) {
        return "Resolve.Condition.FactIs" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.value) + ")";
      } else if (this.$tag === 5) {
        return "Resolve.Condition.FactIn" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.values) + ")";
      } else if (this.$tag === 6) {
        return "Resolve.Condition.FactIsUnknown" + "(" + _dafny.toString(this.key) + ")";
      } else if (this.$tag === 7) {
        return "Resolve.Condition.FactAtLeast" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.bar) + ")";
      } else if (this.$tag === 8) {
        return "Resolve.Condition.ComputedIs" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.value) + ")";
      } else if (this.$tag === 9) {
        return "Resolve.Condition.ComputedAtLeast" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.bar) + ")";
      } else if (this.$tag === 10) {
        return "Resolve.Condition.SumAtLeast" + "(" + _dafny.toString(this.terms) + ", " + _dafny.toString(this.bar) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.parts, other.parts);
      } else if (this.$tag === 1) {
        return other.$tag === 1 && _dafny.areEqual(this.parts, other.parts);
      } else if (this.$tag === 2) {
        return other.$tag === 2 && _dafny.areEqual(this.c, other.c);
      } else if (this.$tag === 3) {
        return other.$tag === 3 && _dafny.areEqual(this.list, other.list) && _dafny.areEqual(this.where, other.where);
      } else if (this.$tag === 4) {
        return other.$tag === 4 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.value, other.value);
      } else if (this.$tag === 5) {
        return other.$tag === 5 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.values, other.values);
      } else if (this.$tag === 6) {
        return other.$tag === 6 && _dafny.areEqual(this.key, other.key);
      } else if (this.$tag === 7) {
        return other.$tag === 7 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.bar, other.bar);
      } else if (this.$tag === 8) {
        return other.$tag === 8 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.value, other.value);
      } else if (this.$tag === 9) {
        return other.$tag === 9 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.bar, other.bar);
      } else if (this.$tag === 10) {
        return other.$tag === 10 && _dafny.areEqual(this.terms, other.terms) && _dafny.areEqual(this.bar, other.bar);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Condition.create_All(_dafny.Seq.of());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Condition.Default();
        }
      };
    }
  }

  $module.FactDecl = class FactDecl {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_FactDecl(key, per, values, numeric) {
      let $dt = new FactDecl(0);
      $dt.key = key;
      $dt.per = per;
      $dt.values = values;
      $dt.numeric = numeric;
      return $dt;
    }
    get is_FactDecl() { return this.$tag === 0; }
    get dtor_key() { return this.key; }
    get dtor_per() { return this.per; }
    get dtor_values() { return this.values; }
    get dtor_numeric() { return this.numeric; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.FactDecl.FactDecl" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.per) + ", " + _dafny.toString(this.values) + ", " + _dafny.toString(this.numeric) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.per, other.per) && _dafny.areEqual(this.values, other.values) && this.numeric === other.numeric;
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.FactDecl.create_FactDecl("", "", _dafny.Seq.of(), false);
    }
    static Rtd() {
      return class {
        static get Default() {
          return FactDecl.Default();
        }
      };
    }
  }

  $module.Collection = class Collection {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Collection(key, emptyOk, unknownWhenEmpty, countsWhen) {
      let $dt = new Collection(0);
      $dt.key = key;
      $dt.emptyOk = emptyOk;
      $dt.unknownWhenEmpty = unknownWhenEmpty;
      $dt.countsWhen = countsWhen;
      return $dt;
    }
    get is_Collection() { return this.$tag === 0; }
    get dtor_key() { return this.key; }
    get dtor_emptyOk() { return this.emptyOk; }
    get dtor_unknownWhenEmpty() { return this.unknownWhenEmpty; }
    get dtor_countsWhen() { return this.countsWhen; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Collection.Collection" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.emptyOk) + ", " + _dafny.toString(this.unknownWhenEmpty) + ", " + _dafny.toString(this.countsWhen) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.emptyOk, other.emptyOk) && _dafny.areEqual(this.unknownWhenEmpty, other.unknownWhenEmpty) && _dafny.areEqual(this.countsWhen, other.countsWhen);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Collection.create_Collection("", Resolve.Option.Default(), Resolve.Option.Default(), Resolve.Option.Default());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Collection.Default();
        }
      };
    }
  }

  $module.ComputedDecl = class ComputedDecl {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_ComputedDecl(key, values, numeric, sum) {
      let $dt = new ComputedDecl(0);
      $dt.key = key;
      $dt.values = values;
      $dt.numeric = numeric;
      $dt.sum = sum;
      return $dt;
    }
    get is_ComputedDecl() { return this.$tag === 0; }
    get dtor_key() { return this.key; }
    get dtor_values() { return this.values; }
    get dtor_numeric() { return this.numeric; }
    get dtor_sum() { return this.sum; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.ComputedDecl.ComputedDecl" + "(" + _dafny.toString(this.key) + ", " + _dafny.toString(this.values) + ", " + _dafny.toString(this.numeric) + ", " + _dafny.toString(this.sum) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.key, other.key) && _dafny.areEqual(this.values, other.values) && this.numeric === other.numeric && _dafny.areEqual(this.sum, other.sum);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.ComputedDecl.create_ComputedDecl("", Resolve.Option.Default(), false, Resolve.Option.Default());
    }
    static Rtd() {
      return class {
        static get Default() {
          return ComputedDecl.Default();
        }
      };
    }
  }

  $module.Rule = class Rule {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Rule(id, outcome, when) {
      let $dt = new Rule(0);
      $dt.id = id;
      $dt.outcome = outcome;
      $dt.when = when;
      return $dt;
    }
    get is_Rule() { return this.$tag === 0; }
    get dtor_id() { return this.id; }
    get dtor_outcome() { return this.outcome; }
    get dtor_when() { return this.when; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Rule.Rule" + "(" + _dafny.toString(this.id) + ", " + _dafny.toString(this.outcome) + ", " + _dafny.toString(this.when) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.id, other.id) && _dafny.areEqual(this.outcome, other.outcome) && _dafny.areEqual(this.when, other.when);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Rule.create_Rule("", "", Resolve.Condition.Default());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Rule.Default();
        }
      };
    }
  }

  $module.Spec = class Spec {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Spec(order, unknownsThen, facts, collections, computed, listOrder, sumOrder, maps, rules) {
      let $dt = new Spec(0);
      $dt.order = order;
      $dt.unknownsThen = unknownsThen;
      $dt.facts = facts;
      $dt.collections = collections;
      $dt.computed = computed;
      $dt.listOrder = listOrder;
      $dt.sumOrder = sumOrder;
      $dt.maps = maps;
      $dt.rules = rules;
      return $dt;
    }
    get is_Spec() { return this.$tag === 0; }
    get dtor_order() { return this.order; }
    get dtor_unknownsThen() { return this.unknownsThen; }
    get dtor_facts() { return this.facts; }
    get dtor_collections() { return this.collections; }
    get dtor_computed() { return this.computed; }
    get dtor_listOrder() { return this.listOrder; }
    get dtor_sumOrder() { return this.sumOrder; }
    get dtor_maps() { return this.maps; }
    get dtor_rules() { return this.rules; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Spec.Spec" + "(" + _dafny.toString(this.order) + ", " + _dafny.toString(this.unknownsThen) + ", " + _dafny.toString(this.facts) + ", " + _dafny.toString(this.collections) + ", " + _dafny.toString(this.computed) + ", " + _dafny.toString(this.listOrder) + ", " + _dafny.toString(this.sumOrder) + ", " + _dafny.toString(this.maps) + ", " + _dafny.toString(this.rules) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.order, other.order) && _dafny.areEqual(this.unknownsThen, other.unknownsThen) && _dafny.areEqual(this.facts, other.facts) && _dafny.areEqual(this.collections, other.collections) && _dafny.areEqual(this.computed, other.computed) && _dafny.areEqual(this.listOrder, other.listOrder) && _dafny.areEqual(this.sumOrder, other.sumOrder) && _dafny.areEqual(this.maps, other.maps) && _dafny.areEqual(this.rules, other.rules);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Spec.create_Spec(_dafny.Seq.of(), "", _dafny.Map.Empty, _dafny.Map.Empty, _dafny.Map.Empty, _dafny.Seq.of(), _dafny.Seq.of(), _dafny.Map.Empty, _dafny.Seq.of());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Spec.Default();
        }
      };
    }
  }

  $module.Answer = class Answer {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Answer(value, unknowns) {
      let $dt = new Answer(0);
      $dt.value = value;
      $dt.unknowns = unknowns;
      return $dt;
    }
    get is_Answer() { return this.$tag === 0; }
    get dtor_value() { return this.value; }
    get dtor_unknowns() { return this.unknowns; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Answer.Answer" + "(" + _dafny.toString(this.value) + ", " + _dafny.toString(this.unknowns) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.value, other.value) && _dafny.areEqual(this.unknowns, other.unknowns);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Answer.create_Answer(Resolve.Tri.Default(), _dafny.Seq.of());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Answer.Default();
        }
      };
    }
  }

  $module.Num = class Num {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Num(n, unknowns) {
      let $dt = new Num(0);
      $dt.n = n;
      $dt.unknowns = unknowns;
      return $dt;
    }
    get is_Num() { return this.$tag === 0; }
    get dtor_n() { return this.n; }
    get dtor_unknowns() { return this.unknowns; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Num.Num" + "(" + _dafny.toString(this.n) + ", " + _dafny.toString(this.unknowns) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.n, other.n) && _dafny.areEqual(this.unknowns, other.unknowns);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Num.create_Num(Resolve.Option.Default(), _dafny.Seq.of());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Num.Default();
        }
      };
    }
  }

  $module.FactRead = class FactRead {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_FactRead(value, n, who, unrecognised) {
      let $dt = new FactRead(0);
      $dt.value = value;
      $dt.n = n;
      $dt.who = who;
      $dt.unrecognised = unrecognised;
      return $dt;
    }
    get is_FactRead() { return this.$tag === 0; }
    get dtor_value() { return this.value; }
    get dtor_n() { return this.n; }
    get dtor_who() { return this.who; }
    get dtor_unrecognised() { return this.unrecognised; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.FactRead.FactRead" + "(" + _dafny.toString(this.value) + ", " + _dafny.toString(this.n) + ", " + _dafny.toString(this.who) + ", " + _dafny.toString(this.unrecognised) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.value, other.value) && _dafny.areEqual(this.n, other.n) && _dafny.areEqual(this.who, other.who) && _dafny.areEqual(this.unrecognised, other.unrecognised);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.FactRead.create_FactRead("", Resolve.Option.Default(), Resolve.Option.Default(), Resolve.Option.Default());
    }
    static Rtd() {
      return class {
        static get Default() {
          return FactRead.Default();
        }
      };
    }
  }

  $module.Candidate = class Candidate {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Candidate(outcome, rule) {
      let $dt = new Candidate(0);
      $dt.outcome = outcome;
      $dt.rule = rule;
      return $dt;
    }
    get is_Candidate() { return this.$tag === 0; }
    get dtor_outcome() { return this.outcome; }
    get dtor_rule() { return this.rule; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Candidate.Candidate" + "(" + _dafny.toString(this.outcome) + ", " + _dafny.toString(this.rule) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.outcome, other.outcome) && _dafny.areEqual(this.rule, other.rule);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Candidate.create_Candidate("", _dafny.ZERO);
    }
    static Rtd() {
      return class {
        static get Default() {
          return Candidate.Default();
        }
      };
    }
  }

  $module.Result = class Result {
    constructor(tag) {
      this.$tag = tag;
    }
    static create_Result(outcome, applied, mightApply, because, decidedBy, counts, sums) {
      let $dt = new Result(0);
      $dt.outcome = outcome;
      $dt.applied = applied;
      $dt.mightApply = mightApply;
      $dt.because = because;
      $dt.decidedBy = decidedBy;
      $dt.counts = counts;
      $dt.sums = sums;
      return $dt;
    }
    get is_Result() { return this.$tag === 0; }
    get dtor_outcome() { return this.outcome; }
    get dtor_applied() { return this.applied; }
    get dtor_mightApply() { return this.mightApply; }
    get dtor_because() { return this.because; }
    get dtor_decidedBy() { return this.decidedBy; }
    get dtor_counts() { return this.counts; }
    get dtor_sums() { return this.sums; }
    toString() {
      if (this.$tag === 0) {
        return "Resolve.Result.Result" + "(" + _dafny.toString(this.outcome) + ", " + _dafny.toString(this.applied) + ", " + _dafny.toString(this.mightApply) + ", " + _dafny.toString(this.because) + ", " + _dafny.toString(this.decidedBy) + ", " + _dafny.toString(this.counts) + ", " + _dafny.toString(this.sums) + ")";
      } else  {
        return "<unexpected>";
      }
    }
    equals(other) {
      if (this === other) {
        return true;
      } else if (this.$tag === 0) {
        return other.$tag === 0 && _dafny.areEqual(this.outcome, other.outcome) && _dafny.areEqual(this.applied, other.applied) && _dafny.areEqual(this.mightApply, other.mightApply) && _dafny.areEqual(this.because, other.because) && _dafny.areEqual(this.decidedBy, other.decidedBy) && _dafny.areEqual(this.counts, other.counts) && _dafny.areEqual(this.sums, other.sums);
      } else  {
        return false; // unexpected
      }
    }
    static Default() {
      return Resolve.Result.create_Result("", _dafny.Seq.of(), _dafny.Seq.of(), _dafny.Seq.of(), _dafny.Seq.of(), _dafny.Seq.of(), _dafny.Seq.of());
    }
    static Rtd() {
      return class {
        static get Default() {
          return Result.Default();
        }
      };
    }
  }
  return $module;
})(); // end of module Resolve
let _module = (function() {
  let $module = {};

  return $module;
})(); // end of module _module

module.exports = { _dafny, Resolve, BigNumber };
