/**
 * gravity_sdk.js
 * GRAVITY AgentSDKとの通信をカプセル化するモジュール
 * ローカルテスト環境でのエラー防止機能と、1024バイトのパケット上限防衛を内包します。
 */

/**
 * ゲームオーバー時のスコアをGRAVITY側へ自動送信します
 * @param {number} finalScore - 最終スコア
 */
export function reportScoreToGravity(finalScore) {
    try {
        // GRAVITY環境内で AgentSDK が存在するかチェック
        if (typeof window !== 'undefined' && window.AgentSDK) {
            
            // 1. 公式のゲームスコア専用APIが提供されている場合（優先）
            if (typeof window.AgentSDK.game?.reportScore === 'function') {
                window.AgentSDK.game.reportScore({ score: finalScore });
                console.log("[GRAVITY SDK] スコアAPI経由で送信完了:", finalScore);
            } 
            // 2. 汎用メッセージングAPIを利用する場合のフォールバック
            else if (typeof window.AgentSDK.room?.sendMessage === 'function') {
                // 1024バイトのパケット制限（Buffer Bloat現象）を防ぐための極小化ペイロード
                const payload = { type: 'GAME_OVER', score: finalScore };
                const msg = JSON.stringify(payload);
                
                // バイト数を計算し、確実に1KB未満である場合のみ送信する（防衛ライン）
                const byteSize = new Blob([msg]).size;
                if (byteSize < 1024) {
                    window.AgentSDK.room.sendMessage({ message: msg });
                    console.log("[GRAVITY SDK] メッセージAPI経由で送信完了:", finalScore);
                } else {
                    console.error("[GRAVITY SDK 致命的エラー] 送信データが1024バイトを超過しています。パケット詰まりを防止するため送信を遮断しました。");
                }
            }
        } else {
            // PCブラウザやGitHub上での単体テスト時
            console.info("[Local Test] AgentSDKが検出されませんでした。スコア送信をスキップします。 Final Score:", finalScore);
        }
    } catch (error) {
        console.warn("[GRAVITY SDK Error] スコア送信中に例外が発生しました:", error);
    }
}