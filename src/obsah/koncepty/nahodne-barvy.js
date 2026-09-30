/* TEST (jen náhled, build tenhle soubor nečte): každý slajd bez fotky si při příchodu
   vylosuje jednu dvojici barev z palety hlavního webu (radomilcz/web, data-paleta).
   Nesahá do manifest.js: hlídá, kterou tečku v liště go() označí jako aktuální,
   a přebarví cílový slajd dřív, než k němu track dojede. */
(function(){
  const PALETA=[          /* [pozadí, písmo] */
    ['#3b2f2f','#e6acac'],['#e6acac','#3b2f2f'],['#498660','#f9e7dd'],
    ['#f9e7dd','#498660'],['#464994','#f9e7dd'],['#f9e7dd','#464994'],
    ['#498660','#e6acac'],['#e6acac','#464994'],['#f9e7dd','#3b2f2f']
  ];
  const svetle=c=>['#e6acac','#f9e7dd'].includes(c);
  const slides=[...document.querySelectorAll('#track .slide')];
  const pevne=[document.getElementById('rail'),document.querySelector('.progress'),document.getElementById('hint')].filter(Boolean);
  const barvit=s=>!s.querySelector('.photo,.portret');
  let posledni=-1;

  function obarvi(el,[g,i]){
    el.style.setProperty('--ground',g);el.style.setProperty('--ink',i);
    el.style.setProperty('--print',`color-mix(in srgb,${i} ${svetle(g)?18:30}%,transparent)`);
  }
  function losuj(s){
    let k;do{k=Math.floor(Math.random()*PALETA.length)}while(k===posledni);
    posledni=k;obarvi(s,PALETA[k]);
    const [g,i]=PALETA[k];
    if(s.classList.contains('love'))s._par=[i,g];   /* .love má pozadí v --ink, pevné prvky jdou naopak */
    else{s.style.background='var(--ground)';s.style.color='var(--ink)';s._par=[g,i]}
  }
  function prijezd(){
    const i=slides.findIndex(s=>s._dot&&s._dot.getAttribute('aria-current')==='true');
    if(i<0)return;const s=slides[i];
    if(barvit(s))losuj(s);
    const par=s._par||['#3b2f2f','#e6acac'];
    pevne.forEach(el=>obarvi(el,par));
  }
  /* go() nastaví aria-current synchronně; observer se ozve hned po něm, ještě před snímkem */
  new MutationObserver(prijezd).observe(document.getElementById('rail'),{subtree:true,attributes:true,attributeFilter:['aria-current']});
  /* on-light z manifest.js přebijí !important pravidla: lišta a progress berou barvy slajdu */
  const st=document.createElement('style');
  st.textContent=`.slide,.rail button,.progress,.progress i{transition:background-color .6s,color .6s,border-color .6s}
    .progress i{transition:width .6s var(--ease),background-color .6s}
    .progress{background:color-mix(in srgb,var(--ink) 15%,transparent)!important}
    .progress i{background:var(--ink)!important}
    .rail button{border-color:var(--ink)!important}.rail button[aria-current="true"]{background:var(--ink)!important}`;
  document.head.appendChild(st);
  prijezd();
})();
