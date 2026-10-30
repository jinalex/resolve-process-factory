% Text
% In 2017, Alice was paid $33200. Alice and Bob got married on Feb 3rd, 2017. Alice was a nonresident alien from August 23rd, 2016 to September 15th, 2018.

% Question
% Section 63(c)(6)(B) applies to Alice for 2017. Entailment

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
nonresident_alien_("a nonresident alien").
agent_("a nonresident alien","Alice").
start_("a nonresident alien","2016-08-23").
end_("a nonresident alien","2018-08-15").

% Test
:- s63_c_6_B("Alice",2017).
:- halt.
