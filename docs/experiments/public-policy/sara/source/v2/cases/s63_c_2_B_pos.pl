% Text
% In 2017, Alice was paid $33200. Alice is a head of household for 2017.

% Question
% Under section 63(c)(2)(B), Alice's basic standard deduction in 2017 is equal to $4400. Entailment

% Facts
:- discontiguous s2_b/3.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
s2_b("Alice",_,2017).

% Test
:- s63_c_2_B("Alice",2017,4400).
:- halt.
