// Sample run shown before any real data exists. In the shape docs/INTERFACE.md describes.
export const SAMPLE = {
 "spec": {
  "version": 2,
  "approved": false,
  "sop": [
   {
    "ref": "2.1",
    "text": "When more than one section applies, the most severe outcome governs: Decline, then Escalate, then Request documents, then Incomplete, then Approve.",
    "rules": [
     "severity-order"
    ]
   },
   {
    "ref": "2.2",
    "text": "A fact that has not been established is unknown, not false. If any fact required by this procedure is unknown, the case cannot be approved.",
    "rules": [
     "unknown-blocks-approve"
    ]
   },
   {
    "ref": "3.1",
    "text": "Entities on the excluded list do not require beneficial owners to be identified.",
    "rules": [
     "excluded"
    ]
   },
   {
    "ref": "3.2",
    "text": "For every other entity, identify one control person. If no control person is identified, request documents.",
    "rules": [
     "control-person"
    ]
   },
   {
    "ref": "3.3",
    "text": "Unless the entity is excluded or is a nonprofit, identify every individual who owns 25% or more, directly or indirectly. If ownership is not complete, request documents.",
    "rules": [
     "own-complete"
    ]
   },
   {
    "ref": "3.4",
    "text": "Verify the identity of every identified individual. If any is unverified, request documents.",
    "rules": [
     "ids-verified"
    ]
   },
   {
    "ref": "3.5",
    "text": "The entity's registry filing must be less than 12 months old. Otherwise request documents.",
    "rules": [
     "registry-fresh"
    ]
   },
   {
    "ref": "4.1",
    "text": "A confirmed sanctions match on the entity or any identified individual: decline.",
    "rules": [
     "sanctions-confirmed"
    ]
   },
   {
    "ref": "4.2",
    "text": "A potential sanctions match that has not been cleared: escalate.",
    "rules": [
     "sanctions-potential"
    ]
   },
   {
    "ref": "4.3",
    "text": "A politically exposed person among the identified individuals: escalate.",
    "rules": [
     "pep"
    ]
   },
   {
    "ref": "4.4",
    "text": "Adverse media on the entity or any identified individual: escalate.",
    "rules": [
     "adverse-media"
    ]
   },
   {
    "ref": "5.1",
    "text": "Prohibited industries: decline.",
    "rules": [
     "industry-prohibited"
    ]
   },
   {
    "ref": "5.2",
    "text": "Restricted industries (money services businesses, virtual currency): escalate.",
    "rules": [
     "industry-restricted"
    ]
   },
   {
    "ref": "5.3",
    "text": "Licensed money services businesses whose state licence has been verified may be approved.",
    "rules": [
     "msb-licensed"
    ]
   },
   {
    "ref": "6.1",
    "text": "Located in a comprehensively sanctioned country: decline.",
    "rules": [
     "geo-sanctioned"
    ]
   },
   {
    "ref": "6.2",
    "text": "Located in a FATF high-risk or increased-monitoring jurisdiction: escalate.",
    "rules": [
     "geo-highrisk"
    ]
   }
  ],
  "rules": [
   {
    "id": "severity-order",
    "says": "Pick the most severe outcome that applies: decline, escalate, request documents, incomplete, approve.",
    "sop_refs": [
     "2.1"
    ]
   },
   {
    "id": "unknown-blocks-approve",
    "says": "If any required fact is unknown, the case can't be approved.",
    "sop_refs": [
     "2.2"
    ]
   },
   {
    "id": "excluded",
    "says": "Excluded entities (banks, listed companies, registered funds) skip the ownership check.",
    "sop_refs": [
     "3.1"
    ]
   },
   {
    "id": "control-person",
    "says": "If no control person is identified, request documents.",
    "sop_refs": [
     "3.2"
    ]
   },
   {
    "id": "own-complete",
    "says": "If someone unidentified could still own 25% or more, request documents.",
    "sop_refs": [
     "3.3"
    ]
   },
   {
    "id": "ids-verified",
    "says": "If any identified person is unverified, request documents.",
    "sop_refs": [
     "3.4"
    ]
   },
   {
    "id": "registry-fresh",
    "says": "If the registry filing is 12 months old or more, request documents.",
    "sop_refs": [
     "3.5"
    ]
   },
   {
    "id": "sanctions-confirmed",
    "says": "Confirmed sanctions match on the business or any identified person: decline.",
    "sop_refs": [
     "4.1"
    ]
   },
   {
    "id": "sanctions-potential",
    "says": "Uncleared potential sanctions match: escalate.",
    "sop_refs": [
     "4.2"
    ]
   },
   {
    "id": "pep",
    "says": "A politically exposed person among the identified people: escalate.",
    "sop_refs": [
     "4.3"
    ]
   },
   {
    "id": "adverse-media",
    "says": "Adverse media on the business or any identified person: escalate.",
    "sop_refs": [
     "4.4"
    ]
   },
   {
    "id": "industry-prohibited",
    "says": "Prohibited industry: decline.",
    "sop_refs": [
     "5.1"
    ]
   },
   {
    "id": "industry-restricted",
    "says": "Money services or virtual currency: escalate.",
    "sop_refs": [
     "5.2"
    ]
   },
   {
    "id": "msb-licensed",
    "says": "Licensed MSB with a verified state licence: may approve.",
    "sop_refs": [
     "5.3"
    ]
   },
   {
    "id": "geo-sanctioned",
    "says": "Business or person in a sanctioned country: decline.",
    "sop_refs": [
     "6.1"
    ]
   },
   {
    "id": "geo-highrisk",
    "says": "Business or person in a FATF high-risk or monitored country: escalate.",
    "sop_refs": [
     "6.2"
    ]
   }
  ],
  "findings": [
   {
    "id": "msb-licence",
    "kind": "contradiction",
    "sop_refs": [
     "5.2",
     "5.3"
    ],
    "title": "Licensed MSBs can never be approved",
    "example": "A licensed money transmitter with a verified state licence and nothing else wrong.",
    "explain": "5.2 escalates every MSB, and escalate outranks approve, so 5.3 never decides a case.",
    "question": "Should a licensed MSB with a verified licence be approved?",
    "options": [
     "Yes, 5.3 wins",
     "No, always escalate MSBs"
    ],
    "answer": null,
    "example_facts": [
     {
      "key": "industry",
      "name": "Industry",
      "value": "msb"
     },
     {
      "key": "msb_licence",
      "name": "State licence verified",
      "value": "yes"
     },
     {
      "key": "sanctions",
      "name": "Sanctions screening",
      "value": "none"
     }
    ]
   },
   {
    "id": "unknown-id-verified",
    "kind": "unknowns",
    "sop_refs": [
     "3.4",
     "2.2",
     "2.1"
    ],
    "rule_ids": [
     "id-verified"
    ],
    "title": "A slow ID check gets the customer asked for documents",
    "example": "Screening is clear, but person 1's ID check hasn't come back yet.",
    "explain": "3.4 calls the person unverified and requests documents, which 2.1 ranks above incomplete. 2.2 says a fact that isn't established is unknown, so the case should be incomplete.",
    "question": "When an ID check hasn't come back yet, should the case be incomplete rather than a request for documents?",
    "options": [
     "Yes, incomplete",
     "No, request documents"
    ],
    "answer": null,
    "example_facts": [
     {
      "key": "id_verified",
      "name": "ID check",
      "value": "unknown",
      "list": "people",
      "item": 1
     }
    ]
   },
   {
    "id": "trust-owner",
    "kind": "gap",
    "sop_refs": [
     "3.3"
    ],
    "title": "Ownership through a trust",
    "example": "A family trust owns 40%. The trustee is known; the beneficiaries aren't.",
    "explain": "3.3 says 'directly or indirectly' but never says who counts as owning through a trust.",
    "question": "For a trust, who counts as the owner?",
    "options": [
     "The trustee",
     "Each beneficiary",
     "Both"
    ],
    "answer": null,
    "example_facts": [],
    "ownership": {
     "holders": [
      {
       "name": "Rivera Family Trust",
       "type": "entity",
       "pct": 40,
       "owners": null,
       "source": "Cap table"
      },
      {
       "name": "Elena Rivera",
       "type": "person",
       "pct": 60,
       "verified": true,
       "source": "Cap table"
      }
     ],
     "unaccounted_pct": 0
    }
   },
   {
    "id": "control-judgment",
    "kind": "judgment",
    "sop_refs": [
     "3.2"
    ],
    "title": "'Significant responsibility to control' is a judgment call",
    "example": "The filing lists a 'Head of Operations' and a 'Managing Member'.",
    "explain": "Logic can't decide who has significant control. A decision model reads the filings, and its call must give a reason: a role FinCEN lists, or a quote showing the person directs the business.",
    "question": "Is a quote showing what the person does enough, or must the role be one FinCEN lists?",
    "options": [
     "Either is enough",
     "A listed role only"
    ],
    "answer": {
     "choice": "Either is enough",
     "at": "2026-10-26T19:12:00Z"
    },
    "example_facts": []
   },
   {
    "id": "licence-evidence",
    "kind": "uncovered",
    "sop_refs": [
     "5.3"
    ],
    "title": "Part of 5.3 has no rule: \"whose state licence has been verified\"",
    "example": "A money transmitter shows a state licence number on its website. Nothing in the spec says whether that counts as verified.",
    "explain": "Without a fact for it, the spec can't tell a verified licence from an unverified one.",
    "question": "What counts as evidence that a state licence is verified?",
    "options": [
     "A lookup on the state regulator's site",
     "A copy of the licence from the customer",
     "Either one"
    ],
    "answer": null,
    "example_facts": []
   }
  ],
  "past_cases": [
   {
    "case_id": "C-1042",
    "name": "Bluefin Logistics LLC",
    "past_decision": "approve",
    "spec_decision": "request_docs",
    "why": "Owners on file add up to 70%. The other 30% is unaccounted for, so someone could own 25%+.",
    "verdict": null
   },
   {
    "case_id": "C-1077",
    "name": "Sunrise Remit Inc.",
    "past_decision": "approve",
    "spec_decision": "escalate",
    "why": "It's a licensed money transmitter. The analyst applied 5.3; the spec escalates all MSBs (see the first question).",
    "verdict": null
   },
   {
    "case_id": "C-1103",
    "name": "Okafor & Daughters Ltd",
    "past_decision": "escalate",
    "spec_decision": "approve",
    "why": "Escalated for adverse media, but the article was about a different person with the same name.",
    "verdict": "past_right"
   }
  ],
  "facts": [
   {
    "name": "Control person",
    "values": [
     "a named person",
     "none",
     "unknown"
    ],
    "required_by": [
     "3.2"
    ],
    "evidence": "Filing or operating agreement naming the person and their role"
   },
   {
    "name": "Ownership",
    "values": [
     "holders with percentages"
    ],
    "required_by": [
     "3.3"
    ],
    "evidence": "Cap table or share register; for each company that owns 25%+, its own owners"
   },
   {
    "name": "Identities verified",
    "values": [
     "yes",
     "no",
     "unknown"
    ],
    "required_by": [
     "3.4"
    ],
    "evidence": "ID check result for every identified person"
   },
   {
    "name": "Registry filing age",
    "values": [
     "months",
     "unknown"
    ],
    "required_by": [
     "3.5"
    ],
    "evidence": "Latest annual report from the state registry"
   },
   {
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
    "evidence": "Screening result for the business and every identified person"
   },
   {
    "name": "Politically exposed",
    "values": [
     "yes",
     "no",
     "unknown"
    ],
    "required_by": [
     "4.3"
    ],
    "evidence": "Screening result for every identified person"
   },
   {
    "name": "Adverse media",
    "values": [
     "yes",
     "no",
     "unknown"
    ],
    "required_by": [
     "4.4"
    ],
    "evidence": "News search on the business and every identified person, with hits matched on more than name"
   },
   {
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
    "evidence": "Website and the filing's industry code"
   },
   {
    "name": "Location",
    "values": [
     "sanctioned",
     "high risk",
     "normal",
     "unknown"
    ],
    "required_by": [
     "6.1",
     "6.2"
    ],
    "evidence": "Registry address and every identified person's address"
   }
  ],
  "changes_from_previous": [
   {
    "from": "request_docs",
    "to": "incomplete",
    "example": "Screening is clear, but a person's ID check hasn't come back yet.",
    "example_facts": [
     {
      "key": "id_verified",
      "name": "ID check",
      "value": "unknown",
      "list": "people",
      "item": 1
     }
    ]
   }
  ]
 },
 "cases": {
  "skill_version": 3,
  "cases": [
   {
    "id": "C-2001",
    "name": "Northwind Coffee Co.",
    "outcome": "request_docs",
    "decided_by": "3.3: ownership isn't complete",
    "missing": [
     "Find the owners of Halcyon Holdings LLC (holds 40%). Without them, someone could own 25% or more."
    ],
    "tool_calls": 14,
    "facts": [
     {
      "name": "Control person",
      "value": "Dana Ruiz, CEO",
      "source": "Operating agreement p.3",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.95,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "4 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 3 hits reviewed",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.93,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Coffee roaster",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Oregon)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Dana Ruiz",
       "type": "person",
       "pct": 35,
       "source": "Cap table",
       "verified": true
      },
      {
       "name": "Halcyon Holdings LLC",
       "type": "entity",
       "pct": 40,
       "source": "Cap table",
       "owners": null
      },
      {
       "name": "Employee option pool",
       "type": "pool",
       "pct": 25,
       "source": "Cap table"
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "request_docs"
    }
   },
   {
    "id": "C-2002",
    "name": "Lumen Dental Group PC",
    "outcome": "approve",
    "decided_by": "Every requirement met, no risk factor",
    "missing": [],
    "tool_calls": 11,
    "facts": [
     {
      "name": "Control person",
      "value": "Priya Shah, President",
      "source": "Articles of incorporation",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.98,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "2 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 0 hits",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.99,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Dental practice",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Texas)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Priya Shah",
       "type": "person",
       "pct": 60,
       "source": "Cap table",
       "verified": true
      },
      {
       "name": "Raj Shah",
       "type": "person",
       "pct": 40,
       "source": "Cap table",
       "verified": true
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "approve"
    }
   },
   {
    "id": "C-2003",
    "name": "Atlas Crypto Payments Inc.",
    "outcome": "escalate",
    "decided_by": "5.2: virtual currency",
    "missing": [],
    "tool_calls": 9,
    "facts": [
     {
      "name": "Control person",
      "value": "Marcus Lee, CEO",
      "source": "Filing",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.91,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "7 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 2 hits reviewed",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.88,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Virtual currency exchange",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Wyoming)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Marcus Lee",
       "type": "person",
       "pct": 100,
       "source": "Cap table",
       "verified": true
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": false,
     "problems": [
      "Adverse media is recorded as 'no', but the news hits were matched on name only. The spec needs hits matched on name plus date of birth or city, so this fact isn't established."
     ],
     "expected": "escalate"
    }
   },
   {
    "id": "C-2004",
    "name": "Greenfield Farms LLC",
    "outcome": "incomplete",
    "decided_by": "2.2: sanctions screening not back yet",
    "missing": [
     "Sanctions screening result for Greenfield Farms LLC"
    ],
    "tool_calls": 8,
    "facts": [
     {
      "name": "Control person",
      "value": "Tom Greer, Managing Member",
      "source": "Operating agreement",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.96,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "5 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "unknown",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 1 hit reviewed",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.95,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Farming",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Iowa)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Tom Greer",
       "type": "person",
       "pct": 40,
       "source": "Operating agreement",
       "verified": true
      },
      {
       "name": "Ann Greer",
       "type": "person",
       "pct": 40,
       "source": "Operating agreement",
       "verified": true
      },
      {
       "name": "Luis Vega",
       "type": "person",
       "pct": 20,
       "source": "Operating agreement",
       "verified": true
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "incomplete"
    }
   },
   {
    "id": "C-2005",
    "name": "Volga Trade Partners Ltd",
    "outcome": "decline",
    "decided_by": "6.1: owner located in a sanctioned country",
    "missing": [],
    "tool_calls": 12,
    "facts": [
     {
      "name": "Control person",
      "value": "Ivan Petrov, Director",
      "source": "Filing",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.9,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "3 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 5 hits reviewed",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.82,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Import/export",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "Owner in a sanctioned country",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Ivan Petrov",
       "type": "person",
       "pct": 70,
       "source": "Share register",
       "verified": true
      },
      {
       "name": "Olga Petrova",
       "type": "person",
       "pct": 30,
       "source": "Share register",
       "verified": true
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "decline"
    }
   },
   {
    "id": "C-2006",
    "name": "Harbor Light Foundation",
    "outcome": "approve",
    "decided_by": "Nonprofit: ownership not required; all else met",
    "missing": [],
    "tool_calls": 7,
    "facts": [
     {
      "name": "Control person",
      "value": "Ana Costa, Executive Director",
      "source": "IRS 990 + bylaws",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "9 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 0 hits",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.99,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Charity",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Maine)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "check": {
     "passed": true,
     "problems": [],
     "expected": "approve"
    }
   },
   {
    "id": "C-2007",
    "name": "Kestrel Media LLC",
    "outcome": "escalate",
    "decided_by": "4.4: adverse media on an owner",
    "missing": [],
    "tool_calls": 16,
    "facts": [
     {
      "name": "Control person",
      "value": "Ben Okoro, CEO",
      "source": "Filing",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.94,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "6 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "yes",
      "source": "Article: owner charged with wire fraud (2025)",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.86,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Digital marketing",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Florida)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Ben Okoro",
       "type": "person",
       "pct": 55,
       "source": "Cap table",
       "verified": true
      },
      {
       "name": "Sam Wu",
       "type": "person",
       "pct": 30,
       "source": "Cap table",
       "verified": true
      }
     ],
     "unaccounted_pct": 15
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "escalate"
    }
   },
   {
    "id": "C-2008",
    "name": "Pinecrest Builders Inc.",
    "outcome": "request_docs",
    "decided_by": "3.5: registry filing 14 months old",
    "missing": [
     "Current annual report from the state registry"
    ],
    "tool_calls": 6,
    "facts": [
     {
      "name": "Control person",
      "value": "Lia Moreno, President",
      "source": "Filing",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.95,
      "key": "control_person"
     },
     {
      "name": "Identities verified",
      "value": "yes",
      "source": "ID check vendor",
      "how": "lookup",
      "key": "ids_verified"
     },
     {
      "name": "Registry filing age",
      "value": "14 months",
      "source": "State registry",
      "how": "lookup",
      "key": "registry_age"
     },
     {
      "name": "Sanctions screening",
      "value": "none",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "sanctions"
     },
     {
      "name": "Politically exposed",
      "value": "no",
      "source": "Screening vendor",
      "how": "lookup",
      "key": "pep"
     },
     {
      "name": "Adverse media",
      "value": "no",
      "source": "News search, 1 hit reviewed",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "adverse_media"
     },
     {
      "name": "Industry",
      "value": "Construction",
      "source": "Website + filing NAICS code",
      "how": "judgment",
      "by": "a decision model",
      "confidence": 0.97,
      "key": "industry"
     },
     {
      "name": "Location",
      "value": "US (Colorado)",
      "source": "Registry + owner addresses",
      "how": "lookup",
      "key": "geo"
     }
    ],
    "ownership": {
     "holders": [
      {
       "name": "Lia Moreno",
       "type": "person",
       "pct": 100,
       "source": "Cap table",
       "verified": true
      }
     ],
     "unaccounted_pct": 0
    },
    "check": {
     "passed": true,
     "problems": [],
     "expected": "request_docs"
    }
   }
  ]
 },
 "rounds": {
  "accepted_version": 2,
  "rounds": [
   {
    "n": 1,
    "skill_version": 1,
    "passed": 41,
    "total": 60,
    "got_worse": [],
    "groups": [
     {
      "cause": "Stopped at the first layer of ownership",
      "cases": [
       "C-2001",
       "C-2014",
       "C-2022",
       "C-2031",
       "C-2040",
       "C-2044",
       "C-2051"
      ],
      "change": "Open every company that owns a share until only people remain."
     },
     {
      "cause": "Treated 'no screening result yet' as 'no match'",
      "cases": [
       "C-2004",
       "C-2019",
       "C-2027",
       "C-2033"
      ],
      "change": "Wait for screening; record 'unknown' if it hasn't returned."
     },
     {
      "cause": "Didn't check the registry filing date",
      "cases": [
       "C-2008",
       "C-2011",
       "C-2036"
      ],
      "change": "Always pull the latest annual report and record its date."
     }
    ],
    "back_to_spec": [],
    "correct": 38
   },
   {
    "n": 2,
    "skill_version": 2,
    "passed": 53,
    "total": 60,
    "got_worse": [
     "C-2017"
    ],
    "groups": [
     {
      "cause": "Adverse media matched on name only",
      "cases": [
       "C-2007",
       "C-2017",
       "C-2029"
      ],
      "change": "Match news hits on name plus date of birth or city before calling it adverse."
     },
     {
      "cause": "Missed the control person when titles were unusual",
      "cases": [
       "C-2012",
       "C-2046"
      ],
      "change": "Ask the decision model about every officer listed, not only 'CEO' or 'President'."
     }
    ],
    "back_to_spec": [
     "C-2050: the SOP doesn't say what to do when the state registry is down"
    ],
    "correct": 47
   },
   {
    "n": 3,
    "skill_version": 3,
    "passed": 57,
    "total": 60,
    "got_worse": [],
    "groups": [
     {
      "cause": "Trust ownership (waiting on the expert's answer)",
      "cases": [
       "C-2038",
       "C-2055"
      ],
      "change": "None yet: needs the answer to 'For a trust, who counts as the owner?'"
     }
    ],
    "back_to_spec": [
     "C-2050: the SOP doesn't say what to do when the state registry is down"
    ],
    "correct": 52
   }
  ]
 }
} as const
