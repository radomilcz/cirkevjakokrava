(function(){
  const deck=document.getElementById('deck');
  const track=document.getElementById('track');
  const slides=[...track.querySelectorAll('.slide')];
  const rail=document.getElementById('rail');
  const counter=document.getElementById('counter');
  const bar=document.getElementById('bar');
  const next=document.getElementById('next');
  const hint=document.getElementById('hint');
  const N=slides.length;
  const pad=n=>String(n+1).padStart(2,'0');
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
    if(i===6||i===17){const sep=document.createElement('li');sep.className='sep';rail.appendChild(sep)}
    const li=document.createElement('li');const b=document.createElement('button');
    b.type='button';b.setAttribute('aria-label','Slajd '+(i+1));b.addEventListener('click',()=>go(i));
    li.appendChild(b);rail.appendChild(li);s._dot=b;
  });

  /* ---------- přechod mezi slajdy ---------- */
  let cur=0,busy=false,t1,t2;
  function go(i,instant){
    i=Math.max(0,Math.min(N-1,i));
    if(i===cur&&!instant)return;
    const prev=cur;cur=i;
    track.classList.toggle('snap',!!instant||reduced);
    track.style.transform=`translate3d(0,${-i*100}%,0)`;
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
    document.body.classList.toggle('on-light',slides[i].classList.contains('love'));
    counter.textContent=pad(i)+' / '+pad(N-1);
    bar.style.width=((i+1)/N*100)+'%';
    next.classList.toggle('end',i===N-1);
    if(i>0)hint.classList.add('gone');
    /* deep-link do adresy; v sandboxu (srcdoc iframe) to prohlížeč zakazuje, tak jen potichu přeskočit */
    if(/^https?:$/.test(location.protocol)||location.protocol==='file:'){try{history.replaceState(null,'','#'+slides[i].id)}catch(e){}}
  }

  /* ---------- klávesy ---------- */
  addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea'))return;
    if(['ArrowDown','PageDown',' ','ArrowRight','j'].includes(e.key)){e.preventDefault();if(!busy)go(cur+1)}
    else if(['ArrowUp','PageUp','ArrowLeft','k'].includes(e.key)){e.preventDefault();if(!busy)go(cur-1)}
    else if(e.key==='Home'){e.preventDefault();go(0)}
    else if(e.key==='End'){e.preventDefault();go(N-1)}
  });
  next.addEventListener('click',()=>{if(!busy)go(cur+1)});

  /* ---------- kolečko / touchpad: nasbírat delta, jeden krok, pak chvíli ignorovat setrvačnost ---------- */
  let acc=0,quiet=0;
  addEventListener('wheel',e=>{
    e.preventDefault();
    const now=performance.now();
    if(busy||now<quiet){acc=0;return}
    acc+=e.deltaY;
    if(Math.abs(acc)>=40){go(cur+(acc>0?1:-1));acc=0;quiet=now+1100}
  },{passive:false});

  /* ---------- dotyk: swipe ---------- */
  let ty=null;
  addEventListener('touchstart',e=>{ty=e.touches[0].clientY},{passive:true});
  addEventListener('touchend',e=>{
    if(ty===null)return;const dy=ty-e.changedTouches[0].clientY;ty=null;
    if(Math.abs(dy)>45&&!busy)go(cur+(dy>0?1:-1));
  },{passive:true});

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
