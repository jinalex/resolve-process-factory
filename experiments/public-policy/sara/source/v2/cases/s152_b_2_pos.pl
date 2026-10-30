% Text
% Alice and Bob got married on Jan 1st, 2015. They file a joint return for the year 2015.

% Question
% Section 152(b)(2) applies to Alice for the year 2015. Entailment

% Facts
:- [statutes/prolog/init].
marriage_("married").
agent_("married","Alice").
agent_("married","Bob").
start_("married","2015-01-01").
joint_return_("file a joint return").
agent_("file a joint return","Alice").
agent_("file a joint return","Bob").
start_("file a joint return","2015-01-01").
end_("file a joint return","2015-12-31").

% Test
:- s152_b_2("Alice",_,_,2015).
:- halt.
