% Text
% In 2017, Alice was paid $33200. For the year 2017, Alice is allowed a basic standard deduction under section 63(c)(2) of $2000 and an additional standard deduction of $3000 under section 63(c)(3) for the year 2017.

% Question
% Under section 63(c)(1), Alice's standard deduction in 2017 is equal to $4000. Contradiction

% Facts
:- discontiguous s63_c_3/3.
:- discontiguous s63_c_2/3.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
s63_c_2("Alice",2017,2000).
s63_c_3("Alice",3000,2017).

% Test
:- \+ s63_c_1("Alice",2017,4000).
:- halt.
