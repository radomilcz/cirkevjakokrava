(function(){
  const deck=document.getElementById('deck');
  const track=document.getElementById('track');
  const slides=[...track.querySelectorAll('.slide')];
  const rail=document.getElementById('rail');
  const bar=document.getElementById('bar');
  const hint=document.getElementById('hint');
  const N=slides.length;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- otisk: rozmístění 1:1 podle Figmy (rámeček 1920×1080, skupina 816×997 otočená) ----------
     x,y,w,h = obalový box otočené skupiny v rámu; rot = rotace navíc oproti exportu (export je otočený o 90°) */
  const PRINT={            /* x,y = levý horní roh obalového boxu otočené skupiny v rámu, r = rotace ve Figmě */
    '01':     {x:851, y:115,  r:90},
    '02':     {x:283, y:370,  r:-75},
    '03':     {x:549, y:-471, r:60},
    '04':     {x:-367,y:228,  r:60},
    '05':     {x:446, y:132,  r:-90},
    '06a':    {x:483, y:121,  r:-90},
    'h01':    {x:324, y:-3,   r:-120},
    'h02':    {x:324, y:-34,  r:-120},
    'h01b':   {x:324, y:-34,  r:-120},
    'h03':    {x:439, y:118,  r:90},
    'h04':    {x:302, y:-111, r:60},
    'h05':    {x:384, y:17,   r:-105},
    'h06':    {x:384, y:0,    r:75},
    'h07':    {x:351, y:-126, r:-45},
    'h08':    {x:336, y:-139, r:30},
    'h09':    {x:373, y:17,   r:-105},
    'h10':    {x:396, y:0,    r:-75},
    'h11':    {x:404, y:38,   r:99},
    'zrcadlo':{x:373, y:0,    r:75}
  };
  /* skupina je 816×997; export otisku je pořízený při rotaci 90°, Figma točí proti směru hodin, CSS po směru → css = 90 − r */
  Object.values(PRINT).forEach(c=>{const a=c.r*Math.PI/180,C=Math.abs(Math.cos(a)),S=Math.abs(Math.sin(a));
    c.w=816*C+997*S;c.h=816*S+997*C;c.rot=90-c.r});
  slides.forEach(s=>{
    const k=s.dataset.print;if(!k)return;const c=PRINT[k];
    const d=document.createElement('div');d.className='print';
    d.style.cssText=`left:${c.x/19.2}%;top:${c.y/10.8}%;width:${c.w/19.2}%;height:${c.h/10.8}%`;
    const r=document.createElement('div');r.className='rot';
    r.style.cssText=`width:${998/c.w*100}%;transform:translate(-50%,-50%) rotate(${c.rot}deg)`;
    r.innerHTML='<div class="sweep"><svg viewBox="0 0 998 816"></svg></div>';
    d.appendChild(r);s.prepend(d);s._svg=r.querySelector('svg');
  });
  const LINES=[...document.querySelectorAll('#otisk path')];
  function drawPrint(s){
    if(!s._svg||s._svg.childElementCount)return;
    const frag=document.createDocumentFragment();
    LINES.forEach(p=>frag.appendChild(p.cloneNode()));
    s._svg.appendChild(frag);
  }
  function clearPrint(s){if(s._svg)s._svg.replaceChildren()}

  /* ---------- lišta s tečkami ---------- */
  slides.forEach((s,i)=>{
    if(i===6||i===18){const sep=document.createElement('li');sep.className='sep';rail.appendChild(sep)}
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

  /* ---------- přechod mezi slajdy ---------- */
  let cur=0,busy=false,t1,t2;
  function go(i,instant){
    i=Math.max(0,Math.min(N-1,i));
    if(i===cur&&!instant)return;
    const prev=cur;cur=i;
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

  /* ---------- klávesy ---------- */
  addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea'))return;
    if(['ArrowDown','PageDown',' ','ArrowRight','j'].includes(e.key)){e.preventDefault();if(!busy)fwd()}
    else if(['ArrowUp','PageUp','ArrowLeft','k'].includes(e.key)){e.preventDefault();if(!busy)back()}
    else if(e.key==='Home'){e.preventDefault();go(0)}
    else if(e.key==='End'){e.preventDefault();go(N-1)}
  });

  /* ---------- kolečko / touchpad: nasbírat delta, jeden krok, pak chvíli ignorovat setrvačnost ---------- */
  let acc=0,quiet=0;
  addEventListener('wheel',e=>{
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
  addEventListener('touchstart',e=>{ty=e.touches[0].clientY;const r=slides[cur]._read;ti=r?r.inner:0},{passive:true});
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
    t.innerHTML=t.textContent.trim().split(/\s+/).map(w=>'<i>'+w+'</i>').join(' ');
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
      const c=s._printCfg,d=s.querySelector('.print');
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
  addEventListener('pointerdown',()=>{try{document.body.focus({preventScroll:true})}catch(e){}});

  /* ---------- start (i z hashe) ---------- */
  const h=location.hash&&document.getElementById(location.hash.slice(1));
  const start=h&&slides.includes(h)?slides.indexOf(h):0;
  go(start,true);
  addEventListener('hashchange',()=>{const el=document.getElementById(location.hash.slice(1));if(el&&slides.includes(el))go(slides.indexOf(el))});
  requestAnimationFrame(()=>requestAnimationFrame(()=>track.classList.remove('snap')));
})();
