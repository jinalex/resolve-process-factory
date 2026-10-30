% Text
% Alice has employed Bob, Cameron, Dan, Emily, Fred and George for agricultural labor on various occasions during the year 2017:
% - Jan 24: Bob, Cameron, Dan, Emily and Fred
% - Feb 4: Bob, Cameron and Fred
% - Mar 3: Bob, Cameron, Dan, Emily and Fred
% - Mar 19: Cameron, Dan, Emily, Fred and George
% - Apr 2: Bob, Cameron, Dan, Fred and George
% - May 9: Cameron, Dan, Emily, Fred and George
% - Oct 15: Bob, Cameron, Dan, Emily and George
% - Oct 25: Bob, Emily, Fred and George
% - Nov 8: Bob, Cameron, Emily, Fred and George
% - Nov 22: Bob, Cameron, Dan, Emily and Fred
% - Dec 1: Bob, Cameron, Dan, Emily and George
% - Dec 3: Bob, Cameron, Dan, Emily and George

% Question
% Section 3306(a)(2)(B) applies to Alice for the year 2017. Contradiction

% Facts
:- discontiguous s3306_c/5.
:- [statutes/prolog/init].
s3306_c("agricultural labor","Alice","Bob","2017-01-24",_).
s3306_c("agricultural labor","Alice","Cameron","2017-01-24",_).
s3306_c("agricultural labor","Alice","Dan","2017-01-24",_).
s3306_c("agricultural labor","Alice","Emily","2017-01-24",_).
s3306_c("agricultural labor","Alice","Fred","2017-01-24",_).
s3306_c("agricultural labor","Alice","Bob","2017-02-04",_).
s3306_c("agricultural labor","Alice","Cameron","2017-02-04",_).
s3306_c("agricultural labor","Alice","Fred","2017-02-04",_).
s3306_c("agricultural labor","Alice","Bob","2017-03-03",_).
s3306_c("agricultural labor","Alice","Cameron","2017-03-03",_).
s3306_c("agricultural labor","Alice","Dan","2017-03-03",_).
s3306_c("agricultural labor","Alice","Emily","2017-03-03",_).
s3306_c("agricultural labor","Alice","Fred","2017-03-03",_).
s3306_c("agricultural labor","Alice","Cameron","2017-03-19",_).
s3306_c("agricultural labor","Alice","Dan","2017-03-19",_).
s3306_c("agricultural labor","Alice","Emily","2017-03-19",_).
s3306_c("agricultural labor","Alice","Fred","2017-03-19",_).
s3306_c("agricultural labor","Alice","George","2017-03-19",_).
s3306_c("agricultural labor","Alice","Bob","2017-04-02",_).
s3306_c("agricultural labor","Alice","Cameron","2017-04-02",_).
s3306_c("agricultural labor","Alice","Dan","2017-04-02",_).
s3306_c("agricultural labor","Alice","Fred","2017-04-02",_).
s3306_c("agricultural labor","Alice","George","2017-04-02",_).
s3306_c("agricultural labor","Alice","Cameron","2017-05-09",_).
s3306_c("agricultural labor","Alice","Dan","2017-05-09",_).
s3306_c("agricultural labor","Alice","Emily","2017-05-09",_).
s3306_c("agricultural labor","Alice","Fred","2017-05-09",_).
s3306_c("agricultural labor","Alice","George","2017-05-09",_).
s3306_c("agricultural labor","Alice","Bob","2017-10-15",_).
s3306_c("agricultural labor","Alice","Cameron","2017-10-15",_).
s3306_c("agricultural labor","Alice","Dan","2017-10-15",_).
s3306_c("agricultural labor","Alice","Emily","2017-10-15",_).
s3306_c("agricultural labor","Alice","George","2017-10-15",_).
s3306_c("agricultural labor","Alice","Bob","2017-10-25",_).
s3306_c("agricultural labor","Alice","Emily","2017-10-25",_).
s3306_c("agricultural labor","Alice","Fred","2017-10-25",_).
s3306_c("agricultural labor","Alice","George","2017-10-25",_).
s3306_c("agricultural labor","Alice","Bob","2017-11-08",_).
s3306_c("agricultural labor","Alice","Cameron","2017-11-08",_).
s3306_c("agricultural labor","Alice","Emily","2017-11-08",_).
s3306_c("agricultural labor","Alice","Fred","2017-11-08",_).
s3306_c("agricultural labor","Alice","George","2017-11-08",_).
s3306_c("agricultural labor","Alice","Bob","2017-11-22",_).
s3306_c("agricultural labor","Alice","Cameron","2017-11-22",_).
s3306_c("agricultural labor","Alice","Dan","2017-11-22",_).
s3306_c("agricultural labor","Alice","Emily","2017-11-22",_).
s3306_c("agricultural labor","Alice","Fred","2017-11-22",_).
s3306_c("agricultural labor","Alice","Bob","2017-12-01",_).
s3306_c("agricultural labor","Alice","Cameron","2017-12-01",_).
s3306_c("agricultural labor","Alice","Dan","2017-12-01",_).
s3306_c("agricultural labor","Alice","Emily","2017-12-01",_).
s3306_c("agricultural labor","Alice","George","2017-12-01",_).
s3306_c("agricultural labor","Alice","Bob","2017-12-03",_).
s3306_c("agricultural labor","Alice","Cameron","2017-12-03",_).
s3306_c("agricultural labor","Alice","Dan","2017-12-03",_).
s3306_c("agricultural labor","Alice","Emily","2017-12-03",_).
s3306_c("agricultural labor","Alice","George","2017-12-03",_).
purpose_("agricultural labor","agricultural labor").

% Test
:- \+ s3306_a_2_B("Alice",_,_,_,_,2017).
:- halt.

