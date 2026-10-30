export type Outcome = 'approve' | 'incomplete' | 'request_docs' | 'escalate' | 'decline'

// What pnpm resolve works out for each option before the owner answers (core/impact.ts).
export type Impact = {
  option: string
  problems: string[]
  keeps_rules: boolean
  resolves: boolean
  new_findings: { id: string; title: string }[]
  changes: { from: Outcome; to: Outcome; example: string }[]
  searched_items_per_list: number | null
  flips: { case_id: string; name: string; from: Outcome; to: Outcome }[]
  matches_past: number | null
  past_decided: number
}

export type Finding = {
  id: string
  kind: 'gap' | 'contradiction' | 'unknowns' | 'judgment' | 'uncovered'
  sop_refs: string[]
  title: string
  example: string
  example_facts?: { key: string; name: string; value: string; list?: string; item?: number }[]
  rule_ids?: string[]
  ownership?: Ownership | null
  explain: string
  question: string | null   // Claude writes the question and options after Z3's findings come in
  options: string[]
  answer: { choice: string; at: string } | null
  option_edits?: { option: string; says: string }[]   // `says` is shown under the option; the edits are the logic's
  impact?: Impact[]
  severity?: 'high' | 'normal'
  proof?: { asks: string; code: string; answer: 'sat' | 'unsat' | 'unknown'; ms: number }   // behind "Show the logic"
}

export type PastCase = {
  case_id: string
  name: string
  past_decision: Outcome | null            // the team's decision; null when no team decided the case
  previous_spec_decision?: Outcome | null  // on a later version: what the version before gave
  spec_decision: Outcome
  why: string
  verdict: 'past_right' | 'spec_right' | null
}

export type Spec = {
  version: number
  sop_title?: string
  spec_hash?: string
  approved: boolean
  sop: { ref: string; text: string; rules: string[]; covered?: boolean }[]
  rules: { id: string; says: string; then?: string; sop_refs: string[]; code?: string }[]
  findings: Finding[]
  facts?: { key: string; name: string; values: string[]; required_by: string[]; evidence?: string }[]
  changes_from_previous?: { from: Outcome; to: Outcome; example: string; example_facts?: { key: string; name: string; value: string }[] }[]
  past_cases: PastCase[]
  applied?: { id: string; question?: string; choice?: string; applied_in: number }[]
}

export type Fact = {
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

export type Holder = {
  name: string
  type: 'person' | 'entity' | 'pool'
  pct: number
  verified?: boolean
  owners?: Holder[] | null   // null: nobody has found them; absent: none are needed (an excluded entity)
  source: string
}

export type Ownership = { holders: Holder[]; unaccounted_pct: number | null }   // null: a share couldn't be read

export type CaseFile = {
  id: string
  name: string
  outcome: Outcome
  decided_by: string
  missing: string[]
  notes?: string[]
  tool_calls?: number | null
  ownership?: Ownership
  // outcome_follows is Resolve's own check. problems and flags come from a pack's example evidence checks.
  check?: { passed: boolean; outcome_follows?: boolean; spec_outcome?: Outcome; problems: string[]; flags?: string[]; expected?: Outcome }
  facts: Fact[]
}

export type Round = {
  n: number
  skill_version: number
  passed: number
  correct?: number
  total: number
  got_worse: string[]
  groups: { cause: string; cases: string[]; change: string }[]
  back_to_spec: string[]
}

// Every line carries the spec version it answers (docs/INTERFACE.md).
export type Answer = { spec_version?: number | null; spec_hash?: string; at: string } & (
  | { type: 'finding'; id: string; rule_ids?: string[]; choice: string }
  | { type: 'past_case'; case_id: string; verdict: 'past_right' | 'spec_right' }
  | { type: 'approve_spec'; version: number }
  | { type: 'accept_skill'; version: number }
  | { type: 'send'; ids: string[] }
)

export type Status = { stage: number; state: 'working' | 'needs_review' | 'waiting' | 'done' | 'failed'; activity: string; progress?: [number, number] }

export type RunData = {
  source: 'sample' | 'folder' | 'tour'
  spec: Spec | null
  cases: { skill_version: number | null; cases: CaseFile[] } | null
  rounds: { accepted_version: number | null; rounds: Round[] } | null
  answers: Answer[]
  status: Status | null
}

export type Tab = 'spec' | 'process' | 'improve'

declare module 'claude-code' {
  interface PluginState {
    'resolve': {
      tab: Tab
      data: Shaped<RunData | null>
      openCase: string | null
      showSop: boolean                    // the spec view (how the SOP became rules) is open
      focus: string | null                // the item drawn as NEXT when the person picked one; null: the top of the queue
      shown: Record<string, boolean>      // which toggles are open: why:<id>, details:<id>, logic:<id>, clean, done, z3
      hilite: string[]                    // SOP sections marked in the spec view, when it was opened from a finding
      tour: number | null                 // the onboarding tour's step, or null when it isn't running
      tourPick: Record<string, string>    // what the person pressed on the tour's current step, by finding id
    }
  }
}
