# What a case supplies

Listed by Claude from the procedure (step `facts`), before any case was read.

## The case

- `spouse_died_in_two_preceding_years` (yes / no): Did the taxpayer's spouse die during either of the two years immediately before the taxable year? Yes if so.
- `spouse_died_during_taxable_year` (yes / no): Did the taxpayer's spouse die during the taxable year itself? Yes if so.
- `remarried_before_close_of_year` (yes / no): After the earlier spouse's death, did the taxpayer remarry at any time before the close of the taxable year? Yes if so.
- `nonresident_alien_in_year_of_death` (yes / no): In the taxable year during which the spouse died, was either the taxpayer or the deceased spouse a nonresident alien at any time? Yes if either was, which means no joint return could have been made for that year.
- `married_at_determination_date` (yes / no): Was the taxpayer legally married at the close of the taxable year, or at the moment of the spouse's death if the spouse died during the year? Answer before considering any separation decree, and yes if married.
- `legally_separated_under_decree` (yes / no): On that same date, was the taxpayer legally separated from the spouse under a decree of divorce or of separate maintenance? Yes if so.
- `spouse_nonresident_alien_during_year` (yes / no): Was the taxpayer's spouse a nonresident alien at any time during the taxable year? Yes if so.
- `taxpayer_nonresident_alien_during_year` (yes / no): Was the taxpayer a nonresident alien at any time during the taxable year? Yes if so.
- `files_separate_return` (yes / no): Does the taxpayer file a separate return (not a joint return) for the taxable year? Yes if so.
- `taxpayer_furnishes_over_half_cost_of_home` (yes / no): Did the taxpayer furnish over half the cost of maintaining, during the taxable year, the household the taxpayer maintains as his home? Yes if so.
- `spouse_member_of_home_last_six_months` (yes / no): Was the taxpayer's spouse a member of the taxpayer's household at any time during the last 6 months of the taxable year? Yes if so.

## persons (one item per person: Each individual other than the taxpayer's spouse whom the record presents as a possible qualifying person for the taxpayer: a child, stepchild, parent, relative, other dependent, or other member of the household.)

- `is_son_daughter_or_stepchild` (yes / no): Is this person a son, stepson, daughter, or stepdaughter of the taxpayer within the meaning of section 152? Yes if so.
- `is_child_of_taxpayer` (yes / no): Is this person a child of the taxpayer as section 152 defines 'child'? Yes if so.
- `is_qualifying_child` (yes / no): Is this person a qualifying child of the taxpayer as defined in section 152(c)? Yes if so. This applies that section's tests to the record.
- `is_father_or_mother` (yes / no): Is this person the taxpayer's father or mother? Yes if so.
- `is_dependent` (yes / no): Is this person a dependent of the taxpayer for the taxable year within the meaning of section 152? Yes if so.
- `taxpayer_entitled_to_151_deduction` (yes / no): Is the taxpayer entitled to a deduction under section 151 for this person for the taxable year? Yes if so.
- `married_at_close_of_taxpayer_year` (yes / no): Was this person married at the close of the taxpayer's taxable year? Yes if so.
- `not_dependent_by_reason_of_152b2` (yes / no): Is this person not a dependent of the taxpayer because of section 152(b)(2), the rule for a married individual who files a joint return? Yes if section 152(b)(2) is why the person is not a dependent.
- `dependent_only_by_152d2H` (yes / no): Would this person not be the taxpayer's dependent for the taxable year except for section 152(d)(2)(H), the rule for an unrelated member of the household? Yes if that provision is the only reason the person is a dependent.
- `abode_in_home_whole_year` (yes / no): For the taxable year, was the household the taxpayer maintains as his home this person's principal place of abode, with the person a member of that household? Yes if so.
- `abode_in_home_over_half_year` (yes / no): For more than one-half of the taxable year, was the household the taxpayer maintains as his home this person's principal place of abode, with the person a member of that household? Yes if so.
- `abode_household_maintained_by_taxpayer` (yes / no): Was this person's principal place of abode for the taxable year a household, whether or not it is the taxpayer's own home, for which the taxpayer furnished over half the cost of maintaining during the year? Yes if so.
