% Text
% Alice employed Bob for agricultural labor from Feb 1st, 2011 to November 19th, 2019. On November 25th, Bob died from a heart attack. On December 20th, 2019, Alice paid Charlie, Bob's surviving spouse, Bob's outstanding wages of $1200.

% Question
% Section 3306(b)(15) applies to the payment that Alice made to Charlie in 2019. Contradiction

% Facts
:- discontiguous s3306_c/5.
:- [statutes/prolog/init].
s3306_c("agricultural labor","Alice","Bob",Day,_) :-
    (
        nonvar(Day),
        is_before("2011-02-01",Day),
        is_before(Day,"2019-11-19")
    );
    var(Day).
purpose_("agricultural labor","agricultural labor").
death_("died").
agent_("died","Bob").
start_("died","2019-11-25").
end_("died","2019-11-25").
marriage_("spouse").
agent_("spouse","Bob").
agent_("spouse","Charlie").
payment_("paid").
agent_("paid","Alice").
patient_("paid","Charlie").
start_("paid","2019-12-20").
end_("paid","2019-12-20").
purpose_("paid","agricultural labor").
amount_("paid",1200).

% Test
:- \+ s3306_b_15("paid","Alice","Charlie","Bob",_).
:- halt.
