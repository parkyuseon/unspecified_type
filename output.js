// output.js — 자동 중앙정렬, 흰 배경, SQUARE/MITER, slant, scale, 그룹 단계+jongSub 렌더(ㄴ은 한 번에 이어 그리기)

window.outputP5 = new p5(function (p) {
  p.setup = function () {
    const el = document.getElementById("output-area");
    p.createCanvas(el.clientWidth, el.clientHeight).parent("output-area");
    p.noLoop();
  };
  p.windowResized = function () {
    const el = document.getElementById("output-area");
    p.resizeCanvas(el.clientWidth, el.clientHeight);
    p.redraw();
  };
  p.draw = function () {
    p.clear(); p.background(255);
    if (window.formParams) drawGlyph(p, window.formParams);
  };
});

/* 유틸 */
function safe(v, d = 0) { return Number.isFinite(v) ? v : d; }
function measureBBox(pm) {
  const xs = [], ys = [];
  const pushLine = (x1, y1, x2, y2) => { xs.push(x1, x2); ys.push(y1, y2); };
  // ㅎ
  pushLine(safe(pm.cho_top_x1), safe(pm.cho_top_y), safe(pm.cho_top_x2), safe(pm.cho_top_y));
  if (pm.cho_top_mode === 'horizontal') {
    pushLine(safe(pm.cho_top_short_x1), safe(pm.cho_top_short_y),
             safe(pm.cho_top_short_x2), safe(pm.cho_top_short_y));
  } else {
    pushLine(safe(pm.cho_top_vert_x), safe(pm.cho_top_vert_y1),
             safe(pm.cho_top_vert_x), safe(pm.cho_top_vert_y2));
  }
  // ㅇ
  const cx = safe(pm.cho_circle_cx), cy = safe(pm.cho_circle_cy);
  const rx = safe(pm.cho_circle_rx), ry = safe(pm.cho_circle_ry);
  if (rx > 0 && ry > 0) { xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry); }
  // ㅏ
  pushLine(safe(pm.jung_x1), safe(pm.jung_y1), safe(pm.jung_x2), safe(pm.jung_y2));
  pushLine(safe(pm.jung_h_x1), safe(pm.jung_h_y1), safe(pm.jung_h_x2), safe(pm.jung_h_y2));
  // ㄴ
  pushLine(safe(pm.jong_v_x1), safe(pm.jong_v_y1), safe(pm.jong_v_x2), safe(pm.jong_v_y2));
  pushLine(safe(pm.jong_h_x1), safe(pm.jong_h_y1), safe(pm.jong_h_x2), safe(pm.jong_h_y2));
  if (!xs.length || !ys.length) return { minX:0, minY:0, maxX:0, maxY:0 };
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY };
}

/* 메인 렌더 */
function drawGlyph(p, pm) {
  const bb = measureBBox(pm);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;

  p.push();
  p.translate(p.width / 2 - cx, p.height / 2 - cy);
  p.scale(0.9); // 선명도 유지 축소
  const slant = safe(pm.strokeSlantDeg, 0);
  if (slant) p.shearX(p.radians(slant));

  p.stroke(0);
  p.strokeCap(p.SQUARE);
  p.strokeJoin(p.MITER);
  p.drawingContext.miterLimit = 3.0; // 코너가 깨지지 않도록 여유

  const stage = Number(pm.stage) || Infinity;

  // 1) ㅎ(두획)
  if (stage >= 1) { drawChoTopShort(p, pm); drawChoTopLong(p, pm); }
  // 2) ㅇ
  if (stage >= 2) { drawChoCircle(p, pm); }
  // 3) ㅏ(세로+가로)
  if (stage >= 3) { drawJung(p, pm); drawJungH(p, pm); }
  // 4) ㄴ(수직→수평: 한 번의 폴리라인으로 이어 그리기)
  if (stage >= 4) {
    const js = Number(pm.jongSub ?? 2); // 0:숨김, 1:수직만, 2:수직+수평
    if (js >= 2) drawJongJoined(p, pm);
    else if (js === 1) drawJongV(p, pm);
  }

  p.pop();
}

