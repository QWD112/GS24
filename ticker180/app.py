from flask import Flask, render_template, request, jsonify
import sqlite3
import os

app = Flask(__name__)

# DB 파일 경로 — app.py와 같은 폴더
DB_PATH = os.path.join(os.path.dirname(__file__), 'ranking.db')

# ── DB 초기화 ─────────────────────────────────────────
def init_db():
    """서버 시작 시 테이블이 없으면 생성"""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ranking_pnl (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                pnl     INTEGER NOT NULL,        -- 수익금 (원)
                pct     REAL    NOT NULL,        -- 수익률 (%)
                trades  INTEGER NOT NULL,        -- 거래 횟수
                date    TEXT    NOT NULL         -- 날짜 문자열
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ranking_pct (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                name    TEXT    NOT NULL,        -- 종목명
                pct     REAL    NOT NULL,        -- 종목 수익률 (%)
                date    TEXT    NOT NULL         -- 날짜 문자열
            )
        ''')
        conn.commit()

init_db()

# ── 페이지 라우트 ──────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/game')
def game():
    return render_template('game.html')

@app.route('/result')
def result():
    return render_template('result.html')

# ── 랭킹 API ──────────────────────────────────────────
@app.route('/api/ranking/save', methods=['POST'])
def save_ranking():
    """게임 종료 시 결과 저장"""
    data = request.get_json()

    pnl    = int(data.get('pnl', 0))
    pct    = float(data.get('pct', 0))
    trades = int(data.get('trades', 0))
    date   = str(data.get('date', ''))

    best_stock_name = str(data.get('bestStockName', ''))
    best_stock_pct  = float(data.get('bestStockPct', 0))

    with sqlite3.connect(DB_PATH) as conn:
        # 수익금 랭킹 저장 (상위 100개만 유지)
        conn.execute(
            'INSERT INTO ranking_pnl (pnl, pct, trades, date) VALUES (?, ?, ?, ?)',
            (pnl, pct, trades, date)
        )
        conn.execute('''
            DELETE FROM ranking_pnl WHERE id NOT IN (
                SELECT id FROM ranking_pnl ORDER BY pnl DESC LIMIT 100
            )
        ''')

        # 종목 수익률 랭킹 저장 (상위 100개만 유지)
        if best_stock_name and best_stock_pct > 0:
            conn.execute(
                'INSERT INTO ranking_pct (name, pct, date) VALUES (?, ?, ?)',
                (best_stock_name, best_stock_pct, date)
            )
            conn.execute('''
                DELETE FROM ranking_pct WHERE id NOT IN (
                    SELECT id FROM ranking_pct ORDER BY pct DESC LIMIT 100
                )
            ''')
        conn.commit()

    return jsonify({'status': 'ok'})


@app.route('/api/ranking/get', methods=['GET'])
def get_ranking():
    """랭킹 조회 — ?limit=10(기본) 또는 ?limit=all로 전체 조회"""
    limit = request.args.get('limit', '10')

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row

        if limit == 'all':
            pnl_rows = conn.execute(
                'SELECT pnl, pct, trades, date FROM ranking_pnl ORDER BY pnl DESC'
            ).fetchall()
            pct_rows = conn.execute(
                'SELECT name, pct, date FROM ranking_pct ORDER BY pct DESC'
            ).fetchall()
        else:
            n = int(limit)
            pnl_rows = conn.execute(
                'SELECT pnl, pct, trades, date FROM ranking_pnl ORDER BY pnl DESC LIMIT ?', (n,)
            ).fetchall()
            pct_rows = conn.execute(
                'SELECT name, pct, date FROM ranking_pct ORDER BY pct DESC LIMIT ?', (n,)
            ).fetchall()

    return jsonify({
        'pnl': [dict(r) for r in pnl_rows],
        'pct': [dict(r) for r in pct_rows],
    })


if __name__ == '__main__':
    pass  # app.run(debug=True, port=5000)