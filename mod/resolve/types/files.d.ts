// The files in .resolve/, exactly as the logic writes them (spec.json, cases.json, status.json, rounds.json) and as the
// pane writes them (answers.jsonl). This is the one description of their shape: core/pane.ts, packs/*/pane.ts,
// drafting/write-options.ts and bench/improve.ts check what they write against it with `import type`, and the pane's
// reader (hooks/files.ts) reads it. docs/INTERFACE.md says what each field means. Types only: nothing here runs, so
// the mod can be installed from mod/resolve alone and core still type-checks against it.

// A spec's outcome names (KYB: decline, escalate, request_docs, incomplete, approve), most severe first in order.
export type OutcomeName = string

// ---- spec.json -------------------------------------------------------------------------------------------------

// What Resolve worked out for one option before the owner answers (core/impact.ts). `of` ties it to the spec and edit
// it was worked out for. An option Resolve couldn't check has only its name, its problems and `of`.
export type CheckedImpact = {
  option: string
  problems: []
  keeps_rules: boolean
  resolves: boolean
  new_findings: { id: string; title: string }[]
  changes: { from: OutcomeName; to: OutcomeName; example: string; example_facts?: ExampleFact[] }[]
  searched_items_per_list: number | null
  flips: { case_id: string; name: string; from: OutcomeName; to: OutcomeName }[]
  matches_past: number | null
  past_decided: number
  ms?: number
  of?: string
}
export type UncheckedImpact = { option: string; problems: string[]; of?: string }
export type ImpactEntry = CheckedImpact | UncheckedImpact

// One change an option makes to the spec, as core/spec-edit.ts writes it. A rule's `when` and a list's `counts_when`
// are conditions in core/spec.ts's format; the pane reads only which rule, list or outcome an edit changes.
export type RuleLine = { id: string; sop: string; text: string; when: unknown; then: OutcomeName }
export type SpecEditLine =
  | { op: 'replace_rule' | 'add_rule'; rule: RuleLine }
  | { op: 'remove_rule'; id: string }
  | { op: 'set_order'; order: OutcomeName[] }
  | { op: 'set_unknowns'; then: OutcomeName }
  | { op: 'set_counts_when'; list: string; counts_when: unknown }
  | { op: 'set_list'; key: string; values: string[] }

export type ExampleFact = { key: string; name: string; value: string; list?: string; item?: number; read_by_change?: true }

export type FindingEntry = {
  id: string
  kind: 'gap' | 'contradiction' | 'unknowns' | 'judgment' | 'uncovered'
  rule_ids: string[]
  sop_refs: string[]
  title: string
  example: string
  example_facts: ExampleFact[]
  explain: string
  proof: { asks: string; code: string; answer: 'sat' | 'unsat' | 'unknown'; ms: number }
  // Claude writes the question and options after Z3's findings come in; the owner's answer, or one carried from an
  // earlier version (in_version), comes after that.
  question: string | null
  options: string[]
  answer: { choice: string; at: string; in_version?: number } | null
  option_edits?: { option: string; says: string; edits?: SpecEditLine[] }[]
  impact?: ImpactEntry[]
  severity?: 'high' | 'normal'
}

export type FactEntry = {
  key: string
  name: string
  values: string[]
  required_by: string[]
  per?: string                              // the list whose items the fact is about; absent: the case's
  computed?: true                           // worked out by the pack, not gathered
  numeric?: true
  sop_words?: Record<string, string[]>      // the SOP's own words for each value
  evidence?: string
}

export type PastCaseEntry = {
  case_id: string
  name: string
  past_decision: OutcomeName | null         // the team's decision; null when no team decided the case
  previous_spec_decision?: OutcomeName | null
  spec_decision: OutcomeName
  why: string
  verdict: 'past_right' | 'spec_right' | null
}

export type SpecJson = {
  domain?: string                           // absent in files written before it was added, and in the built-in sample
  version: number
  spec_hash?: string
  approved: boolean
  order?: OutcomeName[]                     // most severe first; absent in files written before it was added
  sop_title?: string
  sop_doc?: string
  sop: { ref: string; text: string; rules: string[]; covered?: boolean }[]
  rules: { id: string; says: string; then?: OutcomeName; sop_refs: string[]; code?: string }[]
  facts?: FactEntry[]
  findings: FindingEntry[]
  applied?: { id: string; question?: string; choice?: string; applied_in: number }[]
  changes_from_previous?: { from: OutcomeName; to: OutcomeName; example: string; example_facts?: ExampleFact[] }[]
  past_cases: PastCaseEntry[]
}

// ---- cases.json ------------------------------------------------------------------------------------------------

export type FactLine = {
  key?: string
  name: string
  value: string
  source: string
  how: 'lookup' | 'judgment'
  by?: string
  confidence?: number
  person?: string
  problem?: string
}

export type HolderEntry = {
  name: string
  type: 'person' | 'entity' | 'pool'
  pct: number | string                      // as the case file writes it; a share that isn't a percentage stays text
  verified?: boolean
  owners?: HolderEntry[] | null             // null: nobody has found them; absent: none are needed (an excluded entity)
  source: string
}

export type CaseEntry = {
  id: string
  name: string
  outcome: OutcomeName
  decided_by: string
  missing: string[]
  notes?: string[]
  tool_calls?: number | null
  ownership?: { holders: HolderEntry[]; unaccounted_pct: number | null }   // null: a share couldn't be read
  // outcome_follows is Resolve's own check. problems and flags come from a pack's example evidence checks.
  check?: { passed: boolean; outcome_follows?: boolean; spec_outcome?: OutcomeName; problems: string[]; flags?: string[]; expected?: OutcomeName }
  facts: FactLine[]
}

export type CasesJson = { skill_version: number | null; cases: CaseEntry[] }

// ---- status.json -----------------------------------------------------------------------------------------------

export type StatusJson = {
  stage: 1 | 2 | 3
  state: 'working' | 'needs_review' | 'waiting' | 'done' | 'failed'
  activity: string
  progress?: [number, number]
  updated_at: string
}

// ---- rounds.json -----------------------------------------------------------------------------------------------

export type RoundEntry = {
  n: number
  skill_version: number
  passed: number
  correct?: number
  total: number
  got_worse: string[]
  groups: { cause: string; cases: string[]; change: string }[]
  back_to_spec: string[]
  // The agent setup a round ran (model, effort, review notes), what it cost, and whether to take it over the best setup
  // so far (compared_to). The round in use has no compared_to.
  setup?: string
  model?: string
  effort?: string
  runs?: number
  usd_per_case?: number
  turns_per_case?: number
  evidence_calls_per_case?: number
  s_per_case?: number
  compared_to?: number
  recommendation?: { accept: boolean; text: string }
}

export type RoundsJson = { accepted_version: number | null; best_version?: number; rounds: RoundEntry[] }

// ---- answers.jsonl (written by the pane, one line a press) -----------------------------------------------------

// Every line carries the spec version it answers.
export type AnswerLine = { spec_version?: number | null; spec_hash?: string; at: string } & (
  | { type: 'finding'; id: string; rule_ids?: string[]; choice: string }
  | { type: 'past_case'; case_id: string; verdict: 'past_right' | 'spec_right' }
  | { type: 'approve_spec'; version: number }
  | { type: 'accept_skill'; version: number; setup?: string }
  | { type: 'send'; ids: string[] }
)
