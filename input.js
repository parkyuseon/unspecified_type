// input.js — Unspecified Type v2
// v1과의 차이:
//   - 획 구조를 유지한 채 UTFeatures.extract()로 특징 13개를 뽑는다 (A단계)
//   - 좌표 계산은 UTLayout.build()에 위임한다 (B단계)
//   - 필압: 터치 이벤트의 force를 먼저 본다. p5가 합성한 마우스 이벤트의
//     pressure는 항상 0.5라서 v1은 36,231건 전부 0.5로 기록됐다.
// 프리뷰 단계(stage): 1 ㅎ / 2 ㅇ / 3 ㅏ / 4 ㄴ

window.inputP5 = new p5(function (p) {
  let strokes = [];
  let currentStroke = [];
  let drawing = false;

  function throttleRAF(fn) {
    let scheduled = false;
    return (...args) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; fn(...args); });
    };
  }

  p.setup = function () {
    const el = document.getElementById("input-area");
    p.createCanvas(el.clientWidth, el.clientHeight).parent("input-area");
    p.background(255);

    const resetBtn = document.getElementById("reset-button");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        strokes = []; currentStroke = [];
        p.background(255);
        window.formParams = null;
        if (typeof window.updateOutput === 'function') window.updateOutput({}, {});
        if (window.outputP5 && window.outputP5.redraw) window.outputP5.redraw();
      });
    }
  };

  p.draw = function () {
    p.clear(); p.background(255);
    p.stroke(0); p.strokeWeight(2); p.noFill();
    for (const s of strokes) { p.beginShape(); s.forEach(pt => p.vertex(pt.x, pt.y)); p.endShape(); }
    if (currentStroke.length) { p.beginShape(); currentStroke.forEach(pt => p.vertex(pt.x, pt.y)); p.endShape(); }
  };

  // 실제 필압만 기록한다. 없으면 null로 두고 features.js가 속도 변동성으로 대체한다.
  function readForce(evt) {
    if (!evt) return null;
    const t = evt.touches && evt.touches[0];
    if (t && typeof t.force === 'number' && t.force > 0) return t.force;
    if (typeof evt.pressure === 'number' && evt.pressure > 0 && evt.pressure !== 0.5) return evt.pressure;
    return null;
  }

  p.mousePressed = () => { currentStroke = []; drawing = true; };

  p.mouseDragged = (evt) => {
    if (!drawing) return;
    currentStroke.push({ x: p.mouseX, y: p.mouseY, t: p.millis(), force: readForce(evt) });
    emitThrottled(true);
  };

  p.mouseReleased = () => {
    if (currentStroke.length) strokes.push(currentStroke);
    currentStroke = []; drawing = false;
    if (!strokes.length) return;
    emit(false);
  };

  // ---------- 특징 추출 → 배치 ----------
  function emit(isPreview) {
    const all = currentStroke.length ? [...strokes, currentStroke] : strokes;
    if (!all.length) return;

    const F = window.UTFeatures.extract(all);
    if (!F) return;
    const form = window.UTLayout.build(F);

    form.stage = computeStage(strokes, isPreview ? currentStroke : null);
    form.jongSub = (form.stage >= 4)
      ? (isPreview && getStrokeOrientation(currentStroke) === 'V_DOWN' ? 1 : 2)
      : 0;

    // 좌측 패널 표시 + 시트 기록용 (숫자만)
    const view = {};
    for (const k of Object.keys(F)) if (typeof F[k] === 'number') view[k] = F[k];
    view.forceIsReal = F.forceIsReal ? 1 : 0;
    // save-utils.js가 payload.strokeCount로 읽는 값. v1과 같은 원시 획 수를 유지한다.
    view.strokeCount = F._raw.strokeN;
    // 정규화 전 원시 통계. 잠정 캘리브레이션(speedVar/turn/pause/dirBias/spread/order)을
    // 나중에 실측값으로 갱신하려면 이 값들이 남아 있어야 한다.
    view.r_speedMed = F._raw.speedMed;
    view.r_speedCV  = F._raw.speedCV;
    view.r_turnRate = F._raw.turnRate;
    view.r_pauseMed = F._raw.pauseMed;
    view.r_diag     = F._raw.diag;
    view.r_inkLen   = F._raw.inkLen;
    view.r_duration = F._raw.duration;
    view.r_aspect   = F._raw.aspect;
    view.r_density  = F._raw.density;
    view.r_dirBias  = F._raw.dirBias;
    view.r_order    = F._raw.order;
    view.r_canvasW  = p.width;
    view.r_canvasH  = p.height;

    window.latestGesture = view;
    window.latestFeatures = F;
    window.formParams = form;
    if (typeof window.updateOutput === 'function') window.updateOutput(view, form);
    if (window.outputP5 && window.outputP5.redraw) window.outputP5.redraw();
  }
  const emitThrottled = throttleRAF(emit);

  // ---------- 단계 계산 (v1 그대로) ----------
  function computeStage(doneStrokes, liveStroke) {
    const sCount = doneStrokes.length + (liveStroke && liveStroke.length ? 1 : 0);
    const stageByStroke = Math.min(4, Math.max(1, sCount));
    const ink = doneStrokes.reduce((a, s) => a + s.length, 0) + (liveStroke ? liveStroke.length : 0);
    let stageByInk = 1;
    if (ink >= 25) stageByInk = 2;
    if (ink >= 61) stageByInk = 3;
    if (ink >= 111) stageByInk = 4;
    return Math.max(stageByStroke, stageByInk);
  }

  function getStrokeOrientation(stroke) {
    if (!stroke || !stroke.length) return 'NONE';
    const first = stroke[0], last = stroke[stroke.length - 1];
    const dx = last.x - first.x, dy = last.y - first.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ay > ax && dy > 4) return 'V_DOWN';
    if (ax > ay && dx > 4) return 'H_RIGHT';
    return 'OTHER';
  }
});
