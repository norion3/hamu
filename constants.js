/**
 * constants.js
 * ゲームのバランス調整や見た目の設定を一元管理するモジュール
 */

// フォント設定
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// タイマー関連（フレーム数基準: 1秒 ≒ 60フレーム）
export const TIMERS = {
    FEVER_FRAMES: 270,        // フィーバー状態の持続時間（約4.5秒）
    INVINCIBLE_FRAMES: 60,    // 被弾後の無敵時間（1秒）
    WARNING_FRAMES: 70,       // ⚠️警告が出てから敵が突進してくるまでの時間（約1.15秒・見てから避けられる長さに設定）
    GIANT_COOLDOWN: 140,      // 巨大な敵が連続で出ないようにするためのクールダウン（約2.3秒）
    STUTTER_STOP: 25,         // フェイント敵（🦅）が空中でピタッと止まる時間
};

// スピード倍率とサイズ関連
export const PHYSICS = {
    PLAYER_BASE_SPEED: 5.5,      // ハムスターの基本移動スピード
    PLAYER_SIZE: 24,             // ハムスターの当たり判定サイズ
    ENEMY_BASE_SIZE: 20,         // 敵の基本サイズ
    // 敵の特殊攻撃の速度倍率（反応できるようにマイルドに調整）
    SIDE_SPEED_MULT: 1.4,        // 横からの急襲のスピード倍率（元1.8 → 1.4）
    UPWARD_SPEED_MULT: 1.2,      // 下からの突き上げのスピード倍率（元1.45 → 1.2）
    GIANT_SPEED_MULT: 0.5,       // 巨大敵のスピード倍率
    TALL_SPEED_MULT: 0.85,       // 縦長敵のスピード倍率
    DIAGONAL_SPEED_MULT: 0.9,    // 斜めバウンド敵のスピード倍率
};

// 落下してくる絵文字のバリエーション
// レベル（スコア）に応じて出現する種類が解放されていきます
export const EMOJIS = {
    NORMAL: ['💧', '📌', '🔥', '💣', '👾'],
    GIANT: ['👞', '📖', '🪨', '🚌'],
    SIDE: ['🧹', '🐈', '🐕', '🚗'],
    UPWARD: ['🌱', '🐍', '⛲'],
    DIAGONAL: ['🎾', '☄️'],
    TALL: ['💧', '🥖', '🔥'],
    STUTTER: ['🦅', '👾'],
    ITEMS: {
        HEAL: '❤️',
        STAR: '⭐'
    }
};

// 背景のカラーパレット（5段階で循環）
// GPU負荷の掛かるCSSフィルターを避け、Canvasのグラデーション描画で使用します
export const BG_PALETTES = [
    ['#bae6fd', '#d1fae5'], // 1. スカイブルー → ミントグリーン
    ['#fef08a', '#bbf7d0'], // 2. パステルイエロー → ライトグリーン
    ['#fecdd3', '#fed7aa'], // 3. パステルピンク → ピーチ
    ['#ddd6fe', '#bfdbfe'], // 4. ラベンダー → ライトブルー
    ['#a5f3fc', '#fbcfe8']  // 5. シアン → ローズピンク
];