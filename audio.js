/**
 * audio.js
 * Tone.jsを用いた音声の初期化、再生、およびミュート状態を管理するモジュール
 * iOS特有のオーディオコンテキスト制約（ユーザー操作による起動必須）を安全に処理します。
 * 
 * [Version 1.5]
 * - 修正内容: 初期状態を本来のミュート(isMuted=true)に戻し、UIとの矛盾を解消。
 * - 修正内容: 画面がバックグラウンドから復帰したこと（visibilitychange）を自動検知し、
 *   プレイヤーにボタン操作を強いることなく、自動的にハードリセットをかけて音を復活させる処理を追加。
 */

// 音響エンジン（シンセサイザー群）と状態の保持
const synths = {};
let isMuted = true; // ★修正: 初期状態を本来の「ミュート（音なし）」に戻し、UIのXマークと完全に一致させる
let isInitialized = false;

/**
 * 楽器（シンセサイザー）のセットアップ
 * 一度だけ実行され、各種効果音用のオシレーターを生成・ルーティングします。
 */
function setupSynths() {
    if (isInitialized) return;

    // 1. ターン音（ピコッ）
    synths.turn = new Tone.Synth({ 
        oscillator: { type: 'square' }, 
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 } 
    }).toDestination();
    synths.turn.volume.value = -15;

    // 2. 被弾音（ドスッ）
    synths.hit = new Tone.MembraneSynth().toDestination();
    synths.hit.volume.value = -5;

    // 3. スコア加算音（ティロリ）
    synths.score = new Tone.PolySynth(Tone.Synth, { 
        oscillator: { type: 'sine' }, 
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 } 
    }).toDestination();
    synths.score.volume.value = -15;

    // 4. 回復音（ポロロロン）
    synths.heal = new Tone.PolySynth(Tone.Synth, { 
        oscillator: { type: 'triangle' }, 
        envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.5 } 
    }).toDestination();
    synths.heal.volume.value = -10;

    // 5. コイン/小アイテム音
    synths.coin = new Tone.PolySynth(Tone.Synth, { 
        oscillator: { type: 'square' }, 
        envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 } 
    }).toDestination();
    synths.coin.volume.value = -10;

    // 6. フィーバー突入音（ギュイーン）
    synths.fever = new Tone.PolySynth(Tone.Synth, { 
        oscillator: { type: 'sawtooth' }, 
        envelope: { attack: 0.1, decay: 0.2, sustain: 0, release: 1 } 
    }).toDestination();
    synths.fever.volume.value = -12;

    // 7. フィーバー中の破壊音（ザシュッ）
    synths.blast = new Tone.NoiseSynth({ 
        noise: { type: 'white' }, 
        envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 } 
    }).toDestination();
    synths.blast.volume.value = -10;

    isInitialized = true;
}

/**
 * オーディオエンジンの起動（ユーザーのタップイベント内で必ず呼ぶこと）
 */
export async function initAudio() {
    try {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        setupSynths();
    } catch (e) {
        console.warn('Audio initialization skipped or failed:', e);
    }
}

/**
 * 効果音の再生
 * @param {string} type - 鳴らす音の種類 ('turn', 'hit', 'score', etc.)
 */
export function playSound(type) {
    if (!synths[type] || isMuted) return;
    
    // ユーザーが画面をタップした証拠である「turn（Uターン）」の瞬間にだけ、
    // エンジンが寝ていれば叩き起こす（Tone.start）。
    if (Tone.context.state !== 'running' && type === 'turn') {
        Tone.start().catch(e => console.warn(e));
    }
    
    const now = Tone.now();
    switch(type) {
        case 'turn': 
            synths.turn.triggerAttackRelease("C6", "32n", now); 
            break;
        case 'hit': 
            synths.hit.triggerAttackRelease("C2", "8n", now); 
            break;
        case 'score': 
            synths.score.triggerAttackRelease(["E5", "G5", "C6"], "32n", now); 
            break;
        case 'heal': 
            synths.heal.triggerAttackRelease(["C5", "E5", "G5", "C6"], "8n", now); 
            break;
        case 'coin': 
            synths.coin.triggerAttackRelease(["E6", "C7"], "32n", now); 
            break;
        case 'fever': 
            synths.fever.triggerAttackRelease(["C5", "E5", "G5"], "4n", now); 
            break;
        case 'blast': 
            synths.blast.triggerAttackRelease("16n", now); 
            synths.coin.triggerAttackRelease(["C6", "E6"], "16n", now); 
            break;
    }
}

/**
 * ミュート状態の切り替え
 * @returns {boolean} 切り替え後のミュート状態
 */
export function toggleMute() {
    isMuted = !isMuted;
    
    // ミュート解除（ボタンのタップ時）に確実にエンジンを再構築する（ハードリセット）
    if (!isMuted) {
        if (isInitialized) {
            for (let key in synths) {
                if (synths[key] && typeof synths[key].dispose === 'function') {
                    synths[key].dispose();
                }
            }
            isInitialized = false;
        }
        
        initAudio(); 
    }
    
    return isMuted;
}

/**
 * 現在のミュート状態を取得
 */
export function getMuteState() {
    return isMuted;
}

/**
 * ★追加：画面の表示状態（バックグラウンドからの復帰）を監視し、
 * もしプレイヤーがミュートを解除して遊んでいた場合は、自動的にハードリセットをかけてゾンビ化を防ぐ
 */
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !isMuted) {
            // 画面に復帰した瞬間、古い楽器を破棄して初期化フラグをリセット
            if (isInitialized) {
                for (let key in synths) {
                    if (synths[key] && typeof synths[key].dispose === 'function') {
                        synths[key].dispose();
                    }
                }
                isInitialized = false;
            }
            // 次のユーザー操作（Uターン等）に備えて新品の楽器を作り直す
            initAudio();
        }
    });
}