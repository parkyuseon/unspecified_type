// save-utils.js — 촬영용: Write. 쓰기 = 리셋만 + 카운터(총 관객 수) 증가 + 패널 숨김/복귀
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  /* ---------- 패널 숨김/복귀 ---------- */
  function hidePanels() {
    const pb = $('#parameter-box'), fb = $('#form-box');
    if (pb) pb.style.display = 'none';
    if (fb) fb.style.display = 'none';
  }
  function showPanels() {
    const pb = $('#parameter-box'), fb = $('#form-box');
    if (pb) pb.style.display = '';
    if (fb) fb.style.display = '';
  }

  // updateOutput 훅: 데이터가 들어오면 자동으로 패널 다시 보이게
  function hookUpdateOutput() {
    if (typeof window.updateOutput !== 'function') return;
    const orig = window.updateOutput;
    window.updateOutput = function (gParams, fParams) {
      const hasG = gParams && Object.keys(gParams).length > 0;
      const hasF = fParams && Object.keys(fParams).length > 0;
      if (hasG || hasF) showPanels();
      return orig.apply(this, arguments);
    };
  }

  /* ---------- 카운터(총 관객 수) ---------- */
  const KS = { totKey: 'hanCounter.total' };
  const fmtNum = n => (n || 0).toLocaleString();

  function getTotal() {
    try { return parseInt(localStorage.getItem(KS.totKey), 10) || 0; }
    catch (e) { return 0; }
  }
  function incTotal() {
    try {
      let tot = getTotal();
      tot += 1;
      localStorage.setItem(KS.totKey, String(tot));
      return tot;
    } catch (e) { return null; }
  }
  function updateBadge() {
    const el = document.getElementById('counter-badge');
    if (!el) return;
    el.textContent = `Total: ${fmtNum(getTotal())}`;
  }

  /* ---------- 촬영용: 리셋만 + 카운터 증가 ---------- */
  function onResetCapture(/* e */){
    // 1) 초기화 느낌: 패널 즉시 숨김
    hidePanels();

    // 2) 총 관객 수 +1
    incTotal();

    // 3) 배지 갱신
    updateBadge();

    // 4) preventDefault() 호출하지 않음 → input.js의 기존 리셋 핸들러가 그대로 실행
  }

  function bind(){
    hookUpdateOutput();

    // 버튼 라벨을 "Write. 쓰기"로 (원하실 때만)
    const btn = document.getElementById('reset-button');
    if (btn) {
      btn.textContent = 'Write. 쓰기';
      // 캡처 단계에서: 패널 숨김 + 카운터 증가만 수행, 이후 기존 리셋 로직 실행
      btn.addEventListener('click', onResetCapture, { capture:true, passive:true });
    }

    // (촬영용) 별도 저장 버튼이 있다면 완전 비활성화/숨김
    const saveBtn = document.getElementById('save-button');
    if (saveBtn) {
      saveBtn.style.display = 'none';
      const clone = saveBtn.cloneNode(true);
      saveBtn.replaceWith(clone);
    }

    // 초기 배지 표시
    updateBadge();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();