# Builds sop.md from SARA's statute text in source/statutes/source/, word for word. Each lettered subsection becomes
# a top-level section and each numbered paragraph a numbered section, with its clauses ((A), (i), (I)) kept inline
# under their labels, because the rule format reads two levels of numbering. Paragraph titles ("In general") are
# dropped and listed in the header. Only section 1 is ours. Run: python3 build_sop.py
import re
from pathlib import Path

HERE = Path(__file__).parent
STATUTES = ["section2", "section7703"]

out, mapping, n = [], [], 1
for name in STATUTES:
    lines = (HERE / "source/statutes/source" / name).read_text().split("\n")
    title = lines[0].strip()
    i, para = 0, None
    for raw in lines[1:]:
        if not raw.strip():
            continue
        indent, text = len(raw) - len(raw.lstrip()), raw.strip()
        m = re.match(r"\((\w+)\)\s*(.*)", text)
        if indent == 0 and m and m.group(1).isalpha():                     # (a) Title: a new top-level section
            n += 1; i = 0; para = None
            out.append(["head", f"## {n}. {m.group(2)}"])
            mapping.append(f"{n} is {title.split('.')[0]}({m.group(1)})")
            sub = m.group(1)
        elif indent == 4 and m and m.group(1).isdigit():                   # (1) a paragraph, maybe with a title line
            i += 1
            body = m.group(2)
            titled = not re.search(r"[.;,\-]$|\band$|\bor$", body) and len(body.split()) <= 6
            para = ["para", f"{n}.{i}.", "" if titled else body]
            out.append(para)
            mapping.append(f"{n}.{i} is ({sub})({m.group(1)})" + (f", titled \"{body}\"" if titled else ""))
        elif indent == 0 and para is not None:                              # text after the paragraphs: a section of its own
            i += 1
            para = ["para", f"{n}.{i}.", text]
            out.append(para)
            mapping.append(f"{n}.{i} is the closing words of ({sub})")
        elif para is None:                                                  # text before the first paragraph
            out.append(["text", text])
        else:                                                               # a clause or a paragraph's own text
            para[2] = f"{para[2]} {text}".strip()

doc = [
    "# Surviving spouse, head of household and marital status (SARA's edited 26 U.S.C. 2 and 7703)",
    "",
    "The statute text is SARA's (Holzenberger, Blair-Stanek and Van Durme, 2020; nlp.jhu.edu/law), word for word. Only the numbering is ours, so the rule format can cite it, and section 1 is ours: the statutes name no outcomes and don't say what an unknown fact means.",
    "",
    "Numbering: " + "; ".join(mapping) + ".",
    "",
    "## 1. How a case is decided",
    "",
    "A case is one taxpayer and one taxable year. Every case receives exactly one outcome:",
    "",
    "- **Surviving spouse**: the taxpayer is a surviving spouse for the year under section 2(a).",
    "- **Head of household**: the taxpayer is a head of a household for the year under section 2(b).",
    "- **Review**: a required fact has not been established yet. A reviewer finds it before deciding.",
    "- **Neither**: the taxpayer is neither.",
    "",
    "1.1. A fact that has not been established is unknown, not false. If any fact required by this procedure is unknown, the case cannot be decided on it.",
    "",
]
for kind, *rest in out:
    if kind == "head": doc += ["", rest[0], ""]
    elif kind == "text": doc += [rest[0], ""]
    else: doc += [f"{rest[0]} {rest[1]}", ""]
(HERE / "sop.md").write_text(re.sub(r"\n{3,}", "\n\n", "\n".join(doc)).rstrip() + "\n")
print("\n".join(mapping))
