% Text
% Alice is married under section 7703 for the year 2017. Alice files a joint return with her spouse for 2017. Alice's and her spouse's taxable income for the year 2017 is $164612.

% Question
% Alice and her spouse have to pay $44789 in taxes for the year 2017 under section 1(a)(iv). Entailment

% Facts
:- discontiguous s63/3.
:- discontiguous s7703/4.
:- [statutes/prolog/init].
s7703("Alice","her spouse",_,2017).
joint_return_("files a joint return").
agent_("files a joint return","Alice").
agent_("files a joint return","her spouse").
start_("files a joint return","2017-01-01").
end_("files a joint return","2017-12-31").
s63("Alice",2017,164612).

% Test
:- s1_a_iv(164612,44789).
:- halt.
