% Text
% Alice has paid $3200 in cash to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017. Bob has paid $4200 in cash to Alice for domestic service in his home, done from Apr 1st, 2017 to Sep 2nd, 2018.

% Question
% Section 3306(a)(3) applies to Bob for the year 2018. Entailment

% Facts
:- discontiguous s3306_b/8.
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
purpose_("agricultural labor","agricultural labor").
payment_("Alice has paid $3200 in cash to Bob").
agent_("Alice has paid $3200 in cash to Bob","Alice").
patient_("Alice has paid $3200 in cash to Bob","Bob").
start_("Alice has paid $3200 in cash to Bob","2017-09-02").
end_("Alice has paid $3200 in cash to Bob","2017-09-02").
purpose_("Alice has paid $3200 in cash to Bob","agricultural labor").
amount_("Alice has paid $3200 in cash to Bob",3200).
means_("Alice has paid $3200 in cash to Bob","cash").
s3306_b(3200,"Alice has paid $3200 in cash to Bob","agricultural labor","Alice","Bob","Alice","Bob",_).
service_("domestic service").
patient_("domestic service","Bob").
agent_("domestic service","Alice").
start_("domestic service","2017-04-01").
end_("domestic service","2018-09-02").
purpose_("domestic service", "domestic service").
location_("domestic service", "his home").
payment_("Bob has paid $4200 in cash to Alice").
agent_("Bob has paid $4200 in cash to Alice","Bob").
patient_("Bob has paid $4200 in cash to Alice","Alice").
start_("Bob has paid $4200 in cash to Alice","2018-09-02").
end_("Bob has paid $4200 in cash to Alice","2018-09-02").
purpose_("Bob has paid $4200 in cash to Alice","domestic service").
amount_("Bob has paid $4200 in cash to Alice",4200).
means_("Bob has paid $4200 in cash to Alice","cash").
s3306_b(4200,"Bob has paid $4200 in cash to Alice","domestic service","Bob","Alice","Bob","Alice",_).

% Test
:- s3306_a_3("Bob",_,_,2018).
:- halt.
