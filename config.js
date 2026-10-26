// メンバーと共有するための設定（Firebase）。
// 書き方は SETUP.md を見てください。ownerEmail は firestore.rules の ownerEmail() と同じにします。
// （前の版の adminEmail と書いてあっても、オーナーとして扱います）
// null のままなら、今までどおりこの端末だけに保存します。
window.SHUTTLE_FIREBASE = null;
/* 例：
window.SHUTTLE_FIREBASE = {
  ownerEmail: "あなた（オーナー）のメールアドレス",
  config: {
    apiKey: "....",
    authDomain: "xxxx.firebaseapp.com",
    projectId: "xxxx",
    appId: "...."
  }
};
*/
