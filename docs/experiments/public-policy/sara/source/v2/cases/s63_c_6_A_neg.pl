% Text
% In 2017, Alice was paid $33200. Alice and Bob have been married since Feb 3rd, 2017. Bob and Alice file a joint return for 2017.

% Question
% Section 63(c)(6)(A) applies to Alice for 2017. Contradiction

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
joint_return_("file a joint return").
agent_("file a joint return","Bob").
agent_("file a joint return","Alice").
start_("file a joint return","2017-01-01").
end_("file a joint return","2017-12-31").

% Test
:- \+ s63_c_6_A("Alice",_,_,2017).
:- halt.
