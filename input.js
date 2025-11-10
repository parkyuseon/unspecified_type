// input.js — gesture → form params (2025-09-15 preview grouped)
// 프리뷰 단계(stage):
//   1 : ㅎ(짧은+긴)     → 두 획을 한꺼번에
//   2 : ㅇ
//   3 : ㅏ(세로+가로)
//   4 : ㄴ(수직+수평)   → jongSub로 수직→수평 순서 반영
// 추가:
// - 굵기: 원본 감도 유지 + 상단만 약간(+6%/+10px) 더 굵게
// - ㅇ(rx/ry): 정원 ↔ 가로/세로 타원 다양화
// - strokeSlantDeg: -12° ~ +12° 계산/전달
// - 변수 선언/사용 순서 정리 (초기화 전 참조 방지)

window.inputP5 = new p5(function (p) {
  let strokes = [];
  let currentStroke = [];
  let drawing = false;

  const MIN_GAP = 14; // 절대 최소 간격(px)

  // --- rAF 기반 스로틀 (프리뷰 과부하 방지) ---
  function throttleRAF(fn){
    let scheduled = false;
    return (...args)=>{
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(()=>{
        scheduled = false;
        fn(...args);
      });
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
    for (const s of strokes) { p.beginShape(); s.forEach(pt=>p.vertex(pt.x,pt.y)); p.endShape(); }
    if (currentStroke.length) { p.beginShape(); currentStroke.forEach(pt=>p.vertex(pt.x,pt.y)); p.endShape(); }
  };

  p.mousePressed = ()=>{ currentStroke=[]; drawing=true; };
  p.mouseDragged = (evt)=>{
    if(!drawing) return;
    const pressure = evt?.pressure ?? 0.5;
    currentStroke.push({ x:p.mouseX, y:p.mouseY, t:p.millis(), pressure });
    emitPreviewThrottled();             // 드로잉 중 프리뷰
  };
  p.mouseReleased = ()=>{
    if (currentStroke.length) strokes.push(currentStroke);
    currentStroke=[]; drawing=false;
    if (!strokes.length) return;

    const g = calcGesture(strokes);
    const form = g2form(g);
    form.stage  = computeStage(strokes, null); // 확정 단계
    form.jongSub = (form.stage >= 4) ? 2 : 0;  // 확정 시 ㄴ은 둘 다 보이게

    window.formParams = form;
    if (typeof window.updateOutput === 'function') window.updateOutput(g, form);
    if (window.outputP5 && window.outputP5.redraw) window.outputP5.redraw();
  };

  // ---------- 프리뷰 ----------
  function emitPreview(){
    const all = currentStroke.length ? [...strokes, currentStroke] : strokes;
    if (!all.length) return;

    const g = calcGesture(all);
    const form = g2form(g);
    form.stage = computeStage(strokes, currentStroke);

    // ㄴ 서브 단계: 진행 중 스트로크가 아래로 수직이면 1(수직만), 아니면 2(수평까지)
    form.jongSub = (form.stage >= 4)
      ? (getStrokeOrientation(currentStroke) === 'V_DOWN' ? 1 : 2)
      : 0;

    window.formParams = form;
    if (typeof window.updateOutput === 'function') window.updateOutput(g, form);
    if (window.outputP5 && window.outputP5.redraw) window.outputP5.redraw();
  }
  const emitPreviewThrottled = throttleRAF(emitPreview);

  // ---------- 단계 계산(획수 + 잉크량) ----------
  function computeStage(doneStrokes, liveStroke){
    const sCount = doneStrokes.length + (liveStroke && liveStroke.length ? 1 : 0);
    const stageByStroke = Math.min(4, Math.max(1, sCount));
    const ink = doneStrokes.reduce((a,s)=>a+s.length,0) + (liveStroke? liveStroke.length:0);
    // 경험값: 0~24(1), 25~60(2), 61~110(3), 111+(4)
    let stageByInk = 1;
    if (ink >= 25) stageByInk = 2;
    if (ink >= 61) stageByInk = 3;
    if (ink >= 111) stageByInk = 4;
    return Math.max(stageByStroke, stageByInk);
  }

  // 마지막 스트로크 대략 방향
  function getStrokeOrientation(stroke) {
    if (!stroke || !stroke.length) return 'NONE';
    const first = stroke[0], last = stroke[stroke.length - 1];
    const dx = last.x - first.x, dy = last.y - first.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const MIN_PIX = 4;
    if (ay > ax && dy > MIN_PIX) return 'V_DOWN';
    if (ax > ay && dx > MIN_PIX) return 'H_RIGHT';
    return 'OTHER';
  }

  // ---------- gesture analysis ----------
  function calcGesture(strokes){
    const pts = strokes.flat();
    let totalDist=0,totalTime=0; const ang=[];
    for(let i=1;i<pts.length;i++){
      const dx=pts[i].x-pts[i-1].x, dy=pts[i].y-pts[i-1].y;
      const dt=Math.max(1, pts[i].t-pts[i-1].t);
      totalDist += Math.hypot(dx,dy); totalTime += dt;
      ang.push(Math.atan2(dy,dx));
    }
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const width=Math.max(...xs)-Math.min(...xs);
    const height=Math.max(...ys)-Math.min(...ys);
    const avgSpeed = totalDist/Math.max(1,totalTime);
    const avgPressure = pts.reduce((s,q)=>s+(q.pressure??0.5),0)/pts.length;
    const avgAngle = ang.length? ang.reduce((s,a)=>s+a,0)/ang.length : 0;
    const strokeDuration = pts[pts.length-1].t-pts[0].t;
    const startEndAngle = Math.atan2(ys[ys.length-1]-ys[0], xs[xs.length-1]-xs[0]);
    const gestureAspectRatio = height===0?1:width/height;
    const gestureCompactness = width+height===0?1:totalDist/(width+height);
    const dirChange = ang.reduce((s,a,i)=> i? s+Math.abs(a-ang[i-1]) : 0, 0);
    const pathCurvature = Math.min(1, dirChange/(Math.PI*4));
    return {
      avgSpeed, avgPressure, avgAngle, strokeDuration,
      gestureAspectRatio, gestureCompactness, strokeCount: strokes.length,
      pathCurvature, startEndAngle
    };
  }

  // ---------- g(): gesture → form ----------
  function g2form(g){
    // 균일 간격 기반
    const targetGap = Math.max(14, Math.round(14 + 6 + 12*(g.avgPressure||0.5) + 10*(g.pathCurvature||0)));

    // 1) 프레임
    const cho_frame = { x: 40 + 36*Math.sin(g.avgAngle), y: 70, w: 110, h: 100 };
    const jung_frame= { x: cho_frame.x + 120, y: 70, w: 80, h: 170 };

    // 2) 굵기(원본 감도 유지) + 상단 살짝 bump
    const baseW = p.map(g.strokeCount, 1, 7, 10, 52);
    const contrast0 = p.constrain(p.map(g.gestureAspectRatio, 0.5, 2.0, 0.92, 1.08), 0.8, 1.2);
    let wH = Math.min(40, Math.min(48, baseW * contrast0));
    let wV = Math.min(40, Math.min(48, baseW / contrast0));
    const bumpH = Math.min(wH * 0.06, 10);
    const bumpV = Math.min(wV * 0.06, 10);
    wH = p.constrain(wH + bumpH, 2, 64);
    wV = p.constrain(wV + bumpV, 2, 64);

    // 3) ㅎ 모드/초기 값
    const centerX = cho_frame.x + cho_frame.w/2;
    const cho_top_mode = (g.gestureAspectRatio > 0.97) ? "horizontal" : "vertical";
    let cho_top_y = cho_frame.y + cho_frame.h * p.map(g.avgAngle, -1.5, 1.5, 0.14, 0.30);

    // 4) 길이 계산
    let longLen_raw = p.map(g.avgSpeed, 0,1, 110, 290);
    let shortRatio  = p.constrain(
      0.25 + 0.60*p.map(g.avgSpeed,0,1,0,1)
          + 0.55*p.map(g.avgPressure,0,1,0,1)
          + 0.65*p.map(g.pathCurvature,0,1,0,1),
      0.15, 0.85
    );
    let shortLen    = longLen_raw * shortRatio;

    // ㅏ 세로 길이(초기)
    let a_len = p.constrain(
      80 + 240*p.map(g.avgSpeed,0,1,0,1)
         + 110*p.map(g.avgPressure,0,1,0,1)
         + 120*p.map(g.pathCurvature,0,1,0,1),
      50, 380
    );

    // ㅎ 긴 수평 ≤ ㅏ 세로 - 12
    let longLen = Math.max(40, Math.min(longLen_raw, a_len - 12));

    // 짧은 수평은 긴 수평의 약 절반 이하 (중복 선언 금지: 갱신만)
    shortLen = Math.min(shortLen, longLen/2.2);

    // 5) 수평/수직 좌표
    const longTop    = cho_top_y - wH/2;
    const longBottom = cho_top_y + wH/2;
    let cho_top_short_y = (longTop - targetGap) - (wH/2);

    // ㅎ 수평 x (먼저 확정)
    let cho_top_x1 = centerX - longLen/2;
    let cho_top_x2 = centerX + longLen/2;
    const cho_top_short_x1 = centerX - shortLen/2;
    const cho_top_short_x2 = centerX + shortLen/2;

    // 6) 이응(ㅇ) 다양화 — 정원 ↔ 가로/세로 타원
    const wide  = p.constrain(p.map(g.gestureAspectRatio, 0.6, 2.2, 0, 1), 0, 1);
    const horiz = 1 - Math.abs(p.constrain(p.map(g.avgAngle, -1.2, 1.2, 0, 1), 0, 1) - 0.5) * 2;
    let   ratio = p.lerp(0.55, 1.85, 0.55*wide + 0.45*horiz);
    ratio = p.lerp(ratio, 1.0, p.constrain(p.map(g.pathCurvature, 0.4, 1.2, 0, 1), 0, 1));

    const baseR = p.constrain(
      p.lerp(18,  Math.min(cho_frame.h*0.75, cho_frame.w*0.65),
             0.6*p.constrain(g.avgPressure,0,1) + 0.4*p.constrain(p.map(g.strokeCount,1,6,0,1),0,1)),
      14, Math.min(cho_frame.h*0.8, cho_frame.w*0.7)
    );
    let o_rx, o_ry;
    if (ratio >= 1) { o_rx = baseR * ratio; o_ry = baseR; }
    else            { o_rx = baseR;          o_ry = baseR/ratio; }

    // ㅇ 폭 ≥ 첫수평 + 8
    const needCircleRx = (shortLen + 8) / 2;
    if (o_rx < needCircleRx) o_rx = needCircleRx;
    // ㅇ 지름 < ㅎ-긴 수평
    o_rx = Math.min(o_rx, longLen * 0.49);

    // ㅇ 중심 y
    const o_cx = centerX;
    let   o_cy = longBottom + targetGap + o_ry;

    // 7) ㅏ 위치/가로획
    const v_len = longLen * p.map(g.gestureAspectRatio, 0.5,2, 0.38,0.68);
    const cho_top_vert_x  = centerX;
    const cho_top_vert_y1 = cho_top_y;
    const cho_top_vert_y2 = cho_top_y - v_len;

    const firstTopY =
      (cho_top_mode === "horizontal")
        ? (cho_top_short_y - wH*0.5)
        : (cho_top_vert_y2   - wV*0.5);

    let a_y1 = Math.min(jung_frame.y + 8, firstTopY);
    let a_y2 = a_y1 + a_len;

    let jung_x = p.constrain(
      jung_frame.x + jung_frame.w * p.map(g.gestureCompactness,1,3,0.25,0.85),
      jung_frame.x+8, jung_frame.x+jung_frame.w-8
    );

    const a_centerY = (a_y1 + a_y2) / 2;
    const a_horiz_y = a_centerY;
    const a_horiz_len = p.map(g.avgAngle,-1.5,1.5, 16, 66);

    // ㅎ ↔ ㅏ 간격
    const choRightMax = Math.max(cho_top_x2, cho_top_short_x2) + wH/2;
    const neededGapHor = targetGap + (wH + wV)/2;
    let jungLeft = jung_x - (wV/2);
    if (jungLeft - choRightMax < neededGapHor) {
      const need = neededGapHor - (jungLeft - choRightMax);
      const maxShift = (jung_frame.x + jung_frame.w - 8) - jung_x;
      jung_x += Math.min(need, maxShift);
      jungLeft = jung_x - (wV/2);
    }

    // ㅏ 하단 제한
    const circleBottom = o_cy + o_ry + wH/2;
    const maxA2 = circleBottom + targetGap * 0.25;
    if (a_y2 > maxA2) a_y2 = maxA2;

    // 긴 수평 재확인
    if (longLen > (a_y2 - a_y1) - 12) {
      longLen = Math.max(40, (a_y2 - a_y1) - 12);
      cho_top_x1 = centerX - longLen/2;
      cho_top_x2 = centerX + longLen/2;
    }

    // 8) ㄴ 영역
    const zoneTop = circleBottom + Math.max(MIN_GAP, Math.round(targetGap*0.6));
    const leftX  = Math.min(cho_frame.x, jung_frame.x) - 10;
    const rightX = Math.max(cho_frame.x+cho_frame.w, jung_frame.x+jung_frame.w) + 10;
    const jong_zone = { x:leftX, y:zoneTop, w:(rightX-leftX), h:160 };

    const m=12, jf_x1=jong_zone.x+m, jf_x2=jong_zone.x+jong_zone.w-m;
    const jf_y1 = jong_zone.y+m;
    const jf_y2 = jong_zone.y + jong_zone.h - m;

    const vRatio = p.constrain(
      0.24 + 0.80*p.map(g.avgPressure,0,1,0,1) * (0.95 + 0.25*p.map(g.gestureCompactness,1,3,0,1)),
      0.20, 0.92
    );
    const hRatio = p.constrain(
      0.28 + 0.85*p.map(g.avgSpeed,0,1,0,1) * (1.00 + 0.25*p.map(g.pathCurvature,0,1,0,1)),
      0.22, 0.98
    );

    let n_v_len = p.constrain((jf_y2-jf_y1)*vRatio, 16, Math.max(18, jf_y2-jf_y1-8));
    let n_h_len = p.constrain((jf_x2-jf_x1)*hRatio, 24, Math.max(24, jf_x2-jf_x1-8));

    const nxRatioRaw =
      0.50
      + 0.50 * Math.sin(g.avgAngle*1.37 + 0.6)
      + 0.40 * Math.sin(g.startEndAngle*1.73 - 0.4)
      + 0.30 * (p.map(g.gestureCompactness,1,3, -0.6, 0.6))
      + 0.20 * (p.map(g.avgSpeed,0,1, -0.5, 0.5));
    let nyRatioRaw =
      0.06
      + 0.45 * p.map(g.avgSpeed,0,1, 0,1)
      + 0.20 * p.map(g.pathCurvature,0,1, -0.3, 0.3)
      + 0.18 * Math.sin(g.startEndAngle*2.1);

    const posXratio = p.constrain(nxRatioRaw, 0.05, 0.95);
    const posYratio = p.constrain(nyRatioRaw, 0.04, 0.90);

    let n_x = p.constrain(jf_x1 + (jf_x2 - jf_x1 - n_h_len) * posXratio, jf_x1, jf_x2 - n_h_len);
    let n_y1 = p.constrain(jf_y1 + (jf_y2 - jf_y1 - n_v_len) * posYratio, jf_y1, jf_y2 - n_v_len);
    let n_y2 = n_y1 + n_v_len;

    // 9) strokeSlant(기울기)
    const slantCenter = p.constrain(p.map(g.startEndAngle, -1.2, 1.2, -1, 1), -1, 1);
    const slantAmp    = 12 * (0.55 + 0.45 * p.constrain(p.map(g.avgSpeed, 400, 1400, 0, 1), 0, 1));
    const strokeSlantDeg = slantCenter * slantAmp;

    // === 반환 ===
    return {
      // Cho ㅎ
      cho_top_mode,
      cho_top_x1, cho_top_x2, cho_top_y,
      cho_top_weight: wH,
      cho_top_vert_x: centerX, cho_top_vert_y1: cho_top_y, cho_top_vert_y2: cho_top_y - (longLen * p.map(g.gestureAspectRatio, 0.5,2, 0.38,0.68)),
      cho_top_vert_weight: wV,
      cho_top_short_x1, cho_top_short_x2, cho_top_short_y,

      // Circle ㅇ
      cho_circle_cx: centerX, cho_circle_cy: longBottom + targetGap + (o_ry),
      cho_circle_rx: o_rx,    cho_circle_ry: o_ry,
      cho_circle_weight: Math.min(64, (wH+wV)/2),

      // Jung ㅏ
      jung_x1: jung_x, jung_y1: a_y1, jung_x2: jung_x, jung_y2: a_y2,
      jung_weight: wV,
      jung_h_x1: jung_x, jung_h_y1: a_horiz_y, jung_h_x2: jung_x + a_horiz_len, jung_h_y2: a_horiz_y,
      jung_h_weight: wH,

      // Jong ㄴ
      jong_v_x1: n_x, jong_v_y1: n_y1, jong_v_x2: n_x, jong_v_y2: n_y2,
      jong_h_x1: n_x, jong_h_y1: n_y2, jong_h_x2: n_x + n_h_len, jong_h_y2: n_y2,
      jong_weight_unified: Math.max(4, (wH+wV)/2),

      // preview 단계 & ㄴ 서브단계
      stage: 0,
      jongSub: 0,

      // debug
      targetGap,
      checks: { longLen, shortLen, o_rx: o_rx, a_len },

      // 기울기
      strokeSlantDeg
    };
  }
});