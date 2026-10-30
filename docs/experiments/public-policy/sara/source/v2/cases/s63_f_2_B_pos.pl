% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Alice has been blind since Feb 28, 2014. In addition, Bob is allowed an exemption for Alice under section 151(b) for the year 2017.

% Question
% Section 63(f)(2)(B) applies to Bob in 2017 with Alice as the spouse. Entailment

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
start_("blind","2014-02-28").
s151_b_applies("Bob","Alice",2017).

% Test
:- s63_f_2_B("Bob",_,2017).
:- halt.
