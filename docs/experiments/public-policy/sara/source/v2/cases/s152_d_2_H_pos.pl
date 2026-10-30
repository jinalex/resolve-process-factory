% Text
% Alice and Bob started living together on April 15th, 2014. Alice and Bob are not married.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(H) for the year 2018. Entailment

% Facts
:- [statutes/prolog/init].
residence_("living together").
agent_("living together","Alice").
agent_("living together","Bob").
start_("living together","2014-04-15").
patient_("living together","living together").

% Test
:- s152_d_2_H("Alice","Bob",2018,_,_,_).
:- halt.
