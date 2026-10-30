% Text
% In 2016, Alice's income was $567192. Alice is married for the year 2016 under section 7703. Alice does not file a joint return.

% Question
% Section 68(b)(1)(A) applies to Alice for 2016. Contradiction

% Facts
:- discontiguous s7703/4.
:- [statutes/prolog/init].
income_("income").
agent_("income","Alice").
start_("income","2016-12-31").
amount_("income",567192).
s7703("Alice",_,_,2016).

% Test
:- \+ s68_b_1_A("Alice",_,_,_,2016).
:- halt.
