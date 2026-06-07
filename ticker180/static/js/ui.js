/**
 * ui.js
 * 티커 180 — UI 렌더러 (랭킹 인터페이스 통합본)
 */

const RISK_LABEL = { high:'HIGH RISK', med:'MED RISK', low:'LOW RISK', meme:'MEME', ext:'EXTREME!' };
const RISK_CLASS = { high:'risk-high', med:'risk-med', low:'risk-low', meme:'risk-meme', ext:'risk-ext' };
const GROUP_LABEL = {
  'Space/Tech':   '우주/테크',
  'Enter/Virtual':'엔터/버추얼',
  'Stable':       '안정 우량주',
  'Bio/Data':     '바이오/데이터',
  'Meme/Crypto':  '밈/크립토',
};

function render() {
  if      (STATE.phase === 'pregame') renderPreGame();
  else if (STATE.phase === 'trading') renderTrading();
  else                                renderResult();
  updateHUD();
}

window.toggleSelect = function(id) {
  if (typeof initAudioAndPlayBGM === 'function') initAudioAndPlayBGM();

  if (typeof STATE === 'undefined') return;
  if (STATE.phase !== 'pregame') return;

  const idx = STATE.selectedStocks.indexOf(id);

  if (idx > -1) {
    STATE.selectedStocks.splice(idx, 1);
    if (typeof playSelectSound === 'function') playSelectSound(false);
  } else {
    if (STATE.selectedStocks.length < 3) {
      STATE.selectedStocks.push(id);
      if (typeof playSelectSound === 'function') playSelectSound(true);
    } else {
      if (typeof playErrorSound === 'function') playErrorSound();
    }
  }
  renderPreGame();
};

function renderPreGame() {
  const stocks   = STATE.displayedStocks;
  const selected = STATE.selectedStocks;

  const cards = stocks.map(s => {
    const isSel = selected.includes(s.id);
    return `
      <div class="stock-card${isSel ? ' selected' : ''}" onclick="toggleSelect('${s.id}')">
        ${isSel ? '<span class="sel-mark">✓</span>' : ''}
        <div class="sc-tag">[${s.id[0]}] ${GROUP_LABEL[s.group] || s.group}</div>
        <div class="sc-name">${s.name}</div>
        <span class="risk-badge ${RISK_CLASS[s.risk]}">${RISK_LABEL[s.risk]}</span>
        <div class="sc-price">₩${fmt(s.basePrice)}</div>
        <div class="sc-vol">변동성 ${(s.vol * 100).toFixed(0)}%</div>
      </div>`;
  }).join('');

  const slots = [0, 1, 2].map(i => {
    const sid = selected[i];
    const st  = sid ? getStock(sid) : null;
    return `
      <div class="port-slot${st ? '' : ' empty'}">
        <div class="slot-no">SLOT ${i + 1}</div>
        <div class="slot-name">${st ? st.name : '— 비어있음 —'}</div>
        ${st ? `<div class="slot-group">${GROUP_LABEL[st.group]}</div>` : ''}
      </div>`;
  }).join('');

  const rerollLabel = STATE.rerollCount > 0 ? `↺ REROLL  (-${fmt(STATE.rerollCost)} KRW)` : '↺ REROLL  (FREE)';
  const rerollDisabled = STATE.rerollCount > 0 && STATE.balance <= STATE.rerollCost ? 'disabled' : '';

  document.getElementById('game-area').innerHTML = `
    <div class="phase-banner">
      ▶ PRE-GAME : 9개의 시장 종목 중 모니터링할 <strong>3개</strong>를 선택하십시오.
      <span class="sel-count">(선택: ${selected.length} / 3)</span>
    </div>
    <div class="stock-grid">${cards}</div>
    <div class="port-section">
      <div class="section-label">◈ 포트폴리오 슬롯</div>
      <div class="port-bar">${slots}</div>
    </div>
    <div class="action-row">
      <button class="btn btn-yellow" onclick="doReroll()" ${rerollDisabled}>${rerollLabel}</button>
      <button class="btn btn-green"  onclick="startTrading()" ${selected.length < 3 ? 'disabled' : ''}>▶ START TRADING</button>
    </div>`;
}

