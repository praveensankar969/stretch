(function (root) {
  "use strict";
  const PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // Minimum-jerk interpolation: velocity AND acceleration vanish at either endpoint.
  const ease = (t) => {
    t = clamp(t);
    return t * t * t * (10 + t * (-15 + 6 * t));
  };
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mul = (a, s) => a.map((v) => v * s);
  const length = (a) => Math.hypot(...a);
  const unit = (a) => mul(a, 1 / (length(a) || 1));
  const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  function rotate(p, yaw = 0, lean = 0) {
    const x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw);
    const z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw);
    return [
      x * Math.cos(lean) - p[1] * Math.sin(lean),
      x * Math.sin(lean) + p[1] * Math.cos(lean),
      z,
    ];
  }
  function bone(origin, direction, size) {
    return add(origin, mul(unit(direction), size));
  }
  // Analytic two-bone IK, with an explicit pole vector and clamped reach.
  function solveIK(start, target, a, b, pole = [0, 1, 0]) {
    const delta = sub(target, start),
      axis = unit(delta);
    const distance = clamp(length(delta), Math.abs(a - b) + 1e-6, a + b - 1e-6);
    let normal = sub(pole, mul(axis, dot(pole, axis)));
    if (length(normal) < 1e-6) normal = sub([0, 0, 1], mul(axis, axis[2]));
    normal = unit(normal);
    const x = (a * a - b * b + distance * distance) / (2 * distance);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    return {
      elbow: add(start, add(mul(axis, x), mul(normal, h))),
      hand: add(start, mul(axis, distance)),
    };
  }
  function sample(ex, elapsed) {
    const t = clamp(elapsed, 0, ex.seconds);
    const cycle = ex.mode === "hold" ? ex.hold + 2 * ex.transition : ex.cycle;
    const rep = Math.min(ex.repetitions - 1, Math.floor(t / cycle));
    const local = t === ex.seconds ? cycle : t - rep * cycle;
    const side = ex.alternate
      ? Math.floor(rep / (ex.sideEvery || 1)) % 2 === 0
        ? -1
        : 1
      : 0;
    let amount = 0,
      phase = "",
      phaseLeft = 0;
    if (ex.mode === "hold") {
      if (local < ex.transition) {
        amount = ease(local / ex.transition);
        phase = "Ease into position";
        phaseLeft = ex.transition - local;
      } else if (local < ex.transition + ex.hold) {
        amount = 1;
        phase = "Hold gently";
        phaseLeft = ex.transition + ex.hold - local;
      } else {
        amount = 1 - ease((local - ex.transition - ex.hold) / ex.transition);
        phase = "Return to center";
        phaseLeft = cycle - local;
      }
    } else if (ex.mode === "breath") {
      amount = local < 5 ? ease(local / 5) : 1 - ease((local - 5) / 5);
      phase = local < 5 ? "Breathe in gently" : "Breathe out slowly";
      phaseLeft = local < 5 ? 5 - local : 10 - local;
    } else if (ex.mode === "cycle") {
      amount = 0.5 - 0.5 * Math.cos((2 * PI * local) / cycle);
      phase =
        ex.id === "ankle-pumps"
          ? local < cycle / 2
            ? "Point your toes"
            : "Draw your toes back"
          : local < 2
            ? "Lift gently"
            : local < 4
              ? "Roll back"
              : "Let shoulders settle";
      phaseLeft = cycle - local;
    } else {
      phase = "Take an easy walk";
      phaseLeft = cycle - local;
    }
    return {
      t,
      rep: rep + 1,
      side,
      amount,
      phase,
      phaseLeft,
      cycleProgress: local / cycle,
      done: t >= ex.seconds,
      progress: t / ex.seconds,
      remaining: Math.max(0, ex.seconds - t),
    };
  }
  function pose(ex, state) {
    const { amount: a, side, t } = state;
    const seated = ex.seated;
    const root = [0, seated ? 224 : 187, 0];
    let yaw = ex.id === "seated-twist" ? side * a * 0.45 : 0;
    let lean = ex.id === "side-bend" ? side * a * 0.2 : 0;
    // All points in a kinematic chain inherit the same rigid parent transform.
    const local = (p) => add(root, rotate(p, yaw, lean));
    const joints = {
      hipL: add(root, [-19, 0, 0]),
      hipR: add(root, [19, 0, 0]),
    };
    for (const s of [-1, 1]) {
      const suffix = s === -1 ? "L" : "R";
      let sh = [s * 34, -83, 0];
      if (ex.id === "shoulder-roll") {
        const theta = ease(state.cycleProgress) * PI * 2;
        sh[1] -= 5 * (1 - Math.cos(theta));
        sh[2] = -7 * Math.sin(theta);
      }
      if (ex.id === "chest-opener") sh[2] -= 6 * a;
      const shoulder = local(sh);
      let upper = [s * 0.18, 1, 0.08],
        fore = [-s * 0.14, 0.86, 0.5];
      if (!seated) {
        upper = [s * 0.08, 1, 0];
        fore = [s * 0.08, 1, 0.02];
      }
      if (ex.id === "chest-opener") {
        upper = [s * (0.18 + a * 0.85), 1 - a * 0.25, -a * 0.3];
        fore = [
          -s * 0.14 * (1 - a) + s * a,
          0.86 + a * 0.1,
          0.5 * (1 - a) - a * 0.2,
        ];
      }
      let elbow = bone(shoulder, rotate(upper, yaw, lean), 47);
      let wrist = bone(elbow, rotate(fore, yaw, lean), 44);
      if (ex.id === "seated-twist") {
        const ik = solveIK(shoulder, local([-s * 24, -64, 21]), 47, 44, [
          s,
          1,
          0,
        ]);
        elbow = ik.elbow;
        wrist = ik.hand;
      }
      if (ex.id.startsWith("wrist-")) {
        const active = side || -1;
        const end = local([active * 15, -62, 77]);
        const target = s === active ? end : add(end, [0, 7 * a, 0]);
        // Blend the target, then solve joint angles; never interpolate limb endpoints directly.
        const rest = wrist;
        const ik = solveIK(
          shoulder,
          add(mul(rest, 1 - a), mul(target, a)),
          47,
          44,
          [s * 0.6, 1, 0],
        );
        elbow = ik.elbow;
        wrist = ik.hand;
      }
      if (ex.id === "walk-break") {
        const swing = Math.sin(t * PI) * s * 0.25;
        elbow = bone(shoulder, [0, Math.cos(swing), Math.sin(swing)], 47);
        wrist = bone(
          elbow,
          [0, Math.cos(swing + 0.2), Math.sin(swing + 0.2)],
          44,
        );
      }
      const hip = joints["hip" + suffix];
      let knee = bone(hip, seated ? [s * 0.12, 0.16, 1] : [s * 0.07, 1, 0], 61);
      let ankle = bone(knee, [0, 1, 0], 68);
      let footAngle = 0;
      if (ex.id === "ankle-pumps") {
        // Raise and lower the selected leg over its five-repetition block, with neutral handoff.
        const block = state.t % 20,
          envelope = ease(block / 2) * (1 - ease((block - 18) / 2));
        if (s === side) {
          ankle = bone(
            knee,
            [0, Math.cos(envelope * 0.8), Math.sin(envelope * 0.8)],
            68,
          );
          footAngle = (a - 0.5) * 0.8 * envelope;
        }
      }
      if (ex.id === "walk-break") {
        const swing = Math.sin(t * PI) * s * 0.3;
        knee = bone(hip, [0, Math.cos(swing), Math.sin(swing)], 61);
        ankle = bone(
          knee,
          [0, Math.cos(Math.max(0, -swing)), Math.sin(Math.max(0, -swing))],
          68,
        );
      }
      const foot = bone(
        ankle,
        [0, Math.sin(footAngle), Math.cos(footAngle)],
        24,
      );
      let handDirection = unit(sub(wrist, elbow));
      if (ex.id.startsWith("wrist-") && s === side)
        handDirection = unit(
          add(mul(handDirection, 1 - a), mul([0, 0.9, 0.3], a)),
        );
      const hand = bone(wrist, handDirection, 14);
      Object.assign(joints, {
        ["shoulder" + suffix]: shoulder,
        ["elbow" + suffix]: elbow,
        ["wrist" + suffix]: wrist,
        ["hand" + suffix]: hand,
        ["knee" + suffix]: knee,
        ["ankle" + suffix]: ankle,
        ["foot" + suffix]: foot,
      });
    }
    joints.neck = local([0, -94, 0]);
    joints.head = local([0, -117, 0]);
    const headYaw = yaw + (ex.id === "neck-turn" ? side * a * 0.7 : 0);
    joints.nose = add(joints.head, rotate([0, 2, 21], headYaw, lean));
    return {
      joints,
      root,
      lean,
      headYaw,
      seated,
      breath: ex.id === "reset-breath" ? a : 0,
    };
  }
  function project(p) {
    return [180 + p[0] * 0.96 + p[2] * 0.4, 12 + p[1] - p[2] * 0.16];
  }
  class Figure {
    constructor(container) {
      this.container = container;
      container.innerHTML = `<svg viewBox="0 0 360 370" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="188" cy="337" rx="93" ry="10" fill="#244e4110"/><g data-chair stroke="#b8bdab" stroke-width="7" stroke-linecap="round"><path d="M143 238 L129 326 M213 238 L227 326 M133 180 L140 238 L222 238"/><path d="M135 200 L213 200" stroke-width="10"/></g><circle data-halo cx="182" cy="190" r="87" stroke="#658577" stroke-width="1" opacity="0"/><g stroke-linecap="round" stroke-linejoin="round"><path data-legL stroke="#294f46" stroke-width="23"/><path data-shoeL stroke="#e7d8bb" stroke-width="15"/><path data-legR stroke="#356252" stroke-width="23"/><path data-shoeR stroke="#e7d8bb" stroke-width="15"/><path data-neck stroke="#c99373" stroke-width="19"/><path data-torso fill="#82977a"/><path data-seam stroke="#526e571f" stroke-width="2"/><path data-armL stroke="#c99373" stroke-width="14"/><path data-sleeveL stroke="#82977a" stroke-width="24"/><path data-armR stroke="#d9a585" stroke-width="14"/><path data-sleeveR stroke="#92a386" stroke-width="24"/><path data-handL stroke="#c99373" stroke-width="10"/><path data-handR stroke="#d9a585" stroke-width="10"/><path data-palmL stroke-width="3"/><path data-palmR stroke-width="3"/></g><g data-head><ellipse cx="0" cy="0" rx="20" ry="26" fill="#d9a585"/><path d="M-19 0 C-28 -29 -8 -35 9 -26 C22 -23 25 -10 19 -2 L15 -13 Q0 -8 -13 -14 L-15 2Z" fill="#343e32"/><path data-face stroke="#6a493a" stroke-width="2" stroke-linecap="round"/></g><text data-detail x="180" y="66" text-anchor="middle" fill="#607656" font-size="10" font-family="sans-serif"></text><path data-nose stroke="#d9a585" stroke-width="5" stroke-linecap="round"/></svg>`;
      this.nodes = {};
      container
        .querySelectorAll(
          "[data-chair],[data-halo],[data-head],[data-face],[data-nose],[data-detail],path",
        )
        .forEach((el) => {
          for (const attr of el.attributes)
            if (attr.name.startsWith("data-"))
              this.nodes[attr.name.slice(5)] = el;
        });
    }
    render(ex, seconds, reduced = false) {
      if (reduced && this.still === ex.id) return;
      this.still = reduced ? ex.id : null;
      let state = sample(ex, seconds);
      // Reduced motion uses one still illustration, with live text instructions retained.
      if (reduced)
        state = sample(
          ex,
          ex.mode === "hold" ? ex.transition + 0.5 : ex.cycle / 2,
        );
      const p = pose(ex, state),
        j = p.joints,
        pts = {};
      Object.entries(j).forEach(([key, value]) => {
        pts[key] = project(value);
      });
      const path = (names) =>
        names
          .map((name, i) => `${i ? "L" : "M"}${pts[name].join(",")}`)
          .join(" ");
      const set = (key, value) =>
        this.nodes[key.toLowerCase()].setAttribute("d", value);
      this.nodes.chair.style.display = p.seated ? "" : "none";
      this.nodes.detail.textContent = ex.id.startsWith("wrist-")
        ? ex.id === "wrist-flexor"
          ? "PALM FACING UP"
          : "PALM FACING DOWN"
        : "";
      for (const s of ["L", "R"]) {
        set("leg" + s, path(["hip" + s, "knee" + s, "ankle" + s]));
        set("shoe" + s, path(["ankle" + s, "foot" + s]));
        set("arm" + s, path(["shoulder" + s, "elbow" + s, "wrist" + s]));
        const sleeveEnd = project(
          add(
            j["shoulder" + s],
            mul(sub(j["elbow" + s], j["shoulder" + s]), 0.53),
          ),
        );
        set("sleeve" + s, `M${pts["shoulder" + s]} L${sleeveEnd}`);
        set("hand" + s, path(["wrist" + s, "hand" + s]));
        const palm = this.nodes["palm" + s.toLowerCase()];
        const direction = sub(j["hand" + s], j["wrist" + s]);
        set(
          "palm" + s,
          `M${project(add(j["wrist" + s], mul(direction, 0.35)))} L${project(add(j["wrist" + s], mul(direction, 0.7)))}`,
        );
        palm.setAttribute(
          "stroke",
          ex.id === "wrist-flexor" ? "#f1c6a5" : "#ad775b",
        );
        palm.style.display = ex.id.startsWith("wrist-") ? "" : "none";
      }
      const sl = pts.shoulderL,
        sr = pts.shoulderR,
        hl = pts.hipL,
        hr = pts.hipR;
      set(
        "torso",
        `M${sl[0] - 5},${sl[1]} Q${pts.neck} ${sr[0] + 5},${sr[1]} L${hr[0] + 6},${hr[1] + 5} Q${project(add(p.root, [0, 10, 0]))} ${hl[0] - 6},${hl[1] + 5} Z`,
      );
      set("seam", `M${sl[0] + 7},${sl[1] + 28} L${hl[0] + 4},${hl[1] - 8}`);
      set("neck", path(["neck", "head"]));
      this.nodes.head.setAttribute(
        "transform",
        `translate(${pts.head}) rotate(${(p.lean * 180) / PI})`,
      );
      const look = Math.sin(p.headYaw + 0.38);
      set(
        "face",
        `M${look * 13 - 5},0 l1,0 M${look * 13 + 6},0 l1,0 M${look * 15 - 2},12 q4,2 7,-1`,
      );
      set(
        "nose",
        `M${pts.head[0] + look * 16},${pts.head[1] + 2} L${pts.nose}`,
      );
      this.nodes.halo.setAttribute("r", String(80 + p.breath * 22));
      this.nodes.halo.setAttribute(
        "opacity",
        ex.id === "reset-breath" ? "0.32" : "0",
      );
    }
    destroy() {
      this.container.replaceChildren();
    }
  }
  const api = { ease, sample, pose, project, solveIK, Figure, length, sub };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.StretchMotion = api;
})(typeof window !== "undefined" ? window : null);
