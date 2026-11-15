/**
 * main.js
 * ゲームのメインループ、描画レンダリング、および各モジュールの統合を担う心臓部
 * 
 * [Version 1.4]
 * - 修正内容: iOS WebKit特有の結合絵文字（❤️等）のセンタリングズレを完全に解消するため、
 *   オフスクリーンCanvasとgetImageDataを用いた「ピクセル実測・自動センタリングキャッシュ」を導入し、
 *   プレイヤー・敵・アイテムをdrawImageで真の中央に描画するよう変更。
 * 
 * [Version 1.3]
 * - 修正内容: マルチデバイス（横幅の異なるiPhone等）対応のため、画面幅に応じた動的スケーリングと
 *   アイテム周囲のエフェクト円、および絵文字の描画座標（ベースライン）を完全に同期・補正するロジックを追加。
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

// --- 絵文字のピクセル実測・自動センタリングキャッシュ ---
const emojiCache = new Map();

/**
 * 絵文字をオフスクリーンCanvasに一度描画し、実際に色のあるピクセル領域を実測して
 * 真の視覚的中心がど真ん中に来るキャッシュ画像（スタンプ）を生成して返す
 */
function getCenteredEmojiCanvas(emoji) {
    if (emojiCache.has(emoji)) {
        return emojiCache.get(emoji);
    }

    const scanSize = 192;
    const fontSize = 96;
    const outSize = 128;

    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = scanSize;
    tmpCanvas.height = scanSize;
    const tmpCtx = tmpCanvas.getContext('2d', { willReadFrequently: true });

    // iOSのtextAlign='center'バグを回避するため、左上基準で余白を持って描画する
    tmpCtx.font = `${fontSize}px ${EMOJI_FONT}`;
    tmpCtx.textAlign = 'left';
    tmpCtx.textBaseline = 'top';
    tmpCtx.fillStyle = '#000000';
    tmpCtx.fillText(emoji, 32, 32);

    const imgData = tmpCtx.getImageData(0, 0, scanSize, scanSize).data;
    let minX = scanSize, maxX = -1, minY = scanSize, maxY = -1;

    for (let y = 0; y < scanSize; y++) {
        for (let x = 0; x < scanSize; x++) {
            const alpha = imgData[(y * scanSize + x) * 4 + 3];
            if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outSize;
    outCanvas.height = outSize;
    const outCtx = outCanvas.getContext('2d');

    if (maxX >= minX && maxY >= minY) {
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        // 細長い絵文字が過剰に拡大されないよう基準サイズとの最大値でスケールを決定
        const maxDim = Math.max(bw, bh, fontSize * 0.85);
        const scale = (outSize * 0.88) / maxDim;
        const drawW = bw * scale;
        const drawH = bh * scale;

        outCtx.drawImage(
            tmpCanvas,
            minX, minY, bw, bh,
            (outSize - drawW) / 2,
            (outSize - drawH) / 2,
            drawW, drawH
        );
    } else {
        // 万が一ピクセルが検出できなかった場合のフォールバック
        outCtx.font = `${fontSize}px ${EMOJI_FONT}`;
        outCtx.textAlign = 'center';
        outCtx.textBaseline = 'middle';
        outCtx.fillText(emoji, outSize / 2, outSize / 2);
    }

    emojiCache.set(emoji, outCanvas);
    return outCanvas;
}

/**
 * キャッシュされた絵文字を指定座標の中心(x, y)へ正確に描画する
 */
function drawCenteredEmoji(targetCtx, emoji, x, y, size) {
    const cached = getCenteredEmojiCanvas(emoji);
    const drawSize = size * 2.2;
    targetCtx.drawImage(cached, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
}

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
        if (!player.facingRight) ctx.scale(-1, 1);
        drawCenteredEmoji(ctx, player.emoji, 0, 0, player.size);
        ctx.restore();
    }

    // --- 敵・アイテムの描画 ---
    for (let obj of gameState.objects) {
        // ⚠️ 警告描画
        if (obj.state === 'warning') {
            if (gameState.frames % 10 < 5) {
                ctx.save(); ctx.font = `30px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000000';
                
                // 突進してくる方向を矢印でサポート
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
            ctx.beginPath(); 
            ctx.arc(0, 0, obj.size * 1.5, 0, Math.PI * 2); // エフェクト円の原点
            if(obj.itemType === 'star') {
                ctx.fillStyle = `hsla(${(gameState.frames * 10) % 360}, 100%, 70%, 0.5)`; ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
                ctx.fill(); ctx.stroke(); 
                ctx.rotate(gameState.frames * 0.05);
            } else {
                ctx.fillStyle = 'rgba(255, 215, 0, 0.4)'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.fill(); ctx.stroke(); 
            }
        }

        if (obj.subType === 'side' && obj.facingRight) ctx.scale(-1, 1);
        
        if (obj.subType === 'tall') {
            let segs = obj.segments || 4, stepY = obj.size * 1.45, halfH = ((segs - 1) * stepY) / 2;
            for (let s = 0; s < segs; s++) {
                drawCenteredEmoji(ctx, obj.emoji, 0, -halfH + s * stepY, obj.size);
            }
        } else { 
            drawCenteredEmoji(ctx, obj.emoji, 0, 0, obj.size);
        }
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