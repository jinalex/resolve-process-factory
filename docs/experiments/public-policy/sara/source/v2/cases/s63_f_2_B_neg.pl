% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Alice has been blind since October 4, 2013. In addition, Alice is allowed an exemption for Bob under section 151(b) for the year 2017.

% Question
% Section 63(f)(2)(B) applies to Alice in 2017 with Bob as the spouse. Contradiction

% Facts
:- discontiguous s151_b_applies/3.
:- [statutes/prolog/init].
payment_("paid").
patient_("paid","Alice").
start_("paid","2017-12-31").
amount_("paid",33200).
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2017-02-03").
blindness_("blind").
agent_("blind","Alice").
start_("blind","2013-10-04").
s151_b_applies("Alice","Bob",2017).

% Test
:- \+ s63_f_2_B("Alice",_,2017).
:- halt.
