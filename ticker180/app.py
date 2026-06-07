from flask import Flask, render_template

app = Flask(__name__)

# 메인 랜딩 페이지
@app.route('/')
def index():
    return render_template('index.html')

# 게임 페이지
@app.route('/game')
def game():
    return render_template('game.html')

# 결과 페이지 (게임 내 JS가 직접 처리하지만 라우트 보존)
@app.route('/result')
def result():
    return render_template('result.html')

if __name__ == '__main__':
    pass # app.run(debug=True, port=5000)
