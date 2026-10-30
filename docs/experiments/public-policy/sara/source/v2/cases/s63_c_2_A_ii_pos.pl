% Text
% In 2017, Alice was paid $33200. Alice is a surviving spouse for 2017.

% Question
% Section 63(c)(2)(A)(ii) applies to Alice in 2017. Entailment

% Facts
:- discontiguous s2_a/3.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
s2_a("Alice",_,2017).

% Test
:- s63_c_2_A_ii("Alice",2017).
:- halt.
