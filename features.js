// features.js — Unspecified Type v2 / A단계: 제스처 특징 추출 + 실측 분위수 정규화
// 캘리브레이션 출처: unspecified_type_db 36,231건 (2025-12-16 ~ 2026-08-02)
// 모든 출력 특징은 0~1. 하드 clamp 대신 soft tail을 써서 분포 바깥값도 계속 변별된다.

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // 1. 캘리브레이션 테이블
  //    knots = 실측 누적분포의 2/10/20/.../90/98 분위수 (총 11개 마디).
  //    구간선형 CDF로 매핑하므로 출력이 0~1에 거의 균등하게 퍼진다.
  //    MEASURED = 36,231건 실측.  PROVISIONAL = v2 신규 특징, 재수집 후 갱신.
  // ─────────────────────────────────────────────────────────────
  const P = [0.02, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.98];
  const CALIB = {
    speed:     { knots: [0.0239, 0.1756, 0.2649, 0.3382, 0.4106, 0.4840, 0.5677, 0.6638, 0.7978, 1.026, 1.630], src: 'MEASURED' },
    aspect:    { knots: [0.3341, 0.5799, 0.7229, 0.8237, 0.9133, 1.000, 1.101, 1.221, 1.382, 1.675, 2.630], src: 'MEASURED' },
    density:   { knots: [0.9091, 1.628, 2.068, 2.342, 2.525, 2.671, 2.824, 2.999, 3.267, 3.978, 7.087], src: 'MEASURED' },
    duration:  { knots: [113, 1284, 1849, 2349, 2867, 3498, 4334, 5594, 7815, 12960, 127300], src: 'MEASURED' },
    count:     { knots: [1, 2, 3, 4, 5, 6, 6, 6, 7, 10, 18], src: 'MEASURED' },
    angle:     { knots: [-0.2076, 0.1962, 0.3345, 0.4156, 0.4773, 0.5339, 0.5893, 0.6477, 0.7260, 0.8528, 1.250], src: 'MEASURED' },
    travel:    { knots: [-1.568, 0.2298, 0.5091, 0.6487, 0.7486, 0.8391, 0.9264, 1.015, 1.124, 1.320, 2.027], src: 'MEASURED' },
    // v1에 없던 특징. 낙서형 필기에서도 포화되지 않는 통계량으로 골랐다.
    // 3개 마디(p5/p50/p95 추정)만 두고, 신규 수집 후 recalibrate()로 11개로 갱신한다.
    speedVar:  { knots: [0.35, 0.62, 1.05], src: 'PROVISIONAL' },
    turn:      { knots: [0.010, 0.045, 0.130], src: 'PROVISIONAL' },
    pause:     { knots: [60, 260, 1400], src: 'PROVISIONAL' },
    dirBias:   { knots: [0.32, 0.50, 0.70], src: 'PROVISIONAL' },
    spread:    { knots: [140, 300, 560], src: 'PROVISIONAL' },
    order:     { knots: [-0.80, 0.00, 0.80], src: 'PROVISIONAL' },
  };

  // ─────────────────────────────────────────────────────────────
  // 2. 정규화: 실측 CDF를 따라가는 구간선형 매핑 + 양끝 지수 soft tail.
  //    v1의 constrain()은 값을 경계에 뭉치게 만들었다(compactness 41.5%가
  //    최댓값에 고정). 여기서는 마디 바깥에서도 단조 증가가 유지되므로
  //    극단값끼리도 계속 구별된다.
  // ─────────────────────────────────────────────────────────────
  function q3(v, key) {
    const c = CALIB[key];
    if (!c || !Number.isFinite(v)) return 0.5;
    const k = c.knots;
    const ps = (k.length === 3) ? [0.05, 0.50, 0.95] : P;
    const lo = ps[0], hi = ps[ps.length - 1];
    if (v <= k[0]) {
      const slope = (k[1] - k[0]) / ((ps[1] - ps[0]) || 1e-9);
      const t = lo + (v - k[0]) / (slope || 1e-9);
      return lo * Math.exp((t - lo) * 8 / (lo || 1));
    }
    if (v >= k[k.length - 1]) {
      const n = k.length;
      const slope = (k[n - 1] - k[n - 2]) / ((ps[n - 1] - ps[n - 2]) || 1e-9);
      const t = hi + (v - k[n - 1]) / (slope || 1e-9);
      return 1 - (1 - hi) * Math.exp(-(t - hi) * 8 / (1 - hi));
    }
    for (let i = 1; i < k.length; i++) {
      if (v <= k[i]) {
        const span = k[i] - k[i - 1];
        const f = span > 0 ? (v - k[i - 1]) / span : 0.5;
        return ps[i - 1] + (ps[i] - ps[i - 1]) * f;
      }
    }
    return 0.5;
  }

  // 보조 통계
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean   = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

  // ─────────────────────────────────────────────────────────────
  // 3. 원시 통계 (획 단위 구조를 유지한 채 계산)
  //    v1은 strokes.flat()으로 획 경계를 지웠다. 획 사이의 시간 간격, 획별
  //    길이 편차, 첫 획과 마지막 획의 차이가 거기서 전부 소실됐다.
  // ─────────────────────────────────────────────────────────────
  function rawStats(strokes) {
    const S = strokes.filter(s => s && s.length > 1);
    if (!S.length) return null;

    const segSpeeds = [], segTurns = [], strokeLens = [], strokeDirs = [];
    let inkLen = 0, dxAbs = 0, dyAbs = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const forces = [];

    for (const s of S) {
      let len = 0, prevAng = null, turnAcc = 0, turnN = 0;
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].x - s[i - 1].x, dy = s[i].y - s[i - 1].y;
        const dt = Math.max(1, s[i].t - s[i - 1].t);
        const d  = Math.hypot(dx, dy);
        len += d; dxAbs += Math.abs(dx); dyAbs += Math.abs(dy);
        if (d > 0.5) segSpeeds.push(d / dt);
        const ang = Math.atan2(dy, dx);
        if (prevAng !== null && d > 0.5) {
          let da = ang - prevAng;
          while (da >  Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          turnAcc += Math.abs(da); turnN += d;   // 길이당 회전량
        }
        if (d > 0.5) prevAng = ang;
      }
      for (const pt of s) {
        if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        if (Number.isFinite(pt.force) && pt.force > 0) forces.push(pt.force);
      }
      inkLen += len;
      strokeLens.push(len);
      if (turnN > 0) segTurns.push(turnAcc / turnN);
      const a = s[0], b = s[s.length - 1];
      strokeDirs.push(Math.atan2(b.y - a.y, b.x - a.x));
    }

    // 획 사이 정지 시간
    const pauses = [];
    for (let i = 1; i < S.length; i++) {
      const prevEnd = S[i - 1][S[i - 1].length - 1].t;
      const curStart = S[i][0].t;
      if (curStart > prevEnd) pauses.push(curStart - prevEnd);
    }

    const w = maxX - minX, h = maxY - minY;
    const t0 = S[0][0].t, t1 = S[S.length - 1][S[S.length - 1].length - 1].t;

    // 획 순서에 따른 크기 추세 (앞쪽이 큰가 뒤쪽이 큰가) — v1에 없던 시간 구조
    let order = 0;
    if (strokeLens.length > 1) {
      const half = Math.ceil(strokeLens.length / 2);
      const A = mean(strokeLens.slice(0, half)), B = mean(strokeLens.slice(-half));
      order = (B - A) / Math.max(1, A + B);
    }

    const spd = median(segSpeeds);
    const sdSpd = segSpeeds.length > 1
      ? Math.sqrt(mean(segSpeeds.map(x => (x - mean(segSpeeds)) ** 2))) : 0;

    return {
      speedMed: spd,
      speedCV:  spd > 0 ? sdSpd / spd : 0,
      turnRate: median(segTurns),
      pauseMed: pauses.length ? median(pauses) : 0,
      strokeN:  S.length,
      inkLen, w, h,
      aspect:   h > 0 ? w / h : 1,
      density:  (w + h) > 0 ? inkLen / (w + h) : 1,
      diag:     Math.hypot(w, h),
      duration: Math.min(t1 - t0, 120000),          // 17시간짜리 이상치가 실제로 있었다
      dirBias:  (dxAbs + dyAbs) > 0 ? dyAbs / (dxAbs + dyAbs) : 0.5,
      angleMean: circMean(strokeDirs),
      travel:   Math.atan2(
                  S[S.length - 1][S[S.length - 1].length - 1].y - S[0][0].y,
                  S[S.length - 1][S[S.length - 1].length - 1].x - S[0][0].x),
      order,
      force:    forces.length ? mean(forces) : null, // 실제 필압이 들어올 때만 non-null
      forceN:   forces.length,
    };
  }

  function circMean(angs) {
    if (!angs.length) return 0;
    const s = mean(angs.map(Math.sin)), c = mean(angs.map(Math.cos));
    return Math.atan2(s, c);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 정규화된 특징 벡터 (전부 0~1)
  // ─────────────────────────────────────────────────────────────
  function extract(strokes) {
    const r = rawStats(strokes);
    if (!r) return null;
    const F = {
      speed:    q3(r.speedMed, 'speed'),
      speedVar: q3(r.speedCV,  'speedVar'),
      turn:     q3(r.turnRate, 'turn'),
      pause:    q3(r.pauseMed, 'pause'),
      count:    q3(r.strokeN,  'count'),
      aspect:   q3(r.aspect,   'aspect'),
      density:  q3(r.density,  'density'),
      spread:   q3(r.diag,     'spread'),
      duration: q3(r.duration, 'duration'),
      dirBias:  q3(r.dirBias,  'dirBias'),
      angle:    q3(r.angleMean, 'angle'),
      travel:   q3(r.travel,   'travel'),
      order:    q3(r.order,    'order'),
      // 필압은 기기가 실제로 줄 때만 살아난다. 아니면 속도 변동성이 대신한다.
      force:    (r.force !== null) ? Math.min(1, Math.max(0, r.force)) : q3(r.speedCV, 'speedVar'),
      forceIsReal: r.force !== null,
    };
    F._raw = r;
    return F;
  }

  // 캘리브레이션 재산출용: 수집된 raw 통계 배열을 넣으면 새 [p5,p50,p95]를 출력
  function recalibrate(rawList, key, pick) {
    const v = rawList.map(pick).filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const at = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
    return { key, q: [at(0.05), at(0.50), at(0.95)] };
  }

  global.UTFeatures = { CALIB, q3, rawStats, extract, recalibrate };
})(window);
