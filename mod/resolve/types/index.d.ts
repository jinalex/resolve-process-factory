export type Outcome = 'approve' | 'incomplete' | 'request_docs' | 'escalate' | 'decline'

export type Finding = {
  id: string
  kind: 'gap' | 'contradiction' | 'unknowns' | 'judgment' | 'uncovered'
  sop_refs: string[]
  title: string
  example: string
  example_facts?: { key: string; name: string; value: string }[]
  ownership?: Ownership | null
  explain: string
  question: string
  options: string[]
  answer: { choice: string; at: string } | null
}

export type PastCase = {
  case_id: string
  name: string
  past_decision: Outcome
  spec_decision: Outcome
  why: string
  verdict: 'past_right' | 'spec_right' | null
}

export type Spec = {
  version: number
  approved: boolean
  sop: { ref: string; text: string; rules: string[] }[]
  rules: { id: string; says: string; sop_refs: string[]; code?: string }[]
  findings: Finding[]
  facts?: { key: string; name: string; values: string[]; required_by: string[]; evidence: string }[]
  changes_from_previous?: { from: Outcome; to: Outcome; example: string; example_facts?: { key: string; name: string; value: string }[] }[]
  past_cases: PastCase[]
}

export type Fact = {
  key?: string
  name: string
  value: string
  source: string
  how: 'lookup' | 'judgment'
  by?: string
  confidence?: number
}

export type Holder = {
  name: string
  type: 'person' | 'entity' | 'pool'
  pct: number
  verified?: boolean
  owners?: Holder[] | null
  source: string
}

export type Ownership = { holders: Holder[]; unaccounted_pct: number }

export type CaseFile = {
  id: string
  name: string
  outcome: Outcome
  decided_by: string
  missing: string[]
  tool_calls: number
  ownership?: Ownership
  check?: { passed: boolean; problems: string[]; expected?: Outcome }
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

export type Answer =
  | { type: 'finding'; id: string; choice: string; at: string }
  | { type: 'past_case'; case_id: string; verdict: 'past_right' | 'spec_right'; at: string }
  | { type: 'approve_spec'; version: number; at: string }
  | { type: 'accept_skill'; version: number; at: string }

export type RunData = {
  source: 'sample' | 'folder'
  spec: Spec | null
  cases: { skill_version: number; cases: CaseFile[] } | null
  rounds: { accepted_version: number | null; rounds: Round[] } | null
  answers: Answer[]
}

export type Tab = 'spec' | 'process' | 'improve'

declare module 'claude-code' {
  interface PluginState {
    'resolve': {
      tab: Tab
      data: Shaped<RunData | null>
      openCase: string | null
      showSop: boolean
    }
  }
}
