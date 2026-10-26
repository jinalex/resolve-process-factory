set_option linter.unusedVariables false
-- KYB SOP (kyb_sop.md) in Lean 4 (core only, no Mathlib). Every theorem is a check; you write the proof.
inductive Sanctions | none | potential | confirmed | unknown deriving DecidableEq, Repr
inductive YNU | yes | no | unknown deriving DecidableEq, Repr
inductive Industry | prohibited | msb | crypto | normal | unknown deriving DecidableEq, Repr
inductive Geo | sanctioned | highRisk | normal | unknown deriving DecidableEq, Repr
inductive Outcome | approve | incomplete | requestDocs | escalate | decline deriving DecidableEq, Repr

structure Case where
  excluded : Bool
  nonprofit : Bool
  control : Bool
  ownComplete : Bool
  allVerified : Bool
  licence : Bool
  registryFresh : YNU
  pep : YNU
  adverse : YNU
  sanctions : Sanctions
  industry : Industry
  geo : Geo
deriving Repr

def declineFlag (c : Case) : Bool :=                                    -- 4.1 5.1 6.1
  c.sanctions == .confirmed || c.industry == .prohibited || c.geo == .sanctioned
def escalateFlag (c : Case) : Bool :=                                   -- 4.2 4.3 4.4 5.2 6.2
  c.sanctions == .potential || c.pep == .yes || c.adverse == .yes || c.industry == .msb || c.industry == .crypto || c.geo == .highRisk
def docsFlag (c : Case) : Bool :=                                       -- 3.2 3.3 3.4 3.5
  (!c.excluded && !c.control) || (!c.excluded && !c.nonprofit && !c.ownComplete) || !c.allVerified || c.registryFresh == .no
def incompleteFlag (c : Case) : Bool :=                                 -- 2.2
  c.sanctions == .unknown || c.pep == .unknown || c.adverse == .unknown || c.industry == .unknown || c.geo == .unknown || c.registryFresh == .unknown
def rule53 (c : Case) : Bool := c.industry == .msb && c.licence         -- 5.3

def outcomeV1 (c : Case) : Outcome :=   -- 2.1: decline > escalate > request docs > incomplete > approve
  if declineFlag c then .decline else if escalateFlag c then .escalate else if docsFlag c then .requestDocs
  else if incompleteFlag c then .incomplete else .approve
def outcomeV2 (c : Case) : Outcome :=   -- fix: incomplete ranks just below decline
  if declineFlag c then .decline else if incompleteFlag c then .incomplete else if escalateFlag c then .escalate
  else if docsFlag c then .requestDocs else .approve

theorem P1 (c : Case) (h : outcomeV1 c = .approve) :
    declineFlag c = false ∧ escalateFlag c = false ∧ docsFlag c = false ∧ incompleteFlag c = false := by
  unfold outcomeV1 at h; split at h <;> (try split at h) <;> (try split at h) <;> (try split at h) <;> simp_all

theorem P2 (c : Case) (h : c.sanctions = .confirmed) : outcomeV1 c = .decline := by
  simp [outcomeV1, declineFlag, h]

theorem P3_rule53_is_dead (c : Case) (h : rule53 c = true) : outcomeV1 c ≠ .approve := by
  simp [rule53] at h
  simp [outcomeV1, escalateFlag, h.1]
  split <;> simp

-- k fills in every unknown fact of c and agrees with c everywhere else
def completes (c k : Case) : Prop :=
  k.excluded = c.excluded ∧ k.nonprofit = c.nonprofit ∧ k.control = c.control ∧ k.ownComplete = c.ownComplete ∧
  k.allVerified = c.allVerified ∧ k.licence = c.licence ∧
  (c.registryFresh = .unknown ∨ k.registryFresh = c.registryFresh) ∧ k.registryFresh ≠ .unknown ∧
  (c.pep = .unknown ∨ k.pep = c.pep) ∧ k.pep ≠ .unknown ∧ (c.adverse = .unknown ∨ k.adverse = c.adverse) ∧ k.adverse ≠ .unknown ∧
  (c.sanctions = .unknown ∨ k.sanctions = c.sanctions) ∧ k.sanctions ≠ .unknown ∧
  (c.industry = .unknown ∨ k.industry = c.industry) ∧ k.industry ≠ .unknown ∧
  (c.geo = .unknown ∨ k.geo = c.geo) ∧ k.geo ≠ .unknown

