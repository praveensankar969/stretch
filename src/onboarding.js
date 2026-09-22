"use strict";
const bridge = window.stretch;
const figure = new window.StretchMotion.Figure(
  document.getElementById("welcome-figure"),
);
const ex = window.StretchExercises.getExerciseById("shoulder-roll");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let frame;
function draw(t) {
  if (!document.hidden)
    figure.render(ex, (t / 1000) % ex.seconds, reduced.matches);
  frame = requestAnimationFrame(draw);
}
draw(0);
document.getElementById("quiet-enabled").onchange = (event) => {
  document.getElementById("q-start").disabled = document.getElementById(
    "q-end",
  ).disabled = !event.target.checked;
};
document.getElementById("welcome-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = document.getElementById("finish-btn");
  button.disabled = true;
  try {
    await bridge.completeOnboarding({
      interval: Number(document.querySelector("[name=interval]:checked").value),
      quietStart: document.getElementById("q-start").value,
      quietEnd: document.getElementById("q-end").value,
      quietHoursEnabled: document.getElementById("quiet-enabled").checked,
      autoStart: document.getElementById("q-autostart").checked,
    });
  } catch {
    document.getElementById("onboarding-status").textContent =
      "We couldn’t save your preferences. Please try again.";
    button.disabled = false;
  }
};
window.addEventListener("beforeunload", () => cancelAnimationFrame(frame));
