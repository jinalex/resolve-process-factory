% Text
% Alice has paid wages of $3200 to Bob for work done from Feb 1st, 2017 to Sep 2nd, 2017. Bob has paid wages of $4500 to Alice for work done from Apr 1st, 2017 to Sep 2nd, 2018.

% Question
% Under section 3306(a)(1)(A), Alice is an employer for the year 2017. Entailment

% Facts
:- discontiguous s3306_b/8.
:- [statutes/prolog/init].
s3306_b(3200,_,"work done from Feb 1st, 2017 to Sep 2nd, 2017","Alice","Bob","Alice","Bob",_).
start_("work done from Feb 1st, 2017 to Sep 2nd, 2017","2017-02-01").
end_("work done from Feb 1st, 2017 to Sep 2nd, 2017","2017-09-02").
s3306_b(4500,_,"work done from Apr 1st, 2017 to Sep 2nd, 2018","Bob","Alice","Bob","Alice",_).
start_("work done from Apr 1st, 2017 to Sep 2nd, 2018","2017-04-01").
end_("work done from Apr 1st, 2017 to Sep 2nd, 2018","2018-09-02").

% Test
:- s3306_a_1_A("Alice",2017,_).
:- halt.