-- P4 is FALSE for v1. Lean cannot find the counterexample; we paste in the one Z3 found and Lean checks it.
theorem P4_v1_fails : ¬ ∀ c k, completes c k → outcomeV1 c ≠ .decline → outcomeV1 c ≠ .incomplete → outcomeV1 k ≠ .decline := by
  intro h
  let c : Case := ⟨false, true, false, true, true, false, .yes, .unknown, .unknown, .none, .normal, .unknown⟩
  let k : Case := ⟨false, true, false, true, true, false, .yes, .yes, .yes, .none, .normal, .sanctioned⟩
  have := h c k (by simp [completes, c, k]) (by decide) (by decide)
  exact this (by decide)

theorem P4_v2 (c k : Case) (hc : completes c k) (h1 : outcomeV2 c ≠ .decline) (h2 : outcomeV2 c ≠ .incomplete) :
    outcomeV2 k ≠ .decline := by
  obtain ⟨_, _, _, _, _, _, hr, hr', hp, hp', ha, ha', hs, hs', hi, hi', hg, hg'⟩ := hc
  have hinc : incompleteFlag c = false := by
    unfold outcomeV2 at h1 h2; split at h1 <;> simp_all
  have hdec : declineFlag c = false := by
    unfold outcomeV2 at h1; split at h1 <;> simp_all
  simp [incompleteFlag] at hinc
  obtain ⟨⟨⟨⟨⟨s1, p1⟩, a1⟩, i1⟩, g1⟩, r1⟩ := hinc
  have e1 : k.sanctions = c.sanctions := by cases hs <;> simp_all
  have e2 : k.industry = c.industry := by cases hi <;> simp_all
  have e3 : k.geo = c.geo := by cases hg <;> simp_all
  simp [declineFlag] at hdec
  have hk : declineFlag k = false := by simp [declineFlag, e1, e2, e3, hdec]
  have hik : incompleteFlag k = false := by simp [incompleteFlag, hr', hp', ha', hs', hi', hg']
  unfold outcomeV2; rw [hk, hik]
  cases escalateFlag k <;> cases docsFlag k <;> simp

-- ---- Ownership, for ANY number of holders (induction, written by hand) ----
def countBig : List Int → Nat
  | [] => 0
  | x :: xs => (if x ≥ 2500 then 1 else 0) + countBig xs
def total : List Int → Int
  | [] => 0
  | x :: xs => x + total xs

theorem bigCostsAQuarter (xs : List Int) (h : ∀ x ∈ xs, x ≥ 0) : 2500 * (countBig xs : Int) ≤ total xs := by
  induction xs with
  | nil => simp [countBig, total]
  | cons x xs ih =>
    have hx := h x (by simp)
    have ih := ih (fun y hy => h y (by simp [hy]))
    simp only [countBig, total]
    split <;> push_cast <;> omega

theorem P6_atMostFour (xs : List Int) (h : ∀ x ∈ xs, x ≥ 0) (hs : total xs ≤ 10000) : countBig xs ≤ 4 := by
  have := bigCostsAQuarter xs h
  omega

theorem totalNonneg (xs : List Int) (h : ∀ x ∈ xs, x ≥ 0) : total xs ≥ 0 := by
  induction xs with
  | nil => simp [total]
  | cons x xs ih =>
    have := h x (by simp)
    have := ih (fun z hz => h z (by simp [hz]))
    simp only [total]; omega

theorem oneLeqTotal (xs : List Int) (h : ∀ x ∈ xs, x ≥ 0) (y : Int) (hy : y ∈ xs) : y ≤ total xs := by
  induction xs with
  | nil => simp at hy
  | cons x xs ih =>
    have hx := h x (by simp)
    have hrest : ∀ z ∈ xs, z ≥ 0 := fun z hz => h z (by simp [hz])
    have hpos := totalNonneg xs hrest
    simp only [total]
    rcases List.mem_cons.mp hy with rfl | hm
    · omega
    · have := ih hrest hm; omega

-- P5: if the completeness check passes, no unidentified person (known or new) can really reach 25%
theorem P5_completenessSound (known alloc : List Int) (ident : Nat → Bool) (U : Int)
    (hn : ∀ x ∈ alloc, x ≥ 0) (hsum : total alloc ≤ U)
    (hcheck : ∀ i, (h : i < known.length) → ident i = false → known[i] + U < 2500)
    (i : Nat) (hi : i < known.length) (hia : i < alloc.length) (hid : ident i = false) :
    known[i] + alloc[i] < 2500 := by
  have := oneLeqTotal alloc hn alloc[i] (List.getElem_mem alloc i hia)
  have := hcheck i hi hid
  omega

theorem P5_newPerson (alloc : List Int) (U : Int) (hn : ∀ x ∈ alloc, x ≥ 0) (hsum : total alloc ≤ U) (hU : U < 2500)
    (j : Nat) (hj : j < alloc.length) : alloc[j] < 2500 := by
  have := oneLeqTotal alloc hn alloc[j] (List.getElem_mem alloc j hj)
  omega
