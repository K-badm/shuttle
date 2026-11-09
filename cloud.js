/* Firebase とのやりとり。config.js に設定があるときだけ動く */
const FB = window.SHUTTLE_FIREBASE;
if (FB) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const app = initializeApp(FB.config), auth = A.getAuth(app);
    // 端末にも控えを持つので、電波が悪くても前回の分は見られる
    const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    const pubRef = F.doc(db, "public", "today"), privRef = F.doc(db, "private", "state");
    const parse = snap => { try { return snap.exists() ? JSON.parse(snap.data().json) : null } catch (e) { return null } };
    let unsub = null, unsubPriv = null, unsubAdmins = null;
    const ownerEmail = String(FB.ownerEmail || FB.adminEmail || "").trim().toLowerCase();
    const watchPublic = () => { unsub?.(); unsub = F.onSnapshot(pubRef, s => cloudPublic(parse(s)), e => cloudError(e.code || e.message)); };
    window.cloudApi = {
      signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
      // ログアウトしたら、この端末に残っている管理データ（部・NGペアなど）も消す
      signOut: async () => {
        try { localStorage.removeItem("shuttle-v1"); } catch (e) {}
        await A.signOut(auth);
        try { await F.terminate(db); await F.clearIndexedDbPersistence(db); } catch (e) {}
        location.reload();
      },
      push: (priv, pub) => Promise.all([F.setDoc(privRef, priv), F.setDoc(pubRef, pub)]),
      refreshPublic: watchPublic,
      addAdmin: email => F.setDoc(F.doc(db, "admins", email), { addedAt: Date.now() }),
      removeAdmin: email => F.deleteDoc(F.doc(db, "admins", email)),
    };
    watchPublic();
    // スリープや別のアプリから戻ったときは、つなぎ直して最新の組み合わせを読み込む
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") watchPublic(); });
    window.addEventListener("online", () => watchPublic());
    A.onAuthStateChanged(auth, async user => {
      unsubPriv?.(); unsubPriv = null; unsubAdmins?.(); unsubAdmins = null;
      if (!user) { cloudAuth(false); return; }
      const email = String(user.email || "").toLowerCase();
      // オーナーか、admins/{メールアドレス} に登録された人だけが管理者
      let role = email && email === ownerEmail ? "owner" : null;
      if (!role) {
        try { if ((await F.getDoc(F.doc(db, "admins", email))).exists()) role = "admin"; } catch (e) {}
      }
      if (!role) { await A.signOut(auth); cloudAuth(false, null, { denied: email }); return; }
      let priv = null;
      try { const s = await F.getDoc(privRef); priv = s.exists() ? s.data() : null; }
      catch (e) { cloudError(e.code || e.message); return; }
      cloudAuth(true, priv, { owner: role === "owner", email });
      // ほかの管理者の変更をすぐ反映する
      unsubPriv = F.onSnapshot(privRef, s => { if (!s.metadata.hasPendingWrites && s.exists()) cloudPrivate(s.data()); },
        e => { if (e.code === "permission-denied") window.cloudApi.signOut(); }); // 管理者から外されたら、端末の控えも消して出る
      if (role === "owner") unsubAdmins = F.onSnapshot(F.collection(db, "admins"), qs => cloudAdmins(qs.docs.map(d => d.id).sort()), () => {});
    });
  } catch (e) { cloudError(e.message); }
}
