% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Alice is entitled to an additional standard deduction of $600 each for herself and for Bob, under section 63(f)(1)(A) and 63(f)(1)(B), respectively.

% Question
% Under section 63(c)(3), Alice's additional standard deduction in 2017 is equal to $1200. Entailment

% Facts
:- discontiguous s63_f_1_A/2.
:- discontiguous s63_f_1_B/3.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2017-02-03").
s63_f_1_A("Alice",2017).
s63_f_1_B("Alice","Bob",2017).

% Test
:- s63_c_3("Alice",1200,2017).
:- halt.
