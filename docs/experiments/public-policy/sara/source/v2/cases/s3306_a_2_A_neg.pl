% Text
% Alice has paid wages of $3200 to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017. Bob has paid wages of $4520 to Alice for work done from Apr 1st, 2017 to Sep 2nd, 2018.

% Question
% Under section 3306(a)(2)(A), Alice is an employer for the year 2017. Contradiction

% Facts
:- discontiguous s3306_b/8.
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
purpose_("agricultural labor","agricultural labor").
payment_("Alice has paid wages of $3200 to Bob").
agent_("Alice has paid wages of $3200 to Bob","Alice").
patient_("Alice has paid wages of $3200 to Bob","Bob").
start_("Alice has paid wages of $3200 to Bob","2017-09-02").
purpose_("Alice has paid wages of $3200 to Bob","agricultural labor").
amount_("Alice has paid wages of $3200 to Bob",3200).
s3306_b(3200,"Alice has paid wages of $3200 to Bob","agricultural labor","Alice","Bob","Alice","Bob",_).
service_("work").
patient_("work","Bob").
agent_("work","Alice").
start_("work","2017-04-01").
end_("work","2018-09-02").
payment_("Bob has paid wages of $4520 to Alice").
agent_("Bob has paid wages of $4520 to Alice","Bob").
patient_("Bob has paid wages of $4520 to Alice","Alice").
start_("Bob has paid wages of $4520 to Alice","2018-09-02").
purpose_("Bob has paid wages of $4520 to Alice","work").
amount_("Bob has paid wages of $4520 to Alice",4520).
s3306_b(4520,"Bob has paid wages of $4520 to Alice","work","Bob","Alice","Bob","Alice",_).

% Test
:- \+ s3306_a_2_A("Alice",2017,_,_).
:- halt.
