"""KYB SOP (kyb_sop.md) in Z3. Each check prints PASS, or FAIL with a concrete case."""
import time, z3
from z3 import And, Or, Not, If, Implies

Sanc, (S_NONE, S_POTENTIAL, S_CONFIRMED, S_UNKNOWN) = z3.EnumSort("Sanctions", ["none", "potential", "confirmed", "unknown"])
YNU, (YES, NO, UNK) = z3.EnumSort("YesNoUnknown", ["yes", "no", "unknown"])
Ind, (I_PROHIBITED, I_MSB, I_CRYPTO, I_NORMAL, I_UNKNOWN) = z3.EnumSort("Industry", ["prohibited", "msb", "crypto", "normal", "unknown"])
Geo, (G_SANCTIONED, G_HIGHRISK, G_NORMAL, G_UNKNOWN) = z3.EnumSort("Geo", ["sanctioned", "high_risk", "normal", "unknown"])
OUT = ["approve", "incomplete", "request_docs", "escalate", "decline"]

class Case:
    def __init__(s, tag):
        s.excluded, s.nonprofit, s.control, s.own_complete, s.all_verified, s.licence = (
            z3.Bools(" ".join(f"{n}{tag}" for n in ["excluded", "nonprofit", "control", "own_complete", "all_verified", "licence"])))
        s.registry_fresh, s.pep, s.adverse = z3.Const("registry" + tag, YNU), z3.Const("pep" + tag, YNU), z3.Const("adverse" + tag, YNU)
        s.sanctions, s.industry, s.geo = z3.Const("sanc" + tag, Sanc), z3.Const("ind" + tag, Ind), z3.Const("geo" + tag, Geo)
    def facts(s):
        return [s.excluded, s.nonprofit, s.control, s.own_complete, s.all_verified, s.licence,
                s.registry_fresh, s.pep, s.adverse, s.sanctions, s.industry, s.geo]

def flags(c):
    decline = Or(c.sanctions == S_CONFIRMED, c.industry == I_PROHIBITED, c.geo == G_SANCTIONED)              # 4.1 5.1 6.1
    escalate = Or(c.sanctions == S_POTENTIAL, c.pep == YES, c.adverse == YES,
                  c.industry == I_MSB, c.industry == I_CRYPTO, c.geo == G_HIGHRISK)                         # 4.2 4.3 4.4 5.2 6.2
    docs = Or(And(Not(c.excluded), Not(c.control)),                                                         # 3.2
              And(Not(c.excluded), Not(c.nonprofit), Not(c.own_complete)),                                 # 3.3
              Not(c.all_verified), c.registry_fresh == NO)                                                 # 3.4 3.5
    incomplete = Or(c.sanctions == S_UNKNOWN, c.pep == UNK, c.adverse == UNK,
                    c.industry == I_UNKNOWN, c.geo == G_UNKNOWN, c.registry_fresh == UNK)                    # 2.2
    rule_5_3 = And(c.industry == I_MSB, c.licence)                                                         # 5.3 (approve)
    return decline, escalate, docs, incomplete, rule_5_3

def outcome_v1(c):  # 2.1: decline > escalate > request docs > incomplete > approve
    d, e, r, i, _ = flags(c)
    return If(d, 4, If(e, 3, If(r, 2, If(i, 1, 0))))

def outcome_v2(c):  # fix: incomplete ranks just below decline
    d, e, r, i, _ = flags(c)
    return If(d, 4, If(i, 1, If(e, 3, If(r, 2, 0))))

def check(name, claim_negated, show):
    s = z3.Solver(); s.add(claim_negated); t = time.time(); r = s.check(); ms = (time.time() - t) * 1000
    if r == z3.unsat: print(f"PASS  {name}  ({ms:.0f} ms)")
    else: print(f"FAIL  {name}  ({ms:.0f} ms)\n      e.g. {show(s.model())}")

def desc(m, c):
    return ", ".join(f"{f}={m.eval(f, model_completion=True)}" for f in c.facts())

