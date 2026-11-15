/**
 * audio.js
 * Tone.jsを用いた音声の初期化、再生、およびミュート状態を管理するモジュール
 * iOS特有のオーディオコンテキスト制約（ユーザー操作による起動必須）を安全に処理します。
 * 
 * [Version 1.2]
 * - 修正内容: 画面復帰時の音消失（サスペンド）バグを完全修正。自動再生音（スコア等）での
 *   無許可の起動を禁止し、iOSによるオーディオエンジンの永久凍結を防止。
 * - 修正内容: ミュート解除時およびターン操作時に、明示的に `context.resume()` を呼び出し
 *   安全かつ確実にエンジンを再起動（サスペンド解除）するロジックに変更。
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
            await Tone.context.resume(); // ★念押しの明示的再起動（サスペンド解除）
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
    
    // ★修正点：自動発火する音（スコア等）で勝手にエンジンを起こすとiOSに永久凍結されるため、
    // ユーザーが直接画面をタップした証拠である「turn」の時だけ再起動（resume）を許可する。
    if (Tone.context.state !== 'running') {
        if (type === 'turn') {
            Tone.context.resume().catch(e => console.warn(e));
        } else {
            return; // エンジンが寝ている時の自動再生音はあえて無視する（永久凍結防止）
        }
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
    
    // ★修正点：ミュート解除（ボタンのタップ時）に確実にエンジンを叩き起こす
    if (!isMuted) {
        initAudio(); 
        // 確実にサスペンド状態を解除する
        if (Tone.context.state !== 'running') {
            Tone.context.resume().catch(e => console.warn(e));
        }
    }
    
    return isMuted;
}

/**
 * 現在のミュート状態を取得
 */
export function getMuteState() {
    return isMuted;
}