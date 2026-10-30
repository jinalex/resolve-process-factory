% Text
% Alice and Bob started living together on April 15th, 2014. Alice and Bob are not related, nor do they have relatives married to one another.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(G) for the year 2018. Contradiction

% Facts
:- [statutes/prolog/init].
residence_("living together").
agent_("living together","Alice").
agent_("living together","Bob").
start_("living together","2014-04-15").
patient_("living together","living together").

% Test
:- \+ s152_d_2_G("Alice","Bob",_,_).
:- halt.
