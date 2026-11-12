/* シャトル組み合わせ：アプリ本体（画面・組み合わせのロジック） */
const SAMPLE = [
 ["佐藤 健",1],["鈴木 翔",1],["高橋 美咲",2],["田中 大輔",2],["伊藤 彩",2],["渡辺 隼",2],["橋本 悠",2],
 ["山本 さくら",3],["中村 拓海",3],["小林 由佳",3],["加藤 亮",3],["吉田 愛",3],["山田 誠",3],
 ["佐々木 遥",4],["山口 陽介",4],["松本 真央",4],["井上 蓮",4],["池田 結衣",4],
 ["木村 千尋",5],["林 優斗",5],["清水 菜々",5],["森 健太",5]
];
function fresh(){
  const members = SAMPLE.map((m,i)=>({id:i+1,name:m[0],level:m[1]}));
  const absent = new Set([7,12]);
  return {v:2, members, attend: members.filter(m=>!absent.has(m.id)).map(m=>m.id),
    ng:[[4,15],[10,11]], tp:[{a:2,b:5,k:0},{a:14,b:16,k:1}],
    cfg:{matches:30,courts:2,cross:1.5,pairGames:4}, nextId:members.length+1};
}
/* ---------- 読み込んだデータの点検 ----------
   端末やサーバーから読んだデータは、画面に出す前にここで決まった形に整える。
   数字であるべき所は数字に、文字は長さを切り、知らない項目は捨てる。
   （データに仕込まれた文字列が、画面でスクリプトとして動くのを防ぐため） */
function clean(raw){
  if(!raw || typeof raw!=="object" || !Array.isArray(raw.members)) return null;
  const int=(x,lo,hi,def)=>{ const n=Number(x); return Number.isInteger(n)&&n>=lo&&n<=hi ? n : def; };
  const num=(x,lo,hi,def)=>{ const n=Number(x); return Number.isFinite(n)&&n>=lo&&n<=hi ? n : def; };
  const id=x=>int(x,1,999999,null);
  const str=(x,max)=>typeof x==="string" ? x.slice(0,max) : "";
  const date=x=>typeof x==="string"&&/^\d{4}\.\d{2}\.\d{2}$/.test(x) ? x : "";
  const arr=(x,max)=>Array.isArray(x) ? x.slice(0,max) : [];
  const ids=(x,max=300)=>[...new Set(arr(x,max).map(id).filter(v=>v!==null))];
  const idMap=(x,lo,hi)=>{ const o={}; if(x&&typeof x==="object"&&!Array.isArray(x))
    for(const [k,v] of Object.entries(x).slice(0,500)){ const i=id(k), n=int(v,lo,hi,null); if(i!==null&&n!==null) o[i]=n; } return o; };
  const seen=new Set(), members=[];
  for(const m of arr(raw.members,300)){
    const i=id(m?.id); if(i===null||seen.has(i)) continue; seen.add(i);
    members.push({id:i, name:str(m.name,40)||"（名前なし）", level:int(m.level,1,5,3)});
  }
  const c=raw.cfg||{};
  const out={v:2, members, attend:ids(raw.attend),
    ng:arr(raw.ng,200).filter(Array.isArray).map(p=>[id(p[0]),id(p[1])]).filter(([a,b])=>a!==null&&b!==null&&a!==b),
    tp:arr(raw.tp,6).map(p=>({a:id(p?.a),b:id(p?.b),k:int(p?.k,0,5,0)})).filter(p=>p.a!==null&&p.b!==null&&p.a!==p.b),
    cfg:{matches:int(c.matches,1,80,30),courts:int(c.courts,1,8,2),cross:num(c.cross,0,5,1.5),pairGames:int(c.pairGames,1,10,4)},
    nextId:int(raw.nextId,1,999999,Math.max(0,...members.map(m=>m.id))+1),
    wait:ids(raw.wait), waitDate:date(raw.waitDate), arrived:ids(raw.arrived), arrivedDate:date(raw.arrivedDate),
    log:arr(raw.log,1000).filter(e=>e&&["wait","arrive","join","leave","absent"].includes(e.type)&&id(e.id)!==null)
      .map(e=>({type:e.type,id:id(e.id),at:int(e.at,0,8.64e15,0),game:int(e.game,0,100000,0),done:int(e.done,0,100000,0)})),
    logDate:date(raw.logDate), day:null};
  const dy=raw.day;
  if(dy && typeof dy==="object"){
    let ok=true;
    const team=t=>{ const v=arr(t,3).map(id); if(v.length!==2||v.includes(null)) ok=false; return v; };
    const rounds=arr(dy.rounds,300).map(rd=>({rest:ids(rd?.rest),
      games:arr(rd?.games,8).map(g=>{
        const teams=arr(g?.teams,3); if(teams.length!==2) ok=false;
        return {no:int(g?.no,1,100000,1),court:int(g?.court,0,7,0),cross:g?.cross===true,
          pm:arr(g?.pm,2).map(k=>int(k,0,5,null)).filter(k=>k!==null),teams:teams.map(team)};
      })}));
    if(ok) out.day={date:date(dy.date),done:int(dy.done,0,300,0),started:int(dy.started,0,100000,0),
      nums:dy.nums==null?null:idMap(dy.nums,1,9999),off:idMap(dy.off,0,1000),joined:idMap(dy.joined,0,300),
      present:ids(dy.present),rounds};
  }
  return out;
}
let S;
try{ S = clean(JSON.parse(localStorage.getItem("shuttle-v1"))) }catch(e){}
if(!S || !S.members) S = fresh();
if(S.v!==2){ S.v=2; S.cfg.courts=2; S.tp=[{a:2,b:5,k:0},{a:14,b:16,k:1}]; S.cfg.pairGames=4; }
/* ---------- 共有（Firebase）。config.js に設定があるときだけ使う ----------
   管理者：ログインすると private/state にすべてを保存し、public/today にメンバー用の組み合わせを出す。
   メンバー：public/today だけを読む。レベル・NGペア・交流戦の印はそもそも送らない。 */
const FB = window.SHUTTLE_FIREBASE || null;
const cloud = {on:!!FB, admin:false, owner:false, ready:false, err:"", email:"", admins:[], denied:""};
/* 共有の設定（config.js）がないままネットに公開されたページでは、管理者画面を開けないようにする。
   自分のパソコンで開いたとき（file:// や localhost）だけ、ログインなしのお試し管理者画面が使える。 */
const LOCKED = !FB && /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const memberOnly = () => (cloud.on && !cloud.admin) || LOCKED;
const LOCAL = S; // この端末に保存してある分（管理者が初めてログインしたときに送る）
/* 画面の上に少しのあいだ出るお知らせ */
function popup(msg){ const el=$("#popup"); if(!el) return; el.textContent=msg; el.hidden=false;
  clearTimeout(popup.t); popup.t=setTimeout(()=>{el.hidden=true},2500); }
let announce=false; // 次に組み合わせを作ったら「組み合わせが設定されました。」を出す
function save(){
  if(memberOnly()) return; // メンバー用の表示データは保存しない
  try{ localStorage.setItem("shuttle-v1", JSON.stringify(S)) }catch(e){}
  if(cloud.admin) queuePush();
}
const d=new Date();
const TODAY=`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
/* 当日の進行。S.day = {date, rounds（IDで保存）, done（終わったラウンド数）, nums（固定した番号）,
   off（途中参加の人の試合数の下駄）, joined（途中参加したラウンド）, present（前回組んだときの参加者）} */
if(S.day && S.day.date!==TODAY) S.day=null;

let tab = "today", schedule = null, stale = false, focusId = "", mode = "admin";
/* 「今日」タブで表示する内容（いくつでも選べる）。この端末だけに覚える */
const PANES=[{k:"attend",label:"今日の参加者",admin:true},{k:"matches",label:"組み合わせ"},{k:"summary",label:"集計"}];
let panes=["matches","summary"];
try{ const v=JSON.parse(localStorage.getItem("shuttle-panes")); if(Array.isArray(v)&&v.length) panes=v.filter(k=>PANES.some(p=>p.k===k)); }catch(e){}
try{ mode = localStorage.getItem("shuttle-mode") || "admin" }catch(e){}
try{ tab = localStorage.getItem("shuttle-tab") || "today" }catch(e){}
if(["attend","matches","summary"].includes(tab)) tab="today"; // 前の版のタブ名
if(cloud.on || LOCKED){ S = memberState(null); mode = "user"; tab = "today"; } // ログインが確かめられるまではメンバー画面
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const byId = id => S.members.find(m=>m.id===id);
const isNg = (a,b) => S.ng.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
const lvChip = l => `<span class="lv lv${l}" title="${l}部">${l}部</span>`;
/* 部の差が3以上の人（味方でも相手でも）が同じ試合にいれば、交流戦として数える（ユーザーの指定） */
/* 5部（初心者）の相手：5部の人がいる試合に、5部でない人が入った回数を、交流戦とは別に数える（ユーザーの指定）。
   5部は4部とも差があり、相手をするのは4部の人にも負担になるので、5部でない人の間でならす */
const begGame = ps => ps.some(p=>p.level===5) && ps.some(p=>p.level!==5);
const wideGame = ps => Math.max(...ps.map(p=>p.level)) - Math.min(...ps.map(p=>p.level)) >= 3;
const MARKS = ["A","B","C","D","E","F"];
const MAX_MEMBERS = 30; // 登録できるメンバーの上限（ユーザーの指定）
const mkChip = k => k==null ? "" : `<span class="mk mk${k%6}" title="大会ペア${MARKS[k%6]}">${MARKS[k%6]}</span>`;

/* 到着待ち（今日の参加者だが、遅刻でまだ来ていない人）。日付が変わったら空にする */
function waitSet(){ if(S.waitDate!==TODAY){ S.wait=[]; S.waitDate=TODAY; } return new Set(S.wait||[]); }
/* 今いる参加者（到着待ちの人を除く）。組み合わせはこの人たちだけで作る */
function here(){ const w=waitSet(); return S.attend.filter(id=>!w.has(id)); }
/* 今日の記録（遅刻・到着・早退）。日付が変わったら空にする。組み直しやリセットでは消さない */
const LOG_LABEL={wait:"遅刻の連絡",arrive:"到着（遅刻）",join:"到着（予定外）",leave:"早退",absent:"来なかった"};
function dayLog(){ if(S.logDate!==TODAY){ S.log=[]; S.logDate=TODAY; } return S.log; }
function logEv(type, ids){ const L=dayLog(), at=Date.now(), game=S.day?.started||0, done=S.day?.done||0;
  ids.forEach(id=>L.push({type,id,at,game,done})); }
const hhmm=t=>{ const d=new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`; };
/* その人の最後の到着時刻（なければ null） */
function arrivedAt(id){ const e=[...dayLog()].reverse().find(x=>x.id===id&&(x.type==="arrive"||x.type==="join")); return e?e.at:null; }
/* 今日有効な大会ペア（両方が来ている組だけ） */
function todayPairs(){
  const on=new Set(here());
  return S.tp.map((p,k)=>({...p,k:p.k??k})).filter(p=>on.has(p.a)&&on.has(p.b));
}
/* 参加者に弱い順で番号: レベル5 → 1。試合が始まったら番号を固定し、途中参加の人には続きの番号を振る */
function players(){
  const mk={}; todayPairs().forEach(p=>{mk[p.a]=p.k;mk[p.b]=p.k});
  const fz=S.day&&S.day.nums;
  if(fz){
    let mx=Math.max(0,...Object.values(fz));
    here().forEach(id=>{ if(fz[id]==null) fz[id]=++mx; });
    return here().map(byId).filter(Boolean).sort((a,b)=>fz[a.id]-fz[b.id]).map(p=>({...p,num:fz[p.id],mk:mk[p.id]}));
  }
  const ps = here().map(byId).filter(Boolean)
    .sort((a,b)=> b.level-a.level || a.id-b.id);
  return ps.map((p,i)=>({...p,num:i+1,mk:mk[p.id]}));
}

