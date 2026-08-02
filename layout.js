// layout.js — Unspecified Type v2 / 배치 + 형태 계층
//
// 계산 원칙:
//   v1  절대 좌표 계산 → constrain()으로 자름 → 값이 경계에 뭉침
//   v2  가능 구간(feasible interval) 계산 → 구간 안에서 특징값 비율로 배치
//
// 조형 규칙(고정):
//   - 한 글자 안의 모든 획은 같은 굵기
//   - ㅎ의 위쪽 획과 ㅇ은 긴 가로획의 가운데 정렬
//   - ㅇ의 바깥 너비 ≤ 긴 가로획의 9/10
//   - ㅎ 세로 구조일 때 세로획 높이 ≤ ㅏ 곁가지 너비의 4/5
//   - ㅏ 곁가지: 길이 < 긴 가로획의 1/2, y는 긴 가로획 아래 ~ ㅇ 중심 위
//   - ㅏ 세로획 끝은 항상 ㅇ 아래끝보다 아래
//   - ㄴ 세로획 x는 ㅇ의 좌우 폭 안, 가로획 끝은 ㅏ 곁가지 끝보다 왼쪽
//   - 세로 간격 A(ㅎ 두 획), B(가로획↔ㅇ), C(초성↔ㄴ)는 모두 획 굵기보다 작다
//
// 겹침 금지. 출력 키는 v1 formParams와 호환(cho_top_short_weight만 v2 신규).

