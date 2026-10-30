% Text
% Bob is Alice's father since April 15th, 1994. In 2015, Alice and Bob live in separate houses.

% Question
% Alice bears a relationship to Bob under section 152(d)(2)(H) for the year 2015. Contradiction

% Facts
:- [statutes/prolog/init].
father_("father").
agent_("father","Bob").
patient_("father","Alice").
start_("father","1994-04-15").

% Test
:- \+ s152_d_2_H("Alice","Bob",2015,_,_,_).
:- halt.
