/**
 * game.js
 * ゲームのコアロジック、物理演算、AIディレクター（スポーン制御）、
 * およびエンティティ（オブジェクト群）を管理するモジュール
 * 
 * [Version 1.3]
 * - 修正内容: 当たり判定の分離（敵は小さく、アイテムは大きく、フィーバー時は巨大化）。
 * - 修正内容: レベルアップ直後（スコア下1桁 9, 0, 1）にアクティブレスト（休憩ゾーン）を導入。
 * - 修正内容: スコアに応じた移動スピード成長、及び ⏫⏬ アイテムによるバフ/デバフ管理を実装。
 */

import { TIMERS, PHYSICS, EMOJIS } from './constants.js';
import { playSound } from './audio.js';

// --------------------------------------------------------
// グローバルゲームステート
// --------------------------------------------------------
export const gameState = {
    status: 'START', // 'START', 'PLAYING', 'GAMEOVER'
    W: 0, H: 0,
    score: 0, level: 1, lives: 3, frames: 0,
    intervalFrames: 0, giantCooldown: 0, lastSpawnX: 0,
    triggerShake: false, // 被弾時・フィーバー撃破時の画面揺れフラグ
    
    // トラック（走行ルート）情報
    track: { x: 0, y: 0, w: 0, h: 0, perimeter: 0 },
    
    // プレイヤー（ハムスター）
    player: { 
        pos: 0, size: PHYSICS.PLAYER_SIZE, speed: PHYSICS.PLAYER_START_SPEED, 
        dir: 1, emoji: '🐹', invincible: 0, feverFrames: 0, 
        facingRight: true, x: 0, y: 0,
        speedBuff: 0, buffFrames: 0 // ⏫⏬アイテムによるバフ管理
    },
    
    // 画面上のエンティティ群
    objects: [],
    texts: [],
    particles: []
};

// --------------------------------------------------------
// エンティティクラス
// --------------------------------------------------------
export class FloatingText {
    constructor(text, x, y, color, size = 28) {
        this.text = text; this.x = x; this.y = y; 
        this.life = 40; this.color = color; this.size = size;
    }
    update() { this.y -= 1.5; this.life--; }
    // 描画は main.js 側から呼び出されます
}

export class BackgroundParticle {
    constructor() {
        this.x = Math.random() * gameState.W; this.y = Math.random() * gameState.H;
        this.size = Math.random() * 3 + 1.5; this.speedY = Math.random() * 0.6 + 0.2;
        this.alpha = Math.random() * 0.5 + 0.3;
    }
    update(speedMultiplier) {
        this.y += this.speedY * speedMultiplier;
        if (this.y > gameState.H) { 
            this.y = -10; 
            this.x = Math.random() * gameState.W; 
        }
    }
}

// --------------------------------------------------------
// コア機能
// --------------------------------------------------------
export function initGame(W, H) {
    gameState.W = W;
    gameState.H = H;
    gameState.score = 0;
    gameState.level = 1;
    gameState.lives = 3;
    gameState.frames = 0;
    gameState.intervalFrames = 0;
    gameState.giantCooldown = 0;
    gameState.objects = [];
    gameState.texts = [];
    gameState.triggerShake = false;
    
    gameState.player.pos = 0;
    gameState.player.dir = 1;
    gameState.player.feverFrames = 0;
    gameState.player.invincible = 60;
    gameState.player.speedBuff = 0;
    gameState.player.buffFrames = 0;
    
    // 背景パーティクルの初期化
    gameState.particles = Array.from({length: 30}, () => new BackgroundParticle());
    
    gameState.status = 'PLAYING';
}

export function resizeTrack(W, H) {
    gameState.W = W;
    gameState.H = H;
    gameState.track.w = W * 0.8;
    gameState.track.h = H * 0.22;
    gameState.track.x = (W - gameState.track.w) / 2;
    gameState.track.y = H - gameState.track.h - 30;
    gameState.track.perimeter = gameState.track.w * 2 + gameState.track.h * 2;
}

export function doTurn() {
    if (gameState.status !== 'PLAYING') return;
    gameState.player.dir *= -1;
    playSound('turn');
}

export function getTrackCoordinates(pos) {
    let p = pos % gameState.track.perimeter; 
    if (p < 0) p += gameState.track.perimeter;
    
    if (p <= gameState.track.w) return { x: gameState.track.x + p, y: gameState.track.y, vx: 1 };
    else if (p <= gameState.track.w + gameState.track.h) return { x: gameState.track.x + gameState.track.w, y: gameState.track.y + (p - gameState.track.w), vx: 0 };
    else if (p <= gameState.track.w * 2 + gameState.track.h) return { x: gameState.track.x + gameState.track.w - (p - (gameState.track.w + gameState.track.h)), y: gameState.track.y + gameState.track.h, vx: -1 };
    else return { x: gameState.track.x, y: gameState.track.y + gameState.track.h - (p - (gameState.track.w * 2 + gameState.track.h)), vx: 0 };
}

