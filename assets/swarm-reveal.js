/* Chopstick scroll-build reveal.
   Original, dependency-free implementation inspired by collaborative design workflows.
   It animates the real page DOM; it does not recreate or copy the Swarm source code. */
(()=> {
'use strict';
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=window.matchMedia('(pointer: coarse)').matches;
const mobile=coarse||window.innerWidth<700;
const palette=['#e52b4d','#a92b45','#6d5261','#bb4c5c','#8b354b','#d26b77','#9b263c','#c14c62'];
const roles=['Art direction','Brand','Motion','Systems','Typography','Layout','Interaction','Visuals'];
const svg='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 2.5 23.5 16 14.4 17.1 10.2 25.5Z" fill="#fff" stroke="#191317" stroke-width="1.25" stroke-linejoin="round"/><path d="m14.2 17.1 4.3 7.2 2.2-7.9Z" fill="var(--cursor-color)" stroke="#191317" stroke-width="1"/></svg>';
let stage,canvas,ctx,raf=0,active=false,finished=false;
const cursors=[],tracked=new WeakMap(),activeTargets=new Set();
const $=(sel,root=document)=>root.querySelector(sel);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=ms=>sleep(ms/4);
function makeStage(){
 stage=document.createElement('div');stage.id='swarm-stage';stage.setAttribute('aria-hidden','true');
 stage.innerHTML='<div class="swarm-ruler top">CHOPSTICK / CREATIVE SYSTEMS / LIVE BUILD</div><div class="swarm-ruler left">LAYOUT GRID — 08PX</div><div class="swarm-status">BUILD SEQUENCE / 001</div><canvas></canvas>';
 document.body.appendChild(stage);canvas=$('canvas',stage);ctx=canvas.getContext('2d',{alpha:true});const count=mobile?6:18;
 for(let i=0;i<count;i++){const el=document.createElement('div');el.className='swarm-cursor';el.style.setProperty('--cursor-color',palette[i%palette.length]);el.innerHTML=svg+'<span class="swarm-name">'+roles[i%roles.length]+'</span>';stage.appendChild(el);cursors.push({el,x:innerWidth/2,y:innerHeight/2,tx:innerWidth/2,ty:innerHeight/2});}
 resizeCanvas();
}
function resizeCanvas(){if(!canvas||!ctx)return;const dpr=Math.min(devicePixelRatio||1,mobile?1.5:2);canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(dpr,0,0,dpr,0,0);}
function draw(){if(!active)return;ctx.clearRect(0,0,innerWidth,innerHeight);ctx.save();ctx.strokeStyle='rgba(237,49,81,.13)';ctx.lineWidth=1;const step=mobile?48:32;for(let x=22;x<innerWidth;x+=step){ctx.beginPath();ctx.moveTo(x,22);ctx.lineTo(x,innerHeight);ctx.stroke();}for(let y=22;y<innerHeight;y+=step){ctx.beginPath();ctx.moveTo(22,y);ctx.lineTo(innerWidth,y);ctx.stroke();}activeTargets.forEach(el=>{if(!el.isConnected)return;const r=el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;ctx.strokeStyle='rgba(237,49,81,.65)';ctx.setLineDash([4,4]);ctx.strokeRect(r.left-4,r.top-4,r.width+8,r.height+8);ctx.setLineDash([]);ctx.strokeStyle='rgba(255,255,255,.22)';ctx.beginPath();ctx.moveTo(22,r.top);ctx.lineTo(Math.min(innerWidth-22,r.right+28),r.top);ctx.moveTo(r.left,r.top-22);ctx.lineTo(r.left,Math.min(innerHeight,r.bottom+22));ctx.stroke();});ctx.restore();cursors.forEach(c=>{c.x+=(c.tx-c.x)*.63;c.y+=(c.ty-c.y)*.63;c.el.style.transform='translate3d('+c.x+'px,'+c.y+'px,0)';});raf=requestAnimationFrame(draw);}
function move(c,x,y){c.tx=x;c.ty=y;c.el.classList.add('is-visible');}
function rectOf(el){const r=el.getBoundingClientRect();return{x:r.left,y:r.top,w:r.width,h:r.height};}
function splitText(el){
 if(tracked.has(el))return tracked.get(el);
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(node){if(!node.nodeValue.trim()||node.parentElement.closest('script,style,svg,textarea,input,[aria-hidden="true"],.swarm-char'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}});
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);const chars=[];
 for(const node of nodes){const text=node.nodeValue,frag=document.createDocumentFragment();const segments=window.Intl&&Intl.Segmenter?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(x=>x.segment):Array.from(text);for(const char of segments){const span=document.createElement('span');span.className='swarm-char';span.textContent=char;frag.appendChild(span);chars.push(span);}node.parentNode.replaceChild(frag,node);}
 tracked.set(el,chars);return chars;
}
async function typeElement(el,c){
 const chars=splitText(el);if(!chars.length)return;el.classList.add('swarm-build-target');c.el.classList.add('is-typing');
 const caret=document.createElement('span');caret.className='swarm-caret';caret.setAttribute('aria-hidden','true');const total=chars.length,step=mobile?Math.max(2,Math.ceil(total/48)):Math.max(1,Math.ceil(total/100));
 for(let i=0;i<total;i+=step){const span=chars[Math.min(i,total-1)],r=span.getBoundingClientRect();if(r.width||r.height)move(c,Math.min(innerWidth-16,r.right),Math.min(innerHeight-16,r.bottom-2));for(let j=i;j<Math.min(total,i+step);j++)chars[j].classList.add('is-written');span.after(caret);if(i===0){c.el.classList.add('is-pressing');setTimeout(()=>c.el.classList.remove('is-pressing'),25);}await wait(mobile?14:17);}
 caret.remove();c.el.classList.remove('is-typing');el.classList.add('swarm-frame-in');await wait(180);
}
async function buildElement(el,index){
 if(el.dataset.swarmBuilt==='yes'||!el.isConnected)return;el.dataset.swarmBuilt='yes';const c=cursors[index%cursors.length],r=rectOf(el);if(r.w<2||r.h<2)return;activeTargets.add(el);
 const x=Math.max(18,Math.min(innerWidth-24,r.x-4)),y=Math.max(26,Math.min(innerHeight-24,r.y+Math.min(18,r.h/2)));move(c,x,y);c.el.classList.add('is-pressing');el.classList.add('swarm-build-target');await wait(mobile?65:90);c.el.classList.remove('is-pressing');
 const text=el.matches('h1,h2,h3,h4,p,a,button,li,blockquote')?el:el.querySelector('h1,h2,h3,h4,p,a,button');
 if(text)await typeElement(text,c);else{el.classList.add('swarm-frame-in');const rr=rectOf(el);move(c,rr.x+rr.w,rr.y+rr.h);await wait(220);}
 await wait(mobile?40:70);c.el.classList.remove('is-visible');setTimeout(()=>activeTargets.delete(el),650);
}
function targetsFor(section){
 const selectors='h1,h2,h3,.hero__lead,.hero__link,.statement__line,.case,.service,.method__item,.studio__item,.contact__title,.contact__lead,.m-btn,.m-card,.work-card,.capability-card';
 const nodes=[...section.querySelectorAll(selectors)].filter(el=>!el.closest('[hidden]')&&!el.closest('.menu'));
 if(section.matches('header'))nodes.unshift(...section.querySelectorAll('.nav__brand,.nav__links a,.nav__cta'));
 return [...new Set(nodes)].filter(el=>el.dataset.swarmBuilt!=='yes');
}
let sectionBuildCount=0;
async function buildSection(section){
 if(section.dataset.swarmBuilt==='yes')return;section.dataset.swarmBuilt='yes';const targets=targetsFor(section);if(!targets.length)return;
 const status=$('.swarm-status',stage);let done=0;sectionBuildCount++;if(status)status.textContent='BUILD SEQUENCE / '+String(sectionBuildCount).padStart(3,'0');
 const workers=cursors.map((c,i)=>(async()=>{for(let n=i;n<targets.length;n+=cursors.length){await buildElement(targets[n],n);done++;if(status)status.textContent='BUILD SEQUENCE / '+String(sectionBuildCount).padStart(3,'0')+' · '+Math.round(done/targets.length*100)+'%';}})());
 await Promise.all(workers);if(section.matches('footer')){setTimeout(()=>{if(stage){stage.classList.add('is-finishing');setTimeout(stop,140);}},450);}
}
function start(){
 if(active||finished)return;const home=$('#home');if(!home)return;makeStage();active=true;stage.classList.add('is-active');draw();
 const sections=[...home.querySelectorAll('header,main section,footer')];const first=sections.filter(el=>{const r=el.getBoundingClientRect();return r.top<innerHeight*1.15&&r.bottom>0;});
 first.reduce((p,el)=>p.then(()=>buildSection(el)),Promise.resolve()).then(()=>stage&&stage.classList.add('has-started'));
 if('IntersectionObserver'in window){const io=new IntersectionObserver(entries=>entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top).forEach(entry=>{if(entry.target.dataset.swarmQueued)return;entry.target.dataset.swarmQueued='yes';buildSection(entry.target);}),{rootMargin:'0px 0px -8% 0px',threshold:.08});sections.filter(el=>!first.includes(el)).forEach(el=>io.observe(el));}
 else sections.filter(el=>!first.includes(el)).forEach(buildSection);
}
function stop(){active=false;finished=true;if(raf)cancelAnimationFrame(raf);if(stage){stage.remove();stage=null;}document.querySelectorAll('.swarm-char').forEach(el=>el.classList.add('is-written'));document.querySelectorAll('.swarm-caret').forEach(el=>el.remove());}
window.addEventListener('resize',resizeCanvas,{passive:true});window.ChopstickSwarm={start,stop};
document.dispatchEvent(new Event('chopstick:swarm-ready'));
const autoStart=()=>requestAnimationFrame(()=>window.ChopstickSwarm?.start());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoStart,{once:true});else autoStart();
})();