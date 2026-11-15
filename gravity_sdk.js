/**
 * gravity_sdk.js
 * GRAVITY親アプリ（ネイティブ側）との通信をカプセル化するモジュール
 * 
 * [Version 1.2]
 * - 修正内容: GRAVITY公式の仕様に基づき、スコア送信ロジックをAgentSDKから
 *   `window.parent.postMessage` を使用した 'gameOver' イベント通知へ完全移行。
 */

/**
 * ゲームオーバー時のスコアをGRAVITYのランキング（リーダーボード）へ送信します
 * @param {number} finalScore - 最終スコア
 */
export function reportScoreToGravity(finalScore) {
    try {
        // GRAVITYアプリ（親ウィンドウ/iframe外）が存在するかチェックし、postMessageで送信
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'gameOver',
                score: finalScore
            }, '*');
            console.log("[GRAVITY SDK] スコア送信完了 (postMessage):", finalScore);
        } else {
            // PCブラウザやGitHub Pagesでの単体テスト時（iframe外で直接実行されている場合）
            console.info("[Local Test] GRAVITY親ウィンドウが検出されませんでした。スコア送信をスキップします。 Final Score:", finalScore);
        }
    } catch (error) {
        console.warn("[GRAVITY SDK Error] スコア送信中に例外が発生しました:", error);
    }
}