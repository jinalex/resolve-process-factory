% Text
% Alice has paid $3200 to Bob for agricultural labor done from Feb 1st, 2017 to Sep 2nd, 2017. Alice paid Bob with eggs, grapes and hay.

% Question
% Section 3306(b)(11) applies to the payment that Alice made to Bob for the year 2017. Entailment

% Facts
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2017-02-01").
end_("agricultural labor","2017-09-02").
purpose_("agricultural labor","agricultural labor").
payment_("Alice has paid $3200 to Bob").
agent_("Alice has paid $3200 to Bob","Alice").
patient_("Alice has paid $3200 to Bob","Bob").
start_("Alice has paid $3200 to Bob","2017-09-02").
purpose_("Alice has paid $3200 to Bob","agricultural labor").
amount_("Alice has paid $3200 to Bob",3200).
means_("Alice has paid $3200 to Bob","eggs, grapes and hay").

% Test
:- s3306_b_11("Alice has paid $3200 to Bob",_,_).
:- halt.
