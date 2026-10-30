# The checks, stated as laws. PROOF.bend proves them.
import Base
import ./kyb.bend as K

# P1: approve only when no flag is raised (stated over the ranking, for any flags)
law approve_only_if_clean:
  for d: Bool
  for e: Bool
  for r: Bool
  for i: Bool
  {Bool.and(K.is_approve(K.rank_v1(d, e, r, i)), d || e || r || i) == False{} : Bool}

# P2: a confirmed sanctions match always declines, whatever else is true
law confirmed_declines:
  for excl: Bool
  for np: Bool
  for ctrl: Bool
  for own: Bool
  for ver: Bool
  for reg: K.YNU
  for pep: K.YNU
  for adv: K.YNU
  for i: K.Industry
  for g: K.Geo
  {K.outcome_v1(excl, np, ctrl, own, ver, reg, pep, adv, K.Confirmed{}, i, g) == K.Decline{} : K.Outcome}

# P3: rule 5.3 is dead: an MSB is never approved
law msb_never_approved:
  for excl: Bool
  for np: Bool
  for ctrl: Bool
  for own: Bool
  for ver: Bool
  for reg: K.YNU
  for pep: K.YNU
  for adv: K.YNU
  for +s: K.Sanctions
  for +g: K.Geo
  {K.is_approve(K.outcome_v1(excl, np, ctrl, own, ver, reg, pep, adv, s, K.MSB{}, g)) == False{} : Bool}

# P4 (v2): if the answer is not decline or incomplete, nothing is unknown and no decline flag is raised,
# so filling in facts cannot turn it into decline. Stated over the ranking, for any flags.
law v2_settled:
  for d: Bool
  for e: Bool
  for r: Bool
  for i: Bool
  {Bool.and(d || i, K.is_settled(K.rank_v2(d, e, r, i))) == False{} : Bool}
