// What `pnpm resolve` writes for the KYB spec and the six example case files. packs/kyb/pane.test.ts fails when
// this copy no longer matches the writer; regenerate it with `pnpm resolve --out <dir>` and copy the three files in.
export const SPEC = {
 "domain": "kyb",
 "version": 1,
 "spec_hash": "28e264886d775879",
 "approved": false,
 "order": [
  "decline",
  "escalate",
  "request_docs",
  "incomplete",
  "approve"
 ],
 "sop_title": "KYB Onboarding Review: Level 1 Standard Operating Procedure",
 "sop": [
  {
   "ref": "2.1",
   "text": "When more than one section applies, the most severe outcome governs: Decline, then Escalate, then Request documents, then Incomplete, then Approve.",
   "rules": [],
   "covered": true
  },
  {
   "ref": "2.2",
   "text": "A fact that has not been established is unknown, not false. If any fact required by this procedure is unknown, the case cannot be approved.",
   "rules": [],
   "covered": true
  },
  {
   "ref": "3.1",
   "text": "Entities on the excluded list do not require beneficial owners to be identified. The list is the 16 entity types in 31 CFR 1010.230(e)(2), for example regulated banks, SEC-registered issuers, registered investment companies and state-regulated insurance companies.",
   "rules": [],
   "covered": false
  },
  {
   "ref": "3.2",
   "text": "For every other entity, identify one control person: a single individual with significant responsibility to control, manage or direct the entity. If no control person is identified, request documents.",
   "rules": [
    "control-person"
   ],
   "covered": true
  },
  {
   "ref": "3.3",
   "text": "Unless the entity is excluded or is a nonprofit, identify every individual who owns 25% or more of the entity, directly or indirectly. Ownership is complete only when no unidentified person could own 25% or more, given the shares that are unaccounted for or held through entities whose owners are unknown. If an excluded entity owns 25% or more, no individual needs to be identified for that share. If ownership is not complete, request documents.",
   "rules": [
    "ownership-complete",
    "ownership-over-100"
   ],
   "covered": true
  },
  {
   "ref": "3.4",
   "text": "Verify the identity of every identified individual. If any is unverified, request documents.",
   "rules": [
    "id-verified"
   ],
   "covered": true
  },
  {
   "ref": "3.5",
   "text": "The entity's registry filing must be less than 12 months old. Otherwise request documents.",
   "rules": [
    "registry-fresh"
   ],
   "covered": true
  },
  {
   "ref": "4.1",
   "text": "A confirmed sanctions match on the entity or any identified individual: decline.",
   "rules": [
    "sanctions-confirmed"
   ],
   "covered": true
  },
  {
   "ref": "4.2",
   "text": "A potential sanctions match that has not been cleared: escalate.",
   "rules": [
    "sanctions-potential"
   ],
   "covered": true
  },
  {
   "ref": "4.3",
   "text": "A politically exposed person among the identified individuals: escalate.",
   "rules": [
    "pep"
   ],
   "covered": true
  },
  {
   "ref": "4.4",
   "text": "Adverse media on the entity or any identified individual: escalate. Adverse media counts only if it is material. A report counts only if it matches the name and at least one other identifier (age, location or role), and comes from a court record, a regulator or an established news outlet, or from two independent other sources. Record every search: the terms, the date and the sources reviewed.",
   "rules": [
    "adverse-media"
   ],
   "covered": true
  },
  {
   "ref": "5.1",
   "text": "Prohibited industries (marijuana-related business, adult content, unlicensed money transmission): decline.",
   "rules": [
    "industry-prohibited"
   ],
   "covered": true
  },
  {
   "ref": "5.2",
   "text": "Restricted industries (money services businesses, virtual currency): escalate.",
   "rules": [
    "industry-restricted"
   ],
   "covered": true
  },
  {
   "ref": "5.3",
   "text": "Licensed money services businesses whose state licence has been verified may be approved.",
   "rules": [
    "msb-licensed"
   ],
   "covered": true
  },
  {
   "ref": "6.1",
   "text": "The entity or any identified individual is located in a comprehensively sanctioned country: decline.",
   "rules": [
    "country-sanctioned"
   ],
   "covered": true
  },
  {
   "ref": "6.2",
   "text": "The entity or any identified individual is located in a FATF high-risk or increased-monitoring jurisdiction: escalate.",
   "rules": [
    "country-high-risk"
   ],
   "covered": true
  }
 ],
 "rules": [
  {
   "id": "control-person",
   "says": "For every other entity, identify one control person: a single individual with significant responsibility to control, manage or direct the entity. If no control person is identified, request documents.",
   "then": "request_docs",
   "sop_refs": [
    "3.2"
   ],
   "code": "(and (= excluded_c no) (= control_person_identified_c no))"
  },
  {
   "id": "ownership-complete",
   "says": "Unless the entity is excluded or is a nonprofit, identify every individual who owns 25% or more of the entity, directly or indirectly. Ownership is complete only when no unidentified person could own 25% or more, given the shares that are unaccounted for or held through entities whose owners are unknown. If an excluded entity owns 25% or more, no individual needs to be identified for that share. If ownership is not complete, request documents.",
   "then": "request_docs",
   "sop_refs": [
    "3.3"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (and (= excluded_c no) (= nonprofit_c no) unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ unaccounted_pct_c a!5 a!6) 25.0)))"
  },
  {
   "id": "ownership-over-100",
   "says": "If ownership is not complete, request documents. A cap table listing more than 100% is not complete ownership (policy owner, 2026-10-28).",
   "then": "request_docs",
   "sop_refs": [
    "3.3"
   ],
   "code": "(and (= excluded_c no) (= nonprofit_c no) (= over_allocated_c yes))"
  },
  {
   "id": "id-verified",
   "says": "Verify the identity of every identified individual. If any is unverified, request documents.",
   "then": "request_docs",
   "sop_refs": [
    "3.4"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (or (= id_verified0_c no) (= id_verified0_c unknown)))) (a!10 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (or (= id_verified1_c no) (= id_verified1_c unknown))))) (or a!8 a!10))))"
  },
  {
   "id": "registry-fresh",
   "says": "The entity's registry filing must be less than 12 months old. Otherwise request documents.",
   "then": "request_docs",
   "sop_refs": [
    "3.5"
   ],
   "code": "(and registry_age_months_c_known (>= registry_age_months_c 12.0))"
  },
  {
   "id": "sanctions-confirmed",
   "says": "A confirmed sanctions match on the entity or any identified individual: decline.",
   "then": "decline",
   "sop_refs": [
    "4.1"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (= sanctions1_c confirmed))) (a!10 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (= sanctions0_c confirmed)))) (or (= entity_sanctions_c confirmed) a!8 a!10))))"
  },
  {
   "id": "sanctions-potential",
   "says": "A potential sanctions match that has not been cleared: escalate.",
   "then": "escalate",
   "sop_refs": [
    "4.2"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (= sanctions1_c potential))) (a!10 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (= sanctions0_c potential)))) (or (= entity_sanctions_c potential) a!8 a!10))))"
  },
  {
   "id": "pep",
   "says": "A politically exposed person among the identified individuals: escalate.",
   "then": "escalate",
   "sop_refs": [
    "4.3"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (= pep0_c yes))) (a!10 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (= pep1_c yes)))) (or a!8 a!10))))"
  },
  {
   "id": "adverse-media",
   "says": "Adverse media on the entity or any identified individual: escalate.",
   "then": "escalate",
   "sop_refs": [
    "4.4"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (= adverse_media0_c yes))) (a!10 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (= adverse_media1_c yes)))) (or (= entity_adverse_media_c yes) a!8 a!10))))"
  },
  {
   "id": "industry-prohibited",
   "says": "Prohibited industries (marijuana-related business, adult content, unlicensed money transmission): decline.",
   "then": "decline",
   "sop_refs": [
    "5.1"
   ],
   "code": "(= industry_c prohibited)"
  },
  {
   "id": "industry-restricted",
   "says": "Restricted industries (money services businesses, virtual currency): escalate.",
   "then": "escalate",
   "sop_refs": [
    "5.2"
   ],
   "code": "(or (= industry_c msb) (= industry_c crypto))"
  },
  {
   "id": "msb-licensed",
   "says": "Licensed money services businesses whose state licence has been verified may be approved.",
   "then": "approve",
   "sop_refs": [
    "5.3"
   ],
   "code": "(and (= industry_c msb) (= licence_verified_c yes))"
  },
  {
   "id": "country-sanctioned",
   "says": "The entity or any identified individual is located in a comprehensively sanctioned country: decline.",
   "then": "decline",
   "sop_refs": [
    "6.1"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (or (= residence0_c IR) (= residence0_c KP) (= residence0_c CU) (= residence0_c SY) (= residence0_c RU-CRIMEA)))) (a!10 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (or (= residence1_c IR) (= residence1_c KP) (= residence1_c CU) (= residence1_c SY) (= residence1_c RU-CRIMEA))))) (or (= country_c IR) (= country_c KP) (= country_c CU) (= country_c SY) (= country_c RU-CRIMEA) a!8 a!10))))"
  },
  {
   "id": "country-high-risk",
   "says": "The entity or any identified individual is located in a FATF high-risk or increased-monitoring jurisdiction: escalate.",
   "then": "escalate",
   "sop_refs": [
    "6.2"
   ],
   "code": "(let ((a!1 (or (and excluded_share_pct0_c_known (>= excluded_share_pct0_c 25.0)) (not excluded_owners0_c) (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!2 (not (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))))) (a!3 (or (and excluded_share_pct1_c_known (>= excluded_share_pct1_c 25.0)) (not excluded_owners1_c) (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!4 (not (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))))) (a!5 (ite (and excluded_owners0_c excluded_share_pct0_c_known (not (<= 25.0 excluded_share_pct0_c))) excluded_share_pct0_c 0.0)) (a!6 (ite (and excluded_owners1_c excluded_share_pct1_c_known (not (<= 25.0 excluded_share_pct1_c))) excluded_share_pct1_c 0.0))) (let ((a!7 (or (and certified_pct1_c_known (>= certified_pct1_c 25.0)) (and share_pct1_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct1_c unaccounted_pct_c a!5 a!6) 25.0)))) (a!9 (or (and certified_pct0_c_known (>= certified_pct0_c 25.0)) (and share_pct0_c_known unaccounted_pct_c_known excluded_owners_listed_c a!1 (or excluded_share_pct0_c_known a!2) a!3 (or excluded_share_pct1_c_known a!4) (>= (+ share_pct0_c unaccounted_pct_c a!5 a!6) 25.0))))) (let ((a!8 (and people1_c (or (= listed1_c yes) (and (= excluded_c no) (= control_person1_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!7)) (or (= residence1_c IR) (= residence1_c KP) (= residence1_c SY) (= residence1_c MM) (= residence1_c AO) (= residence1_c BA) (= residence1_c BG) (= residence1_c BO) (= residence1_c CD) (= residence1_c CI) (= residence1_c CM) (= residence1_c HT) (= residence1_c IQ) (= residence1_c KE) (= residence1_c KW) (= residence1_c LA) (= residence1_c LB) (= residence1_c MC) (= residence1_c NP) (= residence1_c PG) (= residence1_c SS) (= residence1_c VE) (= residence1_c VG) (= residence1_c VN) (= residence1_c YE)))) (a!10 (and people0_c (or (= listed0_c yes) (and (= excluded_c no) (= control_person0_c yes)) (and (= excluded_c no) (= nonprofit_c no) a!9)) (or (= residence0_c IR) (= residence0_c KP) (= residence0_c SY) (= residence0_c MM) (= residence0_c AO) (= residence0_c BA) (= residence0_c BG) (= residence0_c BO) (= residence0_c CD) (= residence0_c CI) (= residence0_c CM) (= residence0_c HT) (= residence0_c IQ) (= residence0_c KE) (= residence0_c KW) (= residence0_c LA) (= residence0_c LB) (= residence0_c MC) (= residence0_c NP) (= residence0_c PG) (= residence0_c SS) (= residence0_c VE) (= residence0_c VG) (= residence0_c VN) (= residence0_c YE))))) (or (= country_c IR) (= country_c KP) (= country_c SY) (= country_c MM) (= country_c AO) (= country_c BA) (= country_c BG) (= country_c BO) (= country_c CD) (= country_c CI) (= country_c CM) (= country_c HT) (= country_c IQ) (= country_c KE) (= country_c KW) (= country_c LA) (= country_c LB) (= country_c MC) (= country_c NP) (= country_c PG) (= country_c SS) (= country_c VE) (= country_c VG) (= country_c VN) (= country_c YE) a!8 a!10))))"
  }
 ],
 "facts": [
  {
   "key": "excluded",
   "name": "Excluded entity",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "3.2",
    "3.3"
   ]
  },
  {
   "key": "nonprofit",
   "name": "Nonprofit",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "3.3"
   ]
  },
  {
   "key": "industry",
   "name": "Industry",
   "values": [
    "prohibited",
    "msb",
    "crypto",
    "normal",
    "unknown"
   ],
   "required_by": [
    "5.1",
    "5.2",
    "5.3"
   ],
   "sop_words": {
    "prohibited": [
     "marijuana-related business",
     "adult content",
     "unlicensed money transmission"
    ],
    "msb": [
     "money services business"
    ],
    "crypto": [
     "virtual currency"
    ]
   }
  },
  {
   "key": "licence_verified",
   "name": "Licence verified",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "5.3"
   ]
  },
  {
   "key": "country",
   "name": "Country",
   "values": [
    "IR",
    "KP",
    "CU",
    "SY",
    "RU-CRIMEA",
    "MM",
    "AO",
    "BA",
    "BG",
    "BO",
    "CD",
    "CI",
    "CM",
    "HT",
    "IQ",
    "KE",
    "KW",
    "LA",
    "LB",
    "MC",
    "NP",
    "PG",
    "SS",
    "VE",
    "VG",
    "VN",
    "YE",
    "other",
    "unknown"
   ],
   "required_by": [
    "6.1",
    "6.2"
   ]
  },
  {
   "key": "entity_sanctions",
   "name": "Sanctions screening (business)",
   "values": [
    "none",
    "potential",
    "confirmed",
    "unknown"
   ],
   "required_by": [
    "4.1",
    "4.2"
   ]
  },
  {
   "key": "entity_adverse_media",
   "name": "Adverse media (business)",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "4.4"
   ]
  },
  {
   "key": "listed",
   "name": "Listed by the agent",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [],
   "per": "people"
  },
  {
   "key": "control_person",
   "name": "Control person",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [],
   "per": "people"
  },
  {
   "key": "share_pct",
   "name": "Share owned (%)",
   "values": [],
   "required_by": [],
   "per": "people"
  },
  {
   "key": "certified_pct",
   "name": "Share certified by the customer (%)",
   "values": [],
   "required_by": [],
   "per": "people"
  },
  {
   "key": "residence",
   "name": "Residence",
   "values": [
    "IR",
    "KP",
    "CU",
    "SY",
    "RU-CRIMEA",
    "MM",
    "AO",
    "BA",
    "BG",
    "BO",
    "CD",
    "CI",
    "CM",
    "HT",
    "IQ",
    "KE",
    "KW",
    "LA",
    "LB",
    "MC",
    "NP",
    "PG",
    "SS",
    "VE",
    "VG",
    "VN",
    "YE",
    "other",
    "unknown"
   ],
   "required_by": [
    "6.1",
    "6.2"
   ],
   "per": "people"
  },
  {
   "key": "id_verified",
   "name": "ID check",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "3.4"
   ],
   "per": "people"
  },
  {
   "key": "sanctions",
   "name": "Sanctions screening",
   "values": [
    "none",
    "potential",
    "confirmed",
    "unknown"
   ],
   "required_by": [
    "4.1",
    "4.2"
   ],
   "per": "people"
  },
  {
   "key": "pep",
   "name": "Politically exposed",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "4.3"
   ],
   "per": "people"
  },
  {
   "key": "adverse_media",
   "name": "Adverse media",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "4.4"
   ],
   "per": "people"
  },
  {
   "key": "excluded_share_pct",
   "name": "Excluded entity's share (%)",
   "values": [],
   "required_by": [],
   "per": "excluded_owners"
  },
  {
   "key": "control_person_identified",
   "name": "Control person identified",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "3.2"
   ],
   "computed": true
  },
  {
   "key": "unaccounted_pct",
   "name": "Unaccounted share (%)",
   "values": [],
   "required_by": [],
   "computed": true,
   "numeric": true
  },
  {
   "key": "over_allocated",
   "name": "Shares listed over 100%",
   "values": [
    "yes",
    "no",
    "unknown"
   ],
   "required_by": [
    "3.3"
   ],
   "computed": true
  },
  {
   "key": "unidentified_pct",
   "name": "Share held by nobody identified (%)",
   "values": [],
   "required_by": [
    "3.3"
   ],
   "computed": true,
   "numeric": true
  },
  {
   "key": "registry_age_months",
   "name": "Registry filing age (months)",
   "values": [],
   "required_by": [
    "3.5"
   ],
   "computed": true,
   "numeric": true
  }
 ],
 "findings": [
  {
   "id": "dead-msb-licensed",
   "kind": "contradiction",
   "rule_ids": [
    "msb-licensed",
    "industry-restricted"
   ],
   "sop_refs": [
    "5.3",
    "5.2",
    "2.1"
   ],
   "title": "5.3 can never decide a case",
   "example": "",
   "example_facts": [],
   "explain": "Whenever 5.3 applies, 5.2 applies too, and 2.1 says the most severe outcome governs. So no case is ever decided by 5.3.",
   "proof": {
    "asks": "Is there any case with up to 9 items in each list where 5.3 applies and decides the outcome?",
    "code": "solver.add(applies(\"msb-licensed\"), outcome.eq(\"approve\"))",
    "answer": "unsat",
    "ms": 1
   },
   "question": null,
   "options": [],
   "answer": null
  },
  {
   "id": "unknown-id-verified",
   "kind": "unknowns",
   "rule_ids": [
    "id-verified"
   ],
   "sop_refs": [
    "3.4",
    "2.2"
   ],
   "title": "3.4 treats an unknown fact differently from 2.2",
   "example": "id verified for person 1 is unknown. If id verified for person 1 turned out \"yes\", 3.4 would not apply.",
   "example_facts": [
    {
     "key": "id_verified",
     "name": "id verified",
     "value": "unknown",
     "list": "people",
     "item": 1
    }
   ],
   "explain": "In this case 3.4 leads to request docs only because a fact is unknown. 2.2 says a case with an unknown fact is incomplete, and 2.1 ranks request docs above incomplete, so 3.4 wins.",
   "proof": {
    "asks": "Is there a case (with any number of people and up to 6 excluded owners) that 3.4 decides, but that it would not apply to, and that would come out differently, once its unknown facts are known?",
    "code": "solver.add(completes(c, known), applies(\"id-verified\", c), outcome(c).eq(\"request_docs\"), Not(applies(\"id-verified\", known)), outcome(known).neq(\"request_docs\"))",
    "answer": "sat",
    "ms": 36
   },
   "question": null,
   "options": [],
   "answer": null
  },
  {
   "id": "unused-licence_verified",
   "kind": "contradiction",
   "rule_ids": [
    "msb-licensed"
   ],
   "sop_refs": [
    "5.3"
   ],
   "title": "Licence verified never changes an outcome",
   "example": "",
   "example_facts": [],
   "explain": "Only 5.3 uses licence verified, and no case's outcome depends on it. Collecting it is wasted work unless a rule changes.",
   "proof": {
    "asks": "Are there two cases with up to 9 items in each list that differ only in licence verified and get different outcomes?",
    "code": "solver.add(sameExcept(\"licence_verified\", a, b), outcome(a).neq(outcome(b)))",
    "answer": "unsat",
    "ms": 2
   },
   "question": null,
   "options": [],
   "answer": null
  }
 ],
 "applied": [],
 "past_cases": []
}
export const CASES = {
 "skill_version": null,
 "cases": [
  {
   "id": "EX-1",
   "name": "Northwind Coffee Co. LLC",
   "outcome": "escalate",
   "decided_by": "4.3: A politically exposed person among the identified individuals: escalate.",
   "missing": [],
   "notes": [],
   "ownership": {
    "holders": [
     {
      "pct": 35,
      "source": "cap_table.md p.1",
      "name": "Dana Ruiz",
      "type": "person",
      "verified": true
     },
     {
      "pct": 40,
      "source": "cap_table.md p.1",
      "name": "Halcyon Holdings LLC",
      "type": "entity",
      "owners": [
       {
        "pct": 100,
        "source": "halcyon_certification.md p.1",
        "name": "Priya Shah",
        "type": "person",
        "verified": true
       }
      ]
     },
     {
      "pct": 25,
      "source": "cap_table.md p.1",
      "name": "Wei Lee",
      "type": "person",
      "verified": true
     }
    ],
    "unaccounted_pct": 0
   },
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "US",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "normal",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "unknown",
     "source": "",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2026-03-02",
     "source": "registry.md p.1",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Dana Ruiz, Managing Member",
     "source": "operating_agreement.md p.3"
    },
    {
     "key": "residence",
     "name": "Residence (Dana Ruiz)",
     "value": "US",
     "source": "idv_dana_ruiz.json",
     "how": "lookup",
     "person": "Dana Ruiz"
    },
    {
     "key": "id_verified",
     "name": "ID check (Dana Ruiz)",
     "value": "yes",
     "source": "idv_dana_ruiz.json",
     "how": "lookup",
     "person": "Dana Ruiz"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Dana Ruiz)",
     "value": "none",
     "source": "screening_dana_ruiz.json",
     "how": "lookup",
     "person": "Dana Ruiz"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Dana Ruiz)",
     "value": "no",
     "source": "screening_dana_ruiz.json",
     "how": "lookup",
     "person": "Dana Ruiz"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Dana Ruiz)",
     "value": "no",
     "source": "screening_dana_ruiz.json",
     "how": "lookup",
     "person": "Dana Ruiz"
    },
    {
     "key": "residence",
     "name": "Residence (Wei Lee)",
     "value": "US",
     "source": "idv_wei_lee.json",
     "how": "lookup",
     "person": "Wei Lee"
    },
    {
     "key": "id_verified",
     "name": "ID check (Wei Lee)",
     "value": "yes",
     "source": "idv_wei_lee.json",
     "how": "lookup",
     "person": "Wei Lee"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Wei Lee)",
     "value": "none",
     "source": "screening_wei_lee.json",
     "how": "lookup",
     "person": "Wei Lee"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Wei Lee)",
     "value": "no",
     "source": "screening_wei_lee.json",
     "how": "lookup",
     "person": "Wei Lee"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Wei Lee)",
     "value": "no",
     "source": "screening_wei_lee.json",
     "how": "lookup",
     "person": "Wei Lee"
    },
    {
     "key": "residence",
     "name": "Residence (Priya Shah)",
     "value": "US",
     "source": "idv_priya_shah.json",
     "how": "lookup",
     "person": "Priya Shah"
    },
    {
     "key": "id_verified",
     "name": "ID check (Priya Shah)",
     "value": "yes",
     "source": "idv_priya_shah.json",
     "how": "lookup",
     "person": "Priya Shah"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Priya Shah)",
     "value": "none",
     "source": "screening_priya_shah.json",
     "how": "lookup",
     "person": "Priya Shah"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Priya Shah)",
     "value": "yes",
     "source": "screening_priya_shah.json",
     "how": "lookup",
     "person": "Priya Shah"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Priya Shah)",
     "value": "no",
     "source": "screening_priya_shah.json",
     "how": "lookup",
     "person": "Priya Shah"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "escalate",
    "spec_outcome": "escalate",
    "flags": [
     "Priya Shah owns 40% but isn't on the customer's certification.",
     "The certification lists Halcyon Holdings LLC, a company, where it asks for individuals."
    ]
   }
  },
  {
   "id": "EX-2",
   "name": "Bluefin Logistics LLC",
   "outcome": "request_docs",
   "decided_by": "3.3: Unless the entity is excluded or is a nonprofit, identify every individual who owns 25% or more of the entity, directly or indirectly. Ownership is complete only when no unidentified person could own 25% or more, given the shares that are unaccounted for or held through entities whose owners are unknown. If an excluded entity owns 25% or more, no individual needs to be identified for that share. If ownership is not complete, request documents.",
   "missing": [
    "Find who holds 30% (300 Class B (non-voting, economic) units). 30% is held by nobody identified, so someone unidentified could own 25% or more (3.3)."
   ],
   "notes": [],
   "ownership": {
    "holders": [
     {
      "pct": 45,
      "source": "cap_table.md p.1",
      "name": "Marcus Bell",
      "type": "person",
      "verified": true
     },
     {
      "pct": 25,
      "source": "cap_table.md p.1",
      "name": "Ana Okafor",
      "type": "person",
      "verified": true
     },
     {
      "pct": 30,
      "source": "company_agreement.md p.1",
      "name": "Unidentified holders",
      "type": "pool"
     }
    ],
    "unaccounted_pct": 30
   },
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "US",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "normal",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "unknown",
     "source": "",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2026-05-09",
     "source": "registry.md p.1",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Marcus Bell, President",
     "source": "company_agreement.md p.2"
    },
    {
     "key": "residence",
     "name": "Residence (Marcus Bell)",
     "value": "US",
     "source": "idv_marcus_bell.json",
     "how": "lookup",
     "person": "Marcus Bell"
    },
    {
     "key": "id_verified",
     "name": "ID check (Marcus Bell)",
     "value": "yes",
     "source": "idv_marcus_bell.json",
     "how": "lookup",
     "person": "Marcus Bell"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Marcus Bell)",
     "value": "none",
     "source": "screening_marcus_bell.json",
     "how": "lookup",
     "person": "Marcus Bell"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Marcus Bell)",
     "value": "no",
     "source": "screening_marcus_bell.json",
     "how": "lookup",
     "person": "Marcus Bell"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Marcus Bell)",
     "value": "no",
     "source": "screening_marcus_bell.json",
     "how": "lookup",
     "person": "Marcus Bell"
    },
    {
     "key": "residence",
     "name": "Residence (Ana Okafor)",
     "value": "US",
     "source": "idv_ana_okafor.json",
     "how": "lookup",
     "person": "Ana Okafor"
    },
    {
     "key": "id_verified",
     "name": "ID check (Ana Okafor)",
     "value": "yes",
     "source": "idv_ana_okafor.json",
     "how": "lookup",
     "person": "Ana Okafor"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Ana Okafor)",
     "value": "none",
     "source": "screening_ana_okafor.json",
     "how": "lookup",
     "person": "Ana Okafor"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Ana Okafor)",
     "value": "no",
     "source": "screening_ana_okafor.json",
     "how": "lookup",
     "person": "Ana Okafor"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Ana Okafor)",
     "value": "no",
     "source": "screening_ana_okafor.json",
     "how": "lookup",
     "person": "Ana Okafor"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "request_docs",
    "spec_outcome": "request_docs",
    "flags": []
   }
  },
  {
   "id": "EX-3",
   "name": "Cedar Ridge Payments, Inc.",
   "outcome": "escalate",
   "decided_by": "5.2: Restricted industries (money services businesses, virtual currency): escalate.",
   "missing": [],
   "notes": [],
   "ownership": {
    "holders": [
     {
      "pct": 60,
      "source": "shareholder_register.md p.1",
      "name": "Rafael Ortiz",
      "type": "person",
      "verified": true
     },
     {
      "pct": 40,
      "source": "shareholder_register.md p.1",
      "name": "Helen Cho",
      "type": "person",
      "verified": true
     }
    ],
    "unaccounted_pct": 0
   },
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "US",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "msb",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "yes",
     "source": "licence_lookup.json",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2026-01-30",
     "source": "registry.md p.1",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Rafael Ortiz, Chief Executive Officer",
     "source": "bylaws_officers.md p.1"
    },
    {
     "key": "residence",
     "name": "Residence (Rafael Ortiz)",
     "value": "US",
     "source": "idv_rafael_ortiz.json",
     "how": "lookup",
     "person": "Rafael Ortiz"
    },
    {
     "key": "id_verified",
     "name": "ID check (Rafael Ortiz)",
     "value": "yes",
     "source": "idv_rafael_ortiz.json",
     "how": "lookup",
     "person": "Rafael Ortiz"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Rafael Ortiz)",
     "value": "none",
     "source": "screening_rafael_ortiz.json",
     "how": "lookup",
     "person": "Rafael Ortiz"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Rafael Ortiz)",
     "value": "no",
     "source": "screening_rafael_ortiz.json",
     "how": "lookup",
     "person": "Rafael Ortiz"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Rafael Ortiz)",
     "value": "no",
     "source": "screening_rafael_ortiz.json",
     "how": "lookup",
     "person": "Rafael Ortiz"
    },
    {
     "key": "residence",
     "name": "Residence (Helen Cho)",
     "value": "US",
     "source": "idv_helen_cho.json",
     "how": "lookup",
     "person": "Helen Cho"
    },
    {
     "key": "id_verified",
     "name": "ID check (Helen Cho)",
     "value": "yes",
     "source": "idv_helen_cho.json",
     "how": "lookup",
     "person": "Helen Cho"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Helen Cho)",
     "value": "none",
     "source": "screening_helen_cho.json",
     "how": "lookup",
     "person": "Helen Cho"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Helen Cho)",
     "value": "no",
     "source": "screening_helen_cho.json",
     "how": "lookup",
     "person": "Helen Cho"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Helen Cho)",
     "value": "no",
     "source": "screening_helen_cho.json",
     "how": "lookup",
     "person": "Helen Cho"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "escalate",
    "spec_outcome": "escalate",
    "flags": []
   }
  },
  {
   "id": "EX-4",
   "name": "Larkspur Health Foundation",
   "outcome": "request_docs",
   "decided_by": "3.5: The entity's registry filing must be less than 12 months old. Otherwise request documents.",
   "missing": [
    "Get a current registry filing. The latest is 14 months old, and 3.5 needs under 12."
   ],
   "notes": [],
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "US",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "yes",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "normal",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "unknown",
     "source": "",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2025-08-14",
     "source": "registry.md p.2",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Maria Gomez",
     "source": "board_resolution.md p.1"
    },
    {
     "key": "residence",
     "name": "Residence (Maria Gomez)",
     "value": "US",
     "source": "idv_maria_gomez.json",
     "how": "lookup",
     "person": "Maria Gomez"
    },
    {
     "key": "id_verified",
     "name": "ID check (Maria Gomez)",
     "value": "yes",
     "source": "idv_maria_gomez.json",
     "how": "lookup",
     "person": "Maria Gomez"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Maria Gomez)",
     "value": "none",
     "source": "screening_maria_gomez.json",
     "how": "lookup",
     "person": "Maria Gomez"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Maria Gomez)",
     "value": "no",
     "source": "screening_maria_gomez.json",
     "how": "lookup",
     "person": "Maria Gomez"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Maria Gomez)",
     "value": "no",
     "source": "screening_maria_gomez.json",
     "how": "lookup",
     "person": "Maria Gomez"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "request_docs",
    "spec_outcome": "request_docs",
    "flags": [
     "Maria Gomez is the control person on the agent's reading of what Maria Gomez does (\"the Executive Director reports to the Board and manages the day-to-day affairs of the Foundation\"). A person should confirm it meets 3.2."
    ]
   }
  },
  {
   "id": "EX-5",
   "name": "Opal Trading GmbH",
   "outcome": "decline",
   "decided_by": "6.1: The entity or any identified individual is located in a comprehensively sanctioned country: decline.",
   "missing": [],
   "notes": [],
   "ownership": {
    "holders": [
     {
      "pct": 70,
      "source": "shareholder_list.md p.1",
      "name": "Jonas Weber",
      "type": "person",
      "verified": true
     },
     {
      "pct": 30,
      "source": "shareholder_list.md p.1",
      "name": "Dariush Karimi",
      "type": "person",
      "verified": true
     }
    ],
    "unaccounted_pct": 0
   },
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "DE",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "normal",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "unknown",
     "source": "",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2026-02-23",
     "source": "registry.md p.1",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Jonas Weber",
     "source": "registry.md p.1"
    },
    {
     "key": "residence",
     "name": "Residence (Jonas Weber)",
     "value": "DE",
     "source": "idv_jonas_weber.json",
     "how": "lookup",
     "person": "Jonas Weber"
    },
    {
     "key": "id_verified",
     "name": "ID check (Jonas Weber)",
     "value": "yes",
     "source": "idv_jonas_weber.json",
     "how": "lookup",
     "person": "Jonas Weber"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Jonas Weber)",
     "value": "none",
     "source": "screening_jonas_weber.json",
     "how": "lookup",
     "person": "Jonas Weber"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Jonas Weber)",
     "value": "no",
     "source": "screening_jonas_weber.json",
     "how": "lookup",
     "person": "Jonas Weber"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Jonas Weber)",
     "value": "no",
     "source": "screening_jonas_weber.json",
     "how": "lookup",
     "person": "Jonas Weber"
    },
    {
     "key": "residence",
     "name": "Residence (Dariush Karimi)",
     "value": "IR",
     "source": "idv_dariush_karimi.md p.2",
     "how": "lookup",
     "person": "Dariush Karimi"
    },
    {
     "key": "id_verified",
     "name": "ID check (Dariush Karimi)",
     "value": "yes",
     "source": "idv_dariush_karimi.md p.1",
     "how": "lookup",
     "person": "Dariush Karimi"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Dariush Karimi)",
     "value": "none",
     "source": "screening_dariush_karimi.json",
     "how": "lookup",
     "person": "Dariush Karimi"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Dariush Karimi)",
     "value": "no",
     "source": "screening_dariush_karimi.json",
     "how": "lookup",
     "person": "Dariush Karimi"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Dariush Karimi)",
     "value": "no",
     "source": "screening_dariush_karimi.json",
     "how": "lookup",
     "person": "Dariush Karimi"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "decline",
    "spec_outcome": "decline",
    "flags": [
     "Documents disagree on where Dariush Karimi lives: idv_dariush_karimi.md p.2 says IR, shareholder_list.md p.1 says DE. The file uses IR; a person should confirm.",
     "Jonas Weber is the control person on the agent's reading of what Jonas Weber does (\"Managing director (Gesch\u00e4ftsf\u00fchrer): Weber, Jonas, Hamburg, born 1982-10-08, sole representation.\"). A person should confirm it meets 3.2."
    ]
   }
  },
  {
   "id": "EX-6",
   "name": "Sable & Finch LLC",
   "outcome": "escalate",
   "decided_by": "4.3: A politically exposed person among the identified individuals: escalate.",
   "missing": [
    "Sanctions for Thomas Finch is still unknown, and 4.1 and 4.2 need it."
   ],
   "notes": [
    "4.1 could still apply once sanctions for Thomas Finch is known, and would mean decline."
   ],
   "ownership": {
    "holders": [
     {
      "pct": 50,
      "source": "operating_agreement.md p.1",
      "name": "Elena Sable",
      "type": "person",
      "verified": true
     },
     {
      "pct": 50,
      "source": "operating_agreement.md p.1",
      "name": "Thomas Finch",
      "type": "person",
      "verified": true
     }
    ],
    "unaccounted_pct": 0
   },
   "facts": [
    {
     "key": "country",
     "name": "Country",
     "value": "US",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "excluded",
     "name": "Excluded entity",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "nonprofit",
     "name": "Nonprofit",
     "value": "no",
     "source": "application.md p.1",
     "how": "lookup"
    },
    {
     "key": "industry",
     "name": "Industry",
     "value": "normal",
     "source": "application.md p.2",
     "how": "judgment"
    },
    {
     "key": "licence_verified",
     "name": "Licence verified",
     "value": "unknown",
     "source": "",
     "how": "lookup"
    },
    {
     "key": "entity_sanctions",
     "name": "Sanctions screening (business)",
     "value": "none",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "entity_adverse_media",
     "name": "Adverse media (business)",
     "value": "no",
     "source": "screening_entity.json",
     "how": "lookup"
    },
    {
     "key": "registry_filed",
     "name": "Latest registry filing",
     "value": "2026-06-02",
     "source": "registry.md p.1",
     "how": "lookup"
    },
    {
     "key": "control_person",
     "name": "Control person",
     "how": "judgment",
     "value": "Elena Sable, Chief Executive Officer",
     "source": "operating_agreement.md p.2"
    },
    {
     "key": "residence",
     "name": "Residence (Elena Sable)",
     "value": "US",
     "source": "idv_elena_sable.json",
     "how": "lookup",
     "person": "Elena Sable"
    },
    {
     "key": "id_verified",
     "name": "ID check (Elena Sable)",
     "value": "yes",
     "source": "idv_elena_sable.json",
     "how": "lookup",
     "person": "Elena Sable"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Elena Sable)",
     "value": "none",
     "source": "screening_elena_sable.json",
     "how": "lookup",
     "person": "Elena Sable"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Elena Sable)",
     "value": "yes",
     "source": "screening_elena_sable.json",
     "how": "lookup",
     "person": "Elena Sable"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Elena Sable)",
     "value": "no",
     "source": "screening_elena_sable.json",
     "how": "lookup",
     "person": "Elena Sable"
    },
    {
     "key": "residence",
     "name": "Residence (Thomas Finch)",
     "value": "US",
     "source": "idv_thomas_finch.json",
     "how": "lookup",
     "person": "Thomas Finch"
    },
    {
     "key": "id_verified",
     "name": "ID check (Thomas Finch)",
     "value": "yes",
     "source": "idv_thomas_finch.json",
     "how": "lookup",
     "person": "Thomas Finch"
    },
    {
     "key": "sanctions",
     "name": "Sanctions screening (Thomas Finch)",
     "value": "unknown",
     "source": "screening_thomas_finch.json",
     "how": "lookup",
     "person": "Thomas Finch"
    },
    {
     "key": "pep",
     "name": "Politically exposed (Thomas Finch)",
     "value": "no",
     "source": "screening_thomas_finch.json",
     "how": "lookup",
     "person": "Thomas Finch"
    },
    {
     "key": "adverse_media",
     "name": "Adverse media (Thomas Finch)",
     "value": "no",
     "source": "screening_thomas_finch.json",
     "how": "lookup",
     "person": "Thomas Finch"
    }
   ],
   "check": {
    "passed": true,
    "outcome_follows": true,
    "problems": [],
    "expected": "escalate",
    "spec_outcome": "escalate",
    "flags": []
   }
  }
 ]
}
export const STATUS = {
 "stage": 2,
 "state": "needs_review",
 "activity": "3 of 3 findings on the rules need an answer; the rules give the file's outcome in 6 of 6 cases, and 3 have something for a person to check."
}
