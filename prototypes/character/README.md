# 3D guide studio

A standalone review tool for the app's 3D exercise guide. It adds a scrubber, rep segments, free orbiting and a larger stage, so you can inspect choreography frame by frame. The guide itself lives in `src/guide/`:

- `src/guide/person.mjs` builds the character and its rig:
  - capsule limbs with shared joint spheres
  - a skinned SDF torso with a breathing morph, and a hem that drapes over the thighs when seated
  - two-bone IK with soft reach, hand orientation, foot planting, and finger curls
- `src/guide/choreography.mjs` poses the character as a pure function of the session clock. It uses the app's `sample()` for phases, reps and sides.
- `src/guide/stage.mjs` is the in-app renderer: lighting, camera director and on-demand drawing. It has the same `render(exercise, seconds, reduced, view)` contract as the SVG figure.
- `src/guide/index.mjs` exposes `window.StretchGuide.create(container)`. It shows the SVG figure at once, crossfades to 3D when ready, and falls back to SVG if WebGL is unavailable or lost.

```sh
npm run character:preview
# http://127.0.0.1:4174
```

Everything visible is generated from local JavaScript. There are no downloaded models, textures or animation clips.

Checks:
- `npm test` includes `tests/guide.test.js`. For every exercise it checks:
  - skin weights, bone lengths, and that there are no jumps or pops
  - planted feet
  - hand contacts
  - forearm clearance, and that the shirt never passes through the thighs
  - phases match the app clock, and every exercise loops seamlessly
- `npm run character:test` drives this studio in Chromium and WebKit.
- `npm run test:ui` checks the guide inside the real app.
