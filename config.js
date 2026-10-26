// メンバーと共有するための設定（Firebase）。
// 書き方は SETUP.md を見てください。ownerEmail は firestore.rules の ownerEmail() と同じにします。
// （前の版の adminEmail と書いてあっても、オーナーとして扱います）
// null のままなら、今までどおりこの端末だけに保存します。
window.SHUTTLE_FIREBASE = {
  ownerEmail: "kxmz7826@gmail.com",
  config: {
    apiKey: "AIzaSyCB5nmPwW7lnIJPRBOwEAJC0i3W3twn0EQ",
    authDomain: "badminton-4135c.firebaseapp.com",
    projectId: "badminton-4135c",
    storageBucket: "badminton-4135c.firebasestorage.app",
    messagingSenderId: "1049841205246",
    appId: "1:1049841205246:web:5750e5b86ba34a368a8aaf",
    measurementId: "G-3LKLMRXBSL"
  }
};
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
