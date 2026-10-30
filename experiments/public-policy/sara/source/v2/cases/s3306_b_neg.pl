% Text
% Over the year 2018, Alice has paid $2325 in hay to Bob for agricultural labor.

% Question
% Section 3306(b) applies to the payment in hay made by Alice to Bob for the year 2018. Contradiction

% Facts
:- [statutes/prolog/init].
service_("agricultural labor").
patient_("agricultural labor","Alice").
agent_("agricultural labor","Bob").
start_("agricultural labor","2018-01-01").
end_("agricultural labor","2018-12-31").
purpose_("agricultural labor","agricultural labor").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Bob").
start_("paid","2018-01-01").
end_("paid","2018-12-31").
purpose_("paid","agricultural labor").
amount_("paid",2325).
means_("paid","hay").

% Test
:- \+ s3306_b(_,"paid","agricultural labor","Alice","Bob","Alice","Bob",_).
:- halt.
