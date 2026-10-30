% Text
% Alice has paid wages of $3200 to Bob for domestic service done from Feb 1st, 2017 to Sep 2nd, 2017. In 2018, Bob has paid wages of $4500 to Alice for work done from Apr 1st, 2017 to Sep 2nd, 2018.

% Question
% Bob is an employer under section 3306(a)(1) for the year 2018. Entailment

% Facts
:- discontiguous s3306_b/8.
:- [statutes/prolog/init].
service_("domestic service").
patient_("domestic service","Alice").
agent_("domestic service","Bob").
start_("domestic service","2017-02-01").
end_("domestic service","2017-09-02").
purpose_("domestic service","domestic service").
payment_("Alice has paid wages of $3200 to Bob").
agent_("Alice has paid wages of $3200 to Bob","Alice").
patient_("Alice has paid wages of $3200 to Bob","Bob").
start_("Alice has paid wages of $3200 to Bob","2019-09-02").
purpose_("Alice has paid wages of $3200 to Bob","domestic service").
amount_("Alice has paid wages of $3200 to Bob",3200).
s3306_b(3200,"Alice has paid wages of $3200 to Bob","domestic service","Alice","Bob","Alice","Bob",_).
service_("work").
patient_("work","Bob").
agent_("work","Alice").
start_("work","2017-02-01").
end_("work","2017-09-02").
payment_("Bob has paid wages of $4500 to Alice").
agent_("Bob has paid wages of $4500 to Alice","Bob").
patient_("Bob has paid wages of $4500 to Alice","Alice").
start_("Bob has paid wages of $4500 to Alice","2018-09-02").
end_("Bob has paid wages of $4500 to Alice","2018-09-02").
purpose_("Bob has paid wages of $4500 to Alice","work").
amount_("Bob has paid wages of $4500 to Alice",4500).
s3306_b(4500,"Bob has paid wages of $4500 to Alice","work","Bob","Alice","Bob","Alice",_).

% Test
:- s3306_a_1("Bob",2018).
:- halt.
