// What the pane works with: the files in .resolve/ (types/files.d.ts, their one description) after hooks/files.ts has
// read them. A file can be partial, so the reader fills a missing list and leaves out what it can't use; these types
// are what's left, and differ from the files only where the reader loosens or fills something.
import type * as File from './files'

export type Outcome = File.OutcomeName

// What pnpm resolve works out for each option before the owner answers (core/impact.ts). The reader gives every entry
// its lists; an option Resolve couldn't check has problems and nothing else.
export type Impact = Omit<File.CheckedImpact, 'problems'> & { problems: string[] }

// An edit line as the pane reads it: only which rule, list or outcome it changes (types/files.d.ts has the whole line).
export type SpecEdit = { op: string; rule?: { id: string }; id?: string; list?: string; key?: string }

// A finding as read. Z3's own parts may be missing from a hand-written or older file; the sample also draws an ownership
// table on a finding.
export type Finding = Omit<File.FindingEntry, 'rule_ids' | 'example_facts' | 'proof' | 'impact' | 'option_edits'> & {
  rule_ids?: string[]
  example_facts?: File.ExampleFact[]
  proof?: File.FindingEntry['proof']
  impact?: Impact[]
  option_edits?: { option: string; says: string; edits?: SpecEdit[] }[]
  ownership?: Ownership | null
}

export type PastCase = File.PastCaseEntry

export type Spec = Omit<File.SpecJson, 'findings'> & { findings: Finding[] }

export type Fact = File.FactLine
export type Holder = File.HolderEntry
export type Ownership = NonNullable<File.CaseEntry['ownership']>
export type CaseFile = File.CaseEntry
export type Round = File.RoundEntry
export type Answer = File.AnswerLine

// status.json as read: the writer's stage is 1 to 3, and its time of writing isn't used.
export type Status = Omit<File.StatusJson, 'stage' | 'updated_at'> & { stage: number; updated_at?: string }

export type RunData = {
  source: 'sample' | 'folder'
  spec: Spec | null
  cases: File.CasesJson | null
  rounds: File.RoundsJson | null
  answers: Answer[]
  status: Status | null
  problems?: string[]   // files in .resolve/ that couldn't be read, each in a sentence (hooks/files.ts)
  checkout?: boolean    // with no run yet: whether the project is a Resolve checkout that pnpm start can fill
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
      sampleAnswers: Answer[]             // presses on the built-in sample run, kept here and never written to answers.jsonl
    }
  }
}