/* 파트 렌더러 */
function drawChoTopShort(p, pm){
  if (pm.cho_top_mode === "horizontal") {
    p.strokeWeight(Math.max(2, safe(pm.cho_top_weight, 8) * 0.9));
    p.line(safe(pm.cho_top_short_x1), safe(pm.cho_top_short_y),
           safe(pm.cho_top_short_x2), safe(pm.cho_top_short_y));
  } else {
    p.strokeWeight(safe(pm.cho_top_vert_weight, 8));
    p.line(safe(pm.cho_top_vert_x), safe(pm.cho_top_vert_y1),
           safe(pm.cho_top_vert_x), safe(pm.cho_top_vert_y2));
  }
}
function drawChoTopLong(p, pm){
  p.strokeWeight(safe(pm.cho_top_weight, 8));
  p.line(safe(pm.cho_top_x1), safe(pm.cho_top_y), safe(pm.cho_top_x2), safe(pm.cho_top_y));
}
function drawChoCircle(p, pm){
  const cx=safe(pm.cho_circle_cx), cy=safe(pm.cho_circle_cy);
  const rx=safe(pm.cho_circle_rx), ry=safe(pm.cho_circle_ry);
  if (rx<=0 || ry<=0) return;
  p.noFill();
  p.strokeWeight(safe(pm.cho_circle_weight, 8));
  p.ellipse(cx, cy, rx*2, ry*2);
}
function drawJung(p, pm){
  p.noFill();
  p.strokeWeight(safe(pm.jung_weight, 8));
  p.line(safe(pm.jung_x1), safe(pm.jung_y1), safe(pm.jung_x2), safe(pm.jung_y2));
}
function drawJungH(p, pm){
  p.noFill();
  p.strokeWeight(safe(pm.jung_h_weight, 8));
  p.line(safe(pm.jung_h_x1), safe(pm.jung_h_y1), safe(pm.jung_h_x2), safe(pm.jung_h_y2));
}

// ㄴ — 수직만(프리뷰용)
function drawJongV(p, pm){
  const w = Math.max(2, safe(pm.jong_weight_unified, 10));
  p.noFill();
  p.strokeWeight(w);
  p.line(safe(pm.jong_v_x1), safe(pm.jong_v_y1), safe(pm.jong_v_x2), safe(pm.jong_v_y2));
}

// ㄴ — 수직+수평을 하나의 폴리라인으로(끊김 없이 이어 그리기)
function drawJongJoined(p, pm){
  const x1 = safe(pm.jong_v_x1), y1 = safe(pm.jong_v_y1);
  const x2 = safe(pm.jong_v_x2), y2 = safe(pm.jong_v_y2);
  const x3 = safe(pm.jong_h_x2);
  // 수평의 y는 모서리 y와 정확히 같게 맞춰 연결
  const yCorner = y2;

  const w  = Math.max(2, safe(pm.jong_weight_unified, 10));
  p.noFill();
  p.strokeWeight(w);
  p.beginShape();
  p.vertex(x1, y1);       // 수직 시작
  p.vertex(x2, yCorner);  // 코너(모서리)
  p.vertex(x3, yCorner);  // 수평 끝
  p.endShape();
}

/* 좌/우 파라미터 패널 */
const UI = (() => {
  let gRanges = {}; let fRanges = {};
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function norm(key, val, ranges) {
    if (!Number.isFinite(val)) return 0;
    let r = ranges[key];
    if (!r) { const pad = Math.abs(val)*0.25 + 1e-6; r = ranges[key] = [val - pad, val + pad]; }
    if (val < r[0]) r[0] = val; if (val > r[1]) r[1] = val;
    const span = (r[1] - r[0]) || 1e-6; return clamp((val - r[0]) / span, 0, 1);
  }
  function fmt(v){ if (typeof v==='boolean') return v?'true':'false';
                   if (typeof v==='number')  return (Math.round(v*1000)/1000).toString();
                   return String(v ?? ''); }
  function titleize(id){ return id === 'parameter-box' ? 'GESTURE (INPUT)' : 'FORM (OUTPUT)'; }
  function renderPanel(boxId, data, ranges) {
    const box = document.getElementById(boxId); if (!box) return;
    box.innerHTML = '';
    const head = document.createElement('div'); head.className = 'panel-title'; head.textContent = titleize(boxId); box.appendChild(head);
    const keys = Object.keys(data || {}); keys.sort((a,b)=>a.localeCompare(b));
    for (const k of keys) {
      const v = data[k];
      const row = document.createElement('div'); row.className='param-row';
      const lab = document.createElement('div'); lab.className='param-label'; lab.textContent=k;
      const val = document.createElement('div'); val.className='param-value'; val.textContent=fmt(v);
      const bar = document.createElement('div'); bar.className='param-bar';
      const fill = document.createElement('span'); fill.style.width = (norm(k, Number(v), ranges)*100).toFixed(1)+'%';
      bar.appendChild(fill);
      row.appendChild(lab); row.appendChild(val); row.appendChild(bar);
      box.appendChild(row);
    }
  }
  return {
    init(gr={}, fr={}){ gRanges={...gr}; fRanges={...fr};
      renderPanel('parameter-box', {}, gRanges);
      renderPanel('form-box',      {}, fRanges); },
    update(gesture, form){ renderPanel('parameter-box', gesture||{}, gRanges);
                           renderPanel('form-box',      form   ||{}, fRanges); }
  };
})();

/* 외부에서 호출 */
window.updateOutput = function (gesture, form) {
  if (typeof UI !== 'undefined' && UI.update) UI.update(gesture || {}, form || {});
  if (window.outputP5 && window.outputP5.redraw) window.outputP5.redraw();
};