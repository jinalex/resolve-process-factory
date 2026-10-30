% Text
% Alice has paid $3200 to Bob for repairing her roof from Feb 1st, 2017 to Sep 2nd, 2017. Alice paid Bob with eggs, grapes and hay.

% Question
% Section 3306(b)(11) applies to the payment that Alice made to Bob for the year 2017. Contradiction

% Facts
:- [statutes/prolog/init].
service_("repairing her roof").
patient_("repairing her roof","Alice").
agent_("repairing her roof","Bob").
start_("repairing her roof","2017-02-01").
end_("repairing her roof","2017-09-02").
payment_("Alice has paid $3200 to Bob").
agent_("Alice has paid $3200 to Bob","Alice").
patient_("Alice has paid $3200 to Bob","Bob").
start_("Alice has paid $3200 to Bob","2017-09-02").
purpose_("Alice has paid $3200 to Bob","repairing her roof").
amount_("Alice has paid $3200 to Bob",3200).
means_("Alice has paid $3200 to Bob","eggs, grapes and hay").

% Test
:- \+ s3306_b_11("Alice has paid $3200 to Bob","repairing her roof",_).
:- halt.