function doReroll() {
  if (typeof initAudioAndPlayBGM === 'function') initAudioAndPlayBGM();
  if (STATE.rerollCount > 0 && STATE.balance <= STATE.rerollCost) return;
  if (STATE.rerollCount > 0) STATE.balance -= STATE.rerollCost;
  STATE.rerollCount++;
  STATE.selectedStocks  = [];
  STATE.displayedStocks = rollStocks();
  renderPreGame();
  updateHUD();
}

window.setQty = function(id, mode) {
  const h = STATE.holdings[id];
  const qtyInput = document.getElementById('qty-' + id);
  if (!qtyInput) return;

  if (h && h.qty > 0) {
    if (mode === 'max') qtyInput.value = h.qty;
    else if (mode === 'half') qtyInput.value = Math.max(1, Math.floor(h.qty / 2));
    else if (mode === 'one') qtyInput.value = 1;
  } else {
    const price = STATE.prices[id] || getStock(id).basePrice;
    if (mode === 'max') qtyInput.value = Math.max(1, Math.floor(STATE.balance / price));
    else if (mode === 'half') qtyInput.value = Math.max(1, Math.floor((STATE.balance / 2) / price));
    else if (mode === 'one') qtyInput.value = 1;
  }
  updateTradingUI();
};

function renderTrading() {
  const panels = STATE.selectedStocks.map(id => {
    const s       = getStock(id);
    const price   = STATE.prices[id] || s.basePrice;
    const change  = price - s.basePrice;
    const chPct   = (change / s.basePrice * 100).toFixed(2);
    const holding = STATE.holdings[id];
    const hasHold = holding && holding.qty > 0;

    let holdHTML = '미보유<br><span style="color:transparent">.</span>';
    if (hasHold) {
      const holdPnl = (price - holding.avgCost) * holding.qty;
      const holdPct = ((price - holding.avgCost) / holding.avgCost * 100).toFixed(2);
      const pnlClass = holdPnl >= 0 ? 'pnl-up' : 'pnl-dn';
      const sign = holdPnl >= 0 ? '▲ +' : '▼ ';
      holdHTML = `
        보유 ${holding.qty}주 (평단가 ₩${fmt(holding.avgCost)})<br>
        <span class="${pnlClass}">수익률: ${sign}${Math.abs(holdPct)}% (${sign}₩${fmt(Math.abs(holdPnl))})</span>
      `;
    }

    return `
      <div class="chart-panel">
        <div class="cp-header">
          <span class="cp-tag">[${s.id[0]}]</span>
          <span class="cp-name">${s.name}</span>
          <span class="cp-group">${GROUP_LABEL[s.group]}</span>
        </div>
        <div class="cp-price ${change >= 0 ? 'up' : 'dn'}" id="price-${id}">₩${fmt(price)}</div>
        <div class="cp-change ${change >= 0 ? 'up' : 'dn'}" id="change-${id}">
          ${change >= 0 ? '▲' : '▼'} ${Math.abs(chPct)}%
        </div>
        <canvas id="canvas-${id}" class="sparkline" width="260" height="110"></canvas>
        <div class="cp-hold" id="hold-${id}">
          ${holdHTML}
        </div>

        <div class="cp-order-form">
          <div class="cp-order-inputs">
            <input type="number" id="qty-${id}" class="order-input" value="1" min="1" oninput="updateTradingUI()">
            <span style="font-size:14px;font-family:var(--sans);white-space:nowrap;">주</span>
            <button class="qty-btn" onclick="setQty('${id}', 'one')" style="white-space:nowrap;">1주</button>
            <button class="qty-btn" onclick="setQty('${id}', 'half')" style="white-space:nowrap;">1/2</button>
            <button class="qty-btn" onclick="setQty('${id}', 'max')" style="white-space:nowrap;">전체</button>
            <div class="est-cost" id="est-${id}" style="margin-left:auto;white-space:nowrap;">예상 ₩${fmt(price)}</div>
          </div>
          <div class="cp-btns">
            <button class="trade-btn buy-btn"  onclick="trade('${id}','buy')">매수 BUY</button>
            <button class="trade-btn sell-btn" onclick="trade('${id}','sell')" id="sell-${id}" ${!hasHold ? 'disabled' : ''}>매도 SELL</button>
          </div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('game-area').innerHTML = `
    <div class="phase-banner trading-banner">
      ◈ LIVE TRADING — 타이머 종료 시 전량 강제 청산됩니다.
    </div>
    <div class="charts-area">${panels}</div>
    <div class="trade-log" id="trade-log">
      <div class="log-entry muted">— 거래 내역 —</div>
    </div>`;

  STATE.selectedStocks.forEach(id => drawChart(id));
}

function updateTradingUI() {
  STATE.selectedStocks.forEach(id => {
    const s      = getStock(id);
    const price  = STATE.prices[id] || s.basePrice;
    const change = price - s.basePrice;
    const chPct  = (change / s.basePrice * 100).toFixed(2);

    const priceEl  = document.getElementById('price-'  + id);
    const changeEl = document.getElementById('change-' + id);
    const holdEl   = document.getElementById('hold-'   + id);
    const sellBtn  = document.getElementById('sell-'   + id);
    const estEl    = document.getElementById('est-'    + id);
    const qtyInput = document.getElementById('qty-'    + id);

    if (priceEl) {
      priceEl.textContent = '₩' + fmt(price);
      priceEl.className   = 'cp-price ' + (change >= 0 ? 'up' : 'dn');
    }
    if (changeEl) {
      changeEl.textContent = (change >= 0 ? '▲ ' : '▼ ') + Math.abs(chPct) + '%';
      changeEl.className   = 'cp-change ' + (change >= 0 ? 'up' : 'dn');
    }

    const holding = STATE.holdings[id];
    const hasHold = holding && holding.qty > 0;
    if (holdEl) {
      if (hasHold) {
        const holdPnl = (price - holding.avgCost) * holding.qty;
        const holdPct = ((price - holding.avgCost) / holding.avgCost * 100).toFixed(2);
        const pnlClass = holdPnl >= 0 ? 'pnl-up' : 'pnl-dn';
        const sign = holdPnl >= 0 ? '▲ +' : '▼ ';

        holdEl.innerHTML = `
          보유 ${holding.qty}주 (평단가 ₩${fmt(holding.avgCost)})<br>
          <span class="${pnlClass}">수익률: ${sign}${Math.abs(holdPct)}% (${sign}₩${fmt(Math.abs(holdPnl))})</span>
        `;
      } else {
        holdEl.innerHTML = '미보유<br><span style="color:transparent">.</span>';
      }
    }

    if (sellBtn) sellBtn.disabled = !hasHold;

    if (estEl && qtyInput) {
      const inputVal = parseInt(qtyInput.value) || 0;
      estEl.textContent = `예상 ₩${fmt(price * inputVal)}`;
    }

    drawChart(id);
  });
}

function drawChart(id) {
  const canvas = document.getElementById('canvas-' + id);
  if (!canvas) return;
  const ctx     = canvas.getContext('2d');
  const history = STATE.priceHistory[id] || [];
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  if (history.length < 2) return;

  let min = Math.min(...history);
  let max = Math.max(...history);

  const holding = STATE.holdings[id];
  const hasHold = holding && holding.qty > 0 && holding.avgCost > 0;

  if (hasHold) {
    min = Math.min(min, holding.avgCost);
    max = Math.max(max, holding.avgCost);
  }

  const range = max - min || 1;
  const isUp  = history[history.length - 1] >= history[0];

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth   = 0.5;
  [0.25, 0.5, 0.75].forEach(p => {
    ctx.beginPath(); ctx.moveTo(0, H * p); ctx.lineTo(W, H * p); ctx.stroke();
  });

  if (hasHold) {
    const avgY = H - (((holding.avgCost - min) / range) * (H - 16) + 8);
    ctx.beginPath();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(0, avgY);
    ctx.lineTo(W, avgY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd700';
    ctx.font = '10px "Noto Sans KR", sans-serif';
    ctx.fillText('평단가', 5, avgY - 4);
  }

  ctx.beginPath();
  ctx.strokeStyle = isUp ? '#00ff88' : '#ff4466';
  ctx.lineWidth   = 2.5;

  history.forEach((v, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - (((v - min) / range) * (H - 16) + 8);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function showNewsPopup(text) {
  const old = document.querySelector('.news-popup');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className   = 'news-popup';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el && el.remove(), 4000);
}

function renderResult() {
  const pnl    = STATE.balance - STATE.startBalance;
  const pct    = (pnl / STATE.startBalance * 100).toFixed(1);
  const isWin  = pnl >= 0;
  const grade  = getGrade(pct);

  const stockRows = STATE.selectedStocks.map(id => {
    const s      = getStock(id);
    const final  = STATE.prices[id] || s.basePrice;
    const change = final - s.basePrice;
    const chPct  = (change / s.basePrice * 100).toFixed(1);
    return `
      <div class="rs-stock">
        <span class="rs-name">${s.name}</span>
        <span class="rs-pct ${change >= 0 ? 'up' : 'dn'}">${change >= 0 ? '▲' : '▼'}${Math.abs(chPct)}%</span>
        <span class="rs-price">₩${fmt(final)}</span>
      </div>`;
  }).join('');

  const recordBadge = STATE.isNewRecord
    ? `<div style="color:var(--yellow); font-size:24px; font-weight:900; margin-bottom:15px; animation: blink 0.8s infinite;">★ NEW BEST RECORD! ★</div>`
    : '';

  // ── 결과 화면 먼저 렌더링 후, 랭킹은 API로 비동기 로드 ──
  document.getElementById('game-area').innerHTML = `
    <div class="result-wrap">
      <div class="result-grade ${isWin ? 'win' : 'loss'}">${grade.icon}</div>
      <div class="result-title ${isWin ? 'win' : 'loss'}">MARKET CLOSED</div>
      <div class="result-subtitle">${grade.label}</div>

      ${recordBadge}

      <div class="result-pnl ${isWin ? 'win' : 'loss'}">
        ${pnl >= 0 ? '+' : ''}${fmt(pnl)} KRW
        <span class="result-pct">(${pct}%)</span>
      </div>

      <div class="result-cards">
        <div class="rs-card">
          <div class="rs-label">시작 자본</div>
          <div class="rs-val">₩${fmt(STATE.startBalance)}</div>
        </div>
        <div class="rs-card">
          <div class="rs-label">최종 잔고</div>
          <div class="rs-val ${isWin ? 'win' : 'loss'}">₩${fmt(STATE.balance)}</div>
        </div>
        <div class="rs-card">
          <div class="rs-label">총 거래 횟수</div>
          <div class="rs-val">${STATE.totalTrades}회</div>
        </div>
        <div class="rs-card">
          <div class="rs-label">리롤 횟수</div>
          <div class="rs-val">${STATE.rerollCount}회</div>
        </div>
      </div>

      <div class="rs-stocks-title">◈ 포트폴리오 종목 결산</div>
      <div class="rs-stocks" style="margin-bottom: 35px;">${stockRows}</div>

      <div class="rs-stocks-title" style="color: var(--yellow); font-weight: bold; border-top: 1px dashed var(--border); padding-top: 25px;">◈ GLOBAL TRADER RANKINGS</div>
      <div id="ranking-pnl-section" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--green);letter-spacing:2px">◈ 전체 수익금 TOP 10</div>
          <button onclick="showAllRanking('pnl')" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:3px 10px;font-size:10px;cursor:pointer;font-family:var(--mono);letter-spacing:1px">모든 등수 보기 ▶</button>
        </div>
        <div id="ranking-pnl-rows" style="color:var(--muted);text-align:center;padding:12px">불러오는 중...</div>
      </div>
      <div id="ranking-pct-section" style="margin-bottom:30px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--blue);letter-spacing:2px">◈ 단일 종목 최고 수익률 TOP 10</div>
          <button onclick="showAllRanking('pct')" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:3px 10px;font-size:10px;cursor:pointer;font-family:var(--mono);letter-spacing:1px">모든 등수 보기 ▶</button>
        </div>
        <div id="ranking-pct-rows" style="color:var(--muted);text-align:center;padding:12px">불러오는 중...</div>
      </div>

      <div class="result-actions">
        <button class="btn btn-green" onclick="resetGame()">▶ NEW GAME</button>
        <a href="/" class="btn btn-blue">◀ 메인으로</a>
      </div>
    </div>`;

  // ── 서버에서 랭킹 데이터 비동기 로드 ──
  loadRankingIntoResult();
}

/* ── 랭킹 행 HTML 생성 (isMine: 내 기록 강조) ── */
function buildPnlRow(r, i, isMine) {
  const medal = ['🥇','🥈','🥉'];
  const highlight = isMine
    ? 'background:rgba(0,255,136,0.08);border-left:3px solid var(--green);outline:1px solid var(--green);'
    : `border-left:3px solid ${i < 3 ? 'var(--yellow)' : 'var(--border)'};`;
  const meTag = isMine ? ' <span style="color:var(--green);font-size:10px;font-weight:700">◀ 내 기록</span>' : '';
  return `
    <div class="rs-stock" style="${highlight}font-size:13px;">
      <span style="min-width:36px">${medal[i] || (i+1)+'위'}</span>
      <span style="flex:1;color:${r.pnl >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">
        ${r.pnl >= 0 ? '+' : ''}${Math.round(r.pnl).toLocaleString('ko-KR')} KRW
        <span style="color:var(--muted);font-size:11px">(${r.pct}%)</span>
        ${meTag}
      </span>
      <span style="color:var(--muted);font-size:11px">${r.trades}회 거래</span>
      <span style="color:var(--muted);font-size:11px;margin-left:8px">${r.date}</span>
    </div>`;
}

function buildPctRow(r, i, isMine) {
  const medal = ['🥇','🥈','🥉'];
  const highlight = isMine
    ? 'background:rgba(0,255,136,0.08);border-left:3px solid var(--green);outline:1px solid var(--green);'
    : `border-left:3px solid ${i < 3 ? 'var(--yellow)' : 'var(--border)'};`;
  const meTag = isMine ? ' <span style="color:var(--green);font-size:10px;font-weight:700">◀ 내 기록</span>' : '';
  return `
    <div class="rs-stock" style="${highlight}font-size:13px;">
      <span style="min-width:36px">${medal[i] || (i+1)+'위'}</span>
      <span style="flex:1;font-family:var(--sans)">${r.name}${meTag}</span>
      <span style="color:var(--green);font-weight:700">▲${r.pct}%</span>
      <span style="color:var(--muted);font-size:11px;margin-left:8px">${r.date}</span>
    </div>`;
}

function loadRankingIntoResult() {
  // 현재 게임 결과 — 내 기록 식별용
  const myPnl    = Math.floor(STATE.balance - STATE.startBalance);
  const myPct    = parseFloat((myPnl / STATE.startBalance * 100).toFixed(1));
  const myTrades = STATE.totalTrades;

  fetch('/api/ranking/get')
    .then(r => r.json())
    .then(data => {
      // 수익금 랭킹 TOP 10
      const pnlEl = document.getElementById('ranking-pnl-rows');
      if (pnlEl) {
        if (data.pnl.length === 0) {
          pnlEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:8px">기록 없음</div>';
        } else {
          // 내 기록: pnl, pct, trades 모두 일치하는 가장 최근 행
          let myPnlIdx = -1;
          data.pnl.forEach((r, i) => {
            if (myPnlIdx === -1 && r.pnl === myPnl && r.pct === myPct && r.trades === myTrades) myPnlIdx = i;
          });
          pnlEl.innerHTML = data.pnl.map((r, i) => buildPnlRow(r, i, i === myPnlIdx)).join('');
        }
      }

      // 종목 수익률 랭킹 TOP 10
      const pctEl = document.getElementById('ranking-pct-rows');
      if (pctEl) {
        if (data.pct.length === 0) {
          pctEl.innerHTML = '<div style="color:var(--muted);text-align:center;padding:8px">기록 없음</div>';
        } else {
          pctEl.innerHTML = data.pct.map((r, i) => buildPctRow(r, i, false)).join('');
        }
      }
    })
    .catch(() => {
      const pnlEl = document.getElementById('ranking-pnl-rows');
      const pctEl = document.getElementById('ranking-pct-rows');
      if (pnlEl) pnlEl.innerHTML = '<div style="color:var(--muted);text-align:center">랭킹 로드 실패</div>';
      if (pctEl) pctEl.innerHTML = '<div style="color:var(--muted);text-align:center">랭킹 로드 실패</div>';
    });
}

/* ── 모든 등수 보기 모달 ── */
function showAllRanking(type) {
  const myPnl    = Math.floor(STATE.balance - STATE.startBalance);
  const myPct    = parseFloat((myPnl / STATE.startBalance * 100).toFixed(1));
  const myTrades = STATE.totalTrades;

  fetch('/api/ranking/get?limit=all')
    .then(r => r.json())
    .then(data => {
      const list = type === 'pnl' ? data.pnl : data.pct;
      const title = type === 'pnl' ? '전체 수익금 랭킹' : '단일 종목 최고 수익률 랭킹';

      // 내 기록 인덱스 탐색
      let myIdx = -1;
      if (type === 'pnl') {
        list.forEach((r, i) => {
          if (myIdx === -1 && r.pnl === myPnl && r.pct === myPct && r.trades === myTrades) myIdx = i;
        });
      }

      const rows = list.map((r, i) => {
        const isMine = i === myIdx;
        return type === 'pnl' ? buildPnlRow(r, i, isMine) : buildPctRow(r, i, false);
      }).join('') || '<div style="color:var(--muted);text-align:center;padding:20px">기록 없음</div>';

      // 내 등수 표시
      const myRankBadge = myIdx >= 0
        ? `<div style="color:var(--green);font-size:12px;margin-bottom:12px;letter-spacing:1px">◈ 내 등수: <strong>${myIdx + 1}위</strong> / 전체 ${list.length}명</div>`
        : '';

      // 모달 생성
      const old = document.getElementById('all-ranking-overlay');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'all-ranking-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:600;display:flex;align-items:center;justify-content:center;padding:20px;';
      overlay.innerHTML = `
        <div style="background:var(--bg2);border:1px solid var(--border);border-top:3px solid var(--yellow);max-width:600px;width:100%;max-height:80vh;display:flex;flex-direction:column;font-family:var(--mono);">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0">
            <div style="color:var(--yellow);font-size:14px;letter-spacing:2px;font-weight:700">🏆 ${title}</div>
            <button onclick="document.getElementById('all-ranking-overlay').remove()" style="background:transparent;border:1px solid var(--border);color:var(--muted);padding:4px 10px;cursor:pointer;font-family:var(--mono);font-size:12px;">✕</button>
          </div>
          <div style="padding:12px 20px 0;flex-shrink:0">${myRankBadge}</div>
          <div style="overflow-y:auto;padding:0 20px 20px;flex:1">${rows}</div>
        </div>`;

      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      document.body.appendChild(overlay);

      // 내 기록으로 자동 스크롤
      if (myIdx >= 0) {
        setTimeout(() => {
          const allRows = overlay.querySelectorAll('.rs-stock');
          if (allRows[myIdx]) allRows[myIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    })
    .catch(() => alert('랭킹 로드 실패'));
}

function getGrade(pct) {
  const p = parseFloat(pct);
  if (p >= 50)  return { icon: '💎', label: 'LEGENDARY  —  전설의 트레이더' };
  if (p >= 20)  return { icon: '🚀', label: 'EXCELLENT  —  훌륭한 수익!' };
  if (p >= 5)   return { icon: '📈', label: 'GOOD  —  꽤 괜찮은 성과' };
  if (p >= 0)   return { icon: '😐', label: 'BREAK-EVEN  —  본전 수준' };
  if (p >= -10) return { icon: '📉', label: 'LOSS  —  손실 발생' };
  if (p >= -30) return { icon: '💸', label: 'BAD  —  상당한 손실' };
  return             { icon: '💀', label: 'REKT  —  전재산을 날렸다...' };
}