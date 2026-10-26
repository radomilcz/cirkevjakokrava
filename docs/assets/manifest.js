(function(){
  const deck=document.getElementById('deck');
  const track=document.getElementById('track');
  const slides=[...track.querySelectorAll('.slide')];
  const rail=document.getElementById('rail');
  const bar=document.getElementById('bar');
  const hint=document.getElementById('hint');
  const N=slides.length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- fleky: rozmístění po otisku 1:1 podle Figmy (rámeček 1920×1080) ----------
     Místo otisku jsou fleky z Figmy (Fleky → Atlas fleků single, mrak_01–05). Každý slajd má svůj
     tvar (f), sousedé se neopakují; některé mají ještě druhý, menší flek (dva: střed x,y a šířka w
     v pixelech rámu, r = rotace). Druhý flek je umístěný tak, aby se s hlavním nepřekrýval –
     ověřeno podle skutečného tvaru (průhlednosti) obou fleků, ne jen obalových obdélníků. Poloha a rotace hlavního fleku zůstaly po otisku – x,y je levý
     horní roh obalového boxu otočené skupiny 816×997, r je rotace ve Figmě. */
  const FLEKY={'01':[1108,1197],'02':[1225,770],'03':[1159,1163],'04':[907,1114],'05':[1285,940]};
  const PRINT={
    '01':     {x:851, y:115,  r:90,   f:'01'},
    '02':     {x:283, y:370,  r:-75,  f:'03', dva:{f:'02',x:1600,y:190,w:580,r:-12}},
    '03':     {x:549, y:-471, r:60,   f:'02'},
    '04':     {x:-367,y:228,  r:60,   f:'01', dva:{f:'04',x:1680,y:650,w:560,r:18}},
    '05':     {x:446, y:132,  r:-90,  f:'05'},
    '06a':    {x:483, y:121,  r:-90,  f:'04'},
    'h01':    {x:324, y:-3,   r:-120, f:'03'},
    'h02':    {x:324, y:-34,  r:-120, f:'03'},
    'h01b':   {x:324, y:-34,  r:-120, f:'03'},
    'h03':    {x:439, y:118,  r:90,   f:'05'},
    'h04':    {x:302, y:-111, r:60,   f:'04', dva:{f:'02',x:1600,y:220,w:560,r:8}},
    'h05':    {x:384, y:17,   r:-105, f:'01'},
    'h06':    {x:384, y:0,    r:75,   f:'02'},
    'h07':    {x:351, y:-126, r:-45,  f:'03', dva:{f:'05',x:1640,y:820,w:580,r:-20}},
    'h08':    {x:336, y:-139, r:30,   f:'04'},
    'h09':    {x:373, y:17,   r:-105, f:'05'},
    'h10':    {x:396, y:0,    r:-75,  f:'01', dva:{f:'03',x:240,y:690,w:540,r:25}},
    'h11':    {x:404, y:38,   r:99,   f:'02'},
    'zrcadlo':{x:373, y:0,    r:75,   f:'03'}
  };
  /* Obalový box se počítá ze skupiny otisku 816×997 (Figma točí proti směru hodin, CSS po směru →
     css = 90 − r). Flek se do něj vejde s plochou zhruba jako otisk, poměr stran má vlastní. */
  const PLOCHA=998*1078;
  Object.values(PRINT).forEach(c=>{const a=c.r*Math.PI/180,C=Math.abs(Math.cos(a)),S=Math.abs(Math.sin(a));
    c.w=816*C+997*S;c.h=816*S+997*C;c.rot=90-c.r});
  const flek=f=>'<div class="sweep"><img class="flek" alt="" decoding="async" data-src="assets/fleky/mrak'+f+'.webp"></div>';
  slides.forEach(s=>{
    const k=s.dataset.print;if(!k)return;const c=PRINT[k];
    const [fw,fh]=FLEKY[c.f],sirka=Math.sqrt(PLOCHA*fw/fh);
    const d=document.createElement('div');d.className='print';
    d.style.cssText=`left:${c.x/19.2}%;top:${c.y/10.8}%;width:${c.w/19.2}%;height:${c.h/10.8}%`;
    const r=document.createElement('div');r.className='rot';
    r.style.cssText=`width:${sirka/c.w*100}%;aspect-ratio:${fw}/${fh};transform:translate(-50%,-50%) rotate(${c.rot}deg)`;
    r.innerHTML=flek(c.f);d.appendChild(r);
    if(c.dva){
      const v=c.dva,[w2,h2]=FLEKY[v.f],e=document.createElement('div');e.className='print dva';
      e.style.cssText=`left:${(v.x-v.w/2)/19.2}%;top:${(v.y-v.w*h2/w2/2)/10.8}%;width:${v.w/19.2}%;aspect-ratio:${w2}/${h2};rotate:${v.r}deg`;
      e.innerHTML=flek(v.f);s.prepend(e);
    }
    s.prepend(d);
  });
  /* obrázek se stáhne, až slajd poprvé přijde na řadu */
  function drawPrint(s){s.querySelectorAll('.print img[data-src]').forEach(i=>{i.src=i.dataset.src;i.removeAttribute('data-src')})}
  function clearPrint(){}

  /* ---------- lišta s tečkami ---------- */
  slides.forEach((s,i)=>{
    if(s.hasAttribute('data-predel')){const sep=document.createElement('li');sep.className='sep';rail.appendChild(sep)}  /* předěl z CMS */
    const li=document.createElement('li');const b=document.createElement('button');
    b.type='button';b.setAttribute('aria-label','Slajd '+(i+1));b.addEventListener('click',()=>go(i));
    li.appendChild(b);rail.appendChild(li);s._dot=b;
  });

  /* ---------- přebarvení pevných prvků podle slajdu, který je zrovna pod nimi ----------
     Track jede celou vteřinu, ale progress bar sedí na horní hraně a index uprostřed –
     nové pozadí k nim dojede v jinou chvíli. Tak se každý prvek ptá na slajd ve své výšce
     a překlopí se přesně, když přes něj přejde hrana. */
  const painted=[rail,document.querySelector('.progress')].filter(Boolean);
  function trackY(){
    const t=getComputedStyle(track).transform;
    if(!t||t==='none')return 0;
    try{return new DOMMatrixReadOnly(t).f}catch(e){return 0}
  }
  function paint(){
    const ty=trackY();
    painted.forEach(el=>{
      const r=el.getBoundingClientRect(),y=r.top+r.height/2-ty;
      let s=slides[0];
      for(const c of slides){if(y>=c.offsetTop&&y<c.offsetTop+c.offsetHeight){s=c;break}if(c.offsetTop<=y)s=c}
      el.classList.toggle('on-light',s.classList.contains('love'));
      el.classList.toggle('on-photo',!!s.querySelector('.photo'));
    });
  }
  /* Smyčka běží, jen dokud se track hýbe, pak se sama zastaví. Prvních pár snímků
     po startu ale transform ještě hlásí starou hodnotu, tak se drží minimální doba –
     jinak by usnula dřív, než se vůbec rozjede. */
  let praf=0,plast=null,pstill=0,pfrom=0;
  function ptick(){
    const y=trackY();paint();
    if(y===plast){if(++pstill>2&&performance.now()-pfrom>1200){praf=0;return}}else{pstill=0;plast=y}
    praf=requestAnimationFrame(ptick);
  }
  function startPaint(){plast=null;pstill=0;pfrom=performance.now();if(!praf)praf=requestAnimationFrame(ptick)}

  /* ---------- barvy: slajd bez fotky si při každém příchodu vylosuje dvojici z palety webu ----------
     Stejné dvojice jako přepínač na cirkevjakokrava.cz (data-paleta). Dvakrát za sebou nepadne
     stejná. Pevné prvky (lišta, progress) i otevřený rozklik berou barvy aktuálního slajdu. */
  const PALETA=[          /* [pozadí, písmo] */
    ['#3b2f2f','#e6acac'],['#e6acac','#3b2f2f'],['#498660','#f9e7dd'],
    ['#f9e7dd','#498660'],['#464994','#f9e7dd'],['#f9e7dd','#464994'],
    ['#498660','#e6acac'],['#e6acac','#464994'],['#f9e7dd','#3b2f2f']
  ];
  const ZAKLAD=PALETA[0];
  const pevne=[rail,document.querySelector('.progress'),hint].filter(Boolean);
  let posledni=-1,barvyTed=ZAKLAD;
  function obarvi(el,[g,i]){
    el.style.setProperty('--ground',g);el.style.setProperty('--ink',i);
    el.style.setProperty('--print',`color-mix(in srgb,${i} ${['#e6acac','#f9e7dd'].includes(g)?18:30}%,transparent)`);
  }
  function barvy(s){
    if(!s.querySelector('.photo,.portret')){
      let k;do{k=Math.floor(Math.random()*PALETA.length)}while(k===posledni);
      posledni=k;obarvi(s,PALETA[k]);
      const [g,i]=PALETA[k];
      s._barvy=s.classList.contains('love')?[i,g]:[g,i];   /* .love má pozadí v --ink, pevné prvky jdou naopak */
      /* Flek je světlý a overlay ho míchá s pozadím – na tmavém i na růžovém vyjde světlejší skvrna
         (jako v atlasu fleků ve Figmě). Jen na krémové by se úplně rozpustil, tam jde převrácený
         a ztmavuje (multiply), slabě, jako dřív otisk v barvě písma. */
      const krem=s._barvy[0]==='#f9e7dd';
      s.style.setProperty('--flek-filtr',krem?'invert(1) opacity(.45)':'none');
      s.style.setProperty('--flek-blend',krem?'multiply':'overlay');
    }
    barvyTed=s._barvy||ZAKLAD;
    pevne.forEach(el=>obarvi(el,barvyTed));
  }

  /* ---------- přechod mezi slajdy ---------- */
  let cur=0,busy=false,t1,t2;
  function go(i,instant){
    i=Math.max(0,Math.min(N-1,i));
    if(i===cur&&!instant)return;
    const prev=cur;cur=i;
    if(i!==prev||instant&&!slides[i]._barvy)barvy(slides[i]);
    track.classList.toggle('snap',!!instant||reduced);
    track.classList.remove('flow');
    if(slides[i]._read&&i!==prev)slides[i]._read.inner=i>prev?0:slides[i]._read.max;
    track.style.transform=`translate3d(0,${-(slides[i].offsetTop+(slides[i]._read?slides[i]._read.inner:0))}px,0)`;
    if(slides[i]._read)light(slides[i]);
    deck.scrollTop=0; /* prohlížeč umí při skoku na #kotvu posunout i overflow:hidden kontejner */
    slides.forEach((s,j)=>{s._dot.setAttribute('aria-current',j===i?'true':'false');if(j!==i&&j!==prev){s.classList.remove('in');clearPrint(s)}});
    clearTimeout(t1);clearTimeout(t2);
    drawPrint(slides[i]);
    if(instant||reduced){slides[prev].classList.remove('in');if(prev!==i)clearPrint(slides[prev]);slides[i].classList.add('in')}
    else{
      busy=true;
      t1=setTimeout(()=>{slides[prev].classList.remove('in');slides[i].classList.add('in')},180);
      t2=setTimeout(()=>{busy=false;clearPrint(slides[prev])},1100);
    }
    startPaint();
    bar.style.width=((i+1)/N*100)+'%';
    if(i>0)hint.classList.add('gone');
    /* deep-link do adresy; v sandboxu (srcdoc iframe) to prohlížeč zakazuje, tak jen potichu přeskočit */
    if(/^https?:$/.test(location.protocol)||location.protocol==='file:'){try{history.replaceState(null,'','#'+slides[i].id)}catch(e){}}
  }

  /* ---------- rozklik z výroku: otevřená vrstva má klávesy, kolečko i dotyk pro sebe ---------- */
  const detailOpen=()=>!!document.querySelector('dialog.detail[open]');
  document.querySelectorAll('.vic').forEach(b=>b.addEventListener('click',()=>{
    const d=document.getElementById(b.getAttribute('aria-controls'));if(!d||!d.showModal)return;
    obarvi(d,barvyTed);d.scrollTop=0;d.showModal();d._from=b;
  }));
  document.querySelectorAll('dialog.detail').forEach(d=>{
    d.querySelectorAll('.zavrit').forEach(z=>z.addEventListener('click',()=>d.close()));
    d.addEventListener('close',()=>{if(d._from)try{d._from.focus({preventScroll:true})}catch(e){}});
  });

  /* ---------- klávesy ---------- */
  addEventListener('keydown',e=>{
    if(detailOpen()||e.target.matches('input,textarea'))return;
    if(e.target.closest('button')&&(e.key===' '||e.key==='Enter'))return;   /* tlačítko se mačká, ne listuje */
    if(['ArrowDown','PageDown',' ','ArrowRight','j'].includes(e.key)){e.preventDefault();if(!busy)fwd()}
    else if(['ArrowUp','PageUp','ArrowLeft','k'].includes(e.key)){e.preventDefault();if(!busy)back()}
    else if(e.key==='Home'){e.preventDefault();go(0)}
    else if(e.key==='End'){e.preventDefault();go(N-1)}
  });

  /* ---------- kolečko / touchpad: nasbírat delta, jeden krok, pak chvíli ignorovat setrvačnost ---------- */
  let acc=0,quiet=0;
  addEventListener('wheel',e=>{
    if(detailOpen())return;
    e.preventDefault();
    const now=performance.now();
    if(busy||now<quiet){acc=0;return}
    const r=slides[cur]._read;
    if(r&&!reduced&&((e.deltaY>0&&r.inner<r.max-1)||(e.deltaY<0&&r.inner>1))){acc=0;setInner(slides[cur],r.inner+e.deltaY);return}
    acc+=e.deltaY;
    if(Math.abs(acc)>=(r?110:40)){go(cur+(acc>0?1:-1));acc=0;quiet=now+1100}
  },{passive:false});

  /* ---------- dotyk: swipe ---------- */
  let ty=null,ti=0;
  addEventListener('touchstart',e=>{if(detailOpen()){ty=null;return}ty=e.touches[0].clientY;const r=slides[cur]._read;ti=r?r.inner:0},{passive:true});
  addEventListener('touchmove',e=>{
    const r=slides[cur]._read;if(ty===null||!r||reduced||busy)return;
    setInner(slides[cur],ti+(ty-e.touches[0].clientY)*1.15,true);
  },{passive:true});
  addEventListener('touchend',e=>{
    if(ty===null)return;const dy=ty-e.changedTouches[0].clientY;ty=null;if(busy)return;
    const r=slides[cur]._read;
    if(r&&!reduced){
      const target=ti+dy*1.15;
      if(target>r.max+70)go(cur+1);else if(target<-70)go(cur-1);
      return;
    }
    if(Math.abs(dy)>45)go(cur+(dy>0?1:-1));
  },{passive:true});

  /* ---------- čtecí slajd: vyšší než obrazovka, slova se rozsvěcují, jak procházejí čtecí linkou ---------- */
  slides.forEach(s=>{
    /* předmluva se taky čte projížděním, ale nerozsvěcuje se po slovech – je moc dlouhá */
    if(s.querySelector('.essay')){s._read={inner:0,max:0,t:null,el:[]};s._printCfg=PRINT[s.dataset.print];return}
    const t=s.querySelector('.text');if(!t)return;
    t.innerHTML=t.textContent.trim().split(/[ \t\r\n]+/).map(w=>'<i>'+w+'</i>').join(' ');   // nezlomitelná mezera zůstane uvnitř slova
    s._read={inner:0,max:0,t,el:[...t.children]};
    /* otisk drží velikost obrazovky a sedí uprostřed vysokého slajdu */
    s._printCfg=PRINT[s.dataset.print];
  });
  function measure(){
    const H=deck.clientHeight;
    slides.forEach(s=>{
      const r=s._read;if(!r)return;
      r.max=Math.max(0,s.offsetHeight-H);
      /* poloha z layoutu (offset*), ne z rect – ta by se pletla s transformy vstupní animace */
      if(r.t){
        const pos=el=>{let x=0,y=0;while(el&&el!==s){x+=el.offsetLeft;y+=el.offsetTop;el=el.offsetParent}return{x,y}};
        const tp=pos(r.t);r.lineH=parseFloat(getComputedStyle(r.t).lineHeight);r.w=r.t.clientWidth;
        r.el.forEach(w=>{const q=pos(w);w._top=q.y;w._x=(q.x-tp.x)/r.w});
      }
      const c=s._printCfg,d=s.querySelector('.print:not(.dva)');
      if(c&&d){d.style.top=(c.y/1080*H+(s.offsetHeight-H)/2)+'px';d.style.height=(c.h/1080*H)+'px'}
      r.inner=Math.min(r.inner,r.max);
    });
  }
  function light(s){
    const r=s._read,H=deck.clientHeight,line=H*.6;
    r.el.forEach(w=>{
      const v=reduced?1:(line-(w._top-r.inner))/r.lineH-w._x;
      w.style.opacity=(.2+.8*Math.max(0,Math.min(1,v))).toFixed(3);
    });
  }
  function setInner(s,y,drag){
    const r=s._read;r.inner=Math.max(0,Math.min(r.max,y));
    track.classList.toggle('flow',!drag);track.classList.toggle('snap',!!drag);
    track.style.transform=`translate3d(0,${-(s.offsetTop+r.inner)}px,0)`;
    light(s);startPaint();
  }
  function fwd(){
    const r=slides[cur]._read;
    if(r&&!reduced&&r.inner<r.max-1){setInner(slides[cur],r.inner+deck.clientHeight*.55);return}
    go(cur+1);
  }
  function back(){
    const r=slides[cur]._read;
    if(r&&!reduced&&r.inner>1){setInner(slides[cur],r.inner-deck.clientHeight*.55);return}
    go(cur-1);
  }
  /* verše pod odstavcem: pilulka rozbalí znění verše pod sebou, otevřený je vždy jen jeden;
     slajd tím změní výšku, tak se přeměří */
  document.querySelectorAll('.pil').forEach(b=>b.addEventListener('click',()=>{
    const open=b.getAttribute('aria-expanded')!=='true';
    b.closest('.verse-blok').querySelectorAll('.pil').forEach(o=>{
      const on=o===b&&open;o.setAttribute('aria-expanded',String(on));
      document.getElementById(o.getAttribute('aria-controls')).hidden=!on;
    });
    measure();
  }));
  measure();
  addEventListener('resize',()=>{measure();go(cur,true);startPaint()});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{measure();go(cur,true)});

  /* ---------- hodnoty: slovo se vždycky vejde na šířku ---------- */
  const words=[...document.querySelectorAll('.word .ln>span')];
  function fit(){
    words.forEach(w=>{
      w.style.fontSize='';
      const avail=w.closest('.word').clientWidth;
      const need=w.scrollWidth;
      if(need>avail){const fs=parseFloat(getComputedStyle(w).fontSize);w.style.fontSize=(fs*avail/need*.97)+'px'}
    });
  }
  let rt;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(fit,120)});
  fit();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);

  /* v iframu (artefakt) musí mít dokument fokus, jinak klávesy chodí rodiči */
  try{document.body.tabIndex=-1;document.body.focus({preventScroll:true})}catch(e){}
  addEventListener('pointerdown',()=>{if(detailOpen())return;try{document.body.focus({preventScroll:true})}catch(e){}});

  /* ---------- start (i z hashe) ---------- */
  const h=location.hash&&document.getElementById(location.hash.slice(1));
  const start=h&&slides.includes(h)?slides.indexOf(h):0;
  go(start,true);
  addEventListener('hashchange',()=>{const el=document.getElementById(location.hash.slice(1));if(el&&slides.includes(el))go(slides.indexOf(el))});
  requestAnimationFrame(()=>requestAnimationFrame(()=>track.classList.remove('snap')));
})();
