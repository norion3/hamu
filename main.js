/**
 * main.js
 * ゲームのメインループ、描画レンダリング、および各モジュールの統合を担う心臓部
 * 
 * [Version 1.2]
 * - 修正内容: アイテムの描画時、⭐(スター)以外は回転させないようにし、⏫⏬等の視認性を確保。
 * - 修正内容: 警告(⚠️)表示時、敵が突進してくる方向を矢印(➡, ⬅, ⬆)で視覚的にサポート。
 */

import { EMOJI_FONT, BG_PALETTES } from './constants.js';
import { initAudio, toggleMute } from './audio.js';
import { gameState, initGame, resizeTrack, doTurn, updateGame, getTrackCoordinates } from './game.js';
import { reportScoreToGravity } from './gravity_sdk.js';
import { initDOM, updateHUD, triggerShakeUI, setScreens } from './dom.js';

let canvas, ctx;

// --- オフスクリーンCanvasの準備（足跡描画のキャッシュ用） ---
const trackCanvas = document.createElement('canvas');
const trackCtx = trackCanvas.getContext('2d');

/**
 * トラック（足跡）の静止画像を生成してキャッシュする
 * リサイズ時（初回含む）に1度だけ呼ばれ、毎フレームの描画負荷を劇的に下げる
 */
function updateTrackCache(w, h, dpr) {
    trackCanvas.width = w * dpr;
    trackCanvas.height = h * dpr;
    trackCtx.scale(dpr, dpr);
    trackCtx.clearRect(0, 0, w, h);

    trackCtx.save();
    trackCtx.font = `14px ${EMOJI_FONT}`; trackCtx.textAlign = 'center'; trackCtx.textBaseline = 'middle';
    trackCtx.shadowColor = 'rgba(0, 0, 0, 0.45)'; trackCtx.shadowBlur = 5; trackCtx.globalAlpha = 0.95; 
    
    for (let p = 0; p < gameState.track.perimeter; p += 25) {
        let coords = getTrackCoordinates(p);
        trackCtx.save(); trackCtx.translate(coords.x, coords.y);
        
        if (coords.vx === 1) trackCtx.rotate(Math.PI / 2);
        else if (coords.vx === -1) trackCtx.rotate(-Math.PI / 2);
        else if (Math.abs(coords.x - gameState.track.x) < 1) trackCtx.rotate(0);
        else trackCtx.rotate(Math.PI);
        
        // 足跡が明るい背景でも際立つように白フチ付きで描画
        trackCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; trackCtx.lineWidth = 3;
        trackCtx.strokeText('🐾', 0, 0); trackCtx.fillText('🐾', 0, 0);
        trackCtx.restore();
    }
    trackCtx.restore();
}

/**
 * 画面リサイズ時の処理
 */
function resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    resizeTrack(w, h);
    
    // 足跡画像のキャッシュを更新
    updateTrackCache(w, h, dpr);
}

/**
 * ゲームの開始処理
 */
function startGame() {
    initGame(gameState.W, gameState.H);
    setScreens('PLAYING');
    updateHUD(gameState.score, gameState.lives);
}

/**
 * ゲームオーバー処理
 */
function handleGameOver() {
    setScreens('GAMEOVER', gameState.score);
    
    // ベストスコアのローカル保存
    const bestScore = parseInt(localStorage.getItem('hamsterBestScore')) || 0;
    if(gameState.score > bestScore) {
        localStorage.setItem('hamsterBestScore', gameState.score);
    }
    
    // GRAVITYへスコア送信（ローカル時は自動スキップ）
    reportScoreToGravity(gameState.score);
}

/**
 * 2つのカラーコードの中間色を計算（グラデーション用）
 */
function lerpColor(c1, c2, t) {
    const hex2rgb = (hex) => [parseInt(hex.substring(1, 3), 16), parseInt(hex.substring(3, 5), 16), parseInt(hex.substring(5, 7), 16)];
    const r1 = hex2rgb(c1), r2 = hex2rgb(c2);
    return `rgb(${Math.round(r1[0] + (r2[0] - r1[0]) * t)}, ${Math.round(r1[1] + (r2[1] - r1[1]) * t)}, ${Math.round(r1[2] + (r2[2] - r1[2]) * t)})`;
}

/**
 * Canvasへの描画（レンダリング）処理
 */
