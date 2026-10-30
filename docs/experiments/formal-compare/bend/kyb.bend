# KYB SOP (../kyb_sop.md) in Bend 2: the decision logic.
import Base

type Sanctions is Data:
  SNone{}
  Potential{}
  Confirmed{}
  SUnknown{}

type YNU is Data:
  Yes{}
  No{}
  Unknown{}

type Industry is Data:
  Prohibited{}
  MSB{}
  Crypto{}
  Normal{}
  IUnknown{}

type Geo is Data:
  Sanctioned{}
  HighRisk{}
  GNormal{}
  GUnknown{}

type Outcome is Data:
  Approve{}
  Incomplete{}
  RequestDocs{}
  Escalate{}
  Decline{}

# one predicate per value we test; Bend has no derived equality
def s_confirmed(s: Sanctions) -> Bool:
  match s:
    case Confirmed{}:
      True{}
    case _:
      False{}
def s_potential(s: Sanctions) -> Bool:
  match s:
    case Potential{}:
      True{}
    case _:
      False{}
def s_unknown(s: Sanctions) -> Bool:
  match s:
    case SUnknown{}:
      True{}
    case _:
      False{}
def y_yes(x: YNU) -> Bool:
  match x:
    case Yes{}:
      True{}
    case _:
      False{}
def y_no(x: YNU) -> Bool:
  match x:
    case No{}:
      True{}
    case _:
      False{}
def y_unknown(x: YNU) -> Bool:
  match x:
    case Unknown{}:
      True{}
    case _:
      False{}
def i_prohibited(i: Industry) -> Bool:
  match i:
    case Prohibited{}:
      True{}
    case _:
      False{}
def i_restricted(i: Industry) -> Bool:
  match i:
    case MSB{}:
      True{}
    case Crypto{}:
      True{}
    case _:
      False{}
def i_msb(i: Industry) -> Bool:
  match i:
    case MSB{}:
      True{}
    case _:
      False{}
def i_unknown(i: Industry) -> Bool:
  match i:
    case IUnknown{}:
      True{}
    case _:
      False{}
def g_sanctioned(g: Geo) -> Bool:
  match g:
    case Sanctioned{}:
      True{}
    case _:
      False{}
def g_highrisk(g: Geo) -> Bool:
  match g:
    case HighRisk{}:
      True{}
    case _:
      False{}
def g_unknown(g: Geo) -> Bool:
  match g:
    case GUnknown{}:
      True{}
    case _:
      False{}
def is_approve(o: Outcome) -> Bool:
  match o:
    case Approve{}:
      True{}
    case _:
      False{}
def is_decline(o: Outcome) -> Bool:
  match o:
    case Decline{}:
      True{}
    case _:
      False{}

def is_settled(o: Outcome) -> Bool:
  match o:
    case Decline{}:
      False{}
    case Incomplete{}:
      False{}
    case _:
      True{}

# 4.1 5.1 6.1
def decline_flag(+s: Sanctions, +i: Industry, +g: Geo) -> Bool:
  s_confirmed(s) || i_prohibited(i) || g_sanctioned(g)
# 4.2 4.3 4.4 5.2 6.2
def escalate_flag(+s: Sanctions, +pep: YNU, +adv: YNU, +i: Industry, +g: Geo) -> Bool:
  s_potential(s) || y_yes(pep) || y_yes(adv) || i_restricted(i) || g_highrisk(g)
# 3.2 3.3 3.4 3.5
def docs_flag(+excl: Bool, +np: Bool, +ctrl: Bool, +own: Bool, +ver: Bool, +reg: YNU) -> Bool:
  (Bool.not(excl) && Bool.not(ctrl)) || (Bool.not(excl) && Bool.not(np) && Bool.not(own)) || Bool.not(ver) || y_no(reg)
# 2.2
def incomplete_flag(+s: Sanctions, +pep: YNU, +adv: YNU, +i: Industry, +g: Geo, +reg: YNU) -> Bool:
  s_unknown(s) || y_unknown(pep) || y_unknown(adv) || i_unknown(i) || g_unknown(g) || y_unknown(reg)

# 2.1, written over the four flags: decline > escalate > request docs > incomplete > approve
def rank_v1(d: Bool, e: Bool, r: Bool, i: Bool) -> Outcome:
  Bool.pick(Outcome, d, Decline{}, Bool.pick(Outcome, e, Escalate{}, Bool.pick(Outcome, r, RequestDocs{}, Bool.pick(Outcome, i, Incomplete{}, Approve{}))))
# the fix: incomplete ranks just below decline
def rank_v2(d: Bool, e: Bool, r: Bool, i: Bool) -> Outcome:
  Bool.pick(Outcome, d, Decline{}, Bool.pick(Outcome, i, Incomplete{}, Bool.pick(Outcome, e, Escalate{}, Bool.pick(Outcome, r, RequestDocs{}, Approve{}))))

def outcome_v1(+excl: Bool, +np: Bool, +ctrl: Bool, +own: Bool, +ver: Bool, +reg: YNU,
               +pep: YNU, +adv: YNU, +s: Sanctions, +i: Industry, +g: Geo) -> Outcome:
  rank_v1(decline_flag(s, i, g), escalate_flag(s, pep, adv, i, g), docs_flag(excl, np, ctrl, own, ver, reg), incomplete_flag(s, pep, adv, i, g, reg))
