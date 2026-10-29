// The evaluator, in Dafny, with proofs of the two safety facts about it. `pnpm build-dafny` verifies this file and
// compiles it to evaluate.cjs, which core/evaluate.ts calls. It is a line-for-line port of the TypeScript evaluator it
// replaced: the same three-valued logic, the same order of rules, the same exact numbers.
//
// Proved here, for every spec in the rule format and every case (no well-formedness assumed):
//   1. NeverApprovesOnAnUnknown: an outcome less severe than the unknowns outcome means no rule might apply.
//   2. FillingInNeverUndoesAnAnswer: if no condition uses `is_unknown`, filling in unknown values never changes an
//      outcome less severe than the unknowns outcome, and any outcome more severe can only get more severe,
//      through a rule the first result listed as might apply.
//
// What the adapter does before calling in: it reads each value as the TypeScript did (`read`, then trimmed and
// lower-cased, and the exact number if it is one), and resolves named value lists.
module Resolve {
  datatype Option<T> = None | Some(v: T)
  datatype Tri = Yes | No | Unk

  // A value as a case file wrote it: `text` is how it reads (missing, null, "" and "unknown" read "unknown"; true and
  // false read "yes" and "no"), `word` is `text` trimmed and lower-cased, and `num` is the exact number, if it is one.
  datatype Raw = Raw(text: string, word: string, num: Option<real>)
  const Missing: Raw := Raw("unknown", "unknown", None)

  datatype Item = Item(name: string, facts: map<string, Raw>)
  // A list that is missing from `items` reads as empty, as a null list did.
  datatype Case = Case(facts: map<string, Raw>, items: map<string, seq<Item>>, computed: map<string, Raw>)

  datatype Term = TFact(key: string) | TComputed(key: string) | TSumOver(list: string, of: string, where: Option<Condition>)
  datatype Condition =
    | All(parts: seq<Condition>)
    | Any(parts: seq<Condition>)
    | Not(c: Condition)
    | SomeItem(list: string, where: Condition)
    | FactIs(key: string, value: string)
    | FactIn(key: string, values: seq<string>)
    | FactIsUnknown(key: string)
    | FactAtLeast(key: string, bar: real)
    | ComputedIs(key: string, value: string)
    | ComputedAtLeast(key: string, bar: real)
    | SumAtLeast(terms: seq<Term>, bar: real)

  // `per` is "case" or the list the fact belongs to; empty `values` means any value.
  datatype FactDecl = FactDecl(key: string, per: string, values: seq<string>, numeric: bool)
  datatype Collection = Collection(key: string, emptyOk: Option<Condition>, unknownWhenEmpty: Option<string>, countsWhen: Option<Condition>)
  datatype ComputedDecl = ComputedDecl(key: string, values: Option<seq<string>>, numeric: bool, sum: Option<seq<Term>>)
  datatype Rule = Rule(id: string, outcome: string, when: Condition)
  // Declarations are looked up by key; `listOrder` and `sumOrder` give the spec's order of its lists and computed
  // facts, for the result's `counts` and `sums`. The adapter refuses a spec that declares a key twice.
  datatype Spec = Spec(order: seq<string>, unknownsThen: string, facts: map<string, FactDecl>, collections: map<string, Collection>,
                       computed: map<string, ComputedDecl>, listOrder: seq<string>, sumOrder: seq<string>,
                       maps: map<string, map<string, string>>, rules: seq<Rule>)

  // ---- Lookups.

  function FindFact(sp: Spec, k: string): Option<FactDecl> { if k in sp.facts then Some(sp.facts[k]) else None }
  function FindCollection(sp: Spec, k: string): Option<Collection> { if k in sp.collections then Some(sp.collections[k]) else None }
  function FindComputed(sp: Spec, k: string): Option<ComputedDecl> { if k in sp.computed then Some(sp.computed[k]) else None }
  function Get(m: map<string, Raw>, k: string): Raw { if k in m then m[k] else Missing }
  function ListOf(c: Case, k: string): seq<Item> { if k in c.items then c.items[k] else [] }

  function Words(k: string): string { seq(|k|, i requires 0 <= i < |k| => if k[i] == '_' then ' ' else k[i]) }

  // ---- Three-valued answers. `unknowns` names the unknown facts an unknown answer depends on, for notes.

  // The names are kept as a tree, so joining two lists of them takes one step however long they are; the adapter
  // flattens the tree once at the end.
  datatype Names = NoNames | Name(name: string) | Join(left: Names, right: Names)
  datatype Answer = Answer(value: Tri, unknowns: Names)
  function Known(b: bool): Answer { Answer(if b then Yes else No, NoNames) }
  function Unknown(what: string): Answer { Answer(Unk, Name(what)) }

  // The list helpers walk by index with an accumulator, so the compiled code is a loop: a list of 100,000 items
  // neither copies itself at every step nor overflows the stack.
  function OpenUnknowns(parts: seq<Answer>): Names { OpenFrom(parts, 0, NoNames) }
  function OpenFrom(parts: seq<Answer>, i: nat, acc: Names): Names requires i <= |parts| decreases |parts| - i {
    if i == |parts| then acc else OpenFrom(parts, i + 1, if parts[i].value == Unk then Join(acc, parts[i].unknowns) else acc)
  }
  // Kleene logic: "and" is no if any part is no, "or" is yes if any part is yes; otherwise an unknown part decides.
  function Combine(parts: seq<Answer>, decisive: Tri): Answer {
    if Has(parts, decisive) then Answer(decisive, NoNames)
    else if !Has(parts, Unk) then Answer(if decisive == No then Yes else No, NoNames)
    else Answer(Unk, OpenUnknowns(parts))
  }
  function Has(parts: seq<Answer>, t: Tri): bool
    ensures Has(parts, t) <==> exists i :: 0 <= i < |parts| && parts[i].value == t
  { HasFrom(parts, t, 0) }
  function HasFrom(parts: seq<Answer>, t: Tri, i: nat): bool requires i <= |parts| decreases |parts| - i
    ensures HasFrom(parts, t, i) <==> exists j :: i <= j < |parts| && parts[j].value == t
  {
    if i == |parts| then false else if parts[i].value == t then true else HasFrom(parts, t, i + 1)
  }
  function Flip(a: Answer): Answer { if a.value == Unk then a else Known(a.value == No) }

