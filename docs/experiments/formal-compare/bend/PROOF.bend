import Base
import ./kyb.bend as K
import ./LAWS.bend as Laws

def Laws.approve_only_if_clean(d, e, r, i):
  match d e r i:
    case True{} _ _ _:
      {==}
    case False{} True{} _ _:
      {==}
    case False{} False{} True{} _:
      {==}
    case False{} False{} False{} True{}:
      {==}
    case False{} False{} False{} False{}:
      {==}

def Laws.confirmed_declines(excl, np, ctrl, own, ver, reg, pep, adv, i, g):
  {==}

def Laws.v2_settled(d, e, r, i):
  match d i:
    case True{} _:
      {==}
    case False{} True{}:
      {==}
    case False{} False{}:
      {==}

# any MSB raises the escalate flag (5.2)
def escalate_msb(s: K.Sanctions, pep: K.YNU, adv: K.YNU, g: K.Geo) -> {True{} == K.escalate_flag(s, pep, adv, K.MSB{}, g) : Bool}:
  # || groups to the left and only matches its first argument, so every value must be spelled out
  match s pep adv:
    case K.Potential{} _ _:
      {==}
    case K.SNone{} K.Yes{} K.Yes{}:
      {==}
    case K.SNone{} K.Yes{} K.No{}:
      {==}
    case K.SNone{} K.Yes{} K.Unknown{}:
      {==}
    case K.SNone{} K.No{} K.Yes{}:
      {==}
    case K.SNone{} K.No{} K.No{}:
      {==}
    case K.SNone{} K.No{} K.Unknown{}:
      {==}
    case K.SNone{} K.Unknown{} K.Yes{}:
      {==}
    case K.SNone{} K.Unknown{} K.No{}:
      {==}
    case K.SNone{} K.Unknown{} K.Unknown{}:
      {==}
    case K.Confirmed{} K.Yes{} K.Yes{}:
      {==}
    case K.Confirmed{} K.Yes{} K.No{}:
      {==}
    case K.Confirmed{} K.Yes{} K.Unknown{}:
      {==}
    case K.Confirmed{} K.No{} K.Yes{}:
      {==}
    case K.Confirmed{} K.No{} K.No{}:
      {==}
    case K.Confirmed{} K.No{} K.Unknown{}:
      {==}
    case K.Confirmed{} K.Unknown{} K.Yes{}:
      {==}
    case K.Confirmed{} K.Unknown{} K.No{}:
      {==}
    case K.Confirmed{} K.Unknown{} K.Unknown{}:
      {==}
    case K.SUnknown{} K.Yes{} K.Yes{}:
      {==}
    case K.SUnknown{} K.Yes{} K.No{}:
      {==}
    case K.SUnknown{} K.Yes{} K.Unknown{}:
      {==}
    case K.SUnknown{} K.No{} K.Yes{}:
      {==}
    case K.SUnknown{} K.No{} K.No{}:
      {==}
    case K.SUnknown{} K.No{} K.Unknown{}:
      {==}
    case K.SUnknown{} K.Unknown{} K.Yes{}:
      {==}
    case K.SUnknown{} K.Unknown{} K.No{}:
      {==}
    case K.SUnknown{} K.Unknown{} K.Unknown{}:
      {==}

# once escalate is raised, the ranking can no longer say approve
def rank_e_true(d: Bool, -r: Bool, -i: Bool) -> {K.is_approve(K.rank_v1(d, True{}, r, i)) == False{} : Bool}:
  match d:
    case True{}:
      {==}
    case False{}:
      {==}

def Laws.msb_never_approved(excl, np, ctrl, own, ver, reg, pep, adv, s, g):
  %escalate_msb(s, pep, adv, g) : {K.is_approve(K.rank_v1(K.decline_flag(s, K.MSB{}, g), _, K.docs_flag(excl, np, ctrl, own, ver, reg), K.incomplete_flag(s, pep, adv, K.MSB{}, g, reg))) == False{} : Bool}
  rank_e_true(K.decline_flag(s, K.MSB{}, g), K.docs_flag(excl, np, ctrl, own, ver, reg), K.incomplete_flag(s, pep, adv, K.MSB{}, g, reg))