for label, outcome in [("v1", outcome_v1), ("v2", outcome_v2)]:
    print(f"\n== SOP {label}")
    c = Case("_" + label); o = outcome(c); d, e, r, i, r53 = flags(c)
    # P1 approve only when every obligation is met, every fact known, no risk factor
    check("P1 approve => all obligations met and nothing unknown",
          And(o == 0, Or(d, e, r, i)), lambda m: desc(m, c))
    # P2 confirmed sanctions always declined
    check("P2 confirmed sanctions match => decline", And(c.sanctions == S_CONFIRMED, o != 4), lambda m: desc(m, c))
    # P3 rule 5.3 ever decides the outcome?
    s = z3.Solver(); s.add(r53, o == 0)
    print("DEAD  P3 rule 5.3 (licensed MSB may be approved) can never decide an outcome: 5.2 always escalates MSBs"
          if s.check() == z3.unsat else f"LIVE  P3 rule 5.3 applies, e.g. {desc(s.model(), c)}")
    # P4 an answer given while facts are unknown never turns into decline once they are known
    k = Case("_k" + label); ok = outcome(k)
    same_where_known = And(
        k.excluded == c.excluded, k.nonprofit == c.nonprofit, k.control == c.control, k.own_complete == c.own_complete,
        k.all_verified == c.all_verified, k.licence == c.licence,
        Or(c.registry_fresh == UNK, k.registry_fresh == c.registry_fresh), k.registry_fresh != UNK,
        Or(c.pep == UNK, k.pep == c.pep), k.pep != UNK, Or(c.adverse == UNK, k.adverse == c.adverse), k.adverse != UNK,
        Or(c.sanctions == S_UNKNOWN, k.sanctions == c.sanctions), k.sanctions != S_UNKNOWN,
        Or(c.industry == I_UNKNOWN, k.industry == c.industry), k.industry != I_UNKNOWN,
        Or(c.geo == G_UNKNOWN, k.geo == c.geo), k.geo != G_UNKNOWN)
    check("P4 non-incomplete answer never flips to decline once unknowns are filled",
          And(same_where_known, o != 4, o != 1, ok == 4),
          lambda m: f"with unknowns: {OUT[m.eval(o).as_long()]} [{desc(m, c)}]  ->  once known: decline [{desc(m, k)}]")

# P7 what changed between v1 and v2, as a list of kinds of case
print("\n== Diff v1 -> v2")
c = Case("_d")
for a in range(5):
    for b in range(5):
        if a == b: continue
        s = z3.Solver(); s.add(outcome_v1(c) == a, outcome_v2(c) == b)
        if s.check() == z3.sat: print(f"  {OUT[a]} -> {OUT[b]}   e.g. {desc(s.model(), c)}")

# P5 ownership completeness check is sound, and P6 at most four 25% owners: Z3 needs a fixed number of people
def p5(n):
    known = [z3.Int(f"e{i}") for i in range(n)]        # known effective ownership, basis points
    ident = [z3.Bool(f"id{i}") for i in range(n)]
    U = z3.Int("U")                                     # basis points unaccounted / behind unresolved entities
    alloc = [z3.Int(f"u{i}") for i in range(n + 1)]     # how the unknown slice really splits; index n = a new person
    complete = And(U < 2500, *[Implies(Not(ident[i]), known[i] + U < 2500) for i in range(n)])
    world = And(U >= 0, *[x >= 0 for x in known + alloc], z3.Sum(alloc) <= U)
    hidden = Or(alloc[n] >= 2500, *[And(Not(ident[i]), known[i] + alloc[i] >= 2500) for i in range(n)])
    return And(world, complete, hidden)
def p6(n):
    xs = [z3.Int(f"x{i}") for i in range(n)]
    return And(*[x >= 0 for x in xs], z3.Sum(xs) <= 10000, z3.Sum([If(x >= 2500, 1, 0) for x in xs]) >= 5)
print("\n== Ownership (bounded: Z3 checks one size at a time)")
for n in (4, 16, 64):
    check(f"P5 completeness check is sound, {n} people", p5(n), lambda m: m)
    check(f"P6 at most four 25% owners, {n} holders", p6(n), lambda m: m)

# P6 for ANY number of holders: try Z3 with a recursive list sum (needs induction, which Z3 does not do)
print("\n== P6 for any number of holders, via recursive functions")
L = z3.Datatype("L"); L.declare("nil"); L.declare("cons", ("hd", z3.IntSort()), ("tl", L)); L = L.create()
total, big, allnn = z3.RecFunction("total", L, z3.IntSort()), z3.RecFunction("big", L, z3.IntSort()), z3.RecFunction("allnn", L, z3.BoolSort())
xs = z3.Const("xs", L)
z3.RecAddDefinition(total, [xs], If(L.is_nil(xs), 0, L.hd(xs) + total(L.tl(xs))))
z3.RecAddDefinition(big, [xs], If(L.is_nil(xs), 0, If(L.hd(xs) >= 2500, 1, 0) + big(L.tl(xs))))
z3.RecAddDefinition(allnn, [xs], If(L.is_nil(xs), True, And(L.hd(xs) >= 0, allnn(L.tl(xs)))))
s = z3.Solver(); s.set("timeout", 60000); s.add(allnn(xs), total(xs) <= 10000, big(xs) >= 5)
t = time.time(); r = s.check(); print(f"  result: {r} after {time.time()-t:.1f}s  (unsat would be a proof; 'unknown' means Z3 gave up)")