  // A number, or None with the unknown facts it depends on.
  datatype Num = Num(n: Option<real>, unknowns: Names)
  function AllUnknowns(parts: seq<Num>): Names { AllFrom(parts, 0, NoNames) }
  function AllFrom(parts: seq<Num>, i: nat, acc: Names): Names requires i <= |parts| decreases |parts| - i {
    if i == |parts| then acc else AllFrom(parts, i + 1, Join(acc, parts[i].unknowns))
  }
  function SumOf(parts: seq<Num>): real requires forall i :: 0 <= i < |parts| ==> parts[i].n.Some? { SumFrom(parts, 0, 0.0) }
  function SumFrom(parts: seq<Num>, i: nat, acc: real): real
    requires i <= |parts| && forall j :: i <= j < |parts| ==> parts[j].n.Some? decreases |parts| - i
  {
    if i == |parts| then acc else SumFrom(parts, i + 1, acc + parts[i].n.v)
  }
  function Total(parts: seq<Num>): Num {
    if HasNone(parts) then Num(None, AllUnknowns(parts)) else Num(Some(SumOf(parts)), NoNames)
  }
  function HasNone(parts: seq<Num>): bool
    ensures HasNone(parts) <==> exists i :: 0 <= i < |parts| && parts[i].n.None?
  { NoneFrom(parts, 0) }
  function NoneFrom(parts: seq<Num>, i: nat): bool requires i <= |parts| decreases |parts| - i
    ensures NoneFrom(parts, i) <==> exists j :: i <= j < |parts| && parts[j].n.None?
  {
    if i == |parts| then false else if parts[i].n.None? then true else NoneFrom(parts, i + 1)
  }
  function AtLeast(x: Num, bar: real): Answer { if x.n.None? then Answer(Unk, x.unknowns) else Known(x.n.v >= bar) }

  // ---- Reading a fact.

  // A fact's value as the spec reads it: the case's word goes through the spec's word map first, and otherwise is
  // one of the fact's values. A fact that takes any value, like a country code, keeps the word as written.
  function ReadFact(sp: Spec, key: string, raw: Raw): string {
    if key in sp.maps && raw.word in sp.maps[key] then sp.maps[key][raw.word]
    else if key in sp.facts && |sp.facts[key].values| > 0 then raw.word else raw.text
  }

  // A fact's reading: its value ("unknown" if unknown), its number for a numeric fact, and what a note calls it.
  // The note's words are only built when a note needs them.
  datatype FactRead = FactRead(value: string, n: Option<real>, who: Option<string>, unrecognised: Option<string>)
  function Label(key: string, f: FactRead): string {
    (if f.who.Some? then Words(key) + " for " + f.who.v else Words(key))
      + (if f.unrecognised.Some? then " (unrecognised value \"" + f.unrecognised.v + "\")" else "")
  }
  function FactNum(key: string, f: FactRead): Num { if f.n.None? then Num(None, Name(Label(key, f))) else Num(f.n, NoNames) }

  // A fact of the whole case, or of the item being looked at inside "some". A value the spec doesn't declare is unknown.
  function FactOf(sp: Spec, c: Case, key: string, item: Option<Item>): FactRead {
    var decl := FindFact(sp, key);
    var perItem := !(decl.Some? && decl.v.per == "case") && item.Some?;
    var who := if perItem then Some(item.v.name) else None;
    var raw := if perItem then Get(item.v.facts, key) else Get(c.facts, key);
    if decl.Some? && decl.v.numeric then FactRead(if raw.num.None? then "unknown" else "number", raw.num, who, None)
    else
      var value := ReadFact(sp, key, raw);
      if value != "unknown" && decl.Some? && |decl.v.values| > 0 && value !in decl.v.values
      then FactRead("unknown", None, who, Some(value))
      else FactRead(value, None, who, None)
  }

  function ComputedValues(sp: Spec, key: string): seq<string> {
    var d := FindComputed(sp, key);
    if d.Some? && d.v.values.Some? then d.v.values.v else ["yes", "no"]
  }

  // ---- Evaluating a condition.
  //
  // `fuel` bounds how many times evaluation steps into another part of the spec (who counts in a list, a list's
  // empty rule, a computed sum). A valid spec has no cycles there, so Fuel(sp) is always enough; a cyclic spec gets
  // unknown where the TypeScript evaluator would have recursed forever.

  function Fuel(sp: Spec): nat { |sp.collections| + |sp.computed| + 1 }

  // Who counts in each list is worked out once per case (CountTable) and looked up from then on. While the table
  // is being built it is empty, and each answer is worked out directly.
  type Table = map<string, seq<Answer>>
  function Looked(tbl: Table, list: string, i: nat): Option<Answer> {
    if list in tbl && i < |tbl[list]| then Some(tbl[list][i]) else None
  }

