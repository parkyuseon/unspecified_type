
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const SHEETS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzhL3KQ3_XQW05jgahV5dxnWOogiknlTGC16OIabb4ggGhfOC-vewVryehwdauajKcE6Q/exec";
  const SHEETS_TOKEN    = "ut_2025_unspecifiedType_9fA3kL82QmX";

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

  const KS = { totKey: 'hanCounter.total' };
  const fmtNum = n => (n || 0).toLocaleString();

  function getTotal() {
    try {
      return parseInt(localStorage.getItem(KS.totKey), 10) || 0;
    } catch (e) {
      return 0;
    }
  }
  function incTotal() {
    try {
      let tot = getTotal();
      tot += 1;
      localStorage.setItem(KS.totKey, String(tot));
      return tot;
    } catch (e) {
      return null;
    }
  }
  function updateBadge() {
    const el = document.getElementById('counter-badge');
    if (!el) return;
    el.textContent = `Total: ${fmtNum(getTotal())}`;
  }


function getSessionId() {
  try {
    let id = localStorage.getItem('sessionId');
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('sid-' + Math.random().toString(16).slice(2));
      localStorage.setItem('sessionId', id);
    }
    return id;
  } catch (e) {
    return 'no-localstorage';
  }
}

async function saveToGoogleSheet(payload) {
  const body = Object.assign({ token: SHEETS_TOKEN }, payload);
  const res = await fetch(SHEETS_ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!json || json.ok !== true) {
    throw new Error((json && json.error) ? json.error : 'save failed');
  }
  return json; // { ok:true, driveUrl? }
}

function queuePayload(payload) {
  try {
    const q = JSON.parse(localStorage.getItem('saveQueue') || '[]');
    q.push(payload);
    localStorage.setItem('saveQueue', JSON.stringify(q));
  } catch (e) { /* ignore */ }
}

async function flushQueue() {
  let q = [];
  try { q = JSON.parse(localStorage.getItem('saveQueue') || '[]'); } catch (e) { q = []; }
  if (!q.length) return;

  const rest = [];
  for (const payload of q) {
    try {
      const json = await saveToGoogleSheet(payload);
      if (json && json.driveUrl) console.log('[archive] queued upload ok:', json.driveUrl);
      else console.log('[archive] queued upload ok');
    } catch (e) {
      rest.push(payload);
    }
  }
  try { localStorage.setItem('saveQueue', JSON.stringify(rest)); } catch (e) { /* ignore */ }
}

  function getOutCanvas() { return $('#output-area canvas'); }
  function getInCanvas()  { return $('#input-area  canvas'); }

  function stackVertical(cTop, cBottom, pad = 0, bg = '#fff') {
    const w = Math.max(cTop.width, cBottom.width);
    const h = cTop.height + pad + cBottom.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const xTop = (w - cTop.width) / 2;
    const xBot = (w - cBottom.width) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      cTop,
      0, 0, cTop.width, cTop.height,
      xTop, 0, cTop.width, cTop.height
    );
    ctx.drawImage(
      cBottom,
      0, 0, cBottom.width, cBottom.height,
      xBot, cTop.height + pad, cBottom.width, cBottom.height
    );
    return c;
  }

  function toSquare(srcCanvas, size = 2048, bg = '#fff') {
    const s = document.createElement('canvas');
    s.width = s.height = size;
    const ctx = s.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    const r = srcCanvas.width / srcCanvas.height;
    let dw, dh, dx, dy;
    if (r >= 1) {
      dw = size;
      dh = size / r;
      dx = 0;
      dy = (size - dh) / 2;
    } else {
      dh = size;
      dw = size * r;
      dy = 0;
      dx = (size - dw) / 2;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      srcCanvas,
      0, 0, srcCanvas.width, srcCanvas.height,
      dx, dy, dw, dh
    );
    return s;
  }

  function toBlob(canvas) {
    return new Promise(res => canvas.toBlob(res, 'image/png', 1.0));
  }

  function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  let saving = false;
  async function onResetCapture() {
  if (saving) return;

  hidePanels();

  const out = getOutCanvas();
  const inp = getInCanvas();

  if (out && inp && window.formParams) {
    const merged = stackVertical(out, inp, 80, '#fff');
    const square = toSquare(merged, 2048, '#fff');
    const pngBase64 = square.toDataURL('image/png');

    const payload = {
      clientTime: new Date().toISOString(),
      sessionId: getSessionId(),
      gesture: window.latestGesture || null,
      form: window.formParams,
      strokeCount: window.latestGesture?.strokeCount ?? null,
      userAgent: navigator.userAgent,
      pngBase64
    };

    saveToGoogleSheet(payload).then((json)=>{
      console.log('[archive] driveUrl:', json?.driveUrl || '(no url)');
    });
  } else {
    console.log('[archive] skip: canvas or formParams missing');
  }

  incTotal();
  updateBadge();

}
  function bind() {
    hookUpdateOutput();

    const btn = document.getElementById('reset-button');
    if (btn) {
      btn.textContent = 'Write. 쓰기';
      btn.addEventListener('click', onResetCapture, { capture: true, passive: true });
    }

    updateBadge();

    window.addEventListener('load', flushQueue);
    window.addEventListener('online', flushQueue);

    const infoBtn   = document.getElementById('info-button');
    const infoModal = document.getElementById('info-modal');
    const infoClose = document.getElementById('info-close');
    if (infoBtn && infoModal) {
      infoBtn.addEventListener('click', () => infoModal.classList.remove('hidden'));
    }
    if (infoClose && infoModal) {
      infoClose.addEventListener('click', () => infoModal.classList.add('hidden'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();