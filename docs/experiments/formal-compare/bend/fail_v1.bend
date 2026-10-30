import Base
import ./kyb.bend as K

# The v1 ranking stated as settled (false): an answer that is not decline/incomplete could still hide a decline flag
law v1_settled:
  for d: Bool
  for e: Bool
  for r: Bool
  for i: Bool
  {Bool.and(d || i, K.is_settled(K.rank_v1(d, e, r, i))) == False{} : Bool}

def v1_settled(d, e, r, i):
  match d i:
    case True{} _:
      {==}
    case False{} True{}:
      {==}
    case False{} False{}:
      {==}
