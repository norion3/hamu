/**
 * audio.js
 * Tone.jsを用いた音声の初期化、再生、およびミュート状態を管理するモジュール
 * iOS特有のオーディオコンテキスト制約（ユーザー操作による起動必須）を安全に処理します。
 * 
 * [Version 1.8]
 * - 修正内容: ミュート解除（オフ→オン）時に Tone.Context ごと新品へ差し替える完全ハードリセットを実装し、
 *   iOSでのゾンビ化（AudioContext破損による無音）から確実に復旧できるように強化。
 * - 修正内容: ミュート解除の初期化完了後に短い確認音を鳴らし、音の復活を即座に確認できるように改善。
 * 
 * [Version 1.7]
 * - 修正内容: toggleMute内での delete 漏れを修正し、破棄済みオブジェクトへの誤アクセスを防止。
 * - 修正内容: playSound において、isMuted を最優先でチェックし不要なエンジン起動を抑止。
 * - 修正内容: playSound の再生処理を try-catch で保護し、連打時の Tone.js タイムスタンプエラーによるフリーズを防止。
 * 
 * [Version 1.6]
 * - 修正内容: iOSでのバックグラウンド復帰時のクラッシュ回避のため、visibilitychange内での
 *   強制的な initAudio() 呼び出しを削除。楽器の破棄とプロパティの消去のみを行い、
 *   復帰後の最初のタップ操作（playSoundのturn）で安全に再構築するようロジックを変更。
 * 
 * [Version 1.5]
 * - 修正内容: 初期状態を本来のミュート(isMuted=true)に戻し、UIとの矛盾を解消。
 * - 修正内容: 画面がバックグラウンドから復帰したこと（visibilitychange）を自動検知し、
 *   プレイヤーにボタン操作を強いることなく、自動的にハードリセットをかけて音を復活させる処理を追加。
 */

// 音響エンジン（シンセサイザー群）と状態の保持
const synths = {};
let isMuted = true; // 初期状態を本来の「ミュート（音なし）」に戻し、UIのXマークと完全に一致させる
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
    // ミュート時は不要なオーディオエンジンの起動や処理を一切行わない
    if (isMuted) return;

    // ユーザーが画面をタップした証拠である「turn（Uターン）」の瞬間にだけ、
    // 未初期化なら初期化し、エンジンが寝ていれば叩き起こす（Tone.start）。
    if (type === 'turn') {
        if (!isInitialized) {
            setupSynths();
        }
        if (Tone.context.state !== 'running') {
            Tone.start().catch(e => console.warn(e));
        }
    }

    if (!synths[type]) return;
    
    const now = Tone.now();
    
    // 連打時のタイムスタンプ衝突エラー等でゲームループがクラッシュするのを防ぐ保護ブロック
    try {
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
    } catch (error) {
        console.warn("[Audio] 再生エラーをスキップしました (連打保護):", error);
    }
}

/**
 * ミュート状態の切り替え
 * @returns {boolean} 切り替え後のミュート状態
 */
export function toggleMute() {
    isMuted = !isMuted;
    
    // ミュート解除（ボタンのタップ時）にAudioContextごと新品へ差し替える完全ハードリセットを実行
    if (!isMuted) {
        if (isInitialized) {
            for (let key in synths) {
                if (synths[key] && typeof synths[key].dispose === 'function') {
                    synths[key].dispose();
                }
                // 破棄したオブジェクトのプロパティを確実に消去し、誤アクセスを防ぐ
                delete synths[key];
            }
            isInitialized = false;
        }
        
        // ★追加: iOSのAudioContextゾンビ化対策として、コンテキスト自体を新品に差し替える
        try {
            const oldContext = Tone.getContext();
            const newContext = new Tone.Context();
            Tone.setContext(newContext);
            if (oldContext && typeof oldContext.dispose === 'function') {
                oldContext.dispose();
            }
        } catch (e) {
            console.warn('[Audio] Context reset skipped:', e);
        }
        
        // エンジン起動・楽器再構築の完了後に短い確認音を鳴らす
        initAudio().then(() => {
            if (!isMuted) {
                playSound('turn');
            }
        });
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
 * 画面の表示状態（バックグラウンドからの復帰）を監視し、
 * もしプレイヤーがミュートを解除して遊んでいた場合は、破棄だけ行い、
 * ユーザーのタップを伴わない不要な initAudio の呼び出しを避ける
 */
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !isMuted) {
            // 画面に復帰した瞬間、古い楽器を破棄してプロパティも削除
            if (isInitialized) {
                for (let key in synths) {
                    if (synths[key] && typeof synths[key].dispose === 'function') {
                        synths[key].dispose();
                    }
                    delete synths[key]; // プロパティ自体を消去し、エラーを防止
                }
                isInitialized = false;
            }
            // ここでの initAudio() は非ユーザーアクションのため削除済。
            // 次のタップ操作（turn）時に自動的に再構築されます。
        }
    });
}