/* ---------- 組み合わせ生成 ---------- */
function combos(arr,k){
  const out=[]; const rec=(s,acc)=>{ if(acc.length===k){out.push(acc.slice());return}
    for(let i=s;i<arr.length;i++){acc.push(arr[i]);rec(i+1,acc);acc.pop()} };
  rec(0,[]); return out;
}
/* fixed: 終わったラウンド（そのまま残す）。off: 途中参加の人の試合数の下駄 */
function buildOnce(P, cfg, pairs, fixed=[], off={}){
  const M=cfg.matches, C=Math.max(1,cfg.courts), T=cfg.pairGames;
  const byPid={}; P.forEach(p=>byPid[p.id]=p);
  const strong=P.filter(p=>p.level<=2), weak=P.filter(p=>p.level>=4);
  let crossTotal = (strong.length>=2 && weak.length>=2)
    ? Math.round(cfg.cross*(strong.length+weak.length)/4) : 0;
  crossTotal = Math.min(crossTotal, M);
  const cnt={}, xc={}, bc={}, last={}, meet={};
  P.forEach(p=>{cnt[p.id]=off[p.id]||0;xc[p.id]=0;bc[p.id]=0;last[p.id]=-9});
  // 遅刻者は、時間どおりに来た人より1回少なくてもよい。比べるときに 0.5 回分を足しておく
  // （同じ回数なら時間どおりの人を先に出し、ならすときも遅刻者の −1 までは許す）
  const late=new Set(Object.keys(off).map(Number));
  const ac=id=>cnt[id]+(late.has(id)?0.5:0);
  // 遅刻者は、時間どおりに来た人が全員1回ずつ試合に入るまで待つ（ユーザーの指定）。real は実際の出場回数（下駄なし）
  const real={}; P.forEach(p=>real[p.id]=0);
  const allPlayed=()=>P.every(p=>late.has(p.id)||real[p.id]>=1);
  const roundOpen=[]; // そのラウンドで遅刻者が入れたか（ならしの入れ替えで使う）
  const mk=(a,b)=>a<b?a+"-"+b:b+"-"+a;
  const mt=(a,b)=>meet[mk(a,b)]||0;
  const pidx={}; pairs.forEach((pr,j)=>{pidx[pr.a]=j;pidx[pr.b]=j});
  const sameP=(x,y)=>pidx[x]!==undefined && pidx[x]===pidx[y];
  const pc=pairs.map(()=>0);
  const phase=pairs.map((_,j)=>(j+0.5)/pairs.length*0.9);
  const rounds=fixed.slice(); let ng=0, crossDone=0, gi=0;
  // 終わったラウンドの出場・対戦・ペア練を数えておく
  fixed.forEach((rd,r)=>rd.games.forEach(g=>{
    const ps=g.teams.flat();
    for(let a=0;a<4;a++)for(let b=a+1;b<4;b++) meet[mk(ps[a].id,ps[b].id)]=mt(ps[a].id,ps[b].id)+1;
    const gb=begGame(ps);
    for(const p of ps) if(cnt[p.id]!==undefined){cnt[p.id]++;real[p.id]++;last[p.id]=r;if(g.cross)xc[p.id]++;if(gb&&p.level!==5)bc[p.id]++}
    g.pm.forEach(k=>{const j=pairs.findIndex(pr=>pr.k===k); if(j>=0) pc[j]++});
    if(g.cross) crossDone++;
    gi++;
  }));
  for(let r=fixed.length; gi<M; r++){
    const used=new Set(), games=[];
    const open=allPlayed(); roundOpen[r]=open;
    const ok=p=>open||!late.has(p.id); // まだ全員が1回入っていなければ、遅刻者はこのラウンドは休み
    // このラウンドに必ず出す人：試合数がいちばん少ない人たち（コートに入れる人数の枠に収まる分）。
    // 部の差が大きくて組みにくい人も後回しにせず、毎ラウンド順番に出す（終盤に試合や部の差が固まらないように）
    const pool=P.filter(ok), slots=Math.min(C,M-gi)*4;
    const acs=pool.map(p=>ac(p.id)).sort((a,b)=>a-b);
    const cut=acs.length>slots ? acs[slots-1] : Infinity;
    const must=new Set(pool.filter(p=>ac(p.id)<cut).map(p=>p.id));
    for(let c=0;c<C && gi<M;c++){
      const i=gi;
      let avail=P.filter(p=>!used.has(p.id)&&ok(p));
      if(avail.length<4) avail=P.filter(p=>!used.has(p.id)); // 人が足りないときだけは遅刻者も入れる
      if(avail.length<4) break;
      const inAv=new Set(avail.map(p=>p.id));
      const key=p=>ac(p.id)*10+(last[p.id]===r-1?2:0)+Math.random()*1.5;
      // ペア練の順番が来ている大会ペア
      const minC=Math.min(...avail.map(p=>ac(p.id)));
      const due=pairs.map((pr,j)=>j).filter(j=>pc[j]<T && inAv.has(pairs[j].a) && inAv.has(pairs[j].b)
        && Math.max(ac(pairs[j].a),ac(pairs[j].b))<=minC+1
        && pc[j] < Math.floor((i+1)*T/M + phase[j]))
        .sort((x,y)=>pc[x]-pc[y]).slice(0,2);
      const forced=due.map(j=>[byPid[pairs[j].a],byPid[pairs[j].b]]);
      // 試合数が多い人（必ず出す人の枠より上）は、少ない人を飛ばして先に出さない（大会ペアのペア練は別）
      { const cp=avail.filter(p=>ac(p.id)<=cut||forced.some(f=>f.some(q=>q.id===p.id))); if(cp.length>=4) avail=cp; }
      // 交流戦の枠は等間隔に置く。半分前にずらして、最後の枠が入らなかったときも終盤にやり直せるようにする
      let cross=!forced.length && crossDone < Math.floor((i+1)*crossTotal/M+0.5);
      const aS=avail.filter(p=>p.level<=2&&ac(p.id)<=minC+(i%2)), aW=avail.filter(p=>p.level>=4&&ac(p.id)<=minC+(i%2));
      if(cross && (aS.length<2||aW.length<2)) cross=false;
      let cands;
      if(forced.length===2) cands=[[...forced[0],...forced[1]]];
      else if(forced.length===1){
        const fid=new Set(forced[0].map(p=>p.id));
        const rest=avail.filter(p=>!fid.has(p.id)).sort((a,b)=>key(a)-key(b)).slice(0,10);
        cands=combos(rest,2).map(o=>[...forced[0],...o]);
      } else if(cross){
        const ks=p=>key(p)+xc[p.id]*15;
        const ps=aS.sort((a,b)=>ks(a)-ks(b)).slice(0,6), pw=aW.sort((a,b)=>ks(a)-ks(b)).slice(0,6);
        cands=[]; for(const s of combos(ps,2)) for(const w of combos(pw,2)) cands.push([...s,...w]);
      } else {
        cands=combos(avail.sort((a,b)=>key(a)-key(b)).slice(0,10),4);
      }
      // 必ず出す人のうち、残りのコートに入りきらない分は、この試合に入れる
      const rc=Math.min(C-c,M-gi), mr=[...must].filter(id=>!used.has(id)).length, need=Math.max(0,mr-4*(rc-1));
      const enough=g=>g.filter(p=>must.has(p.id)).length>=need;
      if(need && !forced.length){
        let f=cands.filter(enough);
        if(!f.length && cross){ // 交流戦の枠で入りきらないときは、必ず出す人をできるだけ多く入れた交流戦にする
          const nm=g=>g.filter(p=>must.has(p.id)).length, mx=Math.max(...cands.map(nm));
          f=cands.filter(g=>nm(g)===mx);
        }
        if(f.length) cands=f;
      }
      let best=null,bcost=Infinity;
      for(const g of cands){
        let cost=0;
        for(const p of g){ cost+=ac(p.id)*ac(p.id)*6; if(last[p.id]===r-1) cost+=2; }
        for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){
          if(isNg(g[a].id,g[b].id)) cost+=1000;
          cost+=mt(g[a].id,g[b].id)**2*3;
        }
        if(forced.length===1){
          const s1=g[0].level+g[1].level, s2=g[2].level+g[3].level;
          cost+=(s1-s2)**2*8 + Math.abs(g[2].level-g[3].level)*3;
        } else if(cross){ for(const p of g) cost+=xc[p.id]*xc[p.id]*25; }
        else if(!forced.length){
          const ls=g.map(p=>p.level), sp=Math.max(...ls)-Math.min(...ls);
          cost+=sp*sp*9;
          if(Math.min(...ls)<=2 && Math.max(...ls)>=4) cost+=60;
        }
        // 5部の相手が同じ人に片寄らないように（もう相手をした回数が多い人ほど選びにくくする）
        if(begGame(g)) for(const p of g) if(p.level!==5) cost+=bc[p.id]*bc[p.id]*10;
        cost+=Math.random();
        if(cost<bcost){bcost=cost;best=g}
      }
      // ペア分け
      const [a,b,c2,d]=best;
      let opts=[[[a,b],[c2,d]],[[a,c2],[b,d]],[[a,d],[b,c2]]];
      if(forced.length) opts=[opts[0]];
      else if(cross) opts=opts.filter(([t1,t2])=>[t1,t2].every(t=>t.some(p=>p.level<=2)&&t.some(p=>p.level>=4)));
      let pair=opts[0],pv=Infinity;
      for(const o of opts){
        const s1=o[0][0].level+o[0][1].level, s2=o[1][0].level+o[1][1].level;
        let v=Math.abs(s1-s2)*4+mt(o[0][0].id,o[0][1].id)*3+mt(o[1][0].id,o[1][1].id)*3+Math.random();
        for(const t of o) if(sameP(t[0].id,t[1].id) && pc[pidx[t[0].id]]>=T) v+=20; // 予定外のペア練は控える
        if(v<pv){pv=v;pair=o}
      }
      const pm=[];
      for(const t of pair) if(sameP(t[0].id,t[1].id)){ const j=pidx[t[0].id]; pc[j]++; pm.push(pairs[j].k); }
      let bad=[];
      for(let x=0;x<4;x++)for(let y=x+1;y<4;y++){
        meet[mk(best[x].id,best[y].id)]=mt(best[x].id,best[y].id)+1;
        if(isNg(best[x].id,best[y].id)) bad.push([best[x],best[y]]);
      }
      ng+=bad.length;
      const isX = cross || wideGame(best); // 交流戦の枠、または部の差が3以上の人がいる試合
      if(isX) crossDone++;
      const isB=begGame(best);
      for(const p of best){cnt[p.id]++;real[p.id]++;last[p.id]=r;used.add(p.id);if(isX)xc[p.id]++;if(isB&&p.level!==5)bc[p.id]++}
      games.push({no:i+1,court:c,cross:isX,teams:pair,bad,pm});
      gi++;
    }
    if(!games.length) break;
    rounds.push({games,rest:P.filter(p=>!used.has(p.id))});
  }

  // 試合数の偏りを入れ替えでならす
  const cls=p=>p.level<=2?"S":p.level>=4?"W":"M";
  for(let it=0;it<60;it++){
    const ids=P.map(p=>p.id).sort((x,y)=>ac(x)-ac(y));
    if(ac(ids[ids.length-1])-ac(ids[0])<=1) break;
    let done=false;
    const lows=ids.filter(id=>ac(id)<ac(ids[ids.length-1])-1), highs=ids.filter(id=>ac(id)>ac(ids[0])+1);
    let bestSw=null,bs=Infinity;
    for(const rd of rounds.slice(fixed.length)) for(const g of rd.games) for(const t of g.teams) for(let s=0;s<2;s++){
      const ri=rounds.indexOf(rd);
      const h=t[s]; if(!highs.includes(h.id)) continue;
      if(sameP(t[0].id,t[1].id) && g.pm.length) continue;
      for(const l of rd.rest){ if(!lows.includes(l.id) || ac(h.id)-ac(l.id)<=1) continue;
        if(late.has(l.id) && roundOpen[ri]===false) continue; // 全員が1回入る前のラウンドに遅刻者を入れない
        if(g.cross && cls(l)!==cls(h)) continue;
        const others=g.teams.flat().filter(p=>p.id!==h.id);
        if(!g.cross && wideGame([...others,l])) continue; // 入れ替えで交流戦が増えないように
        if(others.some(o=>isNg(o.id,l.id))) continue;
        const v=Math.abs(l.level-h.level)+Math.random()*0.1;
        if(v<bs){bs=v;bestSw={rd,g,t,s,h,l}}
      }
    }
    if(!bestSw) break;
    const {rd,g,t,s,h,l}=bestSw;
    t[s]=l; rd.rest=rd.rest.filter(p=>p.id!==l.id).concat([h]).sort((a,b)=>a.num-b.num);
    cnt[h.id]--; cnt[l.id]++; real[h.id]--; real[l.id]++; if(g.cross){xc[h.id]--;xc[l.id]++}
  }
  // 交流戦の回数をならす：同じラウンドで、交流戦に2回以上出ている人と、まだ0回の人（強い側・弱い側が同じ）の位置を入れ替える。
  // 2人ともそのラウンドに出ているので、試合数は変わらない
  for(let it=0;it<30;it++){
    let bestSw=null,bs=Infinity;
    for(const rd of rounds.slice(fixed.length)) for(const g of rd.games){
      if(!g.cross||g.pm.length) continue;
      for(const t of g.teams) for(let s=0;s<2;s++){
        const h=t[s]; if(xc[h.id]<2) continue;
        for(const g2 of rd.games){
          if(g2===g||g2.cross||g2.pm.length) continue;
          for(const t2 of g2.teams) for(let s2=0;s2<2;s2++){
            const l=t2[s2]; if(xc[l.id]!==0||cls(l)==="M"||cls(l)!==cls(h)) continue;
            const o1=g.teams.flat().filter(p=>p!==h), o2=g2.teams.flat().filter(p=>p!==l);
            if(o1.some(o=>isNg(o.id,l.id))||o2.some(o=>isNg(o.id,h.id))) continue;
            if(wideGame([...o2,h])) continue; // 入れ替えで、ふつうの試合を交流戦にしない
            const v=Math.abs(l.level-h.level)+Math.random()*0.1;
            if(v<bs){bs=v;bestSw={t,s,t2,s2,h,l}}
          }
        }
      }
    }
    if(!bestSw){
      // 同じラウンドで見つからなければ、2つのラウンドで入れ替える：
      // ラウンドAの交流戦で h（2回以上）と休みの l（0回）を入れ替え、ラウンドBのふつうの試合で l と休みの h を入れ替える
      const newR=rounds.slice(fixed.length);
      for(const rA of newR) for(const g of rA.games){
        if(!g.cross||g.pm.length) continue;
        for(const t of g.teams) for(let s=0;s<2;s++){
          const h=t[s]; if(xc[h.id]<2) continue;
          for(const l of rA.rest){
            if(xc[l.id]!==0||cls(l)==="M"||cls(l)!==cls(h)) continue;
            if(late.has(l.id) && roundOpen[rounds.indexOf(rA)]===false) continue;
            if(g.teams.flat().filter(p=>p!==h).some(o=>isNg(o.id,l.id))) continue;
            for(const rB of newR){
              if(rB===rA || !rB.rest.some(p=>p.id===h.id)) continue;
              for(const g2 of rB.games){
                if(g2.cross||g2.pm.length) continue;
                for(const t2 of g2.teams) for(let s2=0;s2<2;s2++){
                  if(t2[s2].id!==l.id) continue;
                  const o2=g2.teams.flat().filter(p=>p.id!==l.id);
                  if(o2.some(o=>isNg(o.id,h.id)) || wideGame([...o2,h])) continue;
                  const v=Math.abs(l.level-h.level)*2+Math.random()*0.1;
                  if(v<bs){bs=v;bestSw={two:true,rA,t,s,h,l,rB,t2,s2}}
                }
              }
            }
          }
        }
      }
    }
    if(!bestSw) break;
    const {t,s,t2,s2,h,l}=bestSw;
    t[s]=l; t2[s2]=h; xc[h.id]--; xc[l.id]++;
    if(bestSw.two){ // 休みの人の並びも直す
      const {rA,rB}=bestSw, byNum=(a,b)=>a.num-b.num;
      rA.rest=rA.rest.filter(p=>p.id!==l.id).concat([h]).sort(byNum);
      rB.rest=rB.rest.filter(p=>p.id!==h.id).concat([l]).sort(byNum);
    }
  }
  const vals=P.map(p=>ac(p.id)), mean=vals.reduce((s,v)=>s+v,0)/vals.length;
  const varc=vals.reduce((s,v)=>s+(v-mean)**2,0);
  const sw=P.filter(p=>p.level<=2||p.level>=4);
  const xdev=sw.reduce((s,p)=>s+(xc[p.id]-cfg.cross)**2,0);
  // 5部の相手をした回数は、入れ替えのあとの組み合わせで数え直し、5部でない人の間のばらつきをスコアに足す
  P.forEach(p=>bc[p.id]=0);
  rounds.forEach(rd=>rd.games.forEach(g=>{ const ps=g.teams.flat(); if(begGame(ps)) ps.forEach(p=>{ if(p.level!==5&&bc[p.id]!==undefined) bc[p.id]++ }); }));
  const nb=P.filter(p=>p.level!==5), bm=nb.length?nb.reduce((s,p)=>s+bc[p.id],0)/nb.length:0;
  const bdev=nb.reduce((s,p)=>s+(bc[p.id]-bm)**2,0);
  const rep=Object.values(meet).reduce((s,v)=>s+(v>1?(v-1)**2:0),0);
  const pdev=pc.reduce((s,v)=>s+(v<3?(3-v)*2000:0)+(v>4?(v-4)*300:0)+(v-T)**2*80,0);
  const ppc={}; pairs.forEach((pr,j)=>{ppc[pr.a]=pc[j];ppc[pr.b]=pc[j]});
  // 部の差が序盤・中盤・終盤のどこかに固まっていないか（3つに分けて、平均からのずれを数える）
  const newGames=rounds.slice(fixed.length).flatMap(rd=>rd.games);
  const spOf=g=>{ const ls=g.teams.flat().map(p=>p.level); return Math.max(...ls)-Math.min(...ls); };
  let lump=0;
  if(newGames.length>=6){
    const sps=newGames.map(spOf), all=sps.reduce((a,b)=>a+b,0)/sps.length;
    for(let k=0;k<3;k++){ const part=sps.slice(Math.floor(k*sps.length/3),Math.floor((k+1)*sps.length/3));
      const m=part.reduce((a,b)=>a+b,0)/part.length; lump+=(m-all)**2*part.length; }
  }
  return {rounds,cnt,xc,bc,ng,crossTotal,pc,ppc,
    score:ng*1000+varc*400+xdev*30+bdev*20+rep*2+pdev+lump*60};
}
/* 保存用にIDだけにする／保存したものを選手の情報に戻す */
function dehydrate(rounds){
  return rounds.map(rd=>({rest:rd.rest.map(p=>p.id),games:rd.games.map(g=>({no:g.no,court:g.court,cross:g.cross,pm:g.pm,teams:g.teams.map(t=>t.map(p=>p.id))}))}));
}
function hydrate(rounds,P){
  const pm={}; P.forEach(p=>pm[p.id]=p);
  const get=id=>pm[id]||{...(byId(id)||{id,name:"（削除済み）",level:3}),num:S.day.nums?.[id]??"–"};
  return rounds.map(rd=>({rest:rd.rest.map(get),games:rd.games.map(g=>{
    const teams=g.teams.map(t=>t.map(get)), ps=teams.flat(), bad=[];
    for(let x=0;x<4;x++)for(let y=x+1;y<4;y++) if(isNg(ps[x].id,ps[y].id)) bad.push([ps[x],ps[y]]);
    return {...g,teams,bad,cross:!!g.cross||wideGame(ps)};
  })}));
}
/* 実際の出場回数などを数える（早退した人も含む） */
function tally(rounds,pairs){
  const cnt={}, xc={}, bc={}, ppc={}; let ng=0;
  const pc=pairs.map(pr=>0);
  for(const rd of rounds) for(const g of rd.games){
    const ps=g.teams.flat(), gb=begGame(ps);
    for(const p of ps){cnt[p.id]=(cnt[p.id]||0)+1; if(g.cross) xc[p.id]=(xc[p.id]||0)+1; if(gb&&p.level!==5) bc[p.id]=(bc[p.id]||0)+1}
    ng+=g.bad.length;
    g.pm.forEach(k=>{const j=pairs.findIndex(pr=>pr.k===k); if(j>=0) pc[j]++});
  }
  pairs.forEach((pr,j)=>{ppc[pr.a]=pc[j];ppc[pr.b]=pc[j]});
  return {cnt,xc,bc,ng,pc,ppc};
}
function generate(){
  const pairs=todayPairs();
  // 終わったラウンドと、試合が始まっているラウンドは組み直さずに残す
  let keepSt=0; const st=S.day?.started||0;
  if(st) (S.day.rounds||[]).forEach((rd,ri)=>{ if(rd.games.some(g=>g.no<=st)) keepSt=ri+1; });
  const keep=Math.max(S.day&&S.day.done>0 ? S.day.done : 0, keepSt);
  if(!keep){
    S.day={date:TODAY,rounds:[],done:0,nums:null,off:{},joined:{},present:[]};
    // まだどのラウンドも終わっていなくても、到着待ちから来た人は遅刻者として扱う（全員が1回入るまで待つ）
    if(S.arrivedDate===TODAY) (S.arrived||[]).filter(id=>here().includes(id)).forEach(id=>{S.day.off[id]=0; S.day.joined[id]=0;});
  }
  else {
    // 前回から増えた人（遅刻・戻ってきた人）は、その時点のみんなの平均試合数から数え始める
    const dy=S.day, pres=new Set(dy.present);
    const fixedRaw=dy.rounds.slice(0,keep), real={};
    fixedRaw.forEach(rd=>rd.games.forEach(g=>g.teams.flat().forEach(id=>real[id]=(real[id]||0)+1)));
    const base=here().filter(id=>pres.has(id));
    const avg=base.length? base.reduce((s,id)=>s+(real[id]||0)+(dy.off[id]||0),0)/base.length : 0;
    here().filter(id=>!pres.has(id)).forEach(id=>{
      dy.off[id]=Math.max(0,Math.round(avg)-(real[id]||0)); dy.joined[id]=keep;
    });
  }
  const P=players();
  const fixed=keep ? hydrate(S.day.rounds.slice(0,keep),P) : [];
  let rounds=fixed;
  if(P.length>=4){
    let best=null;
    for(let t=0;t<80;t++){const s=buildOnce(P,S.cfg,pairs,fixed,S.day.off); if(!best||s.score<best.score) best=s}
    rounds=best.rounds;
  }
  S.day.rounds=dehydrate(rounds); S.day.present=here(); save();
  if(announce){ announce=false; setTimeout(()=>popup("組み合わせが設定されました。")); }
  schedule={...tally(rounds,pairs),rounds,P,pairs};
  stale=false;
}
/* 保存してある組み合わせを読み込む。なければ作る */
function ensure(){
  if(schedule && !stale) return;
  if(memberOnly() && !S.day?.rounds.length){ // メンバー画面ではここで組まない
    schedule={rounds:[],cnt:{},xc:{},bc:{},ng:0,pc:[],ppc:{},P:players(),pairs:[]}; return;
  }
  if(stale || !S.day || !S.day.rounds.length) return generate();
  const P=players(), pairs=todayPairs(), rounds=hydrate(S.day.rounds,P);
  schedule={...tally(rounds,pairs),rounds,P,pairs};
}

