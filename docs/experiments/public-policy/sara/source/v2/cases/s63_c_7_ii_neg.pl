% Text
% In 2019, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2019.  Alice and Bob file separate returns in 2019.

% Question
% Under section 63(c)(7)(ii), Alice's basic standard deduction in 2019 is equal to $3000. Contradiction

% Facts
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2019-12-31").
amount_("paid",33200).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2019-02-03").

% Test
:- \+ s63_c_7_ii(2019,3000).
:- halt.
