// Draws one recorded step at a time from REPLAY (written into the page by replay/build.ts). Every word shown comes from
// the files Resolve wrote on the recorded run, from replay/steps.json, or from replay/display.json (plain wording for a
// finding or option, with the recorded wording kept under "As recorded"); nothing here decides anything.
// Each step leads with its one-line result; the detail (findings, cases, what changed) sits in lists that open on demand.
(() => {
  const R = window.REPLAY;
  const OUT = { approve: "Approve", incomplete: "Incomplete", request_docs: "Request documents", escalate: "Escalate", decline: "Decline" };
  // The brand's stamp class for each outcome (docs/brand/tokens.css).
  const STAMP = { approve: "o-approve", incomplete: "o-incomplete", request_docs: "o-request", escalate: "o-escalate", decline: "o-decline" };
  const KIND = { gap: "Gap", contradiction: "Rules conflict", unknowns: "Missing information", judgment: "Judgment call", uncovered: "Not covered" };
  // Plain wording for a finding and its options, by finding id; the recorded text where there is none.
  const D = R.display?.findings ?? {};
  // A plain field replaces a recorded one only where the step's files have it: no question before Claude writes it.
  const shown = (f) => ({ title: D[f.id]?.title ?? f.title, explain: D[f.id]?.explain ?? f.explain, question: f.question ? D[f.id]?.question ?? f.question : null });
  const optSay = (id, option) => D[id]?.options?.[option]?.say ?? option;
  const optMeans = (id, option, says) => D[id]?.options?.[option]?.means ?? says;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const outcome = (o) => o ? `<span class="stamp ${STAMP[o] ?? ""}">${esc(OUT[o] ?? o)}</span>` : `<span class="muted">none</span>`;
  const stamp = (text, cls = "") => `<span class="stamp ${cls}">${esc(text)}</span>`;
  const ref = (r) => R.sop[r] ? `<span class="sop-ref" title="${esc(R.sop[r])}">${esc(r)}</span>` : esc(r);
  const refs = (rs) => rs.map(ref).join(", ");
  const sections = (rs) => `${rs.length === 1 ? "Section" : "Sections"} ${refs(rs)}`;
  const facts = (fs) => fs?.length ? `<ul class="facts">${fs.map((f) => `<li class="${f.read_by_change ? "read" : ""}">${esc(f.name)}${f.item ? ` (${f.list === "people" ? "person" : "item"} ${f.item})` : ""}: ${esc(f.value)}</li>`).join("")}</ul>` : "";
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const flip = (from, to) => `<span class="flip">${outcome(from)} <span class="arrow">→</span> ${outcome(to)}</span>`;

  // The owner's answer to a finding, from the run's last answers file: the choice sent for that finding on that version.
  const answers = R.steps.at(-1).answers;
  const choiceFor = (f, version) => {
    const sent = answers.filter((a) => a.type === "send" && a.spec_version === version).flatMap((a) => a.ids);
    if (!sent.includes(f.id)) return null;
    return answers.filter((a) => a.type === "finding" && a.id === f.id && a.spec_version === version).at(-1)?.choice ?? null;
  };

  // A list of kinds of case that decide differently: each row is the change, and opens to the example and its facts,
  // which the example's "as listed" points to.
  const changeList = (changes) => `<div class="rows">${changes.map((c) => `<details class="row" data-part="change"><summary>${flip(c.from, c.to)}</summary><div class="body"><p class="muted">${esc(c.example)}</p>${facts(c.example_facts)}</div></details>`).join("")}</div>`;

  function impactHtml(imp) {
    if (!imp) return `<p class="muted">Not worked out yet.</p>`;
    if (imp.problems?.length) return `<div class="tags">${stamp("Can't be used")}</div><ul>${imp.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
    const tags = [imp.keeps_rules ? stamp("Rules unchanged", "plain") : imp.resolves ? stamp("Fixes this problem") : stamp("The problem stays", "plain")];
    const lines = (imp.new_findings ?? []).map((n) => `<p>New problem: ${esc(D[n.id]?.title ?? n.title)}</p>`);
    const changes = imp.changes ?? [];
    const scope = imp.searched_items_per_list == null ? "No decision changes." : `No decision changes, in any case with up to ${imp.searched_items_per_list} people or items in each list.`;
    lines.push(changes.length
      ? `<details class="more"><summary>${plural(changes.length, "kind of decision changes", "kinds of decision change")}</summary>${changeList(changes)}</details>`
      : `<p class="muted">${imp.keeps_rules ? "No decision changes." : scope}</p>`);
    if ((imp.flips ?? []).length) lines.push(`<p>Example cases that change: ${imp.flips.map((x) => `${esc(x.name ?? x.case_id)} ${flip(x.from, x.to)}`).join("; ")}</p>`);
    return `<div class="impact" data-part="impact"><div class="tags">${tags.join(" ")}</div>${lines.join("")}</div>`;
  }

  // The pane's card: kind · SOP refs, the bold title, then (opened) the why, the question and its options, the logic collapsed.
  function findingHtml(f, spec, i, open) {
    // A step that asks the question doesn't show the options' effects yet; the step after it does.
    const showImpact = !(R.steps[i].focus ?? []).includes("question");
    const chosen = choiceFor(f, spec.version);
    // Shown from the step before the owner sends it, so the reader can follow which option goes ahead.
    const answeredHere = chosen && R.steps.slice(0, i + 2).some((s) => s.answers.some((a) => a.type === "send" && a.spec_version === spec.version && a.ids.includes(f.id)));
    const edits = f.option_edits ?? [];
    const options = edits.length
      ? `<div class="options">${edits.map((o) => {
          const imp = (f.impact ?? []).find((x) => x.option === o.option);
          const isChosen = answeredHere && o.option === chosen;
          return `<div class="option ${isChosen ? "chosen" : ""}"><div class="pick">${esc(optSay(f.id, o.option))}${isChosen ? ` <span class="chosen-tag">The SOP owner picks this next</span>` : ""}</div><p class="muted" data-part="options">${esc(optMeans(f.id, o.option, o.says))}</p>${f.impact && showImpact ? impactHtml(imp) : ""}</div>`;
        }).join("")}</div>`
      : "";
    const proof = f.proof ? `<details class="more" data-part="logic"><summary>Show the logic</summary><p>${esc(f.proof.asks)}</p><pre>${esc(f.proof.code)}</pre><p class="label">Z3 answered ${esc(f.proof.answer)} in ${esc(f.proof.ms)} ms</p></details>` : "";
    const t = shown(f);
    // The recorded wording, as Resolve and Claude wrote it, when the tour shows plain wording instead.
    const recorded = D[f.id] ? `<details class="more" data-part="logic"><summary>As recorded</summary>
        <p><strong>${esc(f.title)}</strong></p><p class="muted">${esc(f.explain)}</p>${f.example ? `<p class="muted">Example: ${esc(f.example)}</p>${facts(f.example_facts)}` : ""}
        ${f.question ? `<p>${esc(f.question)}</p>` : ""}${edits.length ? `<ul>${edits.map((o) => `<li><strong>${esc(o.option)}</strong>: ${esc(o.says)}</li>`).join("")}</ul>` : ""}</details>` : "";
    return `<details class="card" name="findings"${open ? " open" : ""}>
      <summary><span class="kind"><span class="stamp kind-stamp">${esc(KIND[f.kind] ?? f.kind)}</span><span>${sections(f.sop_refs)}</span></span><span class="title">${esc(t.title)}</span></summary>
      <div class="body">
        <div class="why" data-part="why"><p>${esc(t.explain)}</p>
        ${f.example && !D[f.id] ? `<p class="muted">Example: ${esc(f.example)}</p>${facts(f.example_facts)}` : ""}</div>
        ${t.question ? `<p class="question" data-part="question">${esc(t.question)}</p>` : ""}
        ${options}<div class="tags">${recorded}${proof}</div>
      </div></details>`;
  }

  // The cases as one summary line, then a row each: the rules' outcome, opening to why. A case that flipped starts open.
  function casesHtml(cases, prev, version) {
    const before = new Map((prev?.cases ?? []).map((c) => [c.id, c.check?.spec_outcome]));
    const counts = new Map();
    for (const c of cases) counts.set(c.check?.spec_outcome, (counts.get(c.check?.spec_outcome) ?? 0) + 1);
    const summary = [...counts].sort((a, b) => b[1] - a[1]).map(([o, n]) => `${n} ${esc((OUT[o] ?? o ?? "none").toLowerCase())}`).join(", ");
    const rows = cases.map((c) => {
      const now = c.check?.spec_outcome, was = before.get(c.id);
      const flipped = prev && was && was !== now;
      const differs = c.outcome && c.outcome !== now;
      return `<details class="row case${flipped ? " flipped" : ""}" data-part="${flipped || differs ? "flips" : "case"}"${flipped || differs ? " open" : ""}>
        <summary><span class="id">${esc(c.id)}</span><span class="nm">${esc(c.name)}</span>${flipped ? `<span class="was">was ${outcome(was)}</span>` : ""}${outcome(now)}</summary>
        <div class="body">
          ${differs ? `<p>Decision recorded in the case file: ${outcome(c.outcome)}. Under these rules: ${outcome(now)}.</p>` : ""}
          <p class="muted">${esc(differs ? c.decided_by.replace(/^The file says [^.]*\. /, "") : c.decided_by)}</p>
          ${(c.missing ?? []).length ? `<p class="muted">Missing: ${c.missing.map(esc).join(" ")}</p>` : ""}
        </div></details>`;
    }).join("");
    return `<section data-part="cases"><h3>${plural(cases.length, "case", "cases")} under version ${version}: ${summary}</h3><div class="rows">${rows}</div></section>`;
  }

  function answerLine(a) {
    if (a.type === "finding") return `${esc(D[a.id]?.title ?? a.id)}: <strong>${esc(optSay(a.id, a.choice))}</strong>`;
    if (a.type === "send") return "";
    if (a.type === "approve_spec") return `Approved version ${a.version}, exactly as shown`;
    return esc(JSON.stringify(a));
  }

  const navButtons = (i, where) => `
    <div class="pager ${where}">
      <button type="button" class="quiet" data-go="${i - 1}" ${i === 0 ? "disabled" : ""}>← Previous</button>
      ${where === "bottom" && i < R.steps.length - 1 ? `<button type="button" class="primary" data-go="${i + 1}">Next: ${esc(R.steps[i + 1].title)} →</button>` : `<button type="button" class="quiet" data-go="${i + 1}" ${i === R.steps.length - 1 ? "disabled" : ""}>Next →</button>`}
    </div>`;

  function stepHtml(i) {
    const s = R.steps[i], prev = R.steps[i - 1], spec = s.spec;
    const added = s.answers.filter((a) => !(prev?.answers ?? []).some((b) => JSON.stringify(b) === JSON.stringify(a)));
    const sentHere = s.answers.filter((a) => a.type === "send" && a.spec_version === spec.version).flatMap((a) => a.ids);
    const open = spec.findings.filter((f) => !sentHere.includes(f.id));
    const changes = spec.changes_from_previous ?? [];
    const past = spec.past_cases ?? [];
    return `
      <div class="step-head">
        <div class="meta">
          <span class="label">Step ${i + 1} of ${R.steps.length} · ${esc(s.by)}${s.seconds ? ` · ${s.seconds} s` : ""}</span>
          <button type="button" class="quiet focus-toggle" aria-pressed="${!showAll}">${showAll ? "Show the gist only" : "Show all details"}</button>
          ${navButtons(i, "top")}
        </div>
        <h2>${esc(s.title)}</h2>
        <p class="result">${esc(s.result)}</p>
        <p>${esc(s.text)}</p>
        <div class="tags" data-part="spec">${stamp(`Rules v${spec.version}`, "plain")} ${spec.approved ? stamp("Approved, now in use") : spec.version === 1 ? stamp("In use") : stamp("Draft, not in use yet", "o-incomplete")}</div>
        <details class="more" data-part="about"><summary>What ran</summary><pre>${s.commands.map(esc).join("\n")}</pre>
          <p class="muted">Version ${spec.version}'s fingerprint, a hash of its exact text that an approval must name: <code>${esc(spec.spec_hash)}</code></p>
          ${(spec.applied ?? []).length ? `<p class="muted">Answers this version holds: ${spec.applied.map((a) => `“${esc(optSay(a.id, a.choice))}” (added in version ${a.applied_in})`).join("; ")}</p>` : ""}
          ${(s.runs ?? []).length ? `<p class="muted">Claude's calls, saved whole in <code>runs/options/</code>: ${s.runs.map((r) => `<code>${esc(r)}</code>`).join(", ")}</p>` : ""}</details>
      </div>
      ${added.length ? `<section data-part="sent"><h3>From the SOP owner</h3><ul class="sent">${added.map(answerLine).filter(Boolean).map((l) => `<li>${l}</li>`).join("")}</ul></section>` : ""}
      ${changes.length && prev?.spec.version !== spec.version ? `<section data-part="changes"><h3>${plural(changes.length, "kind of decision changes", "kinds of decision change")} from version ${spec.version - 1}</h3>
        ${past.length ? `<p data-part="flips">Example cases that change: ${past.map((p) => `<strong>${esc(p.name)}</strong> ${flip(p.previous_spec_decision, p.spec_decision)}`).join("; ")}</p>` : ""}
        ${changeList(changes)}</section>` : ""}
      <section data-part="findings">
        <h3>Problems Z3 found · ${spec.findings.length ? `${open.length} of ${spec.findings.length} open` : "none"}</h3>
        ${spec.findings.length ? `<div class="cards">${spec.findings.map((f, k) => findingHtml(f, spec, i, k === 0)).join("")}</div>` : `<p class="muted">Z3 finds no rule that can never decide a case, no missing information handled differently from 2.2, and no fact the bank collects that never changes a decision.</p>`}
      </section>
      ${casesHtml(s.cases.cases, prev?.cases, spec.version)}
      ${navButtons(i, "bottom")}`;
  }

  // "Show all details", remembered per browser.
  let showAll = false;
  try { showAll = localStorage.getItem("replay-show-all") === "1"; } catch (e) { /* a convenience */ }
  // Tests draw steps without a page (replay/build.test.ts).
  window.REPLAY_VIEW = { stepHtml };
  const nav = document.getElementById("steps"), body = document.getElementById("step");
  if (!nav || !body) return;
  nav.innerHTML = `<ol>${R.steps.map((s, i) => `<li><button type="button" data-go="${i}" title="${esc(s.title)}"><span class="n">${i + 1}</span><span class="t">${esc(s.short)}</span></button></li>`).join("")}</ol>`;
  let current = 0;
  // The gist: each step names the parts that carry it (focus in steps.json). Those get the highlighter's bar; every other
  // part is collapsed. A section folds to its heading, which opens it; anything else hides behind one "Show the rest"
  // per card or section. "Show all details" opens everything, and is remembered.
  const NEUTRAL = ["spec", "about", "logic"]; // already small or collapsed: never folded
  function markGist(focus) {
    if (showAll) return;
    const hidden = new Set();
    for (const el of body.querySelectorAll("[data-part]")) {
      if (focus.includes(el.dataset.part)) el.classList.add("gist");
      else if (NEUTRAL.includes(el.dataset.part) || el.parentElement.closest(".gist, .folded")) continue;
      else if (focus.some((f) => el.querySelector(`[data-part="${f}"]`))) continue; // holds the gist: stays open
      else if (el.tagName === "SECTION") {
        el.classList.add("folded");
        const h = el.querySelector("h3");
        h.setAttribute("role", "button"); h.tabIndex = 0; h.setAttribute("aria-expanded", "false");
      } else { el.classList.add("hid"); hidden.add(el.parentElement.closest(".body, section")); }
    }
    for (const box of hidden) {
      if (!box) continue;
      const rows = box.querySelectorAll(".row.hid").length;
      box.insertAdjacentHTML("beforeend", `<button type="button" class="quiet reveal">${rows ? `Show ${rows} more` : "Show the rest"}</button>`);
    }
  }
  const unfold = (h) => { h.closest("section").classList.remove("folded"); h.setAttribute("aria-expanded", "true"); h.removeAttribute("role"); h.removeAttribute("tabindex"); };
  body.addEventListener("click", (e) => {
    const h = e.target.closest(".folded > h3");
    if (h) return unfold(h);
    const r = e.target.closest(".reveal");
    if (r) { const box = r.parentElement; box.querySelectorAll(".hid").forEach((x) => x.classList.remove("hid")); r.remove(); return; }
    if (!e.target.closest(".focus-toggle")) return;
    showAll = !showAll;
    try { localStorage.setItem("replay-show-all", showAll ? "1" : "0"); } catch (err) { /* a convenience */ }
    go(current);
  });
  body.addEventListener("keydown", (e) => { const h = e.target.closest?.(".folded > h3"); if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); unfold(h); } });
  function go(i, scroll) {
    if (i < 0 || i >= R.steps.length) return;
    current = i;
    body.innerHTML = stepHtml(current);
    markGist(R.steps[current].focus ?? []);
    nav.querySelectorAll("li").forEach((li, k) => {
      li.className = k < current ? "done" : k === current ? "now" : "later";
      const b = li.querySelector("button");
      if (k === current) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    // From the bottom of a long step, bring the new step's top into view.
    if (scroll && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: "start" });
    try { history.replaceState(null, "", `#step-${current + 1}`); } catch (e) { /* hash routing is a convenience */ }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-go]");
    if (b && !b.disabled) go(Number(b.dataset.go), !nav.contains(b));
  });
  // One finding open at a time, where the browser doesn't group <details name> itself.
  body.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.open && d.getAttribute?.("name") === "findings") body.querySelectorAll('details[name="findings"][open]').forEach((x) => { if (x !== d) x.open = false; });
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("input, textarea, select")) return;
    if (e.key === "ArrowRight") go(current + 1, true);
    if (e.key === "ArrowLeft") go(current - 1, true);
  });
  const fromHash = () => { const m = /^#step-(\d+)$/.exec(location.hash); return m ? Number(m[1]) - 1 : 0; };
  window.addEventListener("hashchange", () => { if (fromHash() !== current) go(fromHash()); });
  go(Math.min(Math.max(fromHash(), 0), R.steps.length - 1));
})();
