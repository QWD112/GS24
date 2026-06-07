/**
 * game.js
 * 티커 180 — 게임 엔진 및 통합 사운드 엔진 (랭킹 시스템 통합본)
 */

const STATE = {
  phase: 'pregame',
  balance: 1000000,
  startBalance: 1000000,
  rerollCost: 10000,
  rerollCount: 0,
  displayedStocks: [],
  selectedStocks: [],
  holdings: {},
  prices: {},
  priceHistory: {},
  timeLeft: 180,
  timerInterval: null,
  priceInterval: null,

  nextNewsTime: 0,
  momentum: {},
  extraVol: {},

  tradeLogs: [],
  totalTrades: 0,
  peakBalance: 1000000,
  masterVolume: parseFloat(localStorage.getItem('ticker180_vol')) || 0.2,

  bestPnl: parseInt(localStorage.getItem('ticker180_bestPnl')) || null,
  bestPct: parseFloat(localStorage.getItem('ticker180_bestPct')) || null,
  isNewRecord: false
};

/* ── 사운드 엔진 ──────────────────────── */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmInterval = null;
let bgmStep = 0;

function getVol() {
  const s = document.getElementById('vol-slider');
  if (s) {
    const val = parseFloat(s.value);
    STATE.masterVolume = val;
    return val;
  }
  return STATE.masterVolume;
}

function updateVolume(val) {
  STATE.masterVolume = parseFloat(val);
  localStorage.setItem('ticker180_vol', val);
}

function playTone(freq, type, duration, baseVol=0.1) {
  const vol = getVol();
  if (vol <= 0) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(baseVol * vol * 3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function initAudioAndPlayBGM() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  if (bgmInterval) return;

  // ── 트레이딩 BGM 설계 원칙 ──────────────────────────
  // 125ms 틱마다 실행. timeLeft 기준 4구간으로 긴박감 점층 상승.
  // 구간별 음색: sine(차분) → triangle(긴장) → sawtooth(긴박) → square+글리치(극한)
  // 베이스 리듬은 공통, 멜로디 속도·음역·왜곡만 점점 강해짐.

  // 공통 베이스 드럼 패턴 (4/4박자 킥 느낌)
  function playKick(vol) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(vol * 0.6, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.12);
  }

  bgmInterval = setInterval(() => {
    const vol = getVol();
    if (vol <= 0 || STATE.phase === 'result') return;

    // ── 대기화면: 잔잔한 사인파 멜로디 ──
    if (STATE.phase === 'pregame') {
      if (bgmStep % 4 === 0) {
        const melody = [261.63, 293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66];
        playTone(melody[(bgmStep / 4) % melody.length], 'sine', 0.5, 0.15);
      }
      bgmStep++;
      return;
    }

    if (STATE.phase !== 'trading') { bgmStep++; return; }

    const t = STATE.timeLeft;
    const beat = bgmStep % 8; // 8틱 = 1마디 (125ms × 8 = 1초)

    // ════════════════════════════════════════════
    // 구간 1: 3분~2분 (t > 120) — 차분한 시작
    // 느린 베이스 + 사인파 멜로디, 4박에 한 번 킥
    // ════════════════════════════════════════════
    if (t > 120) {
      // 킥: 1박, 5박 (8틱 중 0, 4번째)
      if (beat === 0 || beat === 4) playKick(vol * 0.4);

      // 베이스라인: 2틱마다
      if (beat % 2 === 0) {
        const bass = [65.41, 73.42, 82.41, 73.42];
        playTone(bass[(bgmStep / 2) % bass.length], 'sine', 0.22, 0.12);
      }

      // 멜로디: 4틱마다 (느림)
      if (beat % 4 === 0) {
        const mel = [261.63, 329.63, 392.00, 349.23];
        playTone(mel[(bgmStep / 4) % mel.length], 'sine', 0.3, 0.1);
      }
    }

    // ════════════════════════════════════════════
    // 구간 2: 2분~1분 (t > 60) — 긴장감 고조
    // 킥 빠르게 + triangle 멜로디 + 하이햇 추가
    // ════════════════════════════════════════════
    else if (t > 60) {
      // 킥: 1, 3, 5, 7박 (매 2틱)
      if (beat % 2 === 0) playKick(vol * 0.5);

      // 하이햇 느낌 (매 틱 고음 짧게)
      if (beat % 2 === 1) playTone(2000 + Math.random() * 200, 'square', 0.04, 0.025);

      // 베이스라인: 반음 긴장감 추가
      if (beat % 2 === 0) {
        const bass = [110.00, 116.54, 123.47, 110.00, 130.81, 123.47, 116.54, 110.00];
        playTone(bass[bgmStep % bass.length], 'triangle', 0.18, 0.12);
      }

      // 멜로디: 2틱마다 (더 빠름)
      if (beat % 2 === 0) {
        const mel = [440.00, 493.88, 523.25, 493.88, 440.00, 415.30, 392.00, 415.30];
        playTone(mel[bgmStep % mel.length], 'triangle', 0.18, 0.09);
      }
    }

    // ════════════════════════════════════════════
    // 구간 3: 1분~30초 (t > 30) — 긴박한 질주
    // 킥 매 틱 + sawtooth 멜로디 + 빠른 아르페지오
    // ════════════════════════════════════════════
    else if (t > 30) {
      // 킥: 매 틱
      if (beat % 1 === 0) playKick(vol * 0.55);

      // 하이햇: 엇박
      playTone(3000, 'square', 0.03, 0.02);

      // 베이스 리프: 매 틱 변화
      const bassRiff = [146.83, 155.56, 164.81, 174.61, 164.81, 155.56, 146.83, 138.59];
      playTone(bassRiff[beat], 'sawtooth', 0.13, 0.07);

      // 긴박한 아르페지오 멜로디
      const arp = [587.33, 659.25, 698.46, 783.99, 880.00, 783.99, 698.46, 659.25];
      playTone(arp[beat], 'sawtooth', 0.13, 0.07);
    }

    // ════════════════════════════════════════════
    // 구간 4: 마지막 30초 (t <= 30) — 극한의 긴박
    // 모든 요소 최대 + 글리치 노이즈 + 빠른 상승 아르페지오
    // ════════════════════════════════════════════
    else {
      // 킥: 매 틱 강하게
      playKick(vol * 0.7);

      // 글리치 노이즈
      playTone(1500 + Math.random() * 1000, 'square', 0.04, 0.025);

      // 베이스: 반음씩 올라가는 긴장감
      const urgBass = [196.00, 207.65, 220.00, 233.08, 246.94, 261.63, 277.18, 293.66];
      playTone(urgBass[beat] * (1 + (Math.random() - 0.5) * 0.02), 'sawtooth', 0.12, 0.07);

      // 멜로디: 고음역 + 글리치 피치
      const urgMel = [1046.50, 1108.73, 1174.66, 1244.51, 1318.51, 1244.51, 1174.66, 1108.73];
      playTone(urgMel[beat] + (Math.random() * 30 - 15), 'square', 0.1, 0.06);

      // 추가 긴박음: 3틱마다
      if (beat % 3 === 0) playTone(523.25, 'square', 0.08, 0.05);
    }

    bgmStep++;
  }, 125);
}

