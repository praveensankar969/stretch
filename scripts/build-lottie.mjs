#!/usr/bin/env node
/**
 * Generates ten Lottie (bodymovin v5.7) animations — one per exercise.
 * Output: src/assets/lottie/<id>.json
 *
 * These are not traced from motion capture; they are anatomy-respecting
 * simplifications modelled on public desk-stretch references:
 *   • NHS "Stretches to do at your desk"
 *   • ACE Fitness Office Stretches
 *   • Mayo Clinic office ergonomics
 *
 * Style: single-weight line art, warm ink on transparent, with the
 * moving limb picked out in terracotta. One honest movement per loop.
 *
 * If you want to replace these with hand-illustrated loops later, drop
 * Bodymovin-exported JSON into src/assets/lottie/ with the same filename.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'assets', 'lottie');
mkdirSync(OUT, { recursive: true });

const hex = (h) => {
  const n = h.replace('#', '');
  return [
    parseInt(n.substring(0, 2), 16) / 255,
    parseInt(n.substring(2, 4), 16) / 255,
    parseInt(n.substring(4, 6), 16) / 255,
    1
  ];
};
const INK = hex('#F2EADF'); 
const ACCENT = hex('#D9734A'); 
const HAIRLINE = hex('#8A7458');

const k = (v) => ({ a: 0, k: v });
const keyed = (frames) => ({
  a: 1,
  k: frames.map((f, i) => {
    const s = Array.isArray(f.s) ? f.s : [f.s];
    const node = { t: f.t, s };
    if (i < frames.length - 1) {
      const dims = s.length;
      node.i = { x: Array(dims).fill(0.45), y: Array(dims).fill(1) };
      node.o = { x: Array(dims).fill(0.55), y: Array(dims).fill(0) };
    }
    return node;
  })
});

function line(from, to, color, width, { animate, anchor, parent, name } = {}) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const transform = {
    p: k([0, 0]),
    a: k([0, 0]),
    s: k([100, 100]),
    r: k(0),
    o: k(100)
  };
  return {
    ddd: 0,
    ind: 0,
    ty: 4,
    nm: name || 'line',
    sr: 1,
    ks: {
      o: k(100),
      r: animate && animate.rotation ? keyed(animate.rotation) : k(0),
      p: animate && animate.position ? keyed(animate.position) : k([0, 0, 0]),
      a: k([0, 0, 0]),
      s:
        animate && animate.scale
          ? keyed(animate.scale)
          : k([100, 100, 100])
    },
    ao: 0,
    parent,
    shapes: [
      {
        ty: 'gr',
        nm: 'g',
        it: [
          {
            ty: 'sh',
            ks: {
              a: 0,
              k: {
                i: [[0, 0], [0, 0]],
                o: [[0, 0], [0, 0]],
                v: [
                  [x1 - (anchor?.[0] || 0), y1 - (anchor?.[1] || 0)],
                  [x2 - (anchor?.[0] || 0), y2 - (anchor?.[1] || 0)]
                ],
                c: false
              }
            }
          },
          {
            ty: 'st',
            c: k(color),
            w: k(width),
            lc: 2,
            lj: 2,
            o: k(100)
          },
          {
            ty: 'tr',
            ...transform
          }
        ]
      }
    ],
    ip: 0,
    op: 180,
    st: 0,
    bm: 0
  };
}

function circle(center, radius, fill, { animate, name, parent } = {}) {
  const [cx, cy] = center;
  return {
    ddd: 0,
    ind: 0,
    ty: 4,
    nm: name || 'dot',
    sr: 1,
    ks: {
      o: k(100),
      r: k(0),
      p: animate?.position ? keyed(animate.position) : k([cx, cy, 0]),
      a: k([0, 0, 0]),
      s: animate?.scale ? keyed(animate.scale) : k([100, 100, 100])
    },
    ao: 0,
    parent,
    shapes: [
      {
        ty: 'gr',
        nm: 'g',
        it: [
          {
            ty: 'el',
            p: k([0, 0]),
            s: k([radius * 2, radius * 2])
          },
          { ty: 'fl', c: k(fill), o: k(100) },
          {
            ty: 'tr',
            p: k([0, 0]),
            a: k([0, 0]),
            s: k([100, 100]),
            r: k(0),
            o: k(100)
          }
        ]
      }
    ],
    ip: 0,
    op: 180,
    st: 0,
    bm: 0
  };
}

function group(origin, { animate, name } = {}) {
  let pTrack;
  if (animate?.position) {
    const frames = animate.position.map((f) => ({
      ...f,
      s: [
        (f.s?.[0] || 0) + origin[0],
        (f.s?.[1] || 0) + origin[1],
        f.s?.[2] || 0
      ]
    }));
    pTrack = keyed(frames);
  } else {
    pTrack = k([origin[0], origin[1], 0]);
  }

  return {
    ddd: 0,
    ind: 0,
    ty: 3, // null layer
    nm: name || 'pivot',
    sr: 1,
    ks: {
      o: k(100),
      r: animate?.rotation ? keyed(animate.rotation) : k(0),
      p: pTrack,
      a: k([0, 0, 0]),
      s: animate?.scale ? keyed(animate.scale) : k([100, 100, 100])
    },
    ao: 0,
    ip: 0,
    op: 180,
    st: 0,
    bm: 0
  };
}

function assemble({ name, op = 180, layers }) {
  let ind = 1;
  const indexed = layers.map((l) => ({ ...l, ind: ind++ }));
  const parented = indexed.map((l) => {
    if (typeof l.parent === 'string') {
      const p = indexed.find((x) => x.nm === l.parent);
      return { ...l, parent: p?.ind };
    }
    return l;
  });
  return {
    v: '5.7.14',
    fr: 30,
    ip: 0,
    op,
    w: 400,
    h: 400,
    nm: name,
    ddd: 0,
    assets: [],
    layers: parented.reverse() 
  };
}

const CX = 200;
const HIP = 260;
const STROKE = 6;
const HEAD_R = 18;

function chairLine() {
  return line(
    [140, HIP + 0],
    [140, HIP + 80],
    HAIRLINE,
    3,
    { name: 'chair' }
  );
}

function figure({ name, torso = {}, head = {}, armR = {}, armL = {}, legR = {}, legL = {} }) {
  const hipsG = group([CX, HIP], { name: 'hips', animate: torso.hips });

  const torsoG = group([0, 0], { name: 'torso', animate: torso.torso });
  torsoG.parent = 'hips';

  const spine = line([0, 0], [0, -80], INK, STROKE + 2, {
    name: 'spine',
    parent: 'torso'
  });

  const shouldersG = group([0, -80], { name: 'shoulders', animate: torso.shoulders });
  shouldersG.parent = 'torso';

  const neckG = group([0, 0], { name: 'neck', animate: head.neck });
  neckG.parent = 'shoulders';
  const neck = line([0, 0], [0, -16], INK, STROKE, { name: 'neckLine', parent: 'neck' });
  const headDot = circle([0, -16 - HEAD_R], HEAD_R, INK, {
    name: 'head',
    parent: 'neck',
    animate: head.head
  });

  const armRupG = group([0, 0], { name: 'armRup', animate: armR.upper });
  armRupG.parent = 'shoulders';
  const armRupLine = line([0, 0], [26, 36], armR.accent ? ACCENT : INK, STROKE, {
    name: 'armRupLine',
    parent: 'armRup'
  });
  const armRloG = group([26, 36], { name: 'armRlo', animate: armR.lower });
  armRloG.parent = 'armRup';
  const armRloLine = line([0, 0], [18, 34], armR.accent ? ACCENT : INK, STROKE, {
    name: 'armRloLine',
    parent: 'armRlo'
  });
  const handR = circle([18, 34], 4, armR.accent ? ACCENT : INK, {
    name: 'handR',
    parent: 'armRlo'
  });

  const armLupG = group([0, 0], { name: 'armLup', animate: armL.upper });
  armLupG.parent = 'shoulders';
  const armLupLine = line([0, 0], [-26, 36], armL.accent ? ACCENT : INK, STROKE, {
    name: 'armLupLine',
    parent: 'armLup'
  });
  const armLloG = group([-26, 36], { name: 'armLlo', animate: armL.lower });
  armLloG.parent = 'armLup';
  const armLloLine = line([0, 0], [-18, 34], armL.accent ? ACCENT : INK, STROKE, {
    name: 'armLloLine',
    parent: 'armLlo'
  });
  const handL = circle([-18, 34], 4, armL.accent ? ACCENT : INK, {
    name: 'handL',
    parent: 'armLlo'
  });

  const legRupG = group([0, 0], { name: 'legRup', animate: legR.upper });
  legRupG.parent = 'hips';
  const legRupLine = line([0, 0], [-22, 48], legR.accent ? ACCENT : INK, STROKE + 1, {
    name: 'legRupLine',
    parent: 'legRup'
  });
  const legRloG = group([-22, 48], { name: 'legRlo', animate: legR.lower });
  legRloG.parent = 'legRup';
  const legRloLine = line([0, 0], [-10, 50], legR.accent ? ACCENT : INK, STROKE + 1, {
    name: 'legRloLine',
    parent: 'legRlo'
  });
  const footR = circle([-10, 50], 5, legR.accent ? ACCENT : INK, {
    name: 'footR',
    parent: 'legRlo'
  });

  const legLupG = group([0, 0], { name: 'legLup', animate: legL.upper });
  legLupG.parent = 'hips';
  const legLupLine = line([0, 0], [24, 44], INK, STROKE + 1, {
    name: 'legLupLine',
    parent: 'legLup'
  });
  const legLloG = group([24, 44], { name: 'legLlo', animate: legL.lower });
  legLloG.parent = 'legLup';
  const legLloLine = line([0, 0], [8, 52], INK, STROKE + 1, {
    name: 'legLloLine',
    parent: 'legLlo'
  });
  const footL = circle([8, 52], 5, INK, { name: 'footL', parent: 'legLlo' });

  return assemble({
    name,
    layers: [
      chairLine(),
      hipsG,
      torsoG,
      spine,
      shouldersG,
      neckG,
      neck,
      headDot,
      armRupG,
      armRupLine,
      armRloG,
      armRloLine,
      handR,
      armLupG,
      armLupLine,
      armLloG,
      armLloLine,
      handL,
      legRupG,
      legRupLine,
      legRloG,
      legRloLine,
      footR,
      legLupG,
      legLupLine,
      legLloG,
      legLloLine,
      footL
    ]
  });
}

const IN_F = 54; 
const HOLD_F = 126; 
const OUT_F = 180;

const loop = (rest, target) => [
  { t: 0, s: rest },
  { t: IN_F, s: target },
  { t: HOLD_F, s: target },
  { t: OUT_F, s: rest }
];

const exercises = {
  'sky-reach': figure({
    name: 'sky-reach',
    torso: {
      torso: { scale: loop([100, 100, 100], [102, 108, 100]) }
    },
    head: { neck: { rotation: loop([0], [6]) } },
    armR: {
      accent: true,
      upper: { rotation: loop([0], [-170]) },
      lower: { rotation: loop([0], [-8]) }
    },
    armL: {
      accent: true,
      upper: { rotation: loop([0], [170]) },
      lower: { rotation: loop([0], [8]) }
    }
  }),

  'chest-opener': figure({
    name: 'chest-opener',
    torso: { torso: { scale: loop([100, 100, 100], [102, 106, 100]) } },
    armR: {
      accent: true,
      upper: { rotation: loop([0], [-32]) },
      lower: { rotation: loop([0], [-10]) }
    },
    armL: {
      accent: true,
      upper: { rotation: loop([0], [32]) },
      lower: { rotation: loop([0], [10]) }
    },
    head: { neck: { rotation: loop([0], [-6]) } }
  }),

  'shoulder-roll': figure({
    name: 'shoulder-roll',
    armR: {
      accent: true,
      upper: {
        rotation: [
          { t: 0, s: [0] },
          { t: 45, s: [-14] },
          { t: 90, s: [0] },
          { t: 135, s: [14] },
          { t: 180, s: [0] }
        ]
      }
    },
    armL: {
      accent: true,
      upper: {
        rotation: [
          { t: 0, s: [0] },
          { t: 45, s: [14] },
          { t: 90, s: [0] },
          { t: 135, s: [-14] },
          { t: 180, s: [0] }
        ]
      }
    },
    head: { neck: { rotation: loop([0], [2]) } }
  }),

  'neck-crescent': figure({
    name: 'neck-crescent',
    head: {
      neck: {
        rotation: [
          { t: 0, s: [0] },
          { t: 45, s: [-24] },
          { t: 90, s: [0] },
          { t: 135, s: [24] },
          { t: 180, s: [0] }
        ]
      }
    }
  }),

  'seated-twist': figure({
    name: 'seated-twist',
    torso: {
      torso: { rotation: loop([0], [16]) },
      shoulders: { rotation: loop([0], [12]) }
    },
    head: { neck: { rotation: loop([0], [18]) } },
    armR: {
      accent: true,
      upper: { rotation: loop([0], [60]) }
    },
    armL: {
      upper: { rotation: loop([0], [-20]) }
    }
  }),

  'cat-cow': figure({
    name: 'cat-cow',
    torso: {
      torso: {
        rotation: [
          { t: 0, s: [0] },
          { t: 54, s: [-14] }, // cat
          { t: 108, s: [10] }, // cow
          { t: 180, s: [0] }
        ]
      }
    },
    head: {
      neck: {
        rotation: [
          { t: 0, s: [0] },
          { t: 54, s: [-22] },
          { t: 108, s: [18] },
          { t: 180, s: [0] }
        ]
      }
    }
  }),

  'wrist-extensor': figure({
    name: 'wrist-extensor',
    armR: {
      accent: true,
      upper: { rotation: loop([0], [75]) },
      lower: { rotation: loop([0], [-20]) }
    },
    armL: {
      upper: { rotation: loop([0], [30]) },
      lower: { rotation: loop([0], [-60]) }
    }
  }),

  'ankle-stretch': figure({
    name: 'ankle-stretch',
    torso: { torso: { rotation: loop([0], [8]) } },
    legR: {
      accent: true,
      upper: { rotation: loop([0], [-70]) },
      lower: { rotation: loop([0], [90]) }
    }
  }),

  'ankle-orbit': figure({
    name: 'ankle-orbit',
    legR: {
      upper: { rotation: loop([0], [-22]) },
      accent: true,
      lower: {
        rotation: [
          { t: 0, s: [0] },
          { t: 45, s: [-14] }, 
          { t: 90, s: [0] },
          { t: 135, s: [18] }, 
          { t: 180, s: [0] }
        ]
      }
    }
  }),

  'reset-breath': figure({
    name: 'reset-breath',
    torso: {
      torso: {
        scale: [
          { t: 0, s: [100, 100, 100] },
          { t: 60, s: [108, 106, 100] }, 
          { t: 180, s: [100, 100, 100] } 
        ]
      },
      shoulders: {
        position: [
          { t: 0, s: [0, 0, 0] },
          { t: 60, s: [0, -6, 0] },
          { t: 180, s: [0, 0, 0] }
        ]
      }
    },
    head: {
      neck: {
        rotation: [
          { t: 0, s: [0] },
          { t: 60, s: [-4] },
          { t: 180, s: [4] }
        ]
      }
    }
  })
};

let wrote = 0;
for (const [id, data] of Object.entries(exercises)) {
  const file = resolve(OUT, `${id}.json`);
  writeFileSync(file, JSON.stringify(data));
  wrote++;
}
console.log(`lottie ready → ${wrote} loops in ${OUT}`);