// --------------------------------------------------------
// AIディレクター (賢くフェアなスポーン制御)
// --------------------------------------------------------
function spawnObject() {
    const isItem = Math.random() < 0.025; 
    const baseSpeed = 2.6 + Math.min(3.2, gameState.level * 0.22);
    const { W, H, track } = gameState;

    function createObj(type, subType, x, y, vy, vx, size, emoji) {
        return {
            type, subType, state: 'active', warningTimer: 0, x, y, vy, vx, size, emoji, itemType: '',
            facingRight: true, baseX: x, swayPhase: Math.random() * Math.PI * 2, swaySpeed: 0,
            stopY: 0, stopTimer: 0, hasStopped: false, segments: 1
        };
    }

    // 団子落下防止のための速度分散
    function getVariedSpeed(base) {
        let sr = Math.random();
        if (sr < 0.50) return base;        
        if (sr < 0.80) return base * 1.5; 
        return base * 0.6;                
    }

    const s10 = gameState.score % 10;
    const isPanicZone = (gameState.score > 10 && (s10 === 7 || s10 === 8));
    
    // ★追加: アクティブレスト（休憩ゾーン）
    // 猛攻の直後やレベルアップ直後は、プレイヤーに息をつかせる
    const isRestZone = (gameState.score > 0 && (s10 === 9 || s10 === 0 || s10 === 1));

    // フェアなランダム性と画面のフル活用
    function getSmartX(objSize) {
        let r = Math.random();
        let targetX;
        let centerX = track.x + track.w / 2;
        
        if (!isPanicZone && r < 0.20) {
            targetX = gameState.player.x + (Math.random() * 60 - 30);
        } else if (r < 0.60) {
            targetX = (gameState.lastSpawnX < centerX) 
                ? centerX + (Math.random() * (track.w / 2)) 
                : track.x + (Math.random() * (track.w / 2));
        } else {
            targetX = track.x + (Math.random() * track.w);
        }
        
        targetX = Math.max(objSize, Math.min(W - objSize, targetX));
        gameState.lastSpawnX = targetX;
        return targetX;
    }

    // --- アイテム生成 ---
    if (isItem) {
        // ★修正: スピードアイテムの同時ドロップ判定（30%の確率でスピードアイテム抽選）
        if (gameState.level >= 2 && Math.random() < 0.3) {
            let leftX = track.x + (track.w * 0.25);
            let rightX = track.x + (track.w * 0.75);
            
            let objUp = createObj('item', 'normal', leftX, -50, baseSpeed * 0.6, 0, 20, EMOJIS.ITEMS.SPEED_UP);
            objUp.itemType = 'speed_up';
            gameState.objects.push(objUp);
            
            let objDown = createObj('item', 'normal', rightX, -50, baseSpeed * 0.6, 0, 20, EMOJIS.ITEMS.SPEED_DOWN);
            objDown.itemType = 'speed_down';
            gameState.objects.push(objDown);
        } else {
            // 通常アイテム（回復・星）
            let obj = createObj('item', 'normal', 0, -50, baseSpeed * 0.6, 0, 20, '');
            if (gameState.player.feverFrames === 0 && Math.random() < 0.1) {
                obj.itemType = 'star'; obj.emoji = EMOJIS.ITEMS.STAR;
            } else {
                obj.itemType = 'heal'; obj.emoji = EMOJIS.ITEMS.HEAL;
            }
            obj.x = getSmartX(obj.size);
            gameState.objects.push(obj);
        }
        return;
    }

    // --- 敵生成スケジュール ---
    const r = Math.random();
    let normals = [...EMOJIS.NORMAL];
    let giants = [], sides = [], upwards = [], diags = [], talls = [], stutters = [];
    
    if (gameState.level >= 2) { giants = [...EMOJIS.GIANT]; talls = [...EMOJIS.TALL]; }
    if (gameState.level >= 3) { sides = [...EMOJIS.SIDE]; }
    if (gameState.level >= 4) { stutters = [...EMOJIS.STUTTER]; diags = [...EMOJIS.DIAGONAL]; }
    if (gameState.level >= 5) { upwards = [...EMOJIS.UPWARD]; }

    const hasSideEnemy = gameState.objects.some(o => o.subType === 'side');
    const hasUpwardEnemy = gameState.objects.some(o => o.subType === 'upward');
    const hasGiantEnemy = gameState.objects.some(o => o.subType === 'giant');
    const hasTallEnemy = gameState.objects.some(o => o.subType === 'tall');
    const hasStutterEnemy = gameState.objects.some(o => o.subType === 'stutter');

    // ★修正: アクティブレスト中（isRestZone）は、特殊攻撃を一切スポーンさせない
    const canSpawnSpecial = !isPanicZone && !isRestZone && !hasSideEnemy && !hasUpwardEnemy && !hasGiantEnemy && !hasTallEnemy;

    if (canSpawnSpecial && giants.length > 0 && gameState.giantCooldown <= 0 && r < 0.15) {
        let emj = giants[Math.floor(Math.random() * giants.length)];
        let obj = createObj('enemy', 'giant', getSmartX(50), -50, baseSpeed * PHYSICS.GIANT_SPEED_MULT, 0, 50, emj);
        gameState.objects.push(obj); 
        gameState.giantCooldown = TIMERS.GIANT_COOLDOWN; 
    } 
    else if (canSpawnSpecial && talls.length > 0 && r < 0.25) {
        let emj = talls[Math.floor(Math.random() * talls.length)];
        let obj = createObj('enemy', 'tall', getSmartX(18), -90, baseSpeed * PHYSICS.TALL_SPEED_MULT, 0, 18, emj);
        obj.segments = 4; gameState.objects.push(obj);
    }
    else if (canSpawnSpecial && stutters.length > 0 && !hasStutterEnemy && r < 0.35) {
        let emj = stutters[Math.floor(Math.random() * stutters.length)];
        let obj = createObj('enemy', 'stutter', getSmartX(22), -50, baseSpeed * 0.95, 0, 22, emj);
        obj.baseX = obj.x; obj.stopY = H * (0.28 + Math.random() * 0.12); obj.stopTimer = TIMERS.STUTTER_STOP;
        gameState.objects.push(obj);
    }
    else if (canSpawnSpecial && sides.length > 0 && r < 0.50) {
        let emj = sides[Math.floor(Math.random() * sides.length)];
        let targetY = Math.random() < 0.5 ? track.y : track.y + track.h;
        let obj = createObj('enemy', 'side', 0, targetY, 0, 0, 20, emj);
        obj.state = 'warning'; 
        obj.warningTimer = TIMERS.WARNING_FRAMES; 
        let fromLeft = Math.random() < 0.5;
        obj.x = fromLeft ? -50 : W + 50; 
        obj.vx = fromLeft ? baseSpeed * PHYSICS.SIDE_SPEED_MULT : -baseSpeed * PHYSICS.SIDE_SPEED_MULT;
        obj.facingRight = fromLeft; 
        gameState.objects.push(obj);
    } 
    else if (canSpawnSpecial && upwards.length > 0 && r < 0.65) {
        let emj = upwards[Math.floor(Math.random() * upwards.length)];
        let obj = createObj('enemy', 'upward', getSmartX(20), H + 40, -baseSpeed * PHYSICS.UPWARD_SPEED_MULT, 0, 20, emj);
        obj.state = 'warning'; 
        obj.warningTimer = TIMERS.WARNING_FRAMES; 
        gameState.objects.push(obj);
    }
    else if (!isPanicZone && !isRestZone && diags.length > 0 && r < 0.80) {
        let obj = createObj('enemy', 'diagonal', getSmartX(20), -50, baseSpeed * PHYSICS.DIAGONAL_SPEED_MULT, 0, 20, diags[Math.floor(Math.random() * diags.length)]);
        obj.vx = (Math.random() > 0.5 ? 1 : -1) * (baseSpeed * 0.5); 
        gameState.objects.push(obj);
    } 
    else {
        // 通常落下 
        let obj = createObj('enemy', 'normal', getSmartX(20), -50, getVariedSpeed(baseSpeed), 0, 20, normals[Math.floor(Math.random() * normals.length)]);
        
        for (let o of gameState.objects) {
            if (o.type === 'enemy' && o.subType === 'normal' && o.y < H * 0.6 && Math.abs(o.x - obj.x) < obj.size * 2.5) {
                if (Math.abs(o.vy - obj.vy) < 0.8) obj.vy = (Math.random() < 0.5) ? obj.vy * 1.5 : obj.vy * 0.6;
            }
        }
        obj.baseX = obj.x;
        if (gameState.level >= 2 && Math.random() < 0.25) obj.swaySpeed = 0.06;
        gameState.objects.push(obj);
    }
}