function playSelectSound(isAdding) { isAdding ? playTone(880, 'sine', 0.08, 0.25) : playTone(349, 'triangle', 0.1, 0.2); }
function playErrorSound() { playTone(130, 'sawtooth', 0.15, 0.25); }
function playBuySound() { playTone(659, 'sine', 0.07, 0.3); setTimeout(() => playTone(987, 'sine', 0.12, 0.3), 60); }
function playSellSound() { playTone(1318, 'square', 0.08, 0.18); setTimeout(() => playTone(880, 'square', 0.18, 0.18), 80); }
function playBGMTick() {
  if (STATE.phase !== 'trading') return;

  // 마지막 5초: 매 초마다 높은 삑 소리 카운트다운
  if (STATE.timeLeft <= 5 && STATE.timeLeft > 0) {
    // 1초=낮은 삑, 마지막 1초=더 높은 삑으로 구분
    const freq = STATE.timeLeft === 1 ? 1800 : 1200;
    playTone(freq, 'square', 0.15, 0.35);
    // 0.1초 뒤 한 번 더 → 삑삑 두 번
    setTimeout(() => playTone(freq, 'square', 0.12, 0.25), 100);
    return;
  }

  // 기존 틱음
  playTone(STATE.timeLeft <= 30 ? 330 : 165, 'triangle', 0.05, 0.1);
}