/* ---------- 共有 ---------- */
/* メンバー用に出す中身。名前・番号・組み合わせ・大会ペアのマークだけ（レベル・NG・交流戦の印は入れない） */
function publicState(){
  const P=players(), dy=S.day, ids=new Set(P.map(p=>p.id));
  dy?.rounds.forEach(rd=>rd.games.forEach(g=>g.teams.flat().forEach(id=>ids.add(id))));
  const nums={...(dy?.nums||{})}; P.forEach(p=>nums[p.id]=p.num);
  return {v:2, members:[...ids].map(id=>({id,name:byId(id)?.name||"（削除済み）"})),
    attend:P.map(p=>p.id), ng:[], tp:todayPairs().map(p=>({a:p.a,b:p.b,k:p.k})),
    cfg:{matches:S.cfg.matches,courts:S.cfg.courts,cross:0,pairGames:S.cfg.pairGames}, nextId:0,
    day:dy?{date:dy.date,done:dy.done,started:dy.started||0,nums,off:dy.off,joined:dy.joined,present:[],
      rounds:dy.rounds.map(rd=>({rest:rd.rest,games:rd.games.map(g=>({...g,cross:false}))}))}:null};
}
/* 届いたメンバー用の中身を、表示に使う形にする */
function memberState(pub){
  return clean(pub) || {v:2,members:[],attend:[],ng:[],tp:[],cfg:{matches:30,courts:2,cross:0,pairGames:4},nextId:0,day:null};
}
let pushT=null, pushMsg="", pushBusy=false;
function pushTimerActive(){ return !!pushT || pushBusy; }
function queuePush(){ clearTimeout(pushT); pushMsg="保存中…"; showStatus(); pushT=setTimeout(()=>{pushT=null;pushNow()},600); }
async function pushNow(){
  if(!cloud.admin || !window.cloudApi) return;
  ensure();
  pushBusy=true;
  try{
    pushMsg="保存中…（ネットにつながると送ります）"; showStatus();
    await window.cloudApi.push({json:JSON.stringify(S),at:Date.now()},{json:JSON.stringify(publicState()),at:Date.now()});
    pushMsg="";
  }catch(e){ pushMsg=e.code==="permission-denied"?"保存できませんでした。管理者から外されている可能性があります。":"保存できませんでした（"+(e.code||e.message)+"）"; }
  pushBusy=false;
  showStatus();
}
function showStatus(){
  const el=$("#status"); if(!el) return;
  el.textContent = LOCKED ? "共有の設定（config.js）がまだ入っていないため、組み合わせは表示されません。管理者の方は SETUP.md の手順で設定してください。"
    : !cloud.on ? "データはこの端末のブラウザにだけ保存されます。"
    : cloud.err ? "共有サーバーにつながりません："+cloud.err
    : cloud.admin ? (pushMsg||((cloud.owner?"オーナー":"管理者")+"としてログイン中（"+cloud.email+"）。変更はメンバーの画面にも出ます。"))
    : cloud.ready ? `管理者が組み合わせを変えると、自動で更新されます（最終確認 ${hhmm(cloud.lastPub||Date.now())}）。` : "読み込み中…";
}
/* module スクリプト（下）から呼ばれる */
function cloudPublic(pub){
  cloud.ready=true; cloud.lastPub=Date.now();
  if(cloud.admin) return;
  S=memberState(pub); schedule=null; stale=false; render();
}
function cloudAuth(isAdmin, priv, info){
  cloud.ready=true;
  cloud.owner=!!info?.owner; cloud.email=info?.email||""; if(info) cloud.denied=info.denied||"";
  if(!isAdmin){
    if(info?.denied){ tab="login"; render(); }
    if(cloud.admin){ cloud.admin=false; pushMsg=""; S=memberState(null); schedule=null; render(); window.cloudApi?.refreshPublic(); }
    showStatus(); return;
  }
  cloud.admin=true; mode="admin"; tab="today";
  if(priv){ try{ S=clean(JSON.parse(priv.json))||LOCAL }catch(e){ S=LOCAL } } else S=LOCAL; // 初めてなら、この端末の分を送る
  if(S.day && S.day.date!==TODAY) S.day=null;
  schedule=null; stale=false; render(); queuePush();
}
function cloudError(msg){ cloud.err=msg; showStatus(); }
/* ほかの管理者が保存した内容を受け取る（自分の保存は除く） */
function cloudPrivate(priv){
  if(!cloud.admin || !priv || pushTimerActive()) return;
  let next; try{ next=clean(JSON.parse(priv.json)) }catch(e){ return }
  if(!next) return;
  if(JSON.stringify(next)===JSON.stringify(S)) return;
  S=next; if(S.day && S.day.date!==TODAY) S.day=null;
  try{ localStorage.setItem("shuttle-v1", JSON.stringify(S)) }catch(e){}
  schedule=null; stale=false;
  const ae=document.activeElement;
  if(ae && ae.matches && ae.matches("input[type=text],input[type=email],input[type=password]")){ cloud.pendingRender=true; return }
  render(); pushMsg="ほかの管理者の変更を読み込みました。"; showStatus();
}
document.addEventListener("focusout",()=>{ if(cloud.pendingRender){ cloud.pendingRender=false; setTimeout(render) } });
function cloudAdmins(list){ cloud.admins=list; if(tab==="admins") render(); }
function viewAdmins(){
  return `<section class="panel">
  <div><h2>管理者</h2><p class="note">ここに登録したメールアドレスの人だけが、管理者画面（部・NGペア・参加者・組み合わせの編集）に入れます。管理者の追加・削除と、アプリ自体の変更はオーナーだけができます。</p></div>
  <div class="box" style="display:grid;gap:8px">
    <div class="aitem"><span class="rolechip">オーナー</span><span class="em">${esc(cloud.email)}</span></div>
    ${cloud.admins.map(e=>`<div class="aitem"><span class="rolechip" style="background:var(--lv2)">管理者</span><span class="em">${esc(e)}</span><button class="x" data-act="delAdmin" data-email="${esc(e)}" aria-label="${esc(e)}を管理者から外す">×</button></div>`).join("")}
    <div class="row"><input type="text" inputmode="email" id="newAdmin" placeholder="管理者にする人のメールアドレス" style="flex:1;min-width:200px" autocomplete="off">
      <button class="btn primary" data-act="addAdmin">追加</button></div>
    <p class="note" id="adminMsg" role="status"></p>
  </div>
  <div class="box" style="display:grid;gap:6px">
    <h3>管理者を増やすときの手順</h3>
    <p class="note">1. Firebase コンソールの「Authentication」→「ユーザー」→「ユーザーを追加」で、その人のメールアドレスと仮のパスワードを作る。<br>2. 上の欄に同じメールアドレスを追加する。<br>3. メールアドレスと仮のパスワードを本人に伝える。</p>
    <p class="note">外すときは × を押します。外した人は、次に開いたときからメンバー画面になります。</p>
  </div></section>`;
}
function viewLogin(){
  return `<section class="panel">
  <div><h2>管理者ログイン</h2><p class="note">オーナーに登録された管理者だけがログインできます。ログインすると、メンバーや部の編集と、組み合わせ作りができます。</p></div>
  ${cloud.denied?`<p class="note" style="color:var(--warn)">${esc(cloud.denied)} は管理者として登録されていません。オーナーに登録を頼んでください。</p>`:""}
  <form class="box" id="loginForm" style="display:grid;gap:10px;max-width:420px">
    <label class="note" for="loginEmail">メールアドレス</label>
    <input type="text" id="loginEmail" inputmode="email" autocomplete="username" value="">
    <label class="note" for="loginPw">パスワード</label>
    <input type="password" id="loginPw" autocomplete="current-password" style="font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:7px 10px">
    <div class="row"><button class="btn primary" type="submit">ログイン</button><span class="note" id="loginMsg" role="status"></span></div>
  </form></section>`;
}
function viewShare(){
  const url=location.href.split(/[?#]/)[0].replace(/index\.html$/,"");
  return det("share","メンバーと共有中","URL・ログアウト",`<p class="note">このURLをメンバーに送ってください。メンバーの画面では、部・NGペア・交流戦の印は出ません（データ自体を送っていません）。</p>
    <div class="row"><input type="text" readonly value="${esc(url)}" style="flex:1;min-width:180px;font-family:var(--f-mono);font-size:13px" aria-label="メンバー用URL">
      <button class="btn" data-act="copyUrl" data-url="${esc(url)}">URLをコピー</button>
      <button class="btn" data-act="logout">ログアウト</button></div>`,"admin");
}

/* ---------- 描画 ---------- */
function render(){
  if(memberOnly()) mode="user";
  const user=mode==="user";
  document.body.classList.toggle("user",user);
  document.body.classList.toggle("owner",cloud.on && cloud.owner);
  if(tab==="admins" && !(cloud.on && cloud.owner && !user)) tab="today";
  const mb=$("#modeBtn"); mb.textContent=user?"メンバー画面":"管理者画面"; mb.setAttribute("aria-pressed",String(!user));
  mb.title=user?"タップで管理者画面に切り替え":"タップでメンバー画面に切り替え";
  if(cloud.on && !cloud.admin){ mb.textContent="管理者ログイン"; mb.title="管理者はここからログイン"; }
  mb.hidden = LOCKED;
  if(tab==="login" && (!cloud.on || cloud.admin)) tab="today";
  if(user&&tab==="members") tab="today";
  document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===tab));
  const m=$("#main");
  // 並べて表示しているときは、それぞれの欄のスクロール位置を描き直しても保つ
  const keep={}; m.querySelectorAll(".pane").forEach(el=>keep[el.dataset.pane]=el.scrollTop);
  const multi=tab==="today" && shownPanes().length>1;
  document.body.classList.toggle("wide",multi);
  if(tab==="members") m.innerHTML=viewMembers();
  if(tab==="today") m.innerHTML=viewToday();
  if(tab==="login") m.innerHTML=viewLogin();
  if(tab==="admins") m.innerHTML=viewAdmins();
  m.querySelectorAll(".pane").forEach(el=>{ if(keep[el.dataset.pane]) el.scrollTop=keep[el.dataset.pane]; });
  setHeaderHeight();
  showStatus();
}
/* 見出し（タブの帯）の高さ。並べて表示するときの各欄の高さに使う */
function setHeaderHeight(){ const h=document.querySelector("header.top"); if(h) document.documentElement.style.setProperty("--hdr",h.offsetHeight+"px"); }
window.addEventListener("resize",setHeaderHeight);
/* 折りたたみの欄（設定・遅刻早退・使い方など）。組み合わせを画面の上のほうに出すため、ふだんは閉じておく。
   開いているかどうかは端末ごとに覚え、描き直しても保つ */