// --------------------------------------------------------
// 物理演算 ＆ 衝突更新ループ
// --------------------------------------------------------
export function updateGame() {
    if (gameState.status !== 'PLAYING') return;
    const { W, H, track, player, objects, texts, particles } = gameState;

    // --- レベルアップ ＆ ボーナス生成 ---
    let newLevel = Math.floor(gameState.score / 10) + 1;
    if (newLevel > gameState.level) {
        gameState.level = newLevel; 
        if (gameState.score % 20 === 0) {
            let obj = {
                type: 'item', subType: 'normal', state: 'active', warningTimer: 0,
                size: 20, vx: 0, vy: 2.0, x: Math.max(20, Math.min(W - 20, track.x + Math.random() * track.w)), y: -50, 
                emoji: EMOJIS.ITEMS.HEAL, itemType: 'heal', facingRight: true, baseX: 0, swayPhase: 0, swaySpeed: 0, stopY: 0, stopTimer: 0, hasStopped: false
            };
            if (player.feverFrames === 0 && Math.random() < 0.1) { 
                obj.itemType = 'star'; obj.emoji = EMOJIS.ITEMS.STAR; 
            }
            obj.baseX = obj.x; objects.push(obj); playSound('heal');
        }
    }
    
    let speedMultiplier = 1 + (gameState.level * 0.1);
    for (let p of particles) p.update(speedMultiplier);
    
    // --- プレイヤー状態更新 ---
    if (player.invincible > 0) player.invincible--;
    if (player.feverFrames > 0) player.feverFrames--;
    if (gameState.giantCooldown > 0) gameState.giantCooldown--;
    
    // ★追加: スピードバフのタイマー管理
    if (player.buffFrames > 0) {
        player.buffFrames--;
        if (player.buffFrames <= 0) player.speedBuff = 0; // タイマー切れでバフリセット
    }

    // ★追加: 最終スピードの計算（ベース成長 + バフ補正）
    let baseGrowthSpeed = Math.min(PHYSICS.PLAYER_MAX_SPEED, PHYSICS.PLAYER_START_SPEED + (gameState.score * PHYSICS.PLAYER_SPEED_GROWTH));
    player.speed = baseGrowthSpeed + player.speedBuff;

    player.pos = (player.pos + player.dir * (player.speed * (player.feverFrames > 0 ? 1.5 : 1.0))) % track.perimeter;
    if (player.pos < 0) player.pos += track.perimeter;
    
    let coords = getTrackCoordinates(player.pos);
    player.x = coords.x; player.y = coords.y;
    if (coords.vx !== 0) player.facingRight = (coords.vx * player.dir) > 0;

    gameState.frames++;

    // --- スポーン管理 ---
    if (gameState.intervalFrames > 0) {
        gameState.intervalFrames--; 
    } else {
        const s10 = gameState.score % 10;
        const isRush = (s10 >= 5 && s10 <= 6);
        const isPanicZone = (gameState.score > 10 && (s10 === 7 || s10 === 8)); 
        const isRestZone = (gameState.score > 0 && (s10 === 9 || s10 === 0 || s10 === 1)); 
        
        const baseInterval = Math.max(24, 85 - (gameState.level * 4));
        let spawnInterval = baseInterval;
        
        // 波（ウェーブ）の調整
        if (isRestZone) spawnInterval = Math.floor(baseInterval * 1.5); // ★休憩ゾーン：間隔を伸ばす
        else if (isPanicZone) spawnInterval = Math.max(20, Math.floor(baseInterval * 0.45));
        else if (isRush) spawnInterval = Math.max(26, Math.floor(baseInterval * 0.6));
        
        if (gameState.frames % spawnInterval === 0) spawnObject();
    }
    
    // --- オブジェクト状態 ＆ 衝突更新 ---
    for (let i = objects.length - 1; i >= 0; i--) {
        let obj = objects[i];
        
        if (obj.state === 'warning') {
            obj.warningTimer--;
            if (obj.warningTimer <= 0) obj.state = 'active';
            continue; 
        }

        if (obj.subType === 'stutter') {
            if (!obj.hasStopped && obj.y >= obj.stopY) {
                obj.stopTimer--;
                if (obj.stopTimer <= 0) { obj.hasStopped = true; obj.vy *= 1.85; }
            } else { obj.y += obj.vy; }
        } else {
            obj.y += obj.vy; obj.x += obj.vx;
        }

        if (obj.swaySpeed > 0) {
            obj.swayPhase += obj.swaySpeed; 
            obj.x = Math.max(obj.size, Math.min(W - obj.size, obj.baseX + Math.sin(obj.swayPhase) * 26));
        }

        if (obj.subType === 'diagonal') {
            if (obj.x < obj.size || obj.x > W - obj.size) {
                obj.vx *= -1; obj.x = Math.max(obj.size, Math.min(W - obj.size, obj.x));
            }
        }
        
        // --- 衝突判定（★追加: 完全分離ロジック） ---
        let hitRadius;
        if (obj.type === 'item') {
            hitRadius = (player.size + obj.size) * PHYSICS.HITBOX_ITEM; // 吸い取りやすく
        } else if (player.feverFrames > 0) {
            hitRadius = (player.size + obj.size) * PHYSICS.HITBOX_FEVER; // 巨大化なぎ倒し
        } else {
            hitRadius = (player.size + obj.size) * PHYSICS.HITBOX_ENEMY; // 極小化（ニアミス許容）
        }
        
        let isHit = false;
        let drawX = obj.x, drawY = obj.y;
        
        if (obj.subType === 'tall') {
            let halfH = (((obj.segments || 4) - 1) * obj.size * 1.45) / 2;
            let dx = Math.abs(player.x - drawX), dy = Math.abs(player.y - Math.max(drawY - halfH, Math.min(drawY + halfH, player.y)));
            if (Math.hypot(dx, dy) < hitRadius) isHit = true;
        } else {
            if (Math.hypot(player.x - drawX, player.y - drawY) < hitRadius) isHit = true;
        }
        
        if (isHit) {
            if (obj.type === 'enemy') {
                if (player.feverFrames > 0) {
                    gameState.score += 1; 
                    texts.push(new FloatingText("+1", obj.x, drawY, "#2563eb", 24)); 
                    playSound('blast'); 
                    gameState.triggerShake = true; // ★追加: フィーバー撃破時も揺らして爽快感UP
                } else if (player.invincible === 0) {
                    gameState.lives--; 
                    playSound('hit'); 
                    gameState.triggerShake = true;
                    if (gameState.lives <= 0) gameState.status = 'GAMEOVER';
                    else player.invincible = TIMERS.INVINCIBLE_FRAMES;
                    
                    // 被弾時はバフを強制リセットしてペナルティ
                    player.speedBuff = 0; 
                    player.buffFrames = 0;
                }
            } else if (obj.type === 'item') {
                if (obj.itemType === 'heal') { 
                    gameState.lives++; 
                    texts.push(new FloatingText("LIFE+1", obj.x, drawY - 20, "#10b981")); 
                    playSound('heal'); 
                } 
                else if (obj.itemType === 'star') { 
                    player.feverFrames = TIMERS.FEVER_FRAMES; 
                    playSound('fever'); 
                }
                // ★追加: スピードアイテムの効果適用
                else if (obj.itemType === 'speed_up') {
                    player.speedBuff = PHYSICS.PLAYER_SPEED_UP_BUFF;
                    player.buffFrames = TIMERS.BUFF_FRAMES;
                    texts.push(new FloatingText("SPEED UP!", obj.x, drawY - 20, "#eab308"));
                    playSound('coin');
                }
                else if (obj.itemType === 'speed_down') {
                    player.speedBuff = PHYSICS.PLAYER_SPEED_DOWN_BUFF;
                    player.buffFrames = TIMERS.BUFF_FRAMES;
                    texts.push(new FloatingText("SLOW...", obj.x, drawY - 20, "#3b82f6"));
                    playSound('coin');
                }
            }
            objects.splice(i, 1); 
            continue;
        }
        
        // 画面外削除 ＆ スコア加算
        let outBottom = (obj.vy >= 0 && obj.y > H + obj.size * 4);
        let outTop = (obj.vy < 0 && obj.y < -obj.size * 3);
        let outSide = (obj.x < -100 || obj.x > W + 100);
        
        if (outBottom || outTop || outSide) {
            if (obj.type === 'enemy') {
                gameState.score++; 
                if (gameState.frames % 3 === 0) playSound('score'); 
                texts.push(new FloatingText("+1", Math.max(30, Math.min(W - 30, obj.x)), outTop ? 40 : (outSide ? obj.y : H - 40), "#2563eb", 20));
            }
            objects.splice(i, 1);
        }
    }
    
    // フローティングテキストの更新
    for (let i = texts.length - 1; i >= 0; i--) {
        texts[i].update();
        if (texts[i].life <= 0) texts.splice(i, 1);
    }
}