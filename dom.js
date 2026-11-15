/**
 * dom.js
 * 画面UI（HTML/Tailwind）の動的インジェクト、イベントバインド、
 * およびiOS（WebKit）特有のスクロール・ラバーバンド防衛を行うモジュール
 * 
 * [Version 1.2]
 * - 修正内容: 画面上下のグレーの空白を消すため、gameContainerの `max-h-[850px]` 制限を撤廃。
 * - 修正内容: GRAVITYヘッダーギリギリにスコアを配置するため、上部余白を 60px から 44px へ引き上げ。
 * - 修正内容: 下部コントローラーの間延びを防ぐため、余分なパディング(+12px)を削除し、
 *   純粋な `env(safe-area-inset-bottom)` のみでスマートに配置。
 * 
 * [Version 1.1]
 * - 修正内容: GRAVITY上部ヘッダーとのUI被り防止のため、HUD(スコア/ライフ)を
 *   env(safe-area-inset-top) + 60px 下方へオフセット。
 * - 修正内容: iPhone下部のホームインジケーター（ホームバー）との干渉を防ぐため、
 *   コントローラー下部に env(safe-area-inset-bottom) の動的余白を追加。
 */

/**
 * iOS/WebKit特有の画面引き伸ばし（ラバーバンド）とテキスト選択を防ぐCSSを注入
 */
function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        body, html {
            touch-action: none;
            overscroll-behavior: none; 
            user-select: none;
            -webkit-user-select: none;
            font-family: 'Nunito', 'M PLUS Rounded 1c', sans-serif;
            background-color: #f3f4f6;
            margin: 0; padding: 0;
            width: 100%; height: 100%;
            overflow: hidden;
        }
        #gameContainer {
            touch-action: none;
            overscroll-behavior: none;
        }
        @keyframes shake {
            0%, 100% { transform: translateX(0) rotate(0); }
            25% { transform: translateX(-4px) rotate(-1deg); }
            50% { transform: translateX(4px) rotate(1deg); }
            75% { transform: translateX(-4px) rotate(-1deg); }
        }
        .shake-animation { animation: shake 0.25s ease-in-out; }
        canvas { image-rendering: optimizeQuality; }
    `;
    document.head.appendChild(style);
}

/**
 * ゲームのUI（HTML構造）をdocument.bodyに動的インジェクト（注入）します
 */
function injectDOM() {
    // 既存のbodyクラスを設定
    document.body.className = "flex items-center justify-center h-screen w-screen overflow-hidden bg-gray-200";

    const gameHTML = `
    <!-- ★修正：max-h-[850px] を撤廃し、どんな縦長スマホでもフル画面を使用する -->
    <div id="gameContainer" class="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        
        <div id="canvasContainer" class="relative flex-1 overflow-hidden bg-gradient-to-b from-sky-200 to-green-100 cursor-pointer">
            <!-- ★修正：topの余白を 60px から 44px へ減らし、GRAVITYヘッダーの真下にギリギリ配置する -->
            <div class="absolute top-[calc(env(safe-area-inset-top,0px)+44px)] left-0 right-0 w-full pointer-events-none z-10">
                <div class="absolute top-0 left-1/2 -translate-x-1/2 text-center text-gray-800 font-black drop-shadow-md">
                    SCORE<br>
                    <span id="scoreDisplay" class="text-7xl text-blue-600 leading-none">0</span>
                </div>
                <div class="absolute top-2 right-4 text-right text-gray-800 text-xl font-black drop-shadow-md">
                    LIFE<br>
                    <span id="lifeDisplay" class="text-2xl tracking-widest leading-none block mt-1">❤️❤️❤️</span>
                </div>
            </div>

            <canvas id="gameCanvas" class="block w-full h-full"></canvas>

            <!-- スタート画面 (GRAVITY最適化: backdrop-blurを廃止) -->
            <div id="startScreen" class="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-30 transition-opacity duration-300">
                <div class="bg-white/95 rounded-3xl p-8 mb-8 text-center shadow-2xl border-4 border-sky-100 w-10/12 max-w-sm">
                    <div class="text-gray-700 font-black text-xl leading-relaxed mb-8 whitespace-pre-line">タップで Uターン
