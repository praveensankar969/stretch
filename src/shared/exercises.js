(function (root) {
  "use strict";
  const SOURCES = {
    sitting: {
      name: "NHS · Sitting exercises",
      url: "https://www.nhs.uk/live-well/exercise/sitting-exercises/",
    },
    wrists: {
      name: "Mayo Clinic · Wrist & forearm stretches",
      url: "https://www.mayoclinic.org/healthy-lifestyle/adult-health/multimedia/forearm-stretches/vid-20084698",
    },
    shoulders: {
      name: "Mayo Clinic · Movement at work",
      url: "https://sportsmedicine.mayoclinic.org/news/the-importance-of-stretching-during-your-workday/",
    },
    flexibility: {
      name: "NHS · Flexibility exercises",
      url: "https://assets.nhs.uk/prod/documents/NHS-flexibility-exercise.pdf",
    },
    breathing: {
      name: "NHS · Gentle breathing",
      url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/",
    },
    breaks: {
      name: "HSE · Work routine and breaks",
      url: "https://www.hse.gov.uk/msd/dse/work-routine.htm",
    },
  };
  // Durations include transitions. Short desk-break adaptations, not treatment prescriptions.
  const EXERCISES = [
    {
      id: "neck-turn",
      view: { angle: "front", framing: "body" },
      title: "Neck reset",
      region: "Neck",
      tags: ["neck"],
      mode: "hold",
      repetitions: 6,
      hold: 5,
      transition: 2,
      alternate: true,
      desc: "Sit tall. Turn your head gently to one side, then return. Keep shoulders still.",
      cue: "Turn only as far as feels easy. No neck circles.",
      source: "sitting",
      seated: true,
    },
    {
      id: "shoulder-roll",
      view: { angle: "three-quarter-side", framing: "body" },
      title: "Shoulder rolls",
      region: "Shoulders",
      tags: ["shoulders", "neck"],
      mode: "cycle",
      repetitions: 5,
      cycle: 6,
      desc: "Slowly lift your shoulders, roll them back, and let them settle down.",
      cue: "Keep your arms loose and breathe naturally.",
      source: "shoulders",
      seated: true,
    },
    {
      id: "chest-opener",
      view: { angle: "three-quarter", framing: "body" },
      title: "Open your chest",
      region: "Chest & shoulders",
      tags: ["shoulders", "back"],
      mode: "hold",
      repetitions: 5,
      hold: 6,
      transition: 2,
      desc: "Open your arms low and wide. Ease your shoulders back and lift your chest.",
      cue: "Stay tall; avoid arching your lower back.",
      source: "sitting",
      seated: true,
    },
    {
      id: "seated-twist",
      view: { angle: "three-quarter", framing: "body" },
      title: "Seated unwind",
      region: "Upper back",
      tags: ["back"],
      mode: "hold",
      repetitions: 6,
      hold: 5,
      transition: 2,
      alternate: true,
      desc: "Cross your arms over your chest. Turn your upper body; keep hips facing forward.",
      cue: "Feet flat. Use a stable chair without wheels.",
      source: "sitting",
      seated: true,
    },
    {
      id: "wrist-extensor",
      view: { angle: "side", framing: "wrists" },
      title: "Wrist release",
      region: "Wrists & forearms",
      tags: ["wrists"],
      mode: "hold",
      repetitions: 2,
      hold: 20,
      transition: 3,
      alternate: true,
      desc: "Reach one arm forward, palm down. Ease the hand downward with your other hand.",
      cue: "Apply light pressure. Relax your fingers; never pull into pain.",
      source: "wrists",
      seated: true,
    },
    {
      id: "wrist-flexor",
      view: { angle: "side", framing: "wrists" },
      title: "Forearm release",
      region: "Wrists & forearms",
      tags: ["wrists"],
      mode: "hold",
      repetitions: 2,
      hold: 20,
      transition: 3,
      alternate: true,
      desc: "Reach one arm forward, palm up. Let the hand bend down; support it gently with your other hand.",
      cue: "Keep the elbow soft. Switch arms when the guide changes.",
      source: "wrists",
      seated: true,
    },
    {
      id: "ankle-pumps",
      view: { angle: "side", framing: "ankles" },
      title: "Ankle wake-up",
      region: "Ankles & legs",
      tags: ["legs"],
      mode: "cycle",
      repetitions: 10,
      cycle: 4,
      alternate: true,
      sideEvery: 5,
      desc: "Raise one foot. Slowly point your toes away, then draw them back. Change feet halfway.",
      cue: "Hold the chair for balance. Keep the movement small.",
      source: "sitting",
      seated: true,
    },
    {
      id: "side-bend",
      view: { angle: "front", framing: "body" },
      title: "Standing side bend",
      region: "Sides & back",
      tags: ["back", "legs"],
      mode: "hold",
      repetitions: 6,
      hold: 2,
      transition: 2,
      alternate: true,
      desc: "Stand with feet hip-width apart. Slide one hand down your side; come back upright.",
      cue: "Bend sideways without leaning forward. Stay within an easy range.",
      source: "flexibility",
      seated: false,
    },
    {
      id: "reset-breath",
      view: { angle: "front", framing: "body" },
      title: "A little breathing room",
      region: "Breathing",
      tags: ["breath"],
      mode: "breath",
      repetitions: 3,
      cycle: 10,
      desc: "Settle your feet. Breathe gently in through your nose and out through your mouth.",
      cue: "Follow your own comfortable breath. This is a short pause, not the full NHS routine.",
      source: "breathing",
      seated: true,
    },
    {
      id: "walk-break",
      view: { angle: "side", framing: "body" },
      title: "Leave the desk",
      region: "Whole body",
      tags: ["legs"],
      mode: "walk",
      repetitions: 1,
      cycle: 60,
      desc: "If comfortable, stand up and take an easy walk. Look away from your screen.",
      cue: "A minute is a starting point. Take a longer break when you can.",
      source: "breaks",
      seated: false,
    },
  ].map((ex) => ({
    ...ex,
    seconds:
      ex.repetitions *
      (ex.mode === "hold" ? ex.hold + 2 * ex.transition : ex.cycle),
  }));
  function getExerciseById(id) {
    return EXERCISES.find((ex) => ex.id === id) || EXERCISES[0];
  }
  function pickExercise(
    lastId,
    focus = "all",
    recent = [],
    random = Math.random,
  ) {
    let pool = EXERCISES.filter(
      (ex) => focus === "all" || ex.tags.includes(focus),
    );
    if (!pool.length) pool = EXERCISES;
    const fresh = pool.filter(
      (ex) =>
        ex.id !== lastId && !recent.slice(-(pool.length - 1)).includes(ex.id),
    );
    const eligible = fresh.length
      ? fresh
      : pool.filter((ex) => ex.id !== lastId);
    const choices = eligible.length ? eligible : pool;
    return choices[
      Math.min(choices.length - 1, Math.floor(random() * choices.length))
    ];
  }
  const api = { EXERCISES, SOURCES, getExerciseById, pickExercise };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.StretchExercises = api;
})(typeof window !== "undefined" ? window : null);
