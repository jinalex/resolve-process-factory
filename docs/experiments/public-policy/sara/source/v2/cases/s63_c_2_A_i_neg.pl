% Text
% In 2017, Alice was paid $33200 in remuneration. Alice and Bob have been married since Feb 3rd, 2017. Alice and Bob file separate returns in 2017.

% Question
% Section 63(c)(2)(A)(i) applies to Alice in 2017. Contradiction

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2017-02-03").

% Test
:- \+ s63_c_2_A_i("Alice",_,2017).
:- halt.
