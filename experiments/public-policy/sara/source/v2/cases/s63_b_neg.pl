% Text
% In 2017, Alice was paid $33200. She is allowed a deduction under section 63(c)(1) of $2000 for the year 2017, and no deduction under section 151. Alice takes the standard deduction.

% Question
% Under section 63(b), Alice's taxable income in 2017 is equal to $31400. Contradiction

% Facts
:- discontiguous s63_c_1/3.
:- discontiguous s151/5.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
s63_c_1("Alice",2017,2000).
s151("Alice",0,_,_,2017).

% Test
:- \+ s63_b("Alice",2017,31400,_).
:- halt.