const openDet=new Set(); try{ (JSON.parse(localStorage.getItem("shuttle-open"))||[]).forEach(k=>openDet.add(String(k))) }catch(e){}
function det(k,title,sub,body,cls=""){
  return `<details class="det ${cls}" data-det="${k}" ${openDet.has(k)?"open":""}><summary><span class="dt">${title}</span><span class="ds">${sub}</span></summary><div class="detb">${body}</div></details>`;
}
document.addEventListener("toggle",e=>{ const d=e.target, k=d?.dataset?.det; if(!k) return;
  if(d.open) openDet.add(k); else openDet.delete(k);
  try{ localStorage.setItem("shuttle-open",JSON.stringify([...openDet])) }catch(e){} },true);
/* 今この端末で選べる内容と、表示する内容（メンバー画面では「今日の参加者」は選べない） */
function panesFor(){ const user=document.body.classList.contains("user"); return PANES.filter(p=>!(p.admin&&user)); }
function shownPanes(){ const av=panesFor(); const on=av.filter(p=>panes.includes(p.k)); return on.length?on:av.filter(p=>p.k==="matches"); }
/* 「今日」タブ：今日の参加者・組み合わせ・集計から、表示するものを選んで並べる */
function viewToday(){
  const av=panesFor(), on=shownPanes();
  const html={attend:viewAttend,matches:viewMatches,summary:viewSummary};
  return `<div class="paneSel" role="group" aria-label="表示する内容">
    ${av.map(p=>`<button class="pchip" data-act="pane" data-k="${p.k}" aria-pressed="${on.includes(p)}">${p.label}</button>`).join("")}
    <span class="note">押して表示を切り替え</span></div>
  <div class="panes ${on.length>1?"multi":""}">${on.map(p=>`<div class="pane pane-${p.k}" data-pane="${p.k}">${html[p.k]()}</div>`).join("")}</div>`;
}
function viewMembers(){
  const ngIds=new Set(S.ng.flat());
  const sorted=[...S.members].sort((a,b)=>a.level-b.level||a.id-b.id);
  const opts=sorted.map(m=>`<option value="${m.id}">${esc(m.name)}（${m.level}部）</option>`).join("");
  return `<section class="panel">
  <div><h2>メンバーと部 <span class="no" style="font-size:15px">${S.members.length}/${MAX_MEMBERS}人</span></h2><p class="note">管理者だけが見る画面の想定です。1部が上級者、5部が初心者です。名前はタップすると直せます。</p></div>
  <div class="box">
    ${S.members.length>=MAX_MEMBERS?`<p class="note">登録できるのは${MAX_MEMBERS}人までです。追加するときは、先にほかの人を削除してください。</p>`:`<div class="row">
      <input type="text" id="newName" placeholder="名前を追加" style="flex:1;min-width:140px">
      <select id="newLv">${[1,2,3,4,5].map(l=>`<option value="${l}" ${l===3?"selected":""}>${l}部</option>`).join("")}</select>
      <button class="btn primary" data-act="addMember">追加</button>
    </div>`}
  </div>
  <div class="box mlist">
    ${sorted.map(m=>`<div class="mrow">
      ${lvChip(m.level)}<input type="text" class="nm" data-act="rename" data-id="${m.id}" value="${esc(m.name)}" aria-label="${esc(m.name)}の名前" title="タップして名前を直せます">
      ${ngIds.has(m.id)?'<span class="ngmark" title="NGペアあり">NG</span>':""}
      <div class="seg" role="group" aria-label="${esc(m.name)}の部">
        ${[1,2,3,4,5].map(l=>`<button class="${m.level===l?"on":""}" data-act="setLv" data-id="${m.id}" data-lv="${l}" aria-pressed="${m.level===l}">${l}部</button>`).join("")}
      </div>
      <button class="x" data-act="delMember" data-id="${m.id}" aria-label="${esc(m.name)}を削除">×</button>
    </div>`).join("")}
  </div>
  <div><h2>NGペア</h2><p class="note">ここに登録した2人は同じ試合（味方・相手とも）に入らないよう組みます。</p></div>
  <div class="box">
    <div class="row">
      <select id="ngA" style="flex:1;min-width:130px">${opts}</select>
      <span class="ngmark">×</span>
      <select id="ngB" style="flex:1;min-width:130px">${opts}</select>
      <button class="btn" data-act="addNg">登録</button>
    </div>
    <div class="nglist">${S.ng.map(([a,b],i)=>{const A=byId(a),B=byId(b);if(!A||!B)return"";
      return `<div class="ngitem"><span>${esc(A.name)}</span><span class="sep">×</span><span style="flex:1">${esc(B.name)}</span><button class="x" data-act="delNg" data-i="${i}" aria-label="NGペアを解除">×</button></div>`}).join("")||'<p class="note">まだ登録はありません。</p>'}</div>
  </div>
  </section>`;
}
function viewAttend(){
  const P=players(), num={}; P.forEach(p=>num[p.id]=p.num);
  const W=waitSet(), att=new Set(S.attend);
  const all=[...S.members].sort((a,b)=>(num[a.id]?0:W.has(a.id)?1:2)-(num[b.id]?0:W.has(b.id)?1:2)||(num[a.id]||0)-(num[b.id]||0)||b.level-a.level);
  const dist=[1,2,3,4,5].map(l=>P.filter(p=>p.level===l).length), mx=Math.max(1,...dist);
  return `<section class="panel">
  <div><h2>今日の参加者 <span class="no" style="font-size:15px">${P.length}人${W.size?`＋遅刻${W.size}人`:""}</span></h2>
  <p class="note">チェックした人に、弱い順（5部から）で番号を振ります。番号は当日の呼び出し用です。</p></div>
  <div class="box"><h3>部ごとの人数</h3>
    <div class="dist">${dist.map((n,i)=>`<div class="b"><span>${n}</span><div class="bar lv${i+1}" style="height:${Math.max(3,n/mx*30)}px"></div><span>${i+1}部</span></div>`).join("")}</div>
  </div>
  ${viewPairs(P)}
  <div class="row"><button class="btn" data-act="allOn">全員チェック</button><button class="btn" data-act="allOff">全員外す</button></div>
  <div class="alist">${all.map(m=>`<label class="chk ${att.has(m.id)?"":"off"}">
    <input type="checkbox" id="att-${m.id}" data-act="toggleAttend" data-id="${m.id}" ${att.has(m.id)?"checked":""}>
    <span class="no">${num[m.id]||"–"}</span>${lvChip(m.level)}<span class="nm">${esc(m.name)}</span>${W.has(m.id)?'<span class="ngmark" style="background:var(--cork-soft);color:var(--cork)">遅刻</span>':mkChip(P.find(p=>p.id===m.id)?.mk)}</label>`).join("")}</div>
  </section>`;
}
function viewPairs(P){
  const inPair=new Set(S.tp.flatMap(p=>[p.a,p.b]));
  const free=P.filter(p=>!inPair.has(p.id));
  const opts=free.map(p=>`<option value="${p.id}">${p.num} ${esc(p.name)}（${p.level}部）</option>`).join("");
  const nextK=[0,1,2,3,4,5].find(k=>!S.tp.some(p=>p.k===k));
  return `<div class="box" style="display:grid;gap:10px">
    <div><h3>大会ペア（今日だけ）</h3><p class="note">大会が近いペアを登録すると、その日は1ペアにつき${S.cfg.pairGames}回、2人を味方にした試合を入れます。ペアごとに別のマークが付きます。</p></div>
    ${S.tp.map((p,i)=>{const A=byId(p.a),B=byId(p.b);if(!A||!B)return"";
      const hs=new Set(here()), on=hs.has(p.a)&&hs.has(p.b);
      return `<div class="tpitem">${mkChip(p.k)}<span class="nm">${esc(A.name)} ・ ${esc(B.name)}${on?"":' <span class="note">（どちらかが欠席か到着待ちのため、今は対象外）</span>'}</span><button class="x" data-act="delTp" data-i="${i}" aria-label="大会ペアを解除">×</button></div>`}).join("")}
    ${nextK===undefined||free.length<2?"":`<div class="row">
      <select id="tpA" style="flex:1;min-width:130px">${opts}</select>
      <select id="tpB" style="flex:1;min-width:130px">${free.length>1?opts.replace(`value="${free[1].id}"`,`value="${free[1].id}" selected`):opts}</select>
      <button class="btn" data-act="addTp">マークを付ける</button></div>`}
    <div class="row"><label for="cfgP" class="note">ペア練の回数</label>
      <select id="cfgP">${[3,4].map(n=>`<option value="${n}" ${S.cfg.pairGames===n?"selected":""}>${n}回</option>`).join("")}</select>
      ${S.tp.length?'<button class="btn" data-act="clearTp">今日の大会ペアをすべて解除</button>':""}</div>
  </div>`;
}
function statsStrip(){
  const P=schedule.P, joined=S.day?.joined||{};
  // 時間どおりに来た人どうしで比べる（遅刻者は −1 回まで少なくてよい）
  const onTime=P.filter(p=>joined[p.id]==null);
  const c=onTime.length?onTime.map(p=>schedule.cnt[p.id]||0):[0];
  const sw=P.filter(p=>p.level<=2||p.level>=4);
  const xa=sw.length? (sw.reduce((s,p)=>s+(schedule.xc[p.id]||0),0)/sw.length):0;
  const mn=Math.min(...c), mx=Math.max(...c);
  // 5部の相手（5部と、5部でない人の両方がいる日だけ出す）
  const nb=P.filter(p=>p.level!==5), bv=nb.map(p=>schedule.bc[p.id]||0);
  const showB=nb.length>0&&nb.length<P.length, bmn=showB?Math.min(...bv):0, bmx=showB?Math.max(...bv):0;
  return `<div class="stats">
    <div class="stat"><b>${schedule.rounds.reduce((s,r)=>s+r.games.length,0)}</b><span>試合</span></div>
    <div class="stat ${mx-mn<=1?"good":""}"><b>${mn===mx?mn:mn+"〜"+mx}</b><span>1人あたり試合数${Object.keys(joined).length?"（遅刻者は1回少ないことがあります）":""}</span></div>
    <div class="stat admin"><b>${xa.toFixed(1)}</b><span>交流戦/人（1・2部と4・5部）</span></div>
    ${showB?`<div class="stat admin"><b>${bmn===bmx?bmn:bmn+"〜"+bmx}</b><span>初心者との試合（5部以外の人、回）</span></div>`:""}
    <div class="stat admin ${schedule.ng?"bad":"good"}"><b>${schedule.ng}</b><span>NGペアの同席</span></div>
    ${schedule.pairs.length?`<div class="stat"><b style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${schedule.pairs.map((p,j)=>`<span style="display:inline-flex;gap:3px;align-items:center">${mkChip(p.k)}${schedule.pc[j]}</span>`).join("")}</b><span>大会ペアのペア練（回）</span></div>`:""}
  </div>`;
}
/* 今日の記録の一覧（新しい順） */
function viewLog(){
  const L=dayLog(); if(!L.length) return "";
  const when=e=>e.game?`第${e.game}試合まで開始のとき`:e.done?`第${e.done}ラウンド終了後`:"試合が始まる前";
  return `<div style="display:grid;gap:4px"><h3>今日の記録</h3><div class="logl">${[...L].reverse().map(e=>`<div class="logi">
    <span class="lt">${hhmm(e.at)}</span><span class="ln">${esc(byId(e.id)?.name||"（削除済み）")}</span>
    <span class="lk lk-${e.type}">${LOG_LABEL[e.type]||esc(e.type)}</span><span class="note">${when(e)}</span></div>`).join("")}</div></div>`;
}
/* 複数人を選べるプルダウン。何も選んでいないときは「該当なし」 */
function msel(id, items){
  return `<details class="msel" id="${id}"><summary><span class="msum">該当なし</span></summary><div class="mlist2">${
    items.length ? items.map(it=>`<label class="mopt"><input type="checkbox" value="${it.id}" data-msel="${id}" data-name="${esc(it.name)}"><span>${it.label}</span></label>`).join("")
    : '<p class="note">対象の人はいません</p>'}</div></details>`;
}
function mselValues(id){ return [...document.querySelectorAll(`[data-msel="${id}"]:checked`)].map(x=>+x.value); }
function viewLate(P){
  const done=S.day?.done||0, R=schedule.rounds.length, W=waitSet();
  const waiting=S.wait.map(byId).filter(Boolean);
  const out=S.members.filter(m=>!S.attend.includes(m.id)).sort((a,b)=>a.id-b.id);
  const pl=p=>({id:p.id,name:p.name,label:`<span class="no">${p.num}</span> ${esc(p.name)}`});
  const nlog=dayLog().length;
  const sub=[waiting.length?`<b class="warnc">到着待ち ${waiting.length}人</b>`:"", nlog?`記録 ${nlog}件`:"", !waiting.length&&!nlog?"タップして開く":""].filter(Boolean).join("・");
  return det("late","遅刻・早退",sub,`<p class="note">${done
      ? `第${done}ラウンドまで終了。終わったラウンドはそのままにして、第${done+1}ラウンドから組み直します。`
      : "まだどのラウンドも終わっていないので、全体を組み直します。ラウンドが終わったら「終了」を押してください。"}</p>
    <div style="display:grid;gap:6px"><span class="note">遅刻する人（今日の参加者から選ぶ。来るまで試合に入りません）</span>
      <div class="row">${msel("mLate",P.map(pl))}<button class="btn" data-act="lateMark">遅刻にする</button></div></div>
    ${waiting.length?`<div class="row" style="gap:6px"><span class="note">到着待ち：</span>${waiting.map(m=>`<span class="ngmark" style="background:var(--cork-soft);color:var(--cork)">${esc(m.name)}</span>`).join("")}</div>`:""}
    <div style="display:grid;gap:6px"><span class="note">来た人（到着待ちの人と、参加予定でなかった人から選ぶ）</span>
      <div class="row">${msel("mIn",[...waiting.map(m=>({id:m.id,name:m.name,label:`${esc(m.name)} <span class="note">（遅刻）</span>`})),
        ...out.map(m=>({id:m.id,name:m.name,label:`${esc(m.name)} <span class="note">（予定なし）</span>`}))])}<button class="btn" data-act="lateIn">来た</button></div></div>
    <div style="display:grid;gap:6px"><span class="note">早退する人</span>
      <div class="row">${msel("mOut",P.map(pl))}<button class="btn" data-act="earlyOut">帰った（早退）</button></div></div>
    <p class="note">到着待ちの人が来なくなったときは、「今日の参加者」でチェックを外してください。</p>
    ${viewLog()}
    ${done?`<div class="row"><button class="btn" data-act="resetDay">進行をリセット（最初から組み直す）</button></div>`:""}
    ${done&&done>=R?'<p class="note">全ラウンドが終わりました。</p>':""}`,"admin");
}
function viewMatches(){
  ensure();
  const P=schedule.P, cfg=S.cfg, done=S.day?.done||0;
  const courtName=c=>String.fromCharCode(65+c)+"コート";
  const started=S.day?.started||0, total=schedule.rounds.reduce((n,r)=>n+r.games.length,0);
  const admin=!document.body.classList.contains("user");
  // 管理者は、終わっていないラウンドの、まだ始まっていない試合と休みの人を入れ替えられる
  const canEdit=(ri,g)=>admin && ri>=done && (!g || g.no>started);
  const sel=dnd.sel;
  const pl=(p,ri,g,slot)=>`<div class="p ${String(p.id)===focusId?"hl":""} ${canEdit(ri,g)?"drag":""} ${sel===`${ri}|${slot}`?"picked":""}" ${canEdit(ri,g)?`data-slot="${ri}|${slot}"`:""}><span class="no">${p.num}</span>${lvChip(p.level)}<span class="nm">${esc(p.name)}</span>${mkChip(p.mk)}</div>`;
  return `<section class="panel">
  <div class="row"><h2 style="margin-right:auto">組み合わせ</h2><button class="btn primary admin" data-act="regen">${done?"残りを組み直す":"組み直す"}</button></div>
  ${det("cfg","設定",`${cfg.matches}試合・${cfg.courts}面・交流戦 ${cfg.cross}回/人`,`<div class="cfg">
    <label for="cfgM">試合数<input type="number" id="cfgM" min="1" max="80" value="${cfg.matches}"></label>
    <label for="cfgC">コート数<input type="number" id="cfgC" min="1" max="8" value="${cfg.courts}"></label>
    <label for="cfgX">交流戦の目安（回/人）<input type="number" id="cfgX" min="0" max="5" step="0.5" value="${cfg.cross}"></label>
  </div><p class="note">数字を変えたら「組み直す」を押してください。</p>`,"admin")}
  ${viewLate(P)}
  ${cloud.on&&cloud.admin?viewShare():""}
  ${cloud.on&&!cloud.admin&&S.day&&S.day.date!==TODAY?`<p class="note">${esc(S.day.date)} の組み合わせです。今日の分はまだ出ていません。</p>`:""}
  ${!schedule.rounds.length&&cloud.on&&!cloud.admin?`<p class="note">${cloud.ready?"まだ組み合わせが出ていません。管理者が作ると、ここに出ます。":"読み込み中…"}</p>`:
    P.length<4&&!schedule.rounds.length?'<p class="note">参加者が4人以上いると組み合わせを作れます。</p>':(shownPanes().some(p=>p.k==="summary")?"":statsStrip())+`
  <div class="row"><label for="focus" class="note">選手を強調</label>
    <select id="focus" style="flex:1;max-width:260px"><option value="">（なし）</option>${P.map(p=>`<option value="${p.id}" ${String(p.id)===focusId?"selected":""}>${p.num} ${esc(p.name)}</option>`).join("")}</select>
</div>
  ${total?`<div class="progress">${started?`<span class="pill">第${started}試合まで開始</span>${started<total?`<span>次は第${started+1}試合</span>`:"<span>全試合が始まりました</span>"}`:"<span>まだ試合は始まっていません</span>"}</div>`:""}
  ${det("help","印の意味と使い方","タップして開く",`<div class="legend"><span class="it"><span class="tag pr">ペア練</span>大会ペアが味方で出る試合</span><span class="it"><span class="tag next">次</span>次にコートに入る試合</span></div>
    <div class="legend admin"><span class="it"><span class="tag">交流戦</span>1・2部と4・5部を混ぜた試合、または部の差が3以上の人（味方・相手とも）がいる試合</span></div>
    <p class="note admin">試合がコートに入ったら、その試合の「開始」を押してください。グレーになり、メンバーの画面にも同じように出ます。</p>
    <p class="note admin">組み合わせを手で直すときは、名前をつかんで（スマホは少し長押しして）入れ替えたい人の上に落とします。2人を続けてタップしても入れ替わります。同じラウンドの中で、まだ始まっていない試合と休みの人が対象です。</p>`)}
  ${schedule.rounds.map((r,ri)=>`<div class="round ${ri<done?"done":""}">
    <div class="rhead"><span class="rn">第${ri+1}ラウンド</span>
      ${ri<done?'<span class="tag ok">終了</span>':""}
      ${canEdit(ri)&&r.rest.length?`<span class="rest">休み：</span>`:`<span class="rest">休み：${r.rest.map(p=>p.num).join("・")||"なし"}</span>`}
      ${ri===done?`<button class="btn sm admin" data-act="doneRound" data-i="${ri}">終了</button>`:""}
      ${ri===done-1?`<button class="btn sm admin" data-act="undoRound" data-i="${ri}">終了を取り消す</button>`:""}</div>
    ${canEdit(ri)&&r.rest.length?`<div class="restchips">${r.rest.map((p,k)=>`<span class="rchip drag ${sel===`${ri}|r|${k}`?"picked":""}" data-slot="${ri}|r|${k}"><span class="no">${p.num}</span>${esc(p.name)}</span>`).join("")}</div>`:""}
    <div class="courts">${r.games.map((g,gi)=>{
      const has=focusId&&g.teams.flat().some(p=>String(p.id)===focusId);
      const sum=t=>t[0].level+t[1].level;
      const on=g.no<=started, next=ri>=done&&g.no===started+1;
      return `<div class="match ${g.cross?"cross":""} ${on?"started":""} ${next?"next":""} ${focusId&&!has?"dim":""}">
        <div class="mh"><span class="mno">第${g.no}試合</span><span>${courtName(g.court)}</span>${next?'<span class="tag next">次</span>':""}
        ${g.bad.length?'<span class="tag bad admin">NG同席</span>':""}${g.cross?'<span class="tag admin">交流戦</span>':""}${g.pm.length?`<span class="tag pr">ペア練 ${g.pm.map(mkChip).join("")}</span>`:""}
        ${on&&!admin?'<span class="tag">開始済み</span>':""}
        ${admin&&g.no===started+1?`<button class="btn go admin" data-act="startGame" data-no="${g.no}">開始</button>`:""}
        ${admin&&g.no===started?`<button class="btn undo admin" data-act="unstartGame" data-no="${g.no}">開始を取り消す</button>`:""}</div>
        <div class="teams">
          <div class="team">${g.teams[0].map((p,k)=>pl(p,ri,g,`g|${gi}|0|${k}`)).join("")}<span class="tsum">部の合計 ${sum(g.teams[0])}</span></div>
          <div class="net" aria-hidden="true"></div>
          <div class="team">${g.teams[1].map((p,k)=>pl(p,ri,g,`g|${gi}|1|${k}`)).join("")}<span class="tsum">部の合計 ${sum(g.teams[1])}</span></div>
        </div></div>`}).join("")}</div>
  </div>`).join("")}`}
  </section>`;
}
function viewSummary(){
  ensure();
  const games=schedule.rounds.flatMap((r,ri)=>r.games.map(g=>({...g,ri})));
  // 今の参加者のあとに、早退した人（試合に出た記録がある人）を並べる
  const inP=new Set(schedule.P.map(p=>p.id)), gone=new Map();
  games.forEach(g=>g.teams.flat().forEach(p=>{if(!inP.has(p.id)) gone.set(p.id,p)}));
  const P=[...schedule.P,...gone.values()];
  const joined=S.day?.joined||{};
  const arr=p=>{ const t=arrivedAt(p.id); return t?`・${hhmm(t)}着`:""; };
  const st=p=>!inP.has(p.id)?' <span class="note">（早退）</span>':joined[p.id]===0?` <span class="note">（遅刻${arr(p)}）</span>`:joined[p.id]!=null?` <span class="note">（第${joined[p.id]+1}Rから${arr(p)}）</span>`:"";
  const R=schedule.rounds.length;
  const showB=schedule.P.some(p=>p.level===5)&&schedule.P.some(p=>p.level!==5); // 5部の相手の欄を出すか
  // 今までに入った試合：「開始」を押した試合と、終わったラウンドの試合
  const started=S.day?.started||0, done=S.day?.done||0;
  const played=g=>g.no<=started||g.ri<done;
  const now={}; games.filter(played).forEach(g=>g.teams.flat().forEach(p=>now[p.id]=(now[p.id]||0)+1));
  const playedN=games.filter(played).length;
  const nowVals=schedule.P.map(p=>now[p.id]||0), nmin=nowVals.length?Math.min(...nowVals):0, nmax=nowVals.length?Math.max(...nowVals):0;
  return `<section class="panel">
  <h2>集計</h2>
  ${det("sumhelp","見方","今まで・予定・マス目の意味",`<p class="note">「今まで」は、もうコートに入った試合の数（「開始」を押した試合まで）です。「予定」は今日の全部の試合の数です。橙の数字は、今いちばん少ない人です。</p>
    <p class="note">行をタップすると、組み合わせでその人の試合を強調します。マス目は各ラウンドの出場で、濃いマスが入った試合、薄いマスがこれからの試合です<span class="admin">（橙は交流戦）</span>。</p>
    ${showB?'<p class="note admin">「初心者との試合」は、5部（初心者）の人がいる試合に入った回数で、交流戦とは別に数えています（5部の人は「–」）。</p>':""}`)}
  ${games.length?`<div class="progress"><span class="pill">今まで ${playedN}試合 / 全${games.length}試合</span>${playedN?`<span>今いる人の今までの試合数：${nmin===nmax?nmin:nmin+"〜"+nmax}回</span>`:"<span>まだ試合は始まっていません</span>"}</div>`:""}
  ${schedule.P.length<4&&!games.length?"":statsStrip()}
  <div class="tablewrap"><table>
    <thead><tr><th>番号</th><th>名前</th><th class="admin">部</th><th style="text-align:right">今まで</th><th style="text-align:right">予定</th><th class="admin" style="text-align:right">交流戦</th>${showB?'<th class="admin" style="text-align:right">初心者と</th>':""}<th style="text-align:right">ペア練</th><th>ラウンド別</th></tr></thead>
    <tbody>${P.map(p=>{
      const mine=games.filter(g=>g.teams.flat().some(q=>q.id===p.id));
      const pips=[...Array(R)].map((_,ri)=>{const g=mine.find(x=>x.ri===ri);return `<span class="pip ${g?(g.cross?"x":"on"):""} ${g&&!played(g)?"fut":""}"></span>`}).join("");
      const nn=now[p.id]||0, low=playedN&&inP.has(p.id)&&nn===nmin&&nmin<nmax;
      return `<tr class="click" data-act="focusP" data-id="${p.id}" tabindex="0"><td class="n">${p.num}</td><td>${esc(p.name)}${st(p)}</td><td class="admin">${lvChip(p.level)}</td>
      <td class="n now ${low?"low":""}" ${low?'title="今いちばん少ない人"':""}>${nn}</td><td class="n">${schedule.cnt[p.id]||0}</td><td class="n admin">${schedule.xc[p.id]||0}</td>${showB?`<td class="n admin">${p.level===5?"–":(schedule.bc[p.id]||0)}</td>`:""}<td class="n">${p.mk==null?"–":mkChip(p.mk)+" "+(schedule.ppc[p.id]||0)}</td><td><div class="pips">${pips}</div></td></tr>`}).join("")}</tbody>
  </table></div>
  </section>`;
}

