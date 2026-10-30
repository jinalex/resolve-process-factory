% Text
% Alice has paid wages of $6771 to Bob, $6954 to Charlie, and $6872 to Dan for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017. Bob has paid wages of $4520 to Alice for work done from Apr 1st, 2017 to Sep 2nd, 2018.

% Question
% Under section 3306(a)(2)(A), Alice is an employer for the year 2017. Entailment

% Facts
:- discontiguous s3306_b/8.
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
agent_("agricultural labor","Charlie").
agent_("agricultural labor","Dan").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
purpose_("agricultural labor","agricultural labor").
payment_("$6771 to Bob").
agent_("$6771 to Bob","Alice").
patient_("$6771 to Bob","Bob").
start_("$6771 to Bob","2017-09-02").
purpose_("$6771 to Bob","agricultural labor").
amount_("$6771 to Bob",6771).
s3306_b(6771,"$6771 to Bob","agricultural labor","Alice","Bob","Alice","Bob",_).
payment_("$6954 to Charlie").
agent_("$6954 to Charlie","Alice").
patient_("$6954 to Charlie","Charlie").
start_("$6954 to Charlie","2017-09-02").
purpose_("$6954 to Charlie","agricultural labor").
amount_("$6954 to Charlie",6954).
s3306_b(6954,"$6954 to Charlie","agricultural labor","Alice","Charlie","Alice","Charlie",_).
payment_("$6872 to Dan").
agent_("$6872 to Dan","Alice").
patient_("$6872 to Dan","Dan").
start_("$6872 to Dan","2017-09-02").
purpose_("$6872 to Dan","agricultural labor").
amount_("$6872 to Dan",6872).
s3306_b(6872,"$6872 to Dan","agricultural labor","Alice","Dan","Alice","Dan",_).
service_("work").
patient_("work","Bob").
agent_("work","Alice").
start_("work","2017-04-01").
end_("work","2018-09-02").
payment_("Bob has paid wages of $4520 to Alice").
agent_("Bob has paid wages of $4520 to Alice","Bob").
patient_("Bob has paid wages of $4520 to Alice","Alice").
start_("Bob has paid wages of $4520 to Alice","2018-09-02").
end_("Bob has paid wages of $4520 to Alice","2018-09-02").
purpose_("Bob has paid wages of $4520 to Alice","work").
amount_("Bob has paid wages of $4520 to Alice",4520).
s3306_b(4520,"Bob has paid wages of $4520 to Alice","work","Bob","Alice","Bob","Alice",_).

% Test
:- s3306_a_2_A("Alice",2017,_,_).
:- halt.