/* ── 게임 엔진 핵심 로직 ──────────────────────── */
function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
function getStock(id) { return STOCKS_DB.find(s => s.id === id); }
function rollStocks() {
  const pool = [...STOCKS_DB];
  const out = [];
  while (out.length < 9) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

function priceTick() {
  STATE.selectedStocks.forEach(id => {
    const s = getStock(id);
    const cur = STATE.prices[id] || s.basePrice;
    STATE.momentum[id] = (STATE.momentum[id] || 0) * 0.90;
    STATE.extraVol[id] = (STATE.extraVol[id] || 0) * 0.85;
    const trend = ((s.tw - 1) * 0.001) + (STATE.momentum[id] || 0);
    const totalVol = (s.vol * 0.3) + (STATE.extraVol[id] || 0);
    const noise = (Math.random() - 0.48) * totalVol;
    const newPrice = Math.max(cur * (1 + trend + noise), s.basePrice * 0.01);
    STATE.prices[id] = newPrice;
    if (!STATE.priceHistory[id]) STATE.priceHistory[id] = [];
    STATE.priceHistory[id].push(newPrice);
    if (STATE.priceHistory[id].length > 80) STATE.priceHistory[id].shift();
  });
  updateTradingUI();
}

function tryTriggerNews() {
  if (STATE.timeLeft > STATE.nextNewsTime) return;
  const id = STATE.selectedStocks[Math.floor(Math.random() * STATE.selectedStocks.length)];
  const s  = getStock(id);
  const ev = s.events[Math.floor(Math.random() * s.events.length)];
  const impactDiff = ev.impact - 1;
  STATE.momentum[id] = (STATE.momentum[id] || 0) + (impactDiff * 0.2);
  STATE.extraVol[id] = (STATE.extraVol[id] || 0) + (Math.abs(impactDiff) * 0.5);
  showNewsPopup(`📰 [${s.name}] ${ev.desc}`);
  addLog(`[뉴스] ${s.name}: ${ev.desc}`, 'news');
  STATE.nextNewsTime = STATE.timeLeft - (Math.floor(Math.random() * 21) + 15);
  updateTradingUI();
}

function trade(id, type) {
  const s = getStock(id);
  const price = STATE.prices[id] || s.basePrice;
  const qtyInput = document.getElementById('qty-' + id);
  const reqQty = parseInt(qtyInput.value) || 0;
  if (reqQty <= 0) return;

  if (type === 'buy') {
    const cost = reqQty * price;
    if (STATE.balance < cost) { playErrorSound(); addLog('잔고 부족', 'news'); return; }
    STATE.balance -= cost;
    playBuySound();
    if (!STATE.holdings[id]) STATE.holdings[id] = { qty: 0, avgCost: 0 };
    const h = STATE.holdings[id];
    h.avgCost = (h.avgCost * h.qty + cost) / (h.qty + reqQty);
    h.qty += reqQty;
    STATE.totalTrades++;
    addLog(`BUY ${s.name} ${reqQty}주`, 'buy');
  } else {
    const h = STATE.holdings[id];
    if (!h || h.qty < reqQty) { playErrorSound(); addLog('보유 수량 부족', 'news'); return; }
    const proceeds = reqQty * price;
    STATE.balance += proceeds;
    playSellSound();
    h.qty -= reqQty;
    STATE.totalTrades++;
    if (h.qty === 0) h.avgCost = 0;
    addLog(`SELL ${s.name} ${reqQty}주`, 'sell');
  }
  updateTradingUI();
  updateHUD();
}

function startTimer() {
  STATE.timerInterval = setInterval(() => {
    STATE.timeLeft--;
    playBGMTick();
    if (STATE.phase === 'trading') tryTriggerNews();
    updateHUD();
    if (STATE.timeLeft <= 0) { endGame(); }
  }, 1000);
}

function startTrading() {
  if (STATE.selectedStocks.length < 3) return;
  STATE.selectedStocks.forEach(id => {
    STATE.prices[id] = getStock(id).basePrice;
    STATE.priceHistory[id] = [STATE.prices[id]];
    STATE.momentum[id] = 0;
    STATE.extraVol[id] = 0;
  });
  STATE.phase = 'trading';
  bgmStep = 0;
  STATE.nextNewsTime = 180 - (Math.floor(Math.random() * 11) + 8);

  render();
  startTradingBGM();

  if (STATE.priceInterval) clearInterval(STATE.priceInterval);
  STATE.priceInterval = setInterval(priceTick, 200);

  startTimer();
}

function startTradingBGM() {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
  initAudioAndPlayBGM();
}

function endGame() {
  clearInterval(STATE.timerInterval);
  clearInterval(STATE.priceInterval);

  STATE.selectedStocks.forEach(id => {
    const h = STATE.holdings[id];
    if (h && h.qty > 0) {
      const finalPrice = STATE.prices[id] || getStock(id).basePrice;
      STATE.balance += h.qty * finalPrice;
      addLog(`[강제청산] ${getStock(id).name} ${h.qty}주 전량 매도 완료`, 'sell');
    }
  });

  STATE.holdings = {};

  const pnl = Math.floor(STATE.balance - STATE.startBalance);
  const pct = parseFloat((pnl / STATE.startBalance * 100).toFixed(1));

  // 최고 기록 산출
  if (STATE.bestPnl === null || pnl > STATE.bestPnl) {
    STATE.bestPnl = pnl;
    STATE.bestPct = pct;
    STATE.isNewRecord = true;
    localStorage.setItem('ticker180_bestPnl', pnl);
    localStorage.setItem('ticker180_bestPct', STATE.bestPct);
  }

  // ── 날짜 포맷 생성 ──
  const now = new Date();
  const dateStr = `${now.getFullYear()}. ${String(now.getMonth()+1).padStart(2,'0')}. ${String(now.getDate()).padStart(2,'0')}. ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  // ── 종목별 최고 수익률 계산 ──
  let bestStockPct  = 0;
  let bestStockName = '';
  STATE.selectedStocks.forEach(id => {
    const s = getStock(id);
    const finalPrice = STATE.prices[id] || s.basePrice;
    const stockPct = parseFloat(((finalPrice - s.basePrice) / s.basePrice * 100).toFixed(1));
    if (stockPct > bestStockPct) { bestStockPct = stockPct; bestStockName = s.name; }
  });

  // ── 서버 SQLite DB에 랭킹 저장 ──
  fetch('/api/ranking/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pnl,
      pct,
      trades: STATE.totalTrades,
      date: dateStr,
      bestStockName,
      bestStockPct,
    })
  }).catch(err => console.warn('랭킹 저장 실패:', err));

  STATE.phase = 'result';
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
  playTone(220, 'sine', 1.5, 0.2);

  render();
  updateHUD();
}

function resetGame() {
  clearInterval(STATE.timerInterval);
  clearInterval(STATE.priceInterval);
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
  const vol = getVol();
  Object.assign(STATE, {
    phase: 'pregame', balance: 1000000, startBalance: 1000000,
    rerollCount: 0, selectedStocks: [], holdings: {}, prices: {},
    priceHistory: {}, timeLeft: 180, timerInterval: null, priceInterval: null,
    nextNewsTime: 0, momentum: {}, extraVol: {},
    tradeLogs: [], totalTrades: 0, peakBalance: 1000000,
    isNewRecord: false
  });
  bgmStep = 0;
  STATE.displayedStocks = rollStocks();

  initAudioAndPlayBGM();
  render();
  updateHUD();
}

function addLog(msg, type) {
  STATE.tradeLogs.unshift({ msg, type });
  const el = document.getElementById('trade-log');
  if (el) {
    el.innerHTML = STATE.tradeLogs.slice(0, 20).map(l => `<div class="log-entry ${l.type}">${l.msg}</div>`).join('');
    el.scrollTop = 0;
  }
}

function updateHUD() {
  const pnl = STATE.balance - STATE.startBalance;
  const balEl = document.getElementById('hud-bal');
  if (balEl) balEl.textContent = fmt(STATE.balance);

  const pnlEl = document.getElementById('hud-pnl');
  if (pnlEl) {
    pnlEl.textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
    pnlEl.style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  }

  const bestEl = document.getElementById('hud-best');
  if (bestEl) {
    if (STATE.bestPnl !== null) {
      bestEl.textContent = (STATE.bestPnl >= 0 ? '+' : '') + fmt(STATE.bestPnl) + ` (${STATE.bestPct}%)`;
      bestEl.style.color = STATE.bestPnl >= 0 ? 'var(--yellow)' : 'var(--red)';
    } else {
      bestEl.textContent = '기록 없음';
      bestEl.style.color = 'var(--muted)';
    }
  }

  const el = document.getElementById('hud-timer');
  if (el) {
    if (STATE.phase === 'pregame') {
      el.textContent = `03:00 (대기중)`;
      el.className = 'hud-timer';
    } else if (STATE.phase === 'result') {
      el.textContent = `00:00 (마감)`;
      el.className = 'hud-timer';
    } else {
      const m  = String(Math.floor(STATE.timeLeft / 60)).padStart(2, '0');
      const s  = String(STATE.timeLeft % 60).padStart(2, '0');
      el.textContent = `${m}:${s}`;
      el.className   = 'hud-timer' + (STATE.timeLeft <= 30 ? ' urgent' : '');
    }
  }
}