  function Ev(sp: Spec, c: Case, tbl: Table, fuel: nat, cond: Condition, item: Option<Item>): Answer
    decreases fuel, cond, 0
  {
    match cond
    case All(ps) => Combine(seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c, tbl, fuel, ps[i], item)), No)
    case Any(ps) => Combine(seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c, tbl, fuel, ps[i], item)), Yes)
    case Not(x) => Flip(Ev(sp, c, tbl, fuel, x, item))
    case SomeItem(list, where) => SomeOf(sp, c, tbl, fuel, list, where)
    case SumAtLeast(ts, bar) => AtLeast(Total(seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c, tbl, fuel, ts[i], item))), bar)
    case FactAtLeast(key, bar) => AtLeast(FactNum(key, FactOf(sp, c, key, item)), bar)
    case FactIsUnknown(key) => Known(FactOf(sp, c, key, item).value == "unknown")
    case FactIs(key, v) => var f := FactOf(sp, c, key, item); if f.value == "unknown" then Unknown(Label(key, f)) else Known(f.value == v)
    case FactIn(key, vs) => var f := FactOf(sp, c, key, item); if f.value == "unknown" then Unknown(Label(key, f)) else Known(f.value in vs)
    case ComputedAtLeast(key, bar) => AtLeast(if fuel == 0 then Num(None, Name(Words(key))) else ComputedNum(sp, c, tbl, fuel - 1, key), bar)
    case ComputedIs(key, v) =>
      // A computed fact's word is read trimmed and in lower case, like a fact with declared values: "YES" is yes.
      var t := Get(c.computed, key).word;
      if t != "unknown" && t !in ComputedValues(sp, key) then Unknown(Words(key) + " (unrecognised value \"" + t + "\")")
      else if t == "unknown" then Unknown(Words(key)) else Known(t == v)
  }

  // An item the SOP's rules are about: the list's `counts_when` holds for it, or might.
  function Counts(sp: Spec, c: Case, tbl: Table, fuel: nat, list: string, x: Item): Answer
    decreases fuel
  {
    var col := FindCollection(sp, list);
    if col.Some? && col.v.countsWhen.Some? then Ev(sp, c, tbl, fuel, col.v.countsWhen.v, Some(x)) else Known(true)
  }
  function NoFuel(list: string): Answer { Unknown("who counts in " + Words(list)) }
  function EmptyOk(sp: Spec, c: Case, tbl: Table, fuel: nat, e: Condition): Answer decreases fuel { Ev(sp, c, tbl, fuel, e, None) }

  // "Some item in the list" is yes if any item that counts matches. "No" needs an item that certainly counts, or an
  // empty list the spec allows. Otherwise, with nobody certainly counting, the list might be empty, which is unknown.
  function SomeOf(sp: Spec, c: Case, tbl: Table, fuel: nat, list: string, where: Condition): Answer
    decreases fuel, where, 1
  {
    var items := ListOf(c, list);
    var cs := seq(|items|, i requires 0 <= i < |items| => (if Looked(tbl, list, i).Some? then Looked(tbl, list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c, tbl, fuel - 1, list, items[i])));
    var hit := Combine(seq(|items|, i requires 0 <= i < |items| => Combine([cs[i], Ev(sp, c, tbl, fuel, where, Some(items[i]))], No)), Yes);
    var col := FindCollection(sp, list);
    if hit.value == Yes || Has(cs, Yes) then hit
    else if col.Some? && col.v.emptyOk.Some? && fuel > 0 && EmptyOk(sp, c, tbl, fuel - 1, col.v.emptyOk.v).value == Yes then hit
    else Unknown(WhichItems(sp, list))
  }
  // What a note says is unknown when a list's items are.
  function WhichItems(sp: Spec, list: string): string {
    var col := FindCollection(sp, list);
    if col.Some? && col.v.unknownWhenEmpty.Some? then col.v.unknownWhenEmpty.v else "which " + Words(list) + " there are"
  }

  // A number in a condition, kept exact so a sum lands on a threshold the way Z3 sees it.
  function Tm(sp: Spec, c: Case, tbl: Table, fuel: nat, t: Term, item: Option<Item>): Num
    decreases fuel, t, 0
  {
    match t
    case TFact(key) => FactNum(key, FactOf(sp, c, key, item))
    case TComputed(key) => if fuel == 0 then Num(None, Name(Words(key))) else ComputedNum(sp, c, tbl, fuel - 1, key)
    case TSumOver(list, of, where) =>
      // A list the case doesn't give at all adds up to unknown, never 0, unless the spec says an empty list is fine
      // here, which is how "some" reads it too. A list given empty adds up to 0.
      var col := FindCollection(sp, list);
      if list !in c.items && !(col.Some? && col.v.emptyOk.Some? && fuel > 0 && EmptyOk(sp, c, tbl, fuel - 1, col.v.emptyOk.v).value == Yes)
      then Num(None, Name(WhichItems(sp, list))) else
      var items := ListOf(c, list);
      Total(seq(|items|, i requires 0 <= i < |items| =>
        var inc := Combine([(if Looked(tbl, list, i).Some? then Looked(tbl, list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c, tbl, fuel - 1, list, items[i])),
                            if where.Some? then Ev(sp, c, tbl, fuel, where.v, Some(items[i])) else Known(true)], No);
        if inc.value == No then Num(Some(0.0), NoNames)
        else if inc.value == Unk then Num(None, inc.unknowns)
        else FactNum(of, FactOf(sp, c, of, Some(items[i])))))
  }

  // A computed fact's number: the spec's own sum when it has one, else the value the domain's code computed.
  function ComputedNum(sp: Spec, c: Case, tbl: Table, fuel: nat, key: string): Num
    decreases fuel
  {
    var d := FindComputed(sp, key);
    if d.Some? && d.v.sum.Some? then
      var ts := d.v.sum.v;
      Total(seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c, tbl, fuel, ts[i], None)))
    else var n := Get(c.computed, key).num; if n.None? then Num(None, Name(Words(key))) else Num(n, NoNames)
  }

  // ---- The outcome.

  // An outcome's place in the spec's order, most severe first; -1 if it isn't there.
  function Rank(order: seq<string>, o: string): int {
    if |order| == 0 then -1 else if order[0] == o then 0 else var r := Rank(order[1..], o); if r < 0 then -1 else r + 1
  }

  function Indices(answers: seq<Answer>, want: Tri, from: nat): seq<nat> decreases |answers| - from {
    if from >= |answers| then [] else (if answers[from].value == want then [from] else []) + Indices(answers, want, from + 1)
  }

  // A candidate is a rule (by index) and the outcome it leads to: its own for a rule that applies, the unknowns
  // outcome for one that might.
  datatype Candidate = Candidate(outcome: string, rule: nat)

  // The most severe outcome governs; with none, the least severe outcome in the order.
  function Best(order: seq<string>, cands: seq<Candidate>, o: string): string {
    if |cands| == 0 then o else Best(order, cands[1..], if Rank(order, cands[0].outcome) < Rank(order, o) then cands[0].outcome else o)
  }
  function Lowest(order: seq<string>): string { if |order| == 0 then "" else order[|order| - 1] }

  function CountTable(sp: Spec, c: Case): Table {
    map k | k in sp.collections && sp.collections[k].countsWhen.Some? ::
      var items := ListOf(c, k); seq(|items|, i requires 0 <= i < |items| => Counts(sp, c, map[], Fuel(sp) - 1, k, items[i]))
  }
  function RuleAnswers(sp: Spec, c: Case, tbl: Table): seq<Answer> {
    seq(|sp.rules|, i requires 0 <= i < |sp.rules| => Ev(sp, c, tbl, Fuel(sp), sp.rules[i].when, None))
  }
  function Candidates(sp: Spec, applied: seq<nat>, might: seq<nat>): seq<Candidate> {
    seq(|applied|, i requires 0 <= i < |applied| => Candidate(if applied[i] < |sp.rules| then sp.rules[applied[i]].outcome else "", applied[i]))
      + seq(|might|, i requires 0 <= i < |might| => Candidate(sp.unknownsThen, might[i]))
  }
  function DecidedBy(cands: seq<Candidate>, o: string): seq<nat> {
    if |cands| == 0 then [] else (if cands[0].outcome == o then [cands[0].rule] else []) + DecidedBy(cands[1..], o)
  }

  datatype Result = Result(
    outcome: string,
    applied: seq<nat>,              // the rules that apply, by index
    mightApply: seq<nat>,           // the rules that apply under some value of an unknown fact
    because: seq<Names>,            // for each rule in mightApply, the unknown facts it waits on
    decidedBy: seq<nat>,            // the rules behind the outcome
    counts: seq<seq<Tri>>,          // for each list with `counts_when`, in spec order: whether each item counts
    sums: seq<Option<real>>)        // each computed fact the spec adds up itself, in spec order

  function CountsFor(tbl: Table, keys: seq<string>): seq<seq<Tri>> {
    if |keys| == 0 then []
    else (if keys[0] !in tbl then [] else [seq(|tbl[keys[0]]|, i requires 0 <= i < |tbl[keys[0]]| => tbl[keys[0]][i].value)])
         + CountsFor(tbl, keys[1..])
  }
  function SumsFor(sp: Spec, c: Case, tbl: Table, keys: seq<string>): seq<Option<real>> {
    if |keys| == 0 then []
    else (var d := FindComputed(sp, keys[0]); if d.None? || d.v.sum.None? then [] else [ComputedNum(sp, c, tbl, Fuel(sp) - 1, keys[0]).n])
         + SumsFor(sp, c, tbl, keys[1..])
  }

  function Evaluate(sp: Spec, c: Case): Result {
    var tbl := CountTable(sp, c);
    var answers := RuleAnswers(sp, c, tbl);
    var applied := Indices(answers, Yes, 0);
    var might := Indices(answers, Unk, 0);
    var cands := Candidates(sp, applied, might);
    var best := Best(sp.order, cands, Lowest(sp.order));
    Result(best, applied, might,
           seq(|might|, i requires 0 <= i < |might| => if might[i] < |answers| then answers[might[i]].unknowns else NoNames),
           DecidedBy(cands, best), CountsFor(tbl, sp.listOrder), SumsFor(sp, c, tbl, sp.sumOrder))
  }

  // ======================================================================================================
  // Property 1: never approves on an unknown.

  lemma BestIsAtMost(order: seq<string>, cands: seq<Candidate>, o: string)
    ensures Rank(order, Best(order, cands, o)) <= Rank(order, o)
    ensures forall i :: 0 <= i < |cands| ==> Rank(order, Best(order, cands, o)) <= Rank(order, cands[i].outcome)
  {
    if |cands| > 0 {
      var o' := if Rank(order, cands[0].outcome) < Rank(order, o) then cands[0].outcome else o;
      BestIsAtMost(order, cands[1..], o');
      forall i | 1 <= i < |cands| ensures Rank(order, Best(order, cands, o)) <= Rank(order, cands[i].outcome) {
        assert cands[i] == cands[1..][i - 1];
      }
    }
  }

  lemma IndicesSpec(answers: seq<Answer>, want: Tri, from: nat)
    ensures forall j :: j in Indices(answers, want, from) <==> from <= j < |answers| && answers[j].value == want
    decreases |answers| - from
  {
    if from < |answers| { IndicesSpec(answers, want, from + 1); }
  }

  // If the outcome ranks below the unknowns outcome (in KYB, approve below incomplete), no rule might apply.
  lemma NeverApprovesOnAnUnknown(sp: Spec, c: Case)
    ensures var r := Evaluate(sp, c);
            Rank(sp.order, r.outcome) > Rank(sp.order, sp.unknownsThen) ==> |r.mightApply| == 0
  {
    var tbl := CountTable(sp, c);
    var answers := RuleAnswers(sp, c, tbl);
    var applied := Indices(answers, Yes, 0);
    var might := Indices(answers, Unk, 0);
    var cands := Candidates(sp, applied, might);
    BestIsAtMost(sp.order, cands, Lowest(sp.order));
    if |might| > 0 {
      assert cands[|applied|].outcome == sp.unknownsThen;
    }
  }

  // ======================================================================================================
  // Property 2: filling in an unknown never undoes an answer.

  // Does a fact's value, as written, read as unknown? Then filling it in may give it any value.
  predicate FactUnknown(sp: Spec, key: string, raw: Raw) {
    var decl := FindFact(sp, key);
    if decl.Some? && decl.v.numeric then raw.num.None?
    else var v := ReadFact(sp, key, raw); v == "unknown" || (decl.Some? && |decl.v.values| > 0 && v !in decl.v.values)
  }
  // A computed value can be read as a number or as a word, so it is unknown only if it is unknown both ways.
  predicate ComputedUnknown(sp: Spec, key: string, raw: Raw) {
    raw.num.None? && (raw.word == "unknown" || raw.word !in ComputedValues(sp, key))
  }

  ghost predicate FactsRefine(sp: Spec, m: map<string, Raw>, m': map<string, Raw>) {
    forall k :: !FactUnknown(sp, k, Get(m, k)) ==> Get(m', k) == Get(m, k)
  }
  ghost predicate ItemRefines(sp: Spec, x: Option<Item>, x': Option<Item>) {
    (x.None? && x'.None?) || (x.Some? && x'.Some? && FactsRefine(sp, x.v.facts, x'.v.facts))
  }
  // c' fills in some unknown values of c and changes nothing else that the rules read. Every list keeps its items
  // in order ("some" reads a missing list as an empty one, which can be a decided no), and a list c gives stays given
  // (an empty list adds up to 0; a missing one to unknown, so c' may give it empty).
  ghost predicate Refines(sp: Spec, c: Case, c': Case) {
    FactsRefine(sp, c.facts, c'.facts)
    && (forall k :: !ComputedUnknown(sp, k, Get(c.computed, k)) ==> Get(c'.computed, k) == Get(c.computed, k))
    && (forall k :: |ListOf(c, k)| == |ListOf(c', k)|
          && forall i :: 0 <= i < |ListOf(c, k)| ==> FactsRefine(sp, ListOf(c, k)[i].facts, ListOf(c', k)[i].facts))
    && (forall k :: k in c.items ==> k in c'.items)
  }

  // No `is_unknown` anywhere: it is the one building block that can go from yes to no as a fact is filled in.
  predicate FreeC(cond: Condition) {
    match cond
    case All(ps) => forall i :: 0 <= i < |ps| ==> FreeC(ps[i])
    case Any(ps) => forall i :: 0 <= i < |ps| ==> FreeC(ps[i])
    case Not(x) => FreeC(x)
    case SomeItem(_, where) => FreeC(where)
    case SumAtLeast(ts, _) => forall i :: 0 <= i < |ts| ==> FreeT(ts[i])
    case FactIsUnknown(_) => false
    case _ => true
  }
  predicate FreeT(t: Term) {
    match t
    case TSumOver(_, _, where) => where.None? || FreeC(where.v)
    case _ => true
  }
  predicate FreeSpec(sp: Spec) {
    (forall k :: k in sp.collections ==>
       (sp.collections[k].emptyOk.Some? ==> FreeC(sp.collections[k].emptyOk.v))
       && (sp.collections[k].countsWhen.Some? ==> FreeC(sp.collections[k].countsWhen.v)))
    && (forall k :: k in sp.computed ==> sp.computed[k].sum.Some? ==> forall j :: 0 <= j < |sp.computed[k].sum.v| ==> FreeT(sp.computed[k].sum.v[j]))
    && (forall i :: 0 <= i < |sp.rules| ==> FreeC(sp.rules[i].when))
  }

  // Two tables of who counts, for the same lists, where every decided answer stays decided the same way.
  ghost predicate TableRefines(t: Table, t': Table) {
    t.Keys == t'.Keys && forall k :: k in t ==> AnswersRefine(t[k], t'[k])
  }
  lemma CountTableMono(sp: Spec, c: Case, c': Case)
    requires FreeSpec(sp) && Refines(sp, c, c')
    ensures TableRefines(CountTable(sp, c), CountTable(sp, c'))
  {
    var t, t' := CountTable(sp, c), CountTable(sp, c');
    forall k | k in t ensures AnswersRefine(t[k], t'[k]) {
      var items, items' := ListOf(c, k), ListOf(c', k);
      forall i | 0 <= i < |items| ensures t[k][i].value != Unk ==> t'[k][i].value == t[k][i].value {
        CountsMono(sp, c, c', map[], map[], Fuel(sp) - 1, k, items[i], items'[i]);
      }
    }
  }

  // Two lists of answers where every decided answer stays decided the same way.
  predicate AnswersRefine(a: seq<Answer>, a': seq<Answer>) {
    |a| == |a'| && forall i :: 0 <= i < |a| ==> a[i].value != Unk ==> a'[i].value == a[i].value
  }
  lemma CombineMono(a: seq<Answer>, a': seq<Answer>, decisive: Tri)
    requires AnswersRefine(a, a')
    ensures Combine(a, decisive).value != Unk ==> Combine(a', decisive).value == Combine(a, decisive).value
  {
    if exists i :: 0 <= i < |a| && a[i].value == decisive {
      var i :| 0 <= i < |a| && a[i].value == decisive;
      if decisive != Unk { assert a'[i].value == decisive; }
    }
  }
  predicate NumsRefine(a: seq<Num>, a': seq<Num>) {
    |a| == |a'| && forall i :: 0 <= i < |a| ==> a[i].n.Some? ==> a'[i].n == a[i].n
  }
  lemma SumOfSame(a: seq<Num>, a': seq<Num>)
    requires |a| == |a'| && forall i :: 0 <= i < |a| ==> a[i].n.Some? && a'[i].n == a[i].n
    ensures SumOf(a) == SumOf(a')
  { SumFromSame(a, a', 0, 0.0); }
  lemma SumFromSame(a: seq<Num>, a': seq<Num>, i: nat, acc: real)
    requires i <= |a| == |a'| && forall j :: 0 <= j < |a| ==> a[j].n.Some? && a'[j].n == a[j].n
    ensures SumFrom(a, i, acc) == SumFrom(a', i, acc)
    decreases |a| - i
  {
    if i < |a| { SumFromSame(a, a', i + 1, acc + a[i].n.v); }
  }
  lemma TotalMono(a: seq<Num>, a': seq<Num>)
    requires NumsRefine(a, a')
    ensures Total(a).n.Some? ==> Total(a').n == Total(a).n
  {
    if Total(a).n.Some? {
      assert forall i :: 0 <= i < |a| ==> a[i].n.Some?;
      SumOfSame(a, a');
    }
  }

  lemma FactMono(sp: Spec, c: Case, c': Case, key: string, x: Option<Item>, x': Option<Item>)
    requires Refines(sp, c, c') && ItemRefines(sp, x, x')
    ensures FactOf(sp, c, key, x).value != "unknown" ==> FactOf(sp, c', key, x').value == FactOf(sp, c, key, x).value
    ensures FactOf(sp, c, key, x).n.Some? ==> FactOf(sp, c', key, x').n == FactOf(sp, c, key, x).n
  {
    var decl := FindFact(sp, key);
    var perItem := !(decl.Some? && decl.v.per == "case") && x.Some?;
    var raw := if perItem then Get(x.v.facts, key) else Get(c.facts, key);
    var raw' := if perItem then Get(x'.v.facts, key) else Get(c'.facts, key);
    assert !FactUnknown(sp, key, raw) ==> raw' == raw;
  }

  lemma EvMono(sp: Spec, c: Case, c': Case, tbl: Table, tbl': Table, fuel: nat, cond: Condition, x: Option<Item>, x': Option<Item>)
    requires FreeSpec(sp) && FreeC(cond) && Refines(sp, c, c') && TableRefines(tbl, tbl') && ItemRefines(sp, x, x')
    ensures Ev(sp, c, tbl, fuel, cond, x).value != Unk ==> Ev(sp, c', tbl', fuel, cond, x').value == Ev(sp, c, tbl, fuel, cond, x).value
    decreases fuel, cond, 0
  {
    match cond
    case All(ps) =>
      var a := seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c, tbl, fuel, ps[i], x));
      var a' := seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c', tbl', fuel, ps[i], x'));
      forall i | 0 <= i < |ps| ensures a[i].value != Unk ==> a'[i].value == a[i].value { EvMono(sp, c, c', tbl, tbl', fuel, ps[i], x, x'); }
      CombineMono(a, a', No);
    case Any(ps) =>
      var a := seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c, tbl, fuel, ps[i], x));
      var a' := seq(|ps|, i requires 0 <= i < |ps| => Ev(sp, c', tbl', fuel, ps[i], x'));
      forall i | 0 <= i < |ps| ensures a[i].value != Unk ==> a'[i].value == a[i].value { EvMono(sp, c, c', tbl, tbl', fuel, ps[i], x, x'); }
      CombineMono(a, a', Yes);
    case Not(y) => EvMono(sp, c, c', tbl, tbl', fuel, y, x, x');
    case SomeItem(list, where) => SomeOfMono(sp, c, c', tbl, tbl', fuel, list, where);
    case SumAtLeast(ts, bar) =>
      var a := seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c, tbl, fuel, ts[i], x));
      var a' := seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c', tbl', fuel, ts[i], x'));
      forall i | 0 <= i < |ts| ensures a[i].n.Some? ==> a'[i].n == a[i].n { TmMono(sp, c, c', tbl, tbl', fuel, ts[i], x, x'); }
      TotalMono(a, a');
    case FactAtLeast(key, bar) => FactMono(sp, c, c', key, x, x');
    case FactIsUnknown(key) =>
    case FactIs(key, v) => FactMono(sp, c, c', key, x, x');
    case FactIn(key, vs) => FactMono(sp, c, c', key, x, x');
    case ComputedAtLeast(key, bar) => if fuel > 0 { ComputedNumMono(sp, c, c', tbl, tbl', fuel - 1, key); }
    case ComputedIs(key, v) =>
  }

  lemma CountsMono(sp: Spec, c: Case, c': Case, tbl: Table, tbl': Table, fuel: nat, list: string, item: Item, item': Item)
    requires FreeSpec(sp) && Refines(sp, c, c') && TableRefines(tbl, tbl') && FactsRefine(sp, item.facts, item'.facts)
    ensures Counts(sp, c, tbl, fuel, list, item).value != Unk ==> Counts(sp, c', tbl', fuel, list, item').value == Counts(sp, c, tbl, fuel, list, item).value
    decreases fuel
  {
    var col := FindCollection(sp, list);
    if col.Some? && col.v.countsWhen.Some? { EvMono(sp, c, c', tbl, tbl', fuel, col.v.countsWhen.v, Some(item), Some(item')); }
  }

  lemma SomeOfMono(sp: Spec, c: Case, c': Case, tbl: Table, tbl': Table, fuel: nat, list: string, where: Condition)
    requires FreeSpec(sp) && FreeC(where) && Refines(sp, c, c') && TableRefines(tbl, tbl')
    ensures SomeOf(sp, c, tbl, fuel, list, where).value != Unk ==> SomeOf(sp, c', tbl', fuel, list, where).value == SomeOf(sp, c, tbl, fuel, list, where).value
    decreases fuel, where, 1
  {
    var items, items' := ListOf(c, list), ListOf(c', list);
    assert |items| == |items'|;
    var cs := seq(|items|, i requires 0 <= i < |items| => (if Looked(tbl, list, i).Some? then Looked(tbl, list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c, tbl, fuel - 1, list, items[i])));
    var cs' := seq(|items'|, i requires 0 <= i < |items'| => (if Looked(tbl', list, i).Some? then Looked(tbl', list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c', tbl', fuel - 1, list, items'[i])));
    var parts := seq(|items|, i requires 0 <= i < |items| => Combine([cs[i], Ev(sp, c, tbl, fuel, where, Some(items[i]))], No));
    var parts' := seq(|items'|, i requires 0 <= i < |items'| => Combine([cs'[i], Ev(sp, c', tbl', fuel, where, Some(items'[i]))], No));
    forall i | 0 <= i < |items| ensures cs[i].value != Unk ==> cs'[i].value == cs[i].value
                                ensures parts[i].value != Unk ==> parts'[i].value == parts[i].value {
      if fuel > 0 { CountsMono(sp, c, c', tbl, tbl', fuel - 1, list, items[i], items'[i]); }
      EvMono(sp, c, c', tbl, tbl', fuel, where, Some(items[i]), Some(items'[i]));
      CombineMono([cs[i], Ev(sp, c, tbl, fuel, where, Some(items[i]))], [cs'[i], Ev(sp, c', tbl', fuel, where, Some(items'[i]))], No);
    }
    CombineMono(parts, parts', Yes);
    var col := FindCollection(sp, list);
    if col.Some? && col.v.emptyOk.Some? && fuel > 0 { EvMono(sp, c, c', tbl, tbl', fuel - 1, col.v.emptyOk.v, None, None); }
    if exists i :: 0 <= i < |cs| && cs[i].value == Yes {
      var i :| 0 <= i < |cs| && cs[i].value == Yes;
      assert cs'[i].value == Yes;
    }
  }

  lemma TmMono(sp: Spec, c: Case, c': Case, tbl: Table, tbl': Table, fuel: nat, t: Term, x: Option<Item>, x': Option<Item>)
    requires FreeSpec(sp) && FreeT(t) && Refines(sp, c, c') && TableRefines(tbl, tbl') && ItemRefines(sp, x, x')
    ensures Tm(sp, c, tbl, fuel, t, x).n.Some? ==> Tm(sp, c', tbl', fuel, t, x').n == Tm(sp, c, tbl, fuel, t, x).n
    decreases fuel, t, 0
  {
    match t
    case TFact(key) => FactMono(sp, c, c', key, x, x');
    case TComputed(key) => if fuel > 0 { ComputedNumMono(sp, c, c', tbl, tbl', fuel - 1, key); }
    case TSumOver(list, of, where) =>
      var col := FindCollection(sp, list);
      var ok := col.Some? && col.v.emptyOk.Some? && fuel > 0 && EmptyOk(sp, c, tbl, fuel - 1, col.v.emptyOk.v).value == Yes;
      var ok' := col.Some? && col.v.emptyOk.Some? && fuel > 0 && EmptyOk(sp, c', tbl', fuel - 1, col.v.emptyOk.v).value == Yes;
      if col.Some? && col.v.emptyOk.Some? && fuel > 0 { EvMono(sp, c, c', tbl, tbl', fuel - 1, col.v.emptyOk.v, None, None); }
      if list in c.items || ok {
        assert list in c'.items || ok';
        var items, items' := ListOf(c, list), ListOf(c', list);
        assert |items| == |items'|;
        var a := seq(|items|, i requires 0 <= i < |items| =>
          var inc := Combine([(if Looked(tbl, list, i).Some? then Looked(tbl, list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c, tbl, fuel - 1, list, items[i])),
                              if where.Some? then Ev(sp, c, tbl, fuel, where.v, Some(items[i])) else Known(true)], No);
          if inc.value == No then Num(Some(0.0), NoNames)
          else if inc.value == Unk then Num(None, inc.unknowns)
          else FactNum(of, FactOf(sp, c, of, Some(items[i]))));
        var a' := seq(|items'|, i requires 0 <= i < |items'| =>
          var inc := Combine([(if Looked(tbl', list, i).Some? then Looked(tbl', list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c', tbl', fuel - 1, list, items'[i])),
                              if where.Some? then Ev(sp, c', tbl', fuel, where.v, Some(items'[i])) else Known(true)], No);
          if inc.value == No then Num(Some(0.0), NoNames)
          else if inc.value == Unk then Num(None, inc.unknowns)
          else FactNum(of, FactOf(sp, c', of, Some(items'[i]))));
        forall i | 0 <= i < |items| ensures a[i].n.Some? ==> a'[i].n == a[i].n {
          if fuel > 0 { CountsMono(sp, c, c', tbl, tbl', fuel - 1, list, items[i], items'[i]); }
          if where.Some? { EvMono(sp, c, c', tbl, tbl', fuel, where.v, Some(items[i]), Some(items'[i])); }
          CombineMono([(if Looked(tbl, list, i).Some? then Looked(tbl, list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c, tbl, fuel - 1, list, items[i])), if where.Some? then Ev(sp, c, tbl, fuel, where.v, Some(items[i])) else Known(true)],
                      [(if Looked(tbl', list, i).Some? then Looked(tbl', list, i).v else if fuel == 0 then NoFuel(list) else Counts(sp, c', tbl', fuel - 1, list, items'[i])), if where.Some? then Ev(sp, c', tbl', fuel, where.v, Some(items'[i])) else Known(true)], No);
          FactMono(sp, c, c', of, Some(items[i]), Some(items'[i]));
        }
        assert Tm(sp, c, tbl, fuel, t, x) == Total(a);
        assert Tm(sp, c', tbl', fuel, t, x') == Total(a');
        TotalMono(a, a');
      }
  }

  lemma ComputedNumMono(sp: Spec, c: Case, c': Case, tbl: Table, tbl': Table, fuel: nat, key: string)
    requires FreeSpec(sp) && Refines(sp, c, c') && TableRefines(tbl, tbl')
    ensures ComputedNum(sp, c, tbl, fuel, key).n.Some? ==> ComputedNum(sp, c', tbl', fuel, key).n == ComputedNum(sp, c, tbl, fuel, key).n
    decreases fuel
  {
    var d := FindComputed(sp, key);
    if d.Some? && d.v.sum.Some? {
      var ts := d.v.sum.v;
      var a := seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c, tbl, fuel, ts[i], None));
      var a' := seq(|ts|, i requires 0 <= i < |ts| => Tm(sp, c', tbl', fuel, ts[i], None));
      forall i | 0 <= i < |ts| ensures a[i].n.Some? ==> a'[i].n == a[i].n { TmMono(sp, c, c', tbl, tbl', fuel, ts[i], None, None); }
      TotalMono(a, a');
    } else {
      assert Get(c.computed, key).num.Some? ==> !ComputedUnknown(sp, key, Get(c.computed, key));
    }
  }

  lemma RankIn(order: seq<string>, o: string)
    ensures Rank(order, o) < |order|
    ensures Rank(order, o) >= 0 ==> order[Rank(order, o)] == o
  {
    if |order| > 0 && order[0] != o { RankIn(order[1..], o); }
  }

  lemma BestIsSome(order: seq<string>, cands: seq<Candidate>, o: string)
    ensures Best(order, cands, o) == o || exists i :: 0 <= i < |cands| && cands[i].outcome == Best(order, cands, o)
  {
    if |cands| > 0 {
      var o' := if Rank(order, cands[0].outcome) < Rank(order, o) then cands[0].outcome else o;
      BestIsSome(order, cands[1..], o');
      if exists i :: 0 <= i < |cands[1..]| && cands[1..][i].outcome == Best(order, cands, o) {
        var i :| 0 <= i < |cands[1..]| && cands[1..][i].outcome == Best(order, cands, o);
        assert cands[i + 1].outcome == Best(order, cands, o);
      }
    }
  }

  // Fill in any unknown values of a case, in a spec with no `is_unknown`. Then:
  //  - an outcome less severe than the unknowns outcome stays exactly as it was;
  //  - an outcome more severe than the unknowns outcome stays or gets more severe, and a more severe one comes
  //    from a rule the first result listed as might apply.
  // The unknowns outcome itself can move either way, as it should.
  lemma FillingInNeverUndoesAnAnswer(sp: Spec, c: Case, c': Case)
    requires FreeSpec(sp) && Refines(sp, c, c')
    ensures var r, r' := Evaluate(sp, c), Evaluate(sp, c');
            var u := Rank(sp.order, sp.unknownsThen);
            (Rank(sp.order, r.outcome) > u ==> r'.outcome == r.outcome)
            && (Rank(sp.order, r.outcome) < u ==>
                  Rank(sp.order, r'.outcome) <= Rank(sp.order, r.outcome)
                  && (Rank(sp.order, r'.outcome) == Rank(sp.order, r.outcome) && Rank(sp.order, r.outcome) >= 0 ==> r'.outcome == r.outcome)
                  && (Rank(sp.order, r'.outcome) < Rank(sp.order, r.outcome) ==>
                        exists i :: i in r.mightApply && i < |sp.rules| && sp.rules[i].outcome == r'.outcome))
  {
    var r, r' := Evaluate(sp, c), Evaluate(sp, c');
    var order, u := sp.order, Rank(sp.order, sp.unknownsThen);
    CountTableMono(sp, c, c');
    var A, A' := RuleAnswers(sp, c, CountTable(sp, c)), RuleAnswers(sp, c', CountTable(sp, c'));
    forall i | 0 <= i < |sp.rules| ensures A[i].value != Unk ==> A'[i].value == A[i].value {
      EvMono(sp, c, c', CountTable(sp, c), CountTable(sp, c'), Fuel(sp), sp.rules[i].when, None, None);
    }
    var applied, might := Indices(A, Yes, 0), Indices(A, Unk, 0);
    var applied', might' := Indices(A', Yes, 0), Indices(A', Unk, 0);
    IndicesSpec(A, Yes, 0); IndicesSpec(A, Unk, 0); IndicesSpec(A', Yes, 0); IndicesSpec(A', Unk, 0);
    var cands, cands' := Candidates(sp, applied, might), Candidates(sp, applied', might');
    var low := Lowest(order);
    BestIsAtMost(order, cands, low); BestIsAtMost(order, cands', low);
    BestIsSome(order, cands, low); BestIsSome(order, cands', low);
    RankIn(order, r.outcome); RankIn(order, r'.outcome); RankIn(order, low);

    if Rank(order, r.outcome) > u {
      NeverApprovesOnAnUnknown(sp, c);
      assert |might| == 0;
      forall i | 0 <= i < |A| ensures A'[i].value == A[i].value { assert i !in might; }
      // The answers' values are the same, so the rules that apply and might apply are the same.
      IndicesSame(A, A', Yes, 0); IndicesSame(A, A', Unk, 0);
    }
    if Rank(order, r.outcome) < u {
      // The outcome came from a rule that applies (a rule that might apply gives u; the lowest outcome ranks last).
      if r.outcome != low {
        var k :| 0 <= k < |cands| && cands[k].outcome == r.outcome;
        if k >= |applied| { assert cands[k].outcome == sp.unknownsThen; assert false; }
        var j := applied[k];
        assert j in applied;
        assert j in applied';
        var k' :| 0 <= k' < |applied'| && applied'[k'] == j;
        assert cands'[k'].outcome == sp.rules[j].outcome;
      }
      if Rank(order, r'.outcome) < Rank(order, r.outcome) {
        if r'.outcome == low { assert false; }
        var k :| 0 <= k < |cands'| && cands'[k].outcome == r'.outcome;
        if k >= |applied'| { assert cands'[k].outcome == sp.unknownsThen; assert false; }
        var j := applied'[k];
        assert j in applied';
        assert A'[j].value == Yes;
        if A[j].value == Yes {
          var k0 :| 0 <= k0 < |applied| && applied[k0] == j;
          assert cands[k0].outcome == sp.rules[j].outcome;
          assert false;
        }
        assert A[j].value == Unk;
        assert j in might;
      }
    }
  }

  lemma IndicesSame(A: seq<Answer>, A': seq<Answer>, want: Tri, from: nat)
    requires |A| == |A'| && forall i :: 0 <= i < |A| ==> A'[i].value == A[i].value
    ensures Indices(A, want, from) == Indices(A', want, from)
    decreases |A| - from
  {
    if from < |A| { IndicesSame(A, A', want, from + 1); }
  }
}
