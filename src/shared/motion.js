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
      bodyYaw: yaw,
      seated,
      breath: ex.id === "reset-breath" ? a : 0,
    };
  }
  const CAMERA_ANGLES = Object.freeze({
    front: { yaw: 0, elevation: 0, label: "Front view" },
    "three-quarter": {
      yaw: PI / 4,
      elevation: 0.06,
      label: "Three-quarter view",
    },
    "three-quarter-side": {
      yaw: PI / 3,
      elevation: 0.06,
      label: "Three-quarter side view",
    },
    side: { yaw: PI / 2, elevation: 0, label: "Side view" },
  });
  // A rigid camera transform: screen axes are orthonormal. The pose is never
  // changed, mirrored, or stretched to manufacture a different view.
  function cameraPoint(point, camera) {
    const [x, y, z] = rotate(point, camera.yaw);
    const c = Math.cos(camera.elevation),
      s = Math.sin(camera.elevation);
    return [x, y * c + z * s, -y * s + z * c];
  }
  function project(point, camera = CAMERA_ANGLES["three-quarter"]) {
    const [x, y] = cameraPoint(point, camera);
    return [180 + x, 12 + y];
  }
  function getCamera(ex, selection = "guide") {
    const angle =
      selection === "front" || selection === "side"
        ? selection
        : ex.view?.angle || "three-quarter";
    const framing = ex.view?.framing || "body";
    const camera = { ...CAMERA_ANGLES[angle], angle, framing };
    // Fixed framing covers the entire movement and both sides. No tracking,
    // orbiting, or automatic zoom changes during a repetition or side change.
    const frames = {
      body: { center: [0, 177, 12], width: 360, height: 340 },
      wrists: { center: [0, 183, 32], width: 212, height: 204 },
      ankles: { center: [0, 264, 60], width: 204, height: 180 },
    };
    const frame = frames[framing] || frames.body;
    const [x, y] = project(frame.center, camera);
    camera.frame = [
      x - frame.width / 2,
      y - frame.height / 2,
      frame.width,
      frame.height,
    ];
    camera.label +=
      framing === "wrists"
        ? " · Hands & forearms"
        : framing === "ankles"
          ? " · Ankles & feet"
          : "";
    return camera;
  }
  function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (arr) => {
      const out = [];
      for (const point of arr) {
        while (out.length > 1 && cross(out.at(-2), out.at(-1), point) <= 0)
          out.pop();
        out.push(point);
      }
      return out;
    };
    return [
      ...half(sorted).slice(0, -1),
      ...half(sorted.reverse()).slice(0, -1),
    ];
  }
  function torsoOutline(p, camera) {
    const points = [];
    // Elliptical cross-sections give the torso actual depth in a side view.
    for (const [y, rx, rz] of [
      [-83, 33, 17],
      [-65, 37, 21],
      [7, 25, 17],
    ]) {
      for (let i = 0; i < 24; i++) {
        const angle = (i * PI) / 12;
        points.push(
          project(
            add(
              p.root,
              rotate(
                [rx * Math.cos(angle), y, rz * Math.sin(angle)],
                p.bodyYaw,
                p.lean,
              ),
            ),
            camera,
          ),
        );
      }
    }
    return convexHull(points);
  }
  const polyline = (points) =>
    points.map((point, i) => `${i ? "L" : "M"}${point.join(",")}`).join(" ");
  function roundedOutline(points) {
    const middle = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return (
      `M${middle(points.at(-1), points[0])} ` +
      points
        .map(
          (point, i) =>
            `Q${point} ${middle(point, points[(i + 1) % points.length])}`,
        )
        .join(" ") +
      " Z"
    );
  }
  class Figure {
    constructor(container) {
      this.container = container;
      container.innerHTML = `<svg viewBox="0 0 360 370" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <svg data-node="scene" x="0" y="27" width="360" height="315" overflow="hidden">
          <ellipse data-node="shadow" rx="85" ry="9" fill="#244e4110"/>
          <g data-node="chair" stroke="#b8bdab" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path data-node="chair-back"/><path data-node="chair-seat"/><path data-node="chair-legs"/></g>
          <circle data-node="halo" r="87" stroke="#658577" stroke-width="1" opacity="0"/>
          <g data-node="body" stroke-linecap="round" stroke-linejoin="round"></g>
        </svg>
        <text data-node="detail" x="180" y="356" text-anchor="middle" fill="#52634b" font-size="10" font-family="sans-serif"></text>
      </svg>`;
      this.nodes = {};
      container
        .querySelectorAll("[data-node]")
        .forEach((node) => (this.nodes[node.dataset.node] = node));
      this.layers = {};
      const ns = "http://www.w3.org/2000/svg";
      const group = (id, html) => {
        const el = document.createElementNS(ns, "g");
        el.innerHTML = html;
        this.nodes.body.append(el);
        this.layers[id] = el;
        return el;
      };
      for (const side of ["L", "R"]) {
        const skin = side === "L" ? "#c99373" : "#d9a585";
        group(
          "leg" + side,
          `<path data-node="leg${side}" stroke="${side === "L" ? "#294f46" : "#356252"}" stroke-width="23"/><path data-node="shoe${side}" stroke="#e7d8bb" stroke-width="15"/>`,
        );
        group(
          "upper" + side,
          `<path data-node="upper${side}" stroke="${skin}" stroke-width="14"/><path data-node="sleeve${side}" stroke="${side === "L" ? "#82977a" : "#92a386"}" stroke-width="24"/>`,
        );
        group(
          "fore" + side,
          `<path data-node="fore${side}" stroke="${skin}" stroke-width="14"/><path data-node="hand${side}" stroke="${skin}" stroke-width="10"/><path data-node="palm${side}" stroke-width="3"/>`,
        );
      }
      group(
        "torso",
        '<path data-node="torso" fill="#82977a"/><path data-node="seam" stroke="#526e5730" stroke-width="2"/>',
      );
      group(
        "neck",
        '<path data-node="neck" stroke="#c99373" stroke-width="19"/>',
      );
      group(
        "head",
        `<g data-node="head"><ellipse rx="20" ry="26" fill="#d9a585"/><path data-node="hair" fill="#343e32"/><path data-node="ear" stroke="#c99373" stroke-width="4"/><path data-node="face" stroke="#6a493a" stroke-width="2"/></g><path data-node="nose" stroke="#d9a585" stroke-width="5"/>`,
      );
      container
        .querySelectorAll("[data-node]")
        .forEach((node) => (this.nodes[node.dataset.node] = node));
    }
    render(ex, seconds, reduced = false, selection = "guide") {
      const camera = getCamera(ex, selection);
      const key = `${ex.id}:${camera.angle}:${camera.framing}`;
      if (reduced && this.still === key) return;
      this.still = reduced ? key : null;
      const state = sample(
        ex,
        reduced
          ? ex.mode === "hold"
            ? ex.transition + 0.5
            : ex.cycle / 2
          : seconds,
      );
      const p = pose(ex, state),
        j = p.joints,
        pts = {};
      const proj = (point) => project(point, camera);
      Object.entries(j).forEach(([name, point]) => (pts[name] = proj(point)));
      const set = (key, value) => this.nodes[key].setAttribute("d", value);
      const path = (names) => polyline(names.map((name) => pts[name]));
      this.nodes.scene.setAttribute("viewBox", camera.frame.join(" "));
      this.container.dataset.camera = camera.angle;
      this.container.dataset.framing = camera.framing;
      this.nodes.detail.textContent = ex.id.startsWith("wrist-")
        ? ex.id === "wrist-flexor"
          ? "PALM FACING UP"
          : "PALM FACING DOWN"
        : "";
      this.nodes.chair.style.display = p.seated ? "" : "none";
      const floor = p.seated ? 310 : 325;
      const shadow = proj([0, floor + 1, p.seated ? 35 : 0]);
      this.nodes.shadow.setAttribute("cx", shadow[0]);
      this.nodes.shadow.setAttribute("cy", shadow[1]);
      set(
        "chair-back",
        [-35, 35]
          .map((x) =>
            polyline(
              [
                [x, 158, -18],
                [x, 244, -18],
              ].map(proj),
            ),
          )
          .join(" ") +
          " " +
          polyline(
            [
              [-35, 177, -18],
              [35, 177, -18],
            ].map(proj),
          ),
      );
      set(
        "chair-seat",
        polyline(
          [
            [-37, 244, -18],
            [37, 244, -18],
            [37, 244, 65],
            [-37, 244, 65],
            [-37, 244, -18],
          ].map(proj),
        ),
      );
      set(
        "chair-legs",
        [-35, 35]
          .flatMap((x) =>
            [-16, 63].map((z) =>
              polyline(
                [
                  [x, 244, z],
                  [x * 1.1, floor, z],
                ].map(proj),
              ),
            ),
          )
          .join(" "),
      );
      const depths = {};
      const depth = (points) =>
        points.reduce((sum, point) => sum + cameraPoint(point, camera)[2], 0) /
        points.length;
      for (const side of ["L", "R"]) {
        set("leg" + side, path(["hip" + side, "knee" + side, "ankle" + side]));
        set("shoe" + side, path(["ankle" + side, "foot" + side]));
        set("upper" + side, path(["shoulder" + side, "elbow" + side]));
        set("fore" + side, path(["elbow" + side, "wrist" + side]));
        set(
          "sleeve" + side,
          polyline(
            [
              j["shoulder" + side],
              add(
                j["shoulder" + side],
                mul(sub(j["elbow" + side], j["shoulder" + side]), 0.53),
              ),
            ].map(proj),
          ),
        );
        set("hand" + side, path(["wrist" + side, "hand" + side]));
        const direction = sub(j["hand" + side], j["wrist" + side]);
        set(
          "palm" + side,
          polyline(
            [0.35, 0.7].map((f) =>
              proj(add(j["wrist" + side], mul(direction, f))),
            ),
          ),
        );
        this.nodes["palm" + side].setAttribute(
          "stroke",
          ex.id === "wrist-flexor" ? "#f1c6a5" : "#ad775b",
        );
        this.nodes["palm" + side].style.display = ex.id.startsWith("wrist-")
          ? ""
          : "none";
        depths["leg" + side] = depth([
          j["hip" + side],
          j["knee" + side],
          j["ankle" + side],
        ]);
        depths["upper" + side] = depth([
          j["shoulder" + side],
          j["elbow" + side],
        ]);
        depths["fore" + side] = depth([j["elbow" + side], j["wrist" + side]]);
        // Subdue the other limb in close-ups; keep the active limb legible even
        // when an exact side camera puts both limbs on the same sightline.
        const active = (state.side < 0 ? "L" : "R") === side;
        for (const kind of ["leg", "upper", "fore"]) {
          const focus =
            camera.framing === "ankles"
              ? kind === "leg"
              : camera.framing === "wrists" && kind === "fore";
          this.layers[kind + side].setAttribute(
            "opacity",
            focus && !active ? ".42" : "1",
          );
          if (focus && active) depths[kind + side] += 160;
        }
      }
      const outline = torsoOutline(p, camera);
      set("torso", roundedOutline(outline));
      const bodyLocal = (point) =>
        add(p.root, rotate(point, p.bodyYaw, p.lean));
      set(
        "seam",
        polyline(
          [
            [-18, -58, 17],
            [-16, -8, 15],
          ]
            .map(bodyLocal)
            .map(proj),
        ),
      );
      set("neck", path(["neck", "head"]));
      const roll = Math.atan2(
        pts.head[0] - pts.neck[0],
        pts.neck[1] - pts.head[1],
      );
      this.nodes.head.setAttribute(
        "transform",
        `translate(${pts.head}) rotate(${(roll * 180) / PI})`,
      );
      const look = Math.sin(p.headYaw + camera.yaw),
        profile = Math.abs(look) > 0.85,
        direction = Math.sign(look) || 1;
      const front = Math.cos(p.headYaw + camera.yaw) >= 0;
      set(
        "hair",
        profile
          ? `M${-19 * direction},5 C${-27 * direction},-21 ${-8 * direction},-32 ${10 * direction},-25 Q${24 * direction},-22 ${17 * direction},-12 L${5 * direction},-15 L${-5 * direction},-8 L${-8 * direction},5 Z`
          : "M-19 0 C-28 -29 -8 -35 9 -26 C22 -23 25 -10 19 -2 L15 -13 Q0 -8 -13 -14 L-15 2Z",
      );
      set(
        "face",
        profile
          ? `M${direction * 13},-3 l${direction},0 M${direction * 13},12 l${direction * 5},-1`
          : `M${look * 13 - 5},0 l1,0 M${look * 13 + 6},0 l1,0 M${look * 15 - 2},12 q4,2 7,-1`,
      );
      this.nodes.face.style.display = front ? "" : "none";
      set(
        "ear",
        profile
          ? `M${-direction * 3},1 q${-direction * 5},-4 ${-direction * 4},4`
          : "",
      );
      set(
        "nose",
        `M${pts.head[0] + look * 16},${pts.head[1] + 2} L${pts.nose}`,
      );
      depths.torso = depth([bodyLocal([0, -35, 0])]);
      depths.neck = depth([j.neck, j.head]) - 1;
      depths.head = depth([j.head, j.nose]) + 1;
      const order = Object.keys(this.layers).sort(
        (a, b) => depths[a] - depths[b],
      );
      const signature = order.join(",");
      if (signature !== this.order) {
        for (const key of order) this.nodes.body.append(this.layers[key]);
        this.order = signature;
      }
      const halo = proj(bodyLocal([0, -35, 0]));
      this.nodes.halo.setAttribute("cx", halo[0]);
      this.nodes.halo.setAttribute("cy", halo[1]);
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
  const api = {
    ease,
    sample,
    pose,
    project,
    cameraPoint,
    getCamera,
    CAMERA_ANGLES,
    torsoOutline,
    solveIK,
    Figure,
    length,
    sub,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.StretchMotion = api;
})(typeof window !== "undefined" ? window : null);
