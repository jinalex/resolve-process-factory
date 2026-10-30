// The animation beside the lander's headline: SOP 3.3 becomes a rule, then an agent works a real example case (Northwind
// Coffee, EX-1), checking with Resolve, fetching the fact it says is still needed, and submitting once nothing is. Elements
// carry the step they appear at (data-in) or leave at (data-out), or get underlined at (data-at). It loops, stops when off
// screen or paused, and shows its last frame still for anyone who asks for reduced motion.
const TIMES = [0, 700, 1900, 2900, 3500, 4300, 5000, 5900, 7300, 8000, 8900, 9600, 10600, 14500]; // ms from the start of a loop; the last is the fade

function setStep(root, n) {
  for (const el of root.querySelectorAll("[data-in]")) el.classList.toggle("on", n >= +el.dataset.in && n < +(el.dataset.out ?? Infinity));
  for (const el of root.querySelectorAll("[data-at]")) el.classList.toggle("on", n >= +el.dataset.at);
}

const root = document.querySelector(".ha");
if (root) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const last = TIMES.length - 1, btn = root.querySelector(".ha-pause");
  let step = 0, timer = 0, paused = false, visible = true;
  const schedule = () => {
    clearTimeout(timer);
    if (reduce.matches) return setStep(root, last - 1);
    if (paused || !visible) return;
    timer = setTimeout(() => {
      if (++step < last) { setStep(root, step); return schedule(); }
      root.classList.add("fading");
      timer = setTimeout(() => { root.classList.remove("fading"); step = 0; setStep(root, 0); schedule(); }, 550);
    }, TIMES[step + 1] - TIMES[step]);
  };
  btn.addEventListener("click", () => {
    paused = !paused;
    btn.textContent = paused ? "Play" : "Pause";
    btn.setAttribute("aria-pressed", String(paused));
    schedule();
  });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; schedule(); }).observe(root);
  document.addEventListener("visibilitychange", () => { visible = !document.hidden; schedule(); });
  reduce.addEventListener("change", schedule);
  setStep(root, 0);
  schedule();
}