/* ---------- 操作 ---------- */
/* ---------- 手で入れ替える（ドラッグ＆ドロップ、またはタップ2回） ----------
   slot は "ラウンド|g|試合|チーム|位置" か "ラウンド|r|休みの何番目"。同じラウンドの中でだけ入れ替える */
const dnd={sel:null, drag:null};
function slotRef(rd, parts){ return parts[0]==="r" ? {arr:rd.rest, i:+parts[1]} : {arr:rd.games[+parts[1]].teams[+parts[2]], i:+parts[3]}; }
function swapSlots(a,b){
  const [ra,...pa]=a.split("|"), [rb,...pb]=b.split("|");
  if(a===b) return;
  if(ra!==rb){ popup("入れ替えられるのは、同じラウンドの中だけです。"); return; }
  const ri=+ra, rd=S.day?.rounds?.[ri]; if(!rd) return;
  const A=slotRef(rd,pa), B=slotRef(rd,pb);
  const t=A.arr[A.i]; A.arr[A.i]=B.arr[B.i]; B.arr[B.i]=t;
  // 入れ替えた試合のペア練と交流戦の印を付け直す
  const pairs=todayPairs(), lv=id=>byId(id)?.level||3;
  rd.games.forEach(g=>{
    g.pm=pairs.filter(pr=>g.teams.some(tm=>tm.includes(pr.a)&&tm.includes(pr.b))).map(pr=>pr.k);
    const ls=g.teams.flat().map(lv); g.cross=(Math.min(...ls)<=2&&Math.max(...ls)>=4)||Math.max(...ls)-Math.min(...ls)>=3;
  });
  rd.rest.sort((x,y)=>(S.day.nums?.[x]??0)-(S.day.nums?.[y]??0));
  if(!S.day.nums){ S.day.nums={}; schedule.P.forEach(p=>S.day.nums[p.id]=p.num); } // 手で直したら番号も固定する
  schedule=null; stale=false; save(); render();
  const ng=schedule?.rounds?.[ri]?.games.some(g=>g.bad.length);
  popup(ng?"入れ替えました（NGペアが同じ試合にいます）":"入れ替えました。");
}
function dndCleanup(){
  const d=dnd.drag; if(!d) return;
  clearTimeout(d.timer); d.ghost?.remove(); d.el.classList.remove("dragging"); document.body.classList.remove("nosel");
  document.querySelectorAll(".drop").forEach(x=>x.classList.remove("drop"));
  dnd.drag=null;
}
function dndBegin(){
  const d=dnd.drag; if(!d) return;
  d.active=true; d.el.classList.add("dragging"); document.body.classList.add("nosel"); getSelection?.().removeAllRanges();
  const r=d.el.getBoundingClientRect(), g=d.el.cloneNode(true);
  g.className="ghost"; g.style.width=r.width+"px"; g.style.left=(d.x-r.width/2)+"px"; g.style.top=(d.y-r.height/2)+"px";
  document.body.appendChild(g); d.ghost=g; d.w=r.width; d.h=r.height;
  navigator.vibrate?.(10);
}
document.addEventListener("pointerdown",e=>{
  const el=e.target.closest("[data-slot]"); if(!el||e.button>0) return;
  if(e.pointerType==="mouse") e.preventDefault(); // マウスで文字が選択されないように
  dndCleanup();
  dnd.drag={el,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,type:e.pointerType,active:false,timer:null};
  if(e.pointerType!=="mouse") dnd.drag.timer=setTimeout(dndBegin,220); // スマホは少し長押ししてから
});
document.addEventListener("pointermove",e=>{
  const d=dnd.drag; if(!d) return;
  d.x=e.clientX; d.y=e.clientY;
  const dist=Math.hypot(d.x-d.sx,d.y-d.sy);
  if(!d.active){
    if(d.type==="mouse"&&dist>5) dndBegin();
    else if(d.type!=="mouse"&&dist>10){ clearTimeout(d.timer); dnd.drag=null; } // 長押しの前に動いたら画面のスクロール
    return;
  }
  d.ghost.style.left=(d.x-d.w/2)+"px"; d.ghost.style.top=(d.y-d.h/2)+"px";
  document.querySelectorAll(".drop").forEach(x=>x.classList.remove("drop"));
  const t=document.elementFromPoint(d.x,d.y)?.closest("[data-slot]");
  if(t&&t!==d.el) t.classList.add("drop");
});
document.addEventListener("touchmove",e=>{ if(dnd.drag?.active) e.preventDefault(); },{passive:false});
document.addEventListener("pointerup",e=>{
  const d=dnd.drag; if(!d) return;
  if(d.active){
    const t=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-slot]");
    const a=d.el.dataset.slot, b=t?.dataset.slot;
    dndCleanup(); dnd.sel=null;
    if(b&&b!==a) swapSlots(a,b); else render();
    return;
  }
  // タップ：1人目を選び、2人目をタップすると入れ替える
  dndCleanup();
  const a=d.el.dataset.slot;
  if(!dnd.sel){ dnd.sel=a; render(); }
  else if(dnd.sel===a){ dnd.sel=null; render(); }
  else { const s0=dnd.sel; dnd.sel=null; swapSlots(s0,a); }
});
document.addEventListener("pointercancel",dndCleanup);
document.addEventListener("contextmenu",e=>{ if(e.target.closest("[data-slot]")) e.preventDefault(); });

