% Text
% In 2016, Alice's income was $310192. Alice is a surviving spouse for the year 2016. Alice is allowed itemized deductions of $60000 under section 63.

% Question
% Section 68(a)(1) prescribes a reduction of Alice's itemized deductions for the year 2016 by $306. Entailment

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",310192).
s2_a("Alice",_,2016).

% Test
:- s68_b("Alice",Applicable_amount,2016),
    gross_income("Alice",2016,Gross_income),
    s68_a_1(Gross_income,Applicable_amount,306).
:- halt.