(function (global) {
  'use strict';

  const place = (lo, hi, t) => lo + (Math.max(hi, lo) - lo) * t;
  const lerp  = (a, b, t) => a + (b - a) * t;
  const bi    = (t) => t * 2 - 1;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let collapseCount = 0;
  const guard = (lo, hi) => { if (hi < lo) collapseCount++; return Math.max(hi, lo); };

  function build(F, opt) {
    const O = Object.assign({
      slantMax: 16,
      weightMin: 4,
      weightMax: 88
    }, opt || {});

    // ── 0. 굵기 (전 획 동일)
    // 실측 분포가 균등한 density를 주 동인으로 쓴다. force는 잠정 캘리브레이션이라
    // 주 동인으로 쓰면 얇은 쪽이 덜 나온다. 여기서는 흔들기 정도로만 쓴다.
    const wT = clamp(F.density + (F.force - 0.5) * 0.25, 0, 1);
    const w  = clamp(lerp(O.weightMin, O.weightMax, wT), O.weightMin, O.weightMax);

    // ── 1. 세로 간격 A / B / C — 모두 굵기보다 작다
    const gapA = w * lerp(0.20, 0.92, F.angle);   // ㅎ 두 획 사이
    const gapB = w * lerp(0.20, 0.92, F.order);   // 긴 가로획 ↔ ㅇ
    const gapC = w * lerp(0.20, 0.92, F.pause);   // 초성/중성 ↔ ㄴ
    const gapHor = Math.max(6, w * lerp(0.5, 2.2, F.count)); // ㅎ ↔ ㅏ (가로 간격, 별도)

    // ── 2. 긴 가로획
    // ㅇ과 곁가지가 모두 이 길이에 묶이므로, 굵기가 커지면 함께 길어져야 한다.
    const longLen = Math.max(lerp(110, 300, F.speed), w * 4);
    const longY = 0, longCx = 0;
    const longX1 = longCx - longLen / 2;
    const longX2 = longCx + longLen / 2;

    // ── 3. ㅏ 곁가지 길이 (ㅎ 세로획 높이의 상한이 되므로 먼저 정한다)
    const branchLen = clamp(longLen * lerp(0.20, 0.49, F.speedVar), w * 1.9, longLen * 0.49);

    // ── 4. ㅎ 위쪽 획 — 가운데 정렬
    const mode = (F.aspect >= 0.5) ? 'horizontal' : 'vertical';
    const shortLen = Math.max(longLen * lerp(0.28, 0.92, F.turn), w * 1.6);
    const shortY = longY - w - gapA;                       // 가로 모드: 띄운다
    // 세로 모드: 긴 가로획에 붙이고, 높이는 곁가지 너비의 4/5 이하
    const vertLen = clamp(lerp(60, 190, F.turn), w * 1.5, branchLen * 0.8);
    const vertY1 = longY;
    const vertY2 = vertY1 - vertLen;
    const vertX = longCx;

    // ── 5. ㅇ — 가운데 정렬, 바깥 너비 ≤ 긴 가로획의 9/10
    const ry = Math.max(lerp(26, 80, F.spread), w / 2 + 8);
    const rxMax = longLen * 0.45 - w / 2;
    const rx = clamp(ry * lerp(0.55, 1.95, F.aspect), Math.min(w / 2 + 8, rxMax), rxMax);
    const oCx = longCx;
    const oCy = longY + w / 2 + gapB + ry + w / 2;

    // ── 6. 초성 블록의 잉크 경계
    const shortTopY = (mode === 'horizontal') ? (shortY - w / 2) : vertY2;
    const choTop    = Math.min(shortTopY, longY - w / 2);
    const choBottom = oCy + ry + w / 2;
    const choRight  = Math.max(longX2, oCx + rx + w / 2);
    const choLeft   = Math.min(longX1, oCx - rx - w / 2);

    // ── 7. 중성 ㅏ
    const jungX = choRight + gapHor + w / 2;
    // 곁가지가 긴 가로획 아래에 놓이려면 세로획 상단이 그보다 위에 있어야 한다.
    const aTop = Math.min(choTop + lerp(-40, 70, F.order), longY - w * 0.1);
    const aOver = lerp(12, 70, F.dirBias);                 // ㅇ 아래끝보다 더 내려가는 양
    const aLen = Math.max(lerp(160, 430, F.duration), (choBottom + aOver) - aTop);
    const aBottom = aTop + aLen;

    // 곁가지 y: 긴 가로획 아래 ~ ㅇ 중심 위, 세로획 안쪽
    const bLo = Math.max(longY + w / 2, aTop + w * 0.6);
    const bHi = Math.max(bLo, Math.min(oCy, aBottom - w * 0.6));
    const branchY = place(bLo, bHi, F.angle);
    const branchEnd = jungX + branchLen;

    // ── 8. 종성 ㄴ
    // 세로획 전체가 ㅇ의 바깥 좌우 경계 안에 들어온다.
    const nxLo = oCx - rx;
    const nxHi = guard(nxLo, Math.min(oCx + rx, jungX - w - gapHor / 2));
    let   nX   = place(nxLo, nxHi, 1 - F.travel);

    // 가로획 끝은 ㅏ 곁가지 끝보다 왼쪽. 최소 길이가 안 나오면 세로획을 왼쪽으로 민다.
    const minH = Math.max(24, w * 1.2);
    if (branchEnd - nX < minH) nX = Math.max(nxLo - 40, branchEnd - minH);
    const nHEnd = place(nX + minH, guard(nX + minH, branchEnd), F.speedVar);
    const nHLen = nHEnd - nX;

    // 위쪽 장애물: [x좌, x우, 아래끝]
    const obstacles = [
      [choLeft, choRight, choBottom],
      [jungX - w / 2, jungX + w / 2, aBottom],
      [jungX, branchEnd, branchY + w / 2]
    ];
    const lowestOver = (x1, x2) => obstacles.reduce(
      (m, o) => (x2 >= o[0] - gapC && x1 <= o[1] + gapC) ? Math.max(m, o[2]) : m, -Infinity);

    // 세로획 길이를 먼저 정하고 코너를 그만큼 내린다. 간격 C는 굵기보다 작다.
    const nVLen = Math.max(lerp(40, 200, F.count), w * 1.4);
    const aboveAtNx = lowestOver(nX - w / 2, nX + w / 2);
    const cornerY = Math.max(
      lowestOver(nX, nHEnd) + gapC + w / 2,
      aboveAtNx + gapC + nVLen
    );
    const nY1 = cornerY - nVLen;

    // ── 9. 기울기
    const slantDeg = bi(F.travel) * lerp(4, O.slantMax, F.speed);

    return {
      cho_top_mode: mode,
      cho_top_x1: longX1, cho_top_x2: longX2, cho_top_y: longY,
      cho_top_weight: w,
      cho_top_vert_x: vertX, cho_top_vert_y1: vertY1, cho_top_vert_y2: vertY2,
      cho_top_vert_weight: w,
      cho_top_short_x1: longCx - shortLen / 2,
      cho_top_short_x2: longCx + shortLen / 2,
      cho_top_short_y: shortY,
      cho_top_short_weight: w,

      cho_circle_cx: oCx, cho_circle_cy: oCy,
      cho_circle_rx: rx,  cho_circle_ry: ry,
      cho_circle_weight: w,

      jung_x1: jungX, jung_y1: aTop, jung_x2: jungX, jung_y2: aBottom,
      jung_weight: w,
      jung_h_x1: jungX, jung_h_y1: branchY, jung_h_x2: branchEnd, jung_h_y2: branchY,
      jung_h_weight: w,

      jong_v_x1: nX, jong_v_y1: nY1, jong_v_x2: nX, jong_v_y2: cornerY,
      jong_h_x1: nX, jong_h_y1: cornerY, jong_h_x2: nHEnd, jong_h_y2: cornerY,
      jong_weight_unified: w,

      stage: 4, jongSub: 2,
      targetGap: gapC,
      strokeSlantDeg: slantDeg,
      checks: { w, longLen, shortLen, vertLen, rx, ry, aLen, branchLen, nHLen, nVLen,
                gapA, gapB, gapC, gapHor }
    };
  }

  global.UTLayout = {
    build,
    resetCollapse: () => { collapseCount = 0; },
    getCollapse: () => collapseCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
