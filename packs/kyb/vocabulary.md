# What the KYB pack supplies

The facts `packs/kyb/facts.ts` hands the rules, and what each one means. These are facts, not decisions: which of them matter, and what follows from them, is the spec's to say. Claude reads this page when it drafts a spec from the SOP (`pnpm propose-spec`).

## The case

- `excluded`: the entity is one of the excluded entity types (the 16 types in 31 CFR 1010.230(e)(2)).
- `nonprofit`: the entity is a nonprofit.
- `industry`: the entity's industry, mapped onto one of the declared values through the spec's word map (`maps.industry`). A word with no mapping is unknown.
- `licence_verified`: the entity's state money-transmitter licence has been verified.
- `country`: where the entity is located, as an ISO 3166 code ("IR", or "RU-CRIMEA" for a region).
- `entity_sanctions`: the entity's sanctions screening: no match, a potential match not yet cleared, or a confirmed match.
- `entity_adverse_media`: adverse media about the entity that meets the SOP's bar.

## People (`people`, one item per person)

Everyone the case names as a person: the individuals the agent identified and screened, every individual who owns part of the entity (directly or through other entities), the control person, and every individual the customer certifies as an owner. Not all of them are "identified individuals" in the SOP's sense. The spec decides which ones count, with the list's `counts_when`.

- `listed`: the agent listed this person among the individuals it identified.
- `control_person`: this person is the control person the case names.
- `share_pct`: the share of the entity this person owns, directly or through other companies, summed over every chain, in percent. The pack doesn't follow ownership up through an excluded entity or a trust, so a share held that way counts toward nobody's `share_pct`.
- `certified_pct`: the share the customer's ownership certification gives this person, in percent: 0 if a certification on file leaves them out, unknown if none is on file. With none on file, the case also holds one stand-in person for whoever it might name, at an unknown share.
- `residence`: where the person lives, as an ISO 3166 code.
- `id_verified`: the person's identity has been verified.
- `sanctions`: the person's sanctions screening: none, potential (not cleared) or confirmed.
- `pep`: the person is a politically exposed person.
- `adverse_media`: adverse media about the person that meets the SOP's bar.

## Excluded owners (`excluded_owners`, one item per excluded entity in the ownership chain)

- `excluded_share_pct`: the share of the entity held through this excluded entity, in percent.

## Computed by the pack

- `control_person_identified`: the case names a control person.
- `unaccounted_pct`: the share of the entity nobody accounts for, in percent: shares missing from the cap table, shares held through companies whose owners are unknown, and shares held by trusts. Shares held by an excluded entity are not in it; they are in `excluded_owners`.
- `over_allocated`: the listed shares of the entity, or of an entity in its ownership chain, add up to more than 100%.
- `registry_age_months`: whole months since the entity's registry filing.
