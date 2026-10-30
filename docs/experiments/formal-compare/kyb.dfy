// KYB SOP (kyb_sop.md) in Dafny. Each lemma is a check; Dafny asks Z3 to prove it.
datatype Sanctions = SNone | Potential | Confirmed | SUnknown
datatype YNU = Yes | No | Unknown
datatype Industry = Prohibited | MSB | Crypto | Normal | IUnknown
datatype Geo = Sanctioned | HighRisk | GNormal | GUnknown
datatype Outcome = Approve | Incomplete | RequestDocs | Escalate | Decline

datatype Case = Case(excluded: bool, nonprofit: bool, control: bool, ownComplete: bool, allVerified: bool, licence: bool,
                     registryFresh: YNU, pep: YNU, adverse: YNU, sanctions: Sanctions, industry: Industry, geo: Geo)

predicate DeclineFlag(c: Case) { c.sanctions == Confirmed || c.industry == Prohibited || c.geo == Sanctioned }          // 4.1 5.1 6.1
predicate EscalateFlag(c: Case) {                                                                                     // 4.2 4.3 4.4 5.2 6.2
  c.sanctions == Potential || c.pep == Yes || c.adverse == Yes || c.industry == MSB || c.industry == Crypto || c.geo == HighRisk }
predicate DocsFlag(c: Case) {                                                                                         // 3.2 3.3 3.4 3.5
  (!c.excluded && !c.control) || (!c.excluded && !c.nonprofit && !c.ownComplete) || !c.allVerified || c.registryFresh == No }
predicate IncompleteFlag(c: Case) {                                                                                   // 2.2
  c.sanctions == SUnknown || c.pep == Unknown || c.adverse == Unknown || c.industry == IUnknown || c.geo == GUnknown || c.registryFresh == Unknown }
predicate Rule53(c: Case) { c.industry == MSB && c.licence }                                                          // 5.3

function OutcomeV1(c: Case): Outcome {   // 2.1: decline > escalate > request docs > incomplete > approve
  if DeclineFlag(c) then Decline else if EscalateFlag(c) then Escalate else if DocsFlag(c) then RequestDocs
  else if IncompleteFlag(c) then Incomplete else Approve }
function OutcomeV2(c: Case): Outcome {   // fix: incomplete ranks just below decline
  if DeclineFlag(c) then Decline else if IncompleteFlag(c) then Incomplete else if EscalateFlag(c) then Escalate
  else if DocsFlag(c) then RequestDocs else Approve }

lemma P1(c: Case) ensures OutcomeV1(c) == Approve ==> !DeclineFlag(c) && !EscalateFlag(c) && !DocsFlag(c) && !IncompleteFlag(c) {}
lemma P2(c: Case) ensures c.sanctions == Confirmed ==> OutcomeV1(c) == Decline {}
lemma P3_rule53_is_dead(c: Case) ensures Rule53(c) ==> OutcomeV1(c) != Approve {}

// k fills in every unknown fact of c and agrees with c everywhere else
predicate Completes(c: Case, k: Case) {
  k.excluded == c.excluded && k.nonprofit == c.nonprofit && k.control == c.control && k.ownComplete == c.ownComplete &&
  k.allVerified == c.allVerified && k.licence == c.licence &&
  (c.registryFresh == Unknown || k.registryFresh == c.registryFresh) && k.registryFresh != Unknown &&
  (c.pep == Unknown || k.pep == c.pep) && k.pep != Unknown && (c.adverse == Unknown || k.adverse == c.adverse) && k.adverse != Unknown &&
  (c.sanctions == SUnknown || k.sanctions == c.sanctions) && k.sanctions != SUnknown &&
  (c.industry == IUnknown || k.industry == c.industry) && k.industry != IUnknown &&
  (c.geo == GUnknown || k.geo == c.geo) && k.geo != GUnknown }

lemma P4_v1(c: Case, k: Case)   // expected to FAIL: v1 can say "request docs" and later turn into decline
  requires Completes(c, k) && OutcomeV1(c) != Decline && OutcomeV1(c) != Incomplete
  ensures OutcomeV1(k) != Decline {}
lemma P4_v2(c: Case, k: Case)
  requires Completes(c, k) && OutcomeV2(c) != Decline && OutcomeV2(c) != Incomplete
  ensures OutcomeV2(k) != Decline {}
lemma P7_versions_agree(c: Case)  // expected to FAIL: they differ
  ensures OutcomeV1(c) == OutcomeV2(c) {}

// ---- Ownership, for ANY number of people (needs induction, written by hand) ----
function Sum(xs: seq<int>): int { if |xs| == 0 then 0 else xs[0] + Sum(xs[1..]) }
function CountBig(xs: seq<int>): int { if |xs| == 0 then 0 else (if xs[0] >= 2500 then 1 else 0) + CountBig(xs[1..]) }
predicate NonNeg(xs: seq<int>) { forall i :: 0 <= i < |xs| ==> xs[i] >= 0 }

lemma BigCostsAQuarter(xs: seq<int>) requires NonNeg(xs) ensures 2500 * CountBig(xs) <= Sum(xs) {
  if |xs| > 0 { BigCostsAQuarter(xs[1..]); }
}
lemma P6_AtMostFour(xs: seq<int>) requires NonNeg(xs) && Sum(xs) <= 10000 ensures CountBig(xs) <= 4 { BigCostsAQuarter(xs); }

lemma OneLeqSum(xs: seq<int>, i: int) requires NonNeg(xs) && 0 <= i < |xs| ensures xs[i] <= Sum(xs) {
  if i > 0 { OneLeqSum(xs[1..], i - 1); } else if |xs| > 1 { SumNonNeg(xs[1..]); }
}
lemma SumNonNeg(xs: seq<int>) requires NonNeg(xs) ensures Sum(xs) >= 0 { if |xs| > 0 { SumNonNeg(xs[1..]); } }

// known[i]: ownership we can see; U: basis points unaccounted for; alloc: how U really splits (last entry = a new person)
predicate CompleteCheck(known: seq<int>, ident: seq<bool>, U: int) requires |known| == |ident| {
  U < 2500 && forall i :: 0 <= i < |known| && !ident[i] ==> known[i] + U < 2500 }
lemma P5_CompletenessSound(known: seq<int>, ident: seq<bool>, U: int, alloc: seq<int>)
  requires |known| == |ident| && |alloc| == |known| + 1 && NonNeg(alloc) && Sum(alloc) <= U && CompleteCheck(known, ident, U)
  ensures alloc[|known|] < 2500
  ensures forall i :: 0 <= i < |known| && !ident[i] ==> known[i] + alloc[i] < 2500 {
  OneLeqSum(alloc, |known|);
  forall i | 0 <= i < |known| && !ident[i] ensures known[i] + alloc[i] < 2500 { OneLeqSum(alloc, i); }
}
