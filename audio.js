/**
 * audio.js
 * Tone.jsを用いた音声の初期化、再生、およびミュート状態を管理するモジュール
 * iOS特有のオーディオコンテキスト制約（ユーザー操作による起動必須）を安全に処理します。
 */

// 音響エンジン（シンセサイザー群）と状態の保持
const synths = {};
let isMuted = true; // 初期状態はミュート（安全のため）
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
        envelope: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 } 
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
    if (!synths[type] || Tone.context.state !== 'running' || isMuted) return;
    
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
    return isMuted;
}

/**
 * 現在のミュート状態を取得
 */
export function getMuteState() {
    return isMuted;
}