function changed(regen){ if(regen) stale=true; save(); render(); }
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab]");
  if(t){tab=t.dataset.tab;try{localStorage.setItem("shuttle-tab",tab)}catch(_){}render();return}
  const a=e.target.closest("[data-act]"); if(!a) return;
  const id=+a.dataset.id, act=a.dataset.act;
  if(act==="setLv"){byId(id).level=+a.dataset.lv;changed(true)}
  if(act==="delMember"){S.members=S.members.filter(m=>m.id!==id);S.attend=S.attend.filter(x=>x!==id);S.ng=S.ng.filter(p=>!p.includes(id));S.tp=S.tp.filter(p=>p.a!==id&&p.b!==id);S.wait=(S.wait||[]).filter(x=>x!==id);changed(true)}
  if(act==="addMember"){if(S.members.length>=MAX_MEMBERS){popup(`登録できるのは${MAX_MEMBERS}人までです。`);return}const n=$("#newName")?.value.trim();if(!n)return;const nid=S.nextId++;S.members.push({id:nid,name:n,level:+$("#newLv").value});S.attend.push(nid);changed(true)}
  if(act==="addNg"){const x=+$("#ngA").value,y=+$("#ngB").value;if(x===y||isNg(x,y))return;S.ng.push([x,y]);changed(true)}
  if(act==="delNg"){S.ng.splice(+a.dataset.i,1);changed(true)}
  if(act==="addTp"){const x=+$("#tpA").value,y=+$("#tpB").value;if(!x||!y||x===y)return;
    const k=[0,1,2,3,4,5].find(k=>!S.tp.some(p=>p.k===k));if(k===undefined)return;S.tp.push({a:x,b:y,k});changed(true)}
  if(act==="delTp"){S.tp.splice(+a.dataset.i,1);changed(true)}
  if(act==="clearTp"){S.tp=[];changed(true)}
  if(act==="allOn"){S.attend=S.members.map(m=>m.id);changed(true)}
  if(act==="allOff"){S.attend=[];changed(true)}
  if(act==="regen"){
    S.cfg.matches=Math.max(1,Math.min(80,+$("#cfgM").value||30));
    S.cfg.courts=Math.max(1,Math.min(8,+$("#cfgC").value||3));
    S.cfg.cross=Math.max(0,+$("#cfgX").value||0);
    announce=true; changed(true);
  }
  if(act==="doneRound"){ensure();const dy=S.day;
    if(!dy.nums){dy.nums={};schedule.P.forEach(p=>dy.nums[p.id]=p.num)} // 始まったら番号を固定
    dy.done=+a.dataset.i+1;changed(false)}
  if(act==="undoRound"){S.day.done=+a.dataset.i;changed(false)}
  if(act==="startGame"){ensure();const dy=S.day;
    if(!dy.nums){dy.nums={};schedule.P.forEach(p=>dy.nums[p.id]=p.num)} // 始まったら番号を固定
    dy.started=+a.dataset.no;changed(false)}
  if(act==="unstartGame"){S.day.started=Math.max(0,+a.dataset.no-1);changed(false)}
  if(act==="lateMark"){const xs=mselValues("mLate");if(!xs.length)return;announce=true;waitSet();
    const nw=xs.filter(x=>!S.wait.includes(x)); logEv("wait",nw);
    S.wait=[...new Set([...S.wait,...xs])];changed(true)}
  if(act==="lateIn"){const xs=mselValues("mIn");if(!xs.length)return;announce=true;waitSet();
    if(S.arrivedDate!==TODAY){S.arrived=[];S.arrivedDate=TODAY} S.arrived=[...new Set([...S.arrived,...xs])];
    logEv("arrive",xs.filter(x=>S.wait.includes(x))); logEv("join",xs.filter(x=>!S.wait.includes(x)));
    S.wait=S.wait.filter(y=>!xs.includes(y)); xs.forEach(x=>{ if(!S.attend.includes(x)) S.attend.push(x) });changed(true)}
  if(act==="earlyOut"){const xs=mselValues("mOut");if(!xs.length)return;announce=true; logEv("leave",xs);
    S.attend=S.attend.filter(y=>!xs.includes(y)); S.wait=(S.wait||[]).filter(y=>!xs.includes(y));changed(true)}
  if(act==="resetDay"){if(!confirm("終わったラウンドの記録を消して、最初から組み直しますか？"))return;S.day=null;changed(true)}
  if(act==="mode"&&cloud.on&&!cloud.admin){tab=tab==="login"?"today":"login";render();return}
  if(act==="pane"){ // 表示する内容の切り替え（最低1つは残す）
    const k=a.dataset.k, on=shownPanes().map(p=>p.k);
    const next=on.includes(k)?on.filter(x=>x!==k):PANES.map(p=>p.k).filter(x=>x===k||on.includes(x));
    if(!next.length){ popup("どれか1つは表示してください。"); return; }
    panes=next; try{localStorage.setItem("shuttle-panes",JSON.stringify(panes))}catch(_){}
    render(); return; }
  if(act==="logout"){window.cloudApi?.signOut();return}
  if(act==="addAdmin"){const inp=$("#newAdmin"), v=inp.value.trim().toLowerCase(), msg=$("#adminMsg");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){msg.textContent="メールアドレスの形になっていません。";return}
    if(v===cloud.email){msg.textContent="オーナーは登録しなくても管理者です。";return}
    inp.value=""; window.cloudApi?.addAdmin(v).then(()=>{const m2=$("#adminMsg"); if(m2) m2.textContent=v+" を管理者にしました。"},err=>{const m2=$("#adminMsg"); if(m2) m2.textContent="追加できませんでした（"+(err.code||err.message)+"）"}); return}
  if(act==="delAdmin"){const v=a.dataset.email; window.cloudApi?.removeAdmin(v).catch(err=>{const m2=$("#adminMsg"); if(m2) m2.textContent="外せませんでした（"+(err.code||err.message)+"）"}); return}
  if(act==="copyUrl"){navigator.clipboard?.writeText(a.dataset.url).then(()=>{a.textContent="コピーしました"},()=>{});return}
  if(act==="mode"&&LOCKED) return;
  if(act==="mode"){mode=mode==="user"?"admin":"user";try{localStorage.setItem("shuttle-mode",mode)}catch(_){}render();return}
  if(act==="focusP"){focusId=String(id);tab="today";
    if(!shownPanes().some(p=>p.k==="matches")){ panes=[...new Set([...panes,"matches"])]; try{localStorage.setItem("shuttle-panes",JSON.stringify(panes))}catch(_){} }
    render(); // その人の最初の試合が見えるところまで動かす
    const hl=document.querySelector(".pane-matches .p.hl"); if(hl) hl.scrollIntoView({block:"center",behavior:"smooth"}); else window.scrollTo(0,0); }
});
document.addEventListener("change",e=>{
  if(e.target.dataset.act==="toggleAttend"){const id=+e.target.dataset.id;
    S.attend=e.target.checked?[...S.attend,id]:S.attend.filter(x=>x!==id);
    if(!e.target.checked && waitSet().has(id)) logEv("absent",[id]);
    if(!e.target.checked) S.wait=(S.wait||[]).filter(x=>x!==id);changed(true)}
  if(e.target.dataset.msel){const box=document.getElementById(e.target.dataset.msel);
    const names=[...box.querySelectorAll("input:checked")].map(x=>x.dataset.name);
    box.querySelector(".msum").textContent=!names.length?"該当なし":names.length<=2?names.join("、"):`${names.slice(0,2).join("、")} ほか${names.length-2}人`;}
  if(e.target.id==="focus"){focusId=e.target.value;render()}
  if(e.target.dataset.act==="rename"){const m=byId(+e.target.dataset.id), n=e.target.value.trim();
    if(!m) return; if(!n){e.target.value=m.name;return}
    // 名前だけなので組み合わせはそのまま。描き直すと次のボタン操作が消えるので、保存だけする
    m.name=n; schedule=null; save()}
  if(e.target.id==="cfgP"){S.cfg.pairGames=+e.target.value;changed(true)}
});
document.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&e.target.id==="newName"){document.querySelector('[data-act="addMember"]').click()}
  if(e.key==="Enter"&&e.target.id==="newAdmin"){document.querySelector('[data-act="addAdmin"]').click()}
  if(e.key==="Enter"&&e.target.dataset.act==="rename") e.target.blur();
  if(e.key==="Enter"&&e.target.matches("tr.click")) e.target.click();
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="loginForm") return;
  e.preventDefault();
  const msg=$("#loginMsg"), btn=e.target.querySelector("button");
  if(!window.cloudApi){msg.textContent="共有サーバーにつながっていません。ネットにつながっているか確かめてください。";return}
  btn.disabled=true; msg.textContent="ログイン中…";
  try{ await window.cloudApi.signIn($("#loginEmail").value.trim(),$("#loginPw").value) }
  catch(err){ msg.textContent=({"auth/invalid-credential":"メールアドレスかパスワードが違います。","auth/wrong-password":"パスワードが違います。","auth/too-many-requests":"失敗が続いたので、しばらく待ってからもう一度試してください。","auth/network-request-failed":"ネットにつながっていません。"})[err.code]||("ログインできませんでした（"+err.code+"）"); btn.disabled=false; }
});
$("#today").textContent=TODAY;
render();
if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