function render() {
    if (gameState.status !== 'PLAYING') return;

    // --- 背景グラデーションの描画 ---
    let bgPhase = Math.floor(gameState.score / 20) % 5;
    let blendT = (gameState.score % 20) / 20; 
    let grad = ctx.createLinearGradient(0, 0, 0, gameState.H);
    grad.addColorStop(0, lerpColor(BG_PALETTES[bgPhase][0], BG_PALETTES[(bgPhase + 1) % 5][0], blendT));
    grad.addColorStop(1, lerpColor(BG_PALETTES[bgPhase][1], BG_PALETTES[(bgPhase + 1) % 5][1], blendT));
    ctx.fillStyle = grad; 
    ctx.fillRect(0, 0, gameState.W, gameState.H);

    // --- パーティクルの描画 ---
    for(let p of gameState.particles) { 
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // --- トラック（足跡）の描画（キャッシュを利用） ---
    // オフスクリーンCanvasに描画済みの画像を1枚貼り付けるだけになり、毎フレームの負荷が激減
    ctx.drawImage(trackCanvas, 0, 0, gameState.W, gameState.H);

    // --- プレイヤー（ハムスター）の描画 ---
    const player = gameState.player;
    if (player.invincible === 0 || player.invincible % 10 < 5 || player.feverFrames > 0) {
        ctx.save(); ctx.translate(player.x, player.y);
        if (player.feverFrames > 0) {
            ctx.beginPath(); ctx.arc(0, 0, player.size * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, 0.4)`; ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255, 215, 0, 0.8)`;
            ctx.fill(); ctx.stroke();
        }
        ctx.font = `${player.size * 2}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000000';
        if (!player.facingRight) ctx.scale(-1, 1);
        ctx.fillText(player.emoji, 0, 0); ctx.restore();
    }

    // --- 敵・アイテムの描画 ---
    for (let obj of gameState.objects) {
        // ⚠️ 警告描画
        if (obj.state === 'warning') {
            if (gameState.frames % 10 < 5) {
                ctx.save(); ctx.font = `30px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000000';
                
                // ★修正：突進してくる方向を矢印でサポート
                if (obj.subType === 'upward') {
                    ctx.fillText('⬆⚠️', obj.x, gameState.H - 18);
                } else if (obj.vx > 0) {
                    ctx.fillText('⚠️➡', 35, obj.y); // 左から右へ来る
                } else {
                    ctx.fillText('⬅⚠️', gameState.W - 35, obj.y); // 右から左へ来る
                }
                
                ctx.restore();
            }
            continue; 
        }

        let drawX = obj.x, drawY = obj.y;
        if (obj.subType === 'stutter' && !obj.hasStopped && obj.y >= obj.stopY) drawX += (Math.random() - 0.5) * 6;

        ctx.save(); ctx.translate(drawX, drawY);
        
        // アイテムのエフェクト
        if (obj.type === 'item') {
            ctx.beginPath(); ctx.arc(0, 0, obj.size * 1.5, 0, Math.PI * 2);
            if(obj.itemType === 'star') {
                ctx.fillStyle = `hsla(${(gameState.frames * 10) % 360}, 100%, 70%, 0.5)`; ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
                ctx.fill(); ctx.stroke(); 
                // ★修正：星だけ回転させる
                ctx.rotate(gameState.frames * 0.05);
            } else {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.fill(); ctx.stroke(); 
                // ★修正：星以外のアイテム（⏫, ⏬, ❤️）は回転させない
            }
        }

        ctx.font = `${obj.size * 2}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000000';
        if (obj.subType === 'side' && obj.facingRight) ctx.scale(-1, 1);
        
        if (obj.subType === 'tall') {
            let segs = obj.segments || 4, stepY = obj.size * 1.45, halfH = ((segs - 1) * stepY) / 2;
            for (let s = 0; s < segs; s++) ctx.fillText(obj.emoji, 0, -halfH + s * stepY);
        } else { ctx.fillText(obj.emoji, 0, 0); }
        ctx.restore();
    }

    // --- フローティングテキスト（+1 等）の描画 ---
    for (let t of gameState.texts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, t.life / 40);
        ctx.font = `900 ${t.size}px "Nunito", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
    }
}

/**
 * メインループ（毎フレーム実行）
 */
function loop() {
    requestAnimationFrame(loop);
    
    if (gameState.status === 'PLAYING') {
        let prevScore = gameState.score;
        let prevLives = gameState.lives;
        
        // 1. 物理演算と衝突判定を更新
        updateGame();
        
        // 2. UIの更新チェック（被弾揺れ・スコア変動）
        if (gameState.triggerShake) {
            triggerShakeUI();
            gameState.triggerShake = false;
        }
        if (prevScore !== gameState.score || prevLives !== gameState.lives) {
            updateHUD(gameState.score, gameState.lives);
        }
        
        // 3. 描画 または ゲームオーバー処理
        if (gameState.status === 'GAMEOVER') {
            handleGameOver();
        } else {
            render();
        }
    }
}

// --------------------------------------------------------
// アプリケーションの初期起動シーケンス
// --------------------------------------------------------
function boot() {
    // 1. DOM（UI）の動的構築とイベントバインド
    const dom = initDOM({
        onStart: async () => {
            await initAudio(); // iOSのために初回タップでAudioContextを起動
            startGame();
        },
        onRetry: () => {
            startGame();
        },
        onTurn: doTurn,
        onMuteToggle: toggleMute,
        onResize: resize
    });
    
    canvas = dom.canvas;
    ctx = dom.ctx;
    
    // 2. メインループの起動
    requestAnimationFrame(loop);
}

// GRAVITYでの動的インポートによる「すれ違い（すでにロード完了している状態）」を防ぐ安全な起動
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot);
} else {
    boot(); // すでにHTMLの読み込みが終わっていれば、待たずに即座に起動
}