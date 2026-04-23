/**
 * Single source of truth for the stretch library.
 *
 * Every exercise here is drawn from public desk-stretch references
 * (NHS "stretches to do at your desk", ACE Fitness Office Stretch Guide,
 * Mayo Clinic office ergonomics). Movements are conservative and
 * self-limiting: nothing here requires a mat, props, or standing.
 *
 * Disclaimer shown to the user: "Not medical advice. Stop if it hurts."
 *
 * Each record:
 *   id          kebab-case filename of the Lottie JSON in src/assets/lottie/
 *   title       short display title (Fraunces display font)
 *   desc        one or two sentences a user reads and does
 *   seconds     recommended hold time
 *   side        'bilateral' | 'unilateral' (ask user to repeat other side)
 *   tags        for filtering/rotation logic
 */

const EXERCISES = [
  {
    id: 'sky-reach',
    title: 'Sky Reach',
    desc: 'Interlace your fingers, press your palms upward, and lengthen through your ribs. Breathe in for four, out for six.',
    seconds: 30,
    side: 'bilateral',
    tags: ['spine', 'shoulders']
  },
  {
    id: 'chest-opener',
    title: 'Chest Opener',
    desc: 'Clasp your hands behind your lower back. Gently draw your shoulder blades together and lift your chest.',
    seconds: 25,
    side: 'bilateral',
    tags: ['chest', 'shoulders']
  },
  {
    id: 'shoulder-roll',
    title: 'Shoulder Roll',
    desc: 'Lift your shoulders toward your ears, roll them back and down. Five slow circles in each direction.',
    seconds: 30,
    side: 'bilateral',
    tags: ['shoulders', 'neck']
  },
  {
    id: 'neck-crescent',
    title: 'Neck Crescent',
    desc: 'Let your chin fall toward your chest. Trace a slow half-circle ear-to-ear. Keep the shoulders heavy.',
    seconds: 30,
    side: 'bilateral',
    tags: ['neck']
  },
  {
    id: 'seated-twist',
    title: 'Seated Twist',
    desc: 'Place your right hand on the back of your chair, left hand on the right knee. Rotate gently. Hold, then switch.',
    seconds: 25,
    side: 'unilateral',
    tags: ['spine', 'back']
  },
  {
    id: 'cat-cow',
    title: 'Seated Cat-Cow',
    desc: 'Hands on knees. Inhale, arch your back and open your chest. Exhale, round the spine and tuck the chin.',
    seconds: 40,
    side: 'bilateral',
    tags: ['spine', 'back']
  },
  {
    id: 'wrist-extensor',
    title: 'Wrist Stretch',
    desc: 'Extend your arm, palm up. With the other hand, gently pull your fingers back toward you. Hold, then switch.',
    seconds: 20,
    side: 'unilateral',
    tags: ['wrists', 'forearms']
  },
  {
    id: 'ankle-stretch',
    title: 'Ankle Stretch',
    desc: 'Cross your right ankle over your left knee. Hinge forward from the hips until you feel the hip release. Switch.',
    seconds: 30,
    side: 'unilateral',
    tags: ['hips', 'glutes']
  },
  {
    id: 'ankle-orbit',
    title: 'Ankle Orbits',
    desc: 'Lift one foot off the floor. Trace ten slow circles with your toes, then reverse. Switch feet.',
    seconds: 30,
    side: 'unilateral',
    tags: ['ankles', 'legs']
  },
  {
    id: 'reset-breath',
    title: 'Reset Breath',
    desc: 'Close your eyes. Inhale through the nose for four. Exhale through the mouth for six. Three rounds.',
    seconds: 30,
    side: 'bilateral',
    tags: ['breath', 'nervous-system']
  }
];

/** Pick the next exercise. Avoids repeating the last one. */
function pickExercise(lastId) {
  const pool = EXERCISES.filter((e) => e.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getExerciseById(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXERCISES, pickExercise, getExerciseById };
}
if (typeof window !== 'undefined') {
  window.StretchExercises = { EXERCISES, pickExercise, getExerciseById };
}