障害物を 避けよう！</div>
                    <button id="startBtn" class="w-full bg-blue-500 hover:bg-blue-400 text-white font-black py-4 px-8 rounded-full text-2xl shadow-[0_6px_0_#1e40af] active:shadow-[0_0px_0_#1e40af] active:translate-y-[6px] transition-all">
                        START
                    </button>
                </div>
            </div>

            <!-- ゲームオーバー画面 (GRAVITY最適化: backdrop-blurを廃止) -->
            <div id="gameOverScreen" class="absolute inset-0 bg-black/75 flex flex-col items-center justify-center z-30 hidden">
                <h2 class="text-5xl font-black text-red-400 mb-6 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)] tracking-widest">
                    GAME OVER
                </h2>
                <div class="bg-white rounded-3xl p-8 text-center shadow-2xl mb-8 w-3/4 max-w-sm border-4 border-gray-100">
                    <p class="text-gray-500 font-black text-xl mb-1">SCORE</p>
                    <p id="resultScore" class="text-7xl font-black text-blue-600 mb-2 drop-shadow-sm">0</p>
                </div>
                <button id="retryBtn" class="bg-green-400 hover:bg-green-300 text-green-900 font-black py-4 px-12 rounded-full text-3xl shadow-[0_6px_0_#166534] active:shadow-[0_0px_0_#166534] active:translate-y-[6px] transition-all transform hover:scale-105">
                    もう一度
                </button>
            </div>
        </div>

        <!-- コントローラー -->
        <!-- ★修正：下部の余白(+12px)を削除し、純粋な safe-area-inset-bottom のみに最適化 -->
        <div class="bg-emerald-600 border-t-8 border-emerald-800 pt-3 px-3 pb-[env(safe-area-inset-bottom,0px)] min-h-[6rem] shrink-0 flex items-center justify-center gap-3 shadow-[0_-4px_15px_rgba(0,0,0,0.15)] z-20 relative w-full">
            <button id="muteBtn" class="h-full aspect-square bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-2xl shadow-[0_6px_0_#047857] active:shadow-[0_0px_0_#047857] active:translate-y-[6px] transition-all flex items-center justify-center border-4 border-emerald-300 shrink-0 text-emerald-900">
                <svg id="muteIconOff" class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clip-rule="evenodd"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path></svg>
                <svg id="muteIconOn" class="w-8 h-8 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
            </button>

            <button id="turnBtn" disabled class="flex-1 h-full bg-orange-400 hover:bg-orange-300 text-orange-950 font-black text-3xl rounded-3xl shadow-[0_6px_0_#9a3412] active:shadow-[0_0px_0_#9a3412] active:translate-y-[6px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group border-4 border-orange-200">
                <svg class="w-8 h-8 transform group-active:-rotate-180 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                TURN
            </button>
        </div>
    </div>
    `;
    document.body.innerHTML = gameHTML;
}

/**
 * UIのスコアとライフ表示を更新
 */
export function updateHUD(score, lives) {
    document.getElementById('scoreDisplay').innerText = score;
    document.getElementById('lifeDisplay').innerText = lives > 3 ? `❤️ × ${lives}` : '❤️'.repeat(Math.max(0, lives)) || '🖤';
}

/**
 * 画面のシェイクエフェクト発動（被弾時）
 */
export function triggerShakeUI() {
    const container = document.getElementById('gameContainer');
    container.classList.remove('shake-animation');
    void container.offsetWidth; // リフローを強制してアニメーションをリセット
    container.classList.add('shake-animation');
}

/**
 * 状態に応じた画面（スクリーン）の切り替え
 */
export function setScreens(state, score = 0) {
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOverScreen');
    const turnBtn = document.getElementById('turnBtn');

    if (state === 'START') {
        startScreen.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        gameOverScreen.classList.add('hidden');
        turnBtn.disabled = true;
    } else if (state === 'PLAYING') {
        startScreen.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => startScreen.classList.add('hidden'), 300);
        gameOverScreen.classList.add('hidden');
        turnBtn.disabled = false;
    } else if (state === 'GAMEOVER') {
        document.getElementById('resultScore').innerText = score;
        gameOverScreen.classList.remove('hidden');
        turnBtn.disabled = true;
    }
}

/**
 * イベントリスナーをバインドし、Canvasコンテキスト等の必要なDOM要素を返す
 */
export function initDOM(callbacks) {
    injectStyles();
    injectDOM();

    // DOM要素の取得
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = document.getElementById('canvasContainer');

    // ボタンへのイベントバインド
    document.getElementById('startBtn').addEventListener('click', callbacks.onStart);
    document.getElementById('retryBtn').addEventListener('click', callbacks.onRetry);
    
    // Uターン操作
    const doTurn = (e) => {
        if (e.type === 'pointerdown' || e.code === 'Space') {
            callbacks.onTurn();
        }
    };
    document.getElementById('turnBtn').addEventListener('pointerdown', doTurn);
    canvasContainer.addEventListener('pointerdown', doTurn);
    window.addEventListener('keydown', (e) => {
        if(e.code === 'Space') {
            e.preventDefault(); doTurn(e);
            const btn = document.getElementById('turnBtn');
            if(!btn.disabled) {
                btn.classList.add('translate-y-[8px]', 'shadow-[0_0px_0_#1e3a8a]');
                setTimeout(() => btn.classList.remove('translate-y-[8px]', 'shadow-[0_0px_0_#1e3a8a]'), 100);
            }
        }
    });

    // ミュートボタン
    document.getElementById('muteBtn').addEventListener('click', () => {
        const isMuted = callbacks.onMuteToggle();
        document.getElementById('muteIconOff').classList.toggle('hidden', !isMuted);
        document.getElementById('muteIconOn').classList.toggle('hidden', isMuted);
    });

    // リサイズ監視設定
    const resizeObserver = new ResizeObserver(() => {
        callbacks.onResize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    });
    resizeObserver.observe(canvasContainer);

    // ★修正点：初回リサイズを手動で発火（main.js側での変数受け取りを待つため非同期化）
    setTimeout(() => {
        callbacks.onResize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    }, 0);

    return { canvas, ctx };
}