// QRコードを作る（外部のサービスは使わない）。8ビットモード・誤り訂正レベルM・型番1〜6（106バイトまで）。
// qrMatrix(文字列) → true/false の2次元配列（true が黒）。長すぎるときは null。
// qrSvg(文字列, 余白) → SVG の文字列。
(function(){
  // 型番ごとの [データのバイト数, ブロック数, ブロックごとの訂正バイト数]
  const VER=[null,[16,1,10],[28,1,16],[44,1,26],[64,2,18],[86,2,24],[108,4,16]];
  const EXP=new Uint8Array(512), LOG=new Uint8Array(256);
  for(let i=0,x=1;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&256) x^=0x11D; }
  for(let i=255;i<512;i++) EXP[i]=EXP[i-255];
  const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
  function rs(data,n){ // リード・ソロモンの訂正バイト
    let g=[1];
    for(let i=0;i<n;i++){ const ng=new Array(g.length+1).fill(0);
      for(let j=0;j<g.length;j++){ ng[j]^=g[j]; ng[j+1]^=mul(g[j],EXP[i]); } g=ng; }
    const r=new Array(n).fill(0);
    for(const b of data){ const f=b^r.shift(); r.push(0); for(let j=0;j<n;j++) r[j]^=mul(g[j+1],f); }
    return r;
  }
  function qrMatrix(text){
    const bytes=[...new TextEncoder().encode(String(text))];
    let v=1; while(v<=6 && bytes.length+2>VER[v][0]) v++;
    if(v>6) return null;
    const [nd,nb,ne]=VER[v], bits=[];
    const put=(val,len)=>{ for(let i=len-1;i>=0;i--) bits.push(val>>>i&1); };
    put(4,4); put(bytes.length,8); bytes.forEach(b=>put(b,8));
    put(0,Math.min(4,nd*8-bits.length)); while(bits.length%8) bits.push(0);
    const data=[]; for(let i=0;i<bits.length;i+=8) data.push(parseInt(bits.slice(i,i+8).join(""),2));
    for(let p=0;data.length<nd;p^=1) data.push(p?0x11:0xEC);
    const bl=nd/nb, blocks=[], ecs=[];
    for(let b=0;b<nb;b++){ const d=data.slice(b*bl,(b+1)*bl); blocks.push(d); ecs.push(rs(d,ne)); }
    const all=[];
    for(let i=0;i<bl;i++) for(const b of blocks) all.push(b[i]);
    for(let i=0;i<ne;i++) for(const e of ecs) all.push(e[i]);

    const n=17+4*v, M=[], F=[]; // M＝黒かどうか、F＝決まった模様（データを置かない所）
    for(let y=0;y<n;y++){ M.push(new Array(n).fill(false)); F.push(new Array(n).fill(false)); }
    const set=(x,y,d)=>{ if(x<0||y<0||x>=n||y>=n) return; M[y][x]=!!d; F[y][x]=true; };
    const finder=(cx,cy)=>{ for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){
      const m=Math.max(Math.abs(dx),Math.abs(dy)); set(cx+dx,cy+dy,m!==2&&m!==4); } };
    finder(3,3); finder(n-4,3); finder(3,n-4);
    for(let i=8;i<n-8;i++){ set(i,6,i%2===0); set(6,i,i%2===0); }
    if(v>=2){ const c=n-7; for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++)
      set(c+dx,c+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1); }
    const format=mask=>{ const d=mask; let r=d; // 訂正レベルMは 00
      for(let i=0;i<10;i++) r=(r<<1)^((r>>>9)*0x537);
      const f=((d<<10)|r)^0x5412, bit=i=>f>>>i&1;
      for(let i=0;i<=5;i++) set(8,i,bit(i));
      set(8,7,bit(6)); set(8,8,bit(7)); set(7,8,bit(8));
      for(let i=9;i<15;i++) set(14-i,8,bit(i));
      for(let i=0;i<8;i++) set(n-1-i,8,bit(i));
      for(let i=8;i<15;i++) set(8,n-15+i,bit(i));
      set(8,n-8,1); };
    format(0);
    // データをジグザグに置く
    let k=0; const total=all.length*8;
    for(let right=n-1;right>=1;right-=2){ if(right===6) right=5;
      for(let vert=0;vert<n;vert++) for(let j=0;j<2;j++){
        const x=right-j, up=((right+1)&2)===0, y=up?n-1-vert:vert;
        if(F[y][x]) continue;
        M[y][x]= k<total ? (all[k>>>3]>>>(7-(k&7))&1)===1 : false; k++; } }
    const MASK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,
      (x,y)=>((x/3|0)+(y/2|0))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
    const apply=m=>{ for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(!F[y][x]&&MASK[m](x,y)) M[y][x]=!M[y][x]; };
    const penalty=()=>{ let p=0, dark=0;
      for(let y=0;y<n;y++){ let rx=1, ry=1;
        for(let x=0;x<n;x++){ if(M[y][x]) dark++;
          if(x){ if(M[y][x]===M[y][x-1]){ rx++; if(rx===5) p+=3; else if(rx>5) p++; } else rx=1;
                 if(M[x][y]===M[x-1][y]){ ry++; if(ry===5) p+=3; else if(ry>5) p++; } else ry=1; }
          if(x&&y&&M[y][x]===M[y][x-1]&&M[y][x]===M[y-1][x]&&M[y][x]===M[y-1][x-1]) p+=3; } }
      return p+Math.floor(Math.abs(dark*20-n*n*10)/(n*n))*10; };
    let best=0, bp=Infinity;
    for(let m=0;m<8;m++){ apply(m); format(m); const p=penalty(); if(p<bp){ bp=p; best=m; } apply(m); }
    apply(best); format(best);
    return M;
  }
  function qrSvg(text,quiet=4){
    const M=qrMatrix(text); if(!M) return "";
    const n=M.length, s=n+quiet*2; let d="";
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) if(M[y][x]) d+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="QRコード"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  window.qrMatrix=qrMatrix; window.qrSvg=qrSvg;
})();
