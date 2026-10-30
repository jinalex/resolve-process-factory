# P4 for v1 is false. Bend can't search for the bad case; this replays the one Z3 found.
import Base
import ./kyb.bend as K

# with pep, adverse media and geography unknown: request documents
# once known (PEP, adverse media, sanctioned country): decline
def main() -> K.Outcome & K.Outcome:
  before = K.outcome_v1(False{}, True{}, False{}, True{}, True{}, K.Yes{}, K.Unknown{}, K.Unknown{}, K.SNone{}, K.Normal{}, K.GUnknown{})
  after = K.outcome_v1(False{}, True{}, False{}, True{}, True{}, K.Yes{}, K.Yes{}, K.Yes{}, K.SNone{}, K.Normal{}, K.Sanctioned{})
  (before, after)
