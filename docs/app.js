import { mascotSVG } from "./mascot.js";
import { LANGS, t, tl, getLang, setLang, detectLang, applyStatic } from "./i18n.js";

(function(){
"use strict";
/* ===================== hằng số ===================== */
var PRESETS=[
 {name:"townhall",label:"Town Hall",w:4128,h:1290},
 {name:"cafeteria",label:"Cafeteria",w:3784,h:774},
 {name:"tv75",label:'TV 75"',w:3840,h:2160},
 {name:"fullhd",label:"Full HD",w:1920,h:1080},
 {name:"doc916",key:"preset.portrait",w:1080,h:1920},
 {name:"vuong",key:"preset.square",w:1080,h:1080},
 {name:"ultrawide",label:"21:9",w:2560,h:1080}
];
function presetLabel(p){return p.key?t(p.key):p.label;}
function modeLabel(m){return t("mode."+m);}
var GPUS=[
 {id:"NvidiaTeslaT4",label:"T4 (16GB, x2)",workers:2,vram:16,note:"Free tier, fp16."},
 {id:"NvidiaTeslaT4Highmem",label:"T4 Highmem",workers:2,vram:16,note:"More system RAM."},
 {id:"NvidiaL4",label:"L4 (24GB)",workers:1,vram:24,note:"bf16."},
 {id:"NvidiaL4X1",label:"L4 x1 (24GB)",workers:1,vram:24,note:"bf16."},
 {id:"NvidiaTeslaA100",label:"A100 (40/80GB)",workers:1,vram:40,note:"Fast, bf16. May be restricted."},
 {id:"NvidiaH100",label:"H100 (80GB)",workers:1,vram:80,note:"Very fast, bf16. Often restricted."},
 {id:"NvidiaRtxPro6000",label:"RTX Pro 6000 (96GB)",workers:1,vram:96,note:"Large VRAM, bf16."},
 {id:"NvidiaTeslaP100",label:"P100 (16GB) - not recommended",workers:1,vram:16,note:"Default PyTorch does not support P100."},
 {id:"custom",label:"Custom (enter ID)...",workers:1,vram:16,note:"Exact accelerator ID per Kaggle CLI docs."}
];
var PROMPTS=[
 {label:"3D cartoon (CIDER)",text:"Seamless wide cinematic extension of the same scene, identical lighting, color grading, depth of field and 3D rendered toy-like art style, soft golden bokeh lights on a dark background, continuous background, no text, no logos, no borders"},
 {label:"Golden ornament (FANTA)",text:"Seamless wide extension of an elegant golden Christmas ornament scene on pure black background, sparkling gold light particles, photorealistic, continuous background, no text, no logos, no borders"},
 {label:"Generic",text:"Seamless extension of the same scene, identical lighting, color grading and art style, continuous background, no text, no logos, no borders"}
];
var CHUNK=81, OVERLAP=16, ACTIVE=["submitted","queued","running"];
var PRO=/[?&]pro(\b|=)/.test(location.search);

/* ===================== hình học (giống hệt runner/worker.py) ===================== */
function pyRound(x){var r=Math.round(x);if(Math.abs(x%1)===0.5&&r%2!==0)r-=1;return r;}
function evenPy(x){return Math.max(2,pyRound(x/2)*2);}
function layout(sw,sh,W,H,scale){
  scale=scale||1;var s=Math.min(W/sw,H/sh)*scale;
  var cw=Math.min(evenPy(sw*s),W),ch=Math.min(evenPy(sh*s),H);
  return {cw:cw,ch:ch,x0:Math.floor((W-cw)/2),y0:Math.floor((H-ch)/2)};
}
function autoGen(W,H,mpx){
  var aspect=W/H,target=mpx*1e6,gh0=Math.floor(Math.sqrt(target/aspect)/16)*16,best=null;
  for(var gh=Math.max(64,gh0-96);gh<gh0+112;gh+=16){
    var gw=Math.max(64,pyRound(gh*aspect/16)*16),area=gw*gh;
    if(area<0.6*target||area>1.5*target)continue;
    var err=Math.abs(gw/gh-aspect)/aspect,k0=Math.round(err*1e4)/1e4,k1=Math.abs(area-target);
    if(!best||k0<best.k0||(k0===best.k0&&k1<best.k1))best={k0:k0,k1:k1,gw:gw,gh:gh};
  }
  if(!best){var gh2=Math.max(64,pyRound(gh0/16)*16);return [Math.max(64,pyRound(gh2*aspect/16)*16),gh2];}
  return [best.gw,best.gh];
}
function genRect(fr,W,H,gw,gh){
  var gcw=fr.cw>=W?gw:Math.min(evenPy(fr.cw*gw/W),gw),gch=fr.ch>=H?gh:Math.min(evenPy(fr.ch*gh/H),gh);
  return {cw:gcw,ch:gch,x0:Math.floor((gw-gcw)/2),y0:Math.floor((gh-gch)/2)};
}
function chunkCount(n,hasCtx,stride,chunk){
  chunk=chunk||CHUNK;var m=stride<=1?n:Math.ceil(n/stride)+1;if(hasCtx)m+=OVERLAP;
  return m<=chunk?1:1+Math.ceil((m-chunk)/(chunk-OVERLAP));
}
function slug(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/đ/g,"d").replace(/Đ/g,"d").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");}
function dsName(n){return String(n).replace(/[^A-Za-z0-9._-]+/g,"_");} /* giống regex trong runner/add_video.sh */

/* ===================== trạng thái ===================== */
var S={sizes:[],videos:{},drops:{},selSize:0,mode:"normal",engine:"wan",model:"1.3b",jobs:[],videoList:[],defaultBranch:"main",
  power:false,powering:false,dragging:false,sending:false,watchId:"",watchTs:0,mstate:"",hold:0,typeNext:false,sayState:"",prevStatus:{},sound:false,timer:null,
  panelOpen:false,pullOpen:false,viewId:"",pvSrc:"",pvImg:null};
var CONFIG={relay:""};
var SCENE=null;
var $=function(id){return document.getElementById(id);};
var LS=(function(){try{window.localStorage.setItem("t","1");window.localStorage.removeItem("t");return window.localStorage;}catch(e){var m={};return{getItem:function(k){return m[k]||null;},setItem:function(k,v){m[k]=String(v);},removeItem:function(k){delete m[k];}};}})();
var REDUCE=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
var LOWPOWER=(window.matchMedia&&matchMedia("(pointer:coarse)").matches)||Math.min(screen.width,screen.height)<700||(navigator.deviceMemory&&navigator.deviceMemory<=4);
function toast(msg,kind){var el=$("toast");el.textContent=msg;el.className="show "+(kind||"");clearTimeout(toast._t);toast._t=setTimeout(function(){el.className="";},kind==="bad"?9000:4500);}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function isActive(j){return j&&ACTIVE.indexOf(j.status)>=0;}
function fmtDur(h){return h<1?Math.max(1,Math.round(h*60))+" "+t("unit.min"):h.toFixed(1)+" "+t("unit.hour");}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function copyText(txt){(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){toast(t("toast.copied"),"good");},function(){window.prompt(t("prompt.copy"),txt);});}
function refocus(box,sel){var el=box.querySelector(sel);if(el)el.focus();}
function pick(a){return a[Math.floor(Math.random()*a.length)];}
function line(key){return pick(tl(key));}
function secsLabel(s){s=Math.round(s||0);return s<60?s+"s":Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function fetchTimeout(url,opts,ms){
  opts=opts||{};var ctl=window.AbortController?new AbortController():null,tm;
  if(ctl){opts.signal=ctl.signal;tm=setTimeout(function(){ctl.abort();},ms||8000);}
  return fetch(url,opts).then(function(r){clearTimeout(tm);return r;},function(e){clearTimeout(tm);throw e;});
}

/* ===================== âm thanh (mặc định tắt) ===================== */
var AC=null;
function sfx(kind){
  if(!S.sound)return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state==="suspended")AC.resume();
    var seq={drop:[[520,.07],[780,.1]],zoom:[[330,.06],[660,.1]],plug:[[260,.05],[520,.07],[880,.12]],start:[[392,.08],[523,.08],[784,.16]],done:[[784,.1],[988,.1],[1319,.28]],error:[[330,.14],[247,.26]],tick:[[880,.04]]}[kind]||[];
    var tt=AC.currentTime;
    seq.forEach(function(n){var o=AC.createOscillator(),g=AC.createGain();o.type="square";o.frequency.value=n[0];
      g.gain.setValueAtTime(.05,tt);g.gain.exponentialRampToValueAtTime(.0001,tt+n[1]);o.connect(g);g.connect(AC.destination);o.start(tt);o.stop(tt+n[1]);tt+=n[1]*.9;});
  }catch(e){}
}
function renderSound(){var b=$("btnSound");b.textContent=S.sound?"🔊":"🔇";b.title=S.sound?t("sound.on"):t("sound.off");b.setAttribute("aria-pressed",S.sound?"true":"false");}

/* ===================== lời của Bọt ===================== */
var sayTimer=null;
function say(text,type){
  var el=$("sayText");if(say._cur===text)return;say._cur=text;clearInterval(sayTimer);$("say").hidden=!text;
  if(!type||REDUCE){el.textContent=text;return;}
  var i=0;el.textContent="";sayTimer=setInterval(function(){el.textContent=text.slice(0,++i);if(i>=text.length)clearInterval(sayTimer);},22);
}
function sayHold(text){say(text,true);S.hold=Date.now()+6000;}

/* ===================== kích thước (màn LED) ===================== */
function sizeIndex(w,h){for(var i=0;i<S.sizes.length;i++){if(S.sizes[i].w===w&&S.sizes[i].h===h)return i;}return -1;}
function sizeLabel(s){var p=PRESETS.filter(function(x){return x.w===s.w&&x.h===s.h;})[0];return p?presetLabel(p):s.name;}
function addSize(name,w,h){
  w=Math.round(+w);h=Math.round(+h);
  if(!(w>=64&&w<=16384&&h>=64&&h<=16384)){toast(t("err.size"),"bad");return;}
  name=slug(name||(w+"x"+h))||(w+"x"+h);
  var base=name,i=2;while(S.sizes.some(function(s){return s.name===name;})){name=base+"-"+i++;}
  S.sizes.push({name:name,w:w,h:h});S.selSize=S.sizes.length-1;update();
}
function arBox(w,h){var k=26/Math.max(w,h);return '<span class="ar"><i style="--w:'+Math.max(6,Math.round(w*k))+'px;--h:'+Math.max(6,Math.round(h*k))+'px"></i></span>';}
function renderPresets(){
  var html=PRESETS.map(function(p,i){
    var on=sizeIndex(p.w,p.h)>=0;
    return '<button class="scr'+(on?' on':'')+'" data-i="'+i+'" aria-pressed="'+on+'">'+arBox(p.w,p.h)+'<span><b>'+esc(presetLabel(p))+'</b><small>'+p.w+'×'+p.h+'</small></span></button>';
  }).join("");
  S.sizes.forEach(function(s,i){
    var isPre=PRESETS.some(function(p){return p.w===s.w&&p.h===s.h;});
    if(!isPre)html+='<button class="scr on" data-c="'+i+'" aria-pressed="true">'+arBox(s.w,s.h)+'<span><b>'+esc(s.name)+'</b><small>'+s.w+'×'+s.h+' · '+esc(t("led.rm"))+'</small></span></button>';
  });
  html+='<button class="scr add" id="btnOther"><span class="ar"><i style="--w:14px;--h:14px;border-style:dashed"></i></span><span><b>'+esc(t("led.other"))+'</b><small>'+esc(t("led.other.sub"))+'</small></span></button>';
  $("presets").innerHTML=html;
}
$("presets").addEventListener("click",function(e){
  var b=e.target.closest("button");if(!b)return;
  if(b.id==="btnOther"){$("customBox").hidden=!$("customBox").hidden;if(!$("customBox").hidden)$("cW").focus();return;}
  if(b.dataset.c!=null){S.sizes.splice(+b.dataset.c,1);S.selSize=Math.max(0,Math.min(S.selSize,S.sizes.length-1));update();return;}
  var i=+b.dataset.i,p=PRESETS[i],at=sizeIndex(p.w,p.h);
  if(at>=0){S.sizes.splice(at,1);S.selSize=Math.max(0,Math.min(S.selSize,S.sizes.length-1));update();}
  else addSize(p.name,p.w,p.h);
  sfx("tick");refocus($("presets"),'[data-i="'+i+'"]');
});
$("btnCustom").onclick=function(){addSize($("cName").value,$("cW").value,$("cH").value);$("cName").value=$("cW").value=$("cH").value="";$("customBox").hidden=true;};
function srcSize(){return {w:Math.max(16,+$("srcW").value||640),h:Math.max(16,+$("srcH").value||392)};}
function info(sz){
  var src=srcSize(),sc=(+$("scale").value||100)/100,fr=layout(src.w,src.h,sz.w,sz.h,sc),g=autoGen(sz.w,sz.h,+$("mpx").value);
  var gr=genRect(fr,sz.w,sz.h,g[0],g[1]),pass=fr.cw>=sz.w&&fr.ch>=sz.h;
  return {fr:fr,g:g,gr:gr,pass:pass,fill:1-(fr.cw*fr.ch)/(sz.w*sz.h),tokens:(g[0]/16)*(g[1]/16)};
}
function progIndex(){
  var sz=S.sizes[S.selSize];if(!sz)return PRESETS.length;
  for(var i=0;i<PRESETS.length;i++){if(PRESETS[i].w===sz.w&&PRESETS[i].h===sz.h)return i;}
  return PRESETS.length;
}
function pvImage(){
  var a=activeDrop();
  if(!a||!a.thumb){S.pvSrc="";S.pvImg=null;return null;}
  if(S.pvSrc!==a.thumb){S.pvSrc=a.thumb;var im=new Image();S.pvImg=im;im.onload=function(){drawPreview();};im.src=a.thumb;}
  return S.pvImg&&S.pvImg.complete&&S.pvImg.naturalWidth?S.pvImg:null;
}
function drawPreview(){
  var cv=$("pv"),ctx=cv.getContext&&cv.getContext("2d"),sz=S.sizes[S.selSize];
  if(!cv.clientWidth)return; /* đang ẩn */
  var dpr=window.devicePixelRatio||1,cssW=cv.clientWidth,cssH=cv.clientHeight||116;
  cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);
  if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);
  if(!sz)return;
  var f=info(sz),ar=sz.w/sz.h,h=cssH-6,w=h*ar;if(w>cssW-6){w=cssW-6;h=w/ar;}
  var ox=(cssW-w)/2,oy=(cssH-h)/2,k=w/sz.w,img=pvImage();
  var vx=ox+f.fr.x0*k,vy=oy+f.fr.y0*k,vw=f.fr.cw*k,vh=f.fr.ch*k;
  ctx.save();ctx.beginPath();ctx.rect(ox,oy,w,h);ctx.clip();
  if(img){var s0=Math.max(w/img.naturalWidth,h/img.naturalHeight);ctx.drawImage(img,ox+(w-img.naturalWidth*s0)/2,oy+(h-img.naturalHeight*s0)/2,img.naturalWidth*s0,img.naturalHeight*s0);}
  else{var g=ctx.createLinearGradient(ox,oy,ox+w,oy+h);g.addColorStop(0,"#16305f");g.addColorStop(1,"#0d1c3d");ctx.fillStyle=g;ctx.fillRect(ox,oy,w,h);}
  ctx.fillStyle="rgba(8,16,40,.62)";ctx.fillRect(ox,oy,w,h);
  if(!f.pass){ctx.strokeStyle="rgba(120,175,255,.35)";ctx.lineWidth=1;for(var i=-h;i<w;i+=8){ctx.beginPath();ctx.moveTo(ox+i,oy+h);ctx.lineTo(ox+i+h,oy);ctx.stroke();}
    if(vx-ox>46){var ai=t("pv.ai");ctx.fillStyle="rgba(190,215,255,.9)";ctx.font="700 10px 'Geist Mono','Noto Sans KR',monospace";ctx.textAlign="center";ctx.fillText(ai,ox+(vx-ox)/2,oy+h/2+3);ctx.fillText(ai,vx+vw+(ox+w-vx-vw)/2,oy+h/2+3);}}
  ctx.restore();
  ctx.save();ctx.shadowColor="rgba(0,0,0,.55)";ctx.shadowBlur=12;
  if(img)ctx.drawImage(img,vx,vy,vw,vh);else{ctx.fillStyle="#2d8f6b";ctx.fillRect(vx,vy,vw,vh);}
  ctx.restore();
  ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.strokeRect(vx,vy,vw,vh);
  ctx.strokeStyle="rgba(125,175,255,.9)";ctx.lineWidth=1.5;ctx.strokeRect(ox,oy,w,h);
}

/* ===================== nước giặt (engine + model) ===================== */
function gpuObj(){var id=$("gpu").value;return GPUS.filter(function(g){return g.id===id;})[0]||GPUS[0];}
function accelerator(){var g=gpuObj();return g.id==="custom"?($("gpuCustom").value.trim()||"NvidiaTeslaT4"):g.id;}
function renderGpu(){
  $("gpu").innerHTML=GPUS.map(function(g){return '<option value="'+g.id+'">'+esc(g.label)+'</option>';}).join("");
  $("promptPresets").innerHTML=PROMPTS.map(function(p,i){return '<button class="chip" data-p="'+i+'">'+esc(p.label)+'</button>';}).join("");
  $("promptPresets").onclick=function(e){var b=e.target.closest("button");if(b){$("prompt").value=PROMPTS[+b.dataset.p].text;update();}};
}
function modeFrom(engine,model){return engine==="blur"?"quick":(model==="14b"?"deep":"normal");}
function setMode(m){
  S.mode=m;S.engine=m==="quick"?"blur":"wan";S.model=m==="deep"?"14b":"1.3b";
  Array.prototype.forEach.call(document.querySelectorAll("input[name=mode]"),function(r){r.checked=r.value===m;});
  if(SCENE)SCENE.setMode(m);
}
$("modes").addEventListener("change",function(e){if(e.target.name==="mode"){setMode(e.target.value);sfx("tick");update();}});
$("testOn").addEventListener("change",function(){$("testSec").value=this.checked?(+$("testSec").dataset.last||2):0;update();});

/* ===================== ước tính + cảnh báo ===================== */
function selectedVideos(){return Object.keys(S.videos).filter(function(k){return S.videos[k];});}
function inDataset(key){return S.videoList.some(function(v){return v.name===key;});}
function videoTitle(k){return S.drops[k]?S.drops[k].orig:k;}
function estimate(){
  var test=+$("testSec").value||0,dur=+$("srcDur").value||0,fps=+$("srcFps").value||24;
  var secs=test>0?Math.min(test,dur||test):dur,frames=Math.ceil(secs*fps),shots=Math.max(1,+$("nShots").value||1);
  var stride=+$("stride").value||1,vids=Math.max(1,selectedVideos().length),per=0;
  S.sizes.forEach(function(s){var f=info(s);if(f.pass)return;per+=shots*chunkCount(Math.ceil(frames/shots),false,stride,CHUNK);});
  var chunks=per*vids,sec=+$("secChunk").value||0,w=Math.max(1,+$("nWorkers").value||1);
  var wall=chunks*sec/w/3600,quota=+$("quota").value||30;
  return {frames:frames,chunks:chunks,wallH:wall,quotaPct:quota?wall/quota:0,quota:quota};
}
var FIXES={
  gpu40:{key:"fix.gpu",fn:function(){$("gpu").value="NvidiaTeslaA100";}},
  lighter:{key:"fix.lighter",fn:function(){$("stride").value="2";$("steps").value=Math.min(+$("steps").value,20);}}
};
function notes(e){
  var n=[];
  if(S.engine==="wan"&&e.quotaPct>1)n.push({t:t("alert.quota"),fix:"lighter"});
  if(S.model==="14b"&&S.engine==="wan"&&gpuObj().vram<40)n.push({t:t("alert.gpu14"),fix:"gpu40"});
  return n;
}
function renderEstimate(){
  var e=estimate(),ns=notes(e);
  $("alerts").innerHTML=ns.map(function(n){return '<div class="alert"><span>⚠ '+esc(n.t)+'</span>'+(n.fix?'<button data-fix="'+n.fix+'">'+esc(t(FIXES[n.fix].key))+'</button>':'')+'</div>';}).join("");
  var vids=selectedVideos(),sz=S.sizes[S.selSize],txt="",est=S.engine==="wan"&&e.chunks?" · ≈"+fmtDur(e.wallH):"",f=sz?info(sz):null;
  var missing=!vids.length?1:(!S.sizes.length?2:0);
  if(missing===1)txt=t("sum.noVideo");
  else if(missing===2)txt=t("sum.noLed");
  else txt=(f.pass?t("sum.fit"):t("sum.fill",{p:Math.round(f.fill*100)}))+est;
  $("runSum").textContent=txt;
  $("pvCap").textContent=!sz?t("pv.none"):(f.pass?t("pv.fit"):t("pv.fill",{p:Math.round(f.fill*100)}))+(S.sizes.length>1?t("pv.viewing",{n:sizeLabel(sz)}):"");
  var first=vids[0]?videoTitle(vids[0]):"",label=first+(vids.length>1?" +"+(vids.length-1):"");
  var szl=!S.sizes.length?t("bar.noLed"):(S.sizes.length>1?t("bar.leds",{n:S.sizes.length}):sizeLabel(S.sizes[0])+" "+S.sizes[0].w+"×"+S.sizes[0].h);
  $("barT1").textContent=label||t("bar.none");
  $("barT2").textContent=szl+" · "+modeLabel(S.mode)+est+(ns.length||vids.some(function(k){return S.drops[k]&&!S.drops[k].up&&!inDataset(k);})?" · ⚠":"");
  $("st1").textContent=vids.length?label:t("step.none");
  $("st2").textContent=S.sizes.length?(S.sizes.length>1?t("bar.leds",{n:S.sizes.length}):sizeLabel(S.sizes[0])):t("step.none");
  $("st3").textContent=modeLabel(S.mode);
  var done=[vids.length>0,S.sizes.length>0,true];
  Array.prototype.forEach.call($("psteps").children,function(li,i){
    li.className=done[i]?"done":(missing===i+1?"cur":"");
    li.querySelector(".n").textContent=done[i]?"✓":String(i+1);
  });
  $("pInfo").textContent=missing===1?t("panel.lcd.noVideo"):missing===2?t("panel.lcd.noLed"):t("panel.lcd.ready");
  $("plcd2").classList.toggle("warn",!!missing);
  $("btnRun").classList.toggle("notready",!!missing);
  var face=missing?"idle":"loaded";
  if(panelMsg._face!==face){panelMsg._face=face;$("pMascot").innerHTML=mascotSVG(face);}
}
$("alerts").addEventListener("click",function(e){var b=e.target.closest("[data-fix]");if(b){FIXES[b.dataset.fix].fn();sfx("tick");update();}});
$("psteps").addEventListener("click",function(e){var li=e.target.closest("li");if(!li)return;var sec=$("sec"+li.dataset.s);if(sec)sec.scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"nearest"});});
function flagNeed(n){var el=$("sec"+n);if(!el)return;el.classList.remove("need");void el.offsetWidth;el.classList.add("need");el.scrollIntoView({behavior:REDUCE?"auto":"smooth",block:"nearest"});setTimeout(function(){el.classList.remove("need");},1000);}

/* ===================== video: thả vào máy (hoá thành tấm vải) ===================== */
function isVideo(f){return /^video\//.test(f.type)||/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name);}
function probeVideo(file){
  return new Promise(function(resolve){
    var v=document.createElement("video"),url=URL.createObjectURL(file),done=false,meta=null;
    v.muted=true;v.preload="metadata";v.playsInline=true;
    function fin(){if(done)return;done=true;clearTimeout(tm);v.removeAttribute("src");v.load();URL.revokeObjectURL(url);resolve(meta);}
    var tm=setTimeout(fin,8000);
    v.onloadedmetadata=function(){
      meta={w:v.videoWidth,h:v.videoHeight,dur:isFinite(v.duration)?v.duration:0};
      try{v.currentTime=Math.min(0.2,(v.duration||1)/2);}catch(e){fin();}
    };
    v.onseeked=function(){
      try{var k=Math.min(1,520/(v.videoWidth||520)),c=document.createElement("canvas");c.width=Math.max(2,Math.round(v.videoWidth*k));c.height=Math.max(2,Math.round(v.videoHeight*k));
        c.getContext("2d").drawImage(v,0,0,c.width,c.height);meta.thumb=c.toDataURL("image/jpeg",.82);}catch(e){}
      fin();
    };
    v.onerror=fin;v.src=url;
  });
}
function activeDrop(){
  var ks=selectedVideos().filter(function(k){return S.drops[k];});
  for(var i=0;i<ks.length;i++){if(S.drops[ks[i]].thumb)return S.drops[ks[i]];}
  return ks.length?S.drops[ks[0]]:null;
}
function applyActiveMeta(){
  var a=activeDrop();if(!a||!a.w)return;
  $("srcW").value=a.w;$("srcH").value=a.h;if(a.dur)$("srcDur").value=Math.round(a.dur);
}
function addDrop(file){
  var key=dsName(file.name);
  cancelUpload(key);
  S.videos[key]=true;S.drops[key]={orig:file.name,bytes:file.size,probing:true,file:file};
  startUpload(key);
  return probeVideo(file).then(function(m){var d=S.drops[key];if(m)for(var p in m)d[p]=m[p];d.probing=false;});
}
/* ===================== hạn mức: hiển thị phần còn lại, hết là khoá cả máy ===================== */
function isLocked(){return !!(CONFIG.relay&&S.power&&S.quota&&S.quota.locked);}
function resetLeft(){return S.quota?Math.max(0,Math.round((S.quota.resetSec||0)-(Date.now()-(S.quotaAt||Date.now()))/1000)):0;}
function fmtWait(sec){
  sec=Math.max(0,Math.round(sec));
  if(sec<90)return Math.max(1,sec)+" "+t("q.s");
  if(sec<5400)return Math.round(sec/60)+" "+t("unit.min");
  if(sec<172800)return Math.round(sec/3600)+" "+t("unit.hour");
  return Math.round(sec/86400)+" "+t("q.d");
}
function fmtBytes(b){return b>=1073741824?(b/1073741824).toFixed(b>=10737418240?0:2)+" GB":Math.max(0,Math.round(b/1048576))+" MB";}
function fmtMeter(m,v){return m.unit==="bytes"?fmtBytes(v):m.unit==="hours"?(Math.round(v*10)/10)+" "+t("unit.hour"):t("q.cnt",{n:Math.round(v)});}
function lockText(){
  var q=S.quota,what=t("q.m."+q.reason),w=resetLeft();
  return w>0?t("q.lock",{what:what,t:fmtWait(w)}):t("q.lockNoT",{what:what});
}
function loadQuota(){
  if(!CONFIG.relay||!S.power)return Promise.resolve();
  return fetchTimeout(relayURL("/quota"),{cache:"no-store"},8000).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(function(q){if(q&&Array.isArray(q.meters)){S.quota=q;S.quotaAt=Date.now();}}).catch(function(){}).then(function(){update();});
}
function quotaHit(body){ /* relay từ chối vì hết hạn mức */
  loadQuota();
  var what=t("q.m."+(body.reason||"storage"));
  toast(t("q.toast",{what:what,t:fmtWait(body.resetSec||0)}),"bad");sayHold(t("say.locked"));sfx("error");
}
function lockNudge(){toast(lockText(),"bad");sayHold(t("say.locked"));sfx("error");openQuota(true);}
function openQuota(on){
  var b=$("quotaBox");if(on&&b.hidden===false)return;
  b.hidden=!on;$("btnQuota").setAttribute("aria-expanded",on?"true":"false");
  if(on){S.qSig="";renderQuota();}
}
function renderQuota(){
  var show=!!(CONFIG.relay&&S.power&&S.quota);
  $("btnQuota").hidden=!show;
  if(!show){$("quotaBox").hidden=true;$("lockBanner").hidden=true;return;}
  var q=S.quota,worst=0;
  q.meters.forEach(function(m){worst=Math.max(worst,m.limit?m.used/m.limit:0);});
  var dot=$("qDot");dot.className="qdot"+(q.locked?" lock":worst>=0.8?" warn":"");
  var lb=$("lockBanner");
  if(q.locked){
    lb.innerHTML='<span aria-hidden="true">⛔</span><span>'+esc(lockText())+'</span><button type="button" id="lockSee">'+esc(t("q.see"))+'</button>';lb.hidden=false;
  }else lb.hidden=true;
  var box=$("quotaBox");if(box.hidden)return;
  var sig=JSON.stringify([q.meters,q.locked,q.partial,Math.round(resetLeft()/30),t("q.head")]);if(sig===S.qSig)return;S.qSig=sig;
  box.innerHTML='<h3 id="qHead"><span>📊 '+esc(t("q.head"))+'</span><button type="button" id="qClose" aria-label="'+esc(t("q.close"))+'">✕</button></h3><p class="qsub">'+esc(t("q.sub"))+'</p>'
    +q.meters.map(function(m){
      var pct=m.limit?Math.min(100,m.used/m.limit*100):0,cls=pct>=100?" lock":pct>=80?" warn":"";
      var left=Math.max(0,m.limit-m.used);
      return '<div class="qm'+cls+'"><div class="qh"><b>'+esc(t("q.m."+m.id))+'</b><span>'+esc(pct>=100?t("q.full"):t("q.left",{v:fmtMeter(m,left)}))+'</span></div>'
        +'<div class="qbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(pct)+'" aria-label="'+esc(t("q.m."+m.id))+'"><i style="width:'+pct.toFixed(1)+'%"></i></div>'
        +'<div class="qf"><span>'+esc(t("q.of",{u:fmtMeter(m,m.used),l:fmtMeter(m,m.limit)}))+(m.approx?" · "+esc(t("q.approx")):"")+'</span>'
        +'<span>'+(m.used>0&&m.resetSec>0?esc(t("q.reset",{t:fmtWait(Math.max(0,m.resetSec-(Date.now()-(S.quotaAt||Date.now()))/1000))})):"")+'</span></div></div>';}).join("")
    +'<div class="qnote">'+esc(t("q.note.txt"))+(q.partial?'<br>⚠ '+esc(t("q.partial")):"")+'</div>';
}
$("btnQuota").onclick=function(e){e.stopPropagation();openQuota($("quotaBox").hidden);};
$("quotaBox").addEventListener("click",function(e){e.stopPropagation();if(e.target.closest("#qClose")){openQuota(false);$("btnQuota").focus();}});
$("lockBanner").addEventListener("click",function(e){if(e.target.closest("#lockSee"))openQuota(true);});
document.addEventListener("click",function(){if(!$("quotaBox").hidden)openQuota(false);});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!$("quotaBox").hidden){openQuota(false);$("btnQuota").focus();}});

/* ===================== tải video lên máy giặt (R2 qua trạm): người dùng không phải làm gì ===================== */
function canUpload(){return !!CONFIG.relay;}
function upErr(status,msg){return status===429?"rate limited":status===413?"too large":(msg||("HTTP "+status));}
function relayJSON(path,body){
  return fetchTimeout(relayURL(path),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)},20000).then(function(r){
    return r.text().then(function(tx){var j={};try{j=JSON.parse(tx);}catch(e){}
      if(!r.ok){var er=new Error(upErr(r.status,j.error));er.status=r.status;er.body=j;throw er;}return j;});});
}
function putPart(url,blob,onProg,up){
  return new Promise(function(res,rej){
    var x=new XMLHttpRequest();x.open("PUT",url);x.timeout=600000;up.xhr=x;
    x.upload.onprogress=function(e){if(e.lengthComputable)onProg(e.loaded);};
    x.onload=function(){var j={};try{j=JSON.parse(x.responseText);}catch(e){}
      if(x.status>=200&&x.status<300&&j.etag)res(j);else{var er=new Error(upErr(x.status,j.error));er.status=x.status;rej(er);}};
    x.onerror=function(){rej(new Error("network"));};x.ontimeout=function(){rej(new Error("timeout"));};
    x.onabort=function(){rej(new Error("cancel"));};
    x.send(blob);
  });
}
function uploadFile(file,name,up){
  return relayJSON("/upload/start",{name:name,size:file.size}).then(function(s){
    var parts=[],i=0;
    function next(){
      if(up.cancel)throw new Error("cancel");
      if(i*s.partSize>=file.size)return relayJSON("/upload/complete",{key:s.key,uploadId:s.uploadId,parts:parts});
      var n=i+1,base=i*s.partSize,blob=file.slice(base,base+s.partSize);
      var url=relayURL("/upload/part?key="+encodeURIComponent(s.key)+"&uploadId="+encodeURIComponent(s.uploadId)+"&n="+n);
      function attempt(k){
        return putPart(url,blob,function(l){up.sent=base+l;upTick();},up).catch(function(e){
          if(up.cancel)throw new Error("cancel");
          if(k<3&&(!e.status||e.status>=500))return new Promise(function(r){setTimeout(r,1500*k);}).then(function(){return attempt(k+1);});
          throw e;});
      }
      return attempt(1).then(function(p){parts.push({partNumber:p.partNumber,etag:p.etag});i++;up.sent=Math.min(file.size,i*s.partSize);upTick();return next();});
    }
    return next();
  }).then(function(c){return c.url;});
}
var upT=0;function upTick(){var n=Date.now();if(n-upT<250)return;upT=n;update();}
function startUpload(key){
  var d=S.drops[key];if(!d||!d.file||!canUpload()||!S.power)return null;
  var up=d.up={state:"up",sent:0,total:d.file.size,url:"",err:"",cancel:false,xhr:null};
  up.p=uploadFile(d.file,key,up).then(function(url){up.state="ok";up.url=url;d.file=null;})
    .catch(function(e){if(up.cancel)return;up.state="err";up.err=e.message;
      if(e.body&&e.body.error==="quota"){quotaHit(e.body);return;}
      toast(t("err.upload",{m:e.message}),"bad");sfx("error");})
    .then(function(){update();});
  update();return up.p;
}
function cancelUpload(key){var d=S.drops[key];if(d&&d.up&&d.up.state==="up"){d.up.cancel=true;try{d.up.xhr.abort();}catch(e){}}}
function uploadPct(){
  var tot=0,sent=0;Object.keys(S.drops).forEach(function(k){var d=S.drops[k];if(S.videos[k]&&d.up&&d.up.state==="up"){tot+=d.up.total;sent+=d.up.sent;}});
  return tot?Math.min(99,Math.floor(sent*100/tot)):null;
}
/* trả về {tên: url} cho các video của mẻ giặt; đợi tải xong, thử lại video bị lỗi */
function ensureUploads(keys){
  var map={},ps=[];
  keys.forEach(function(k){
    var d=S.drops[k];if(!d||!canUpload())return;
    function fin(){if(d.up.state!=="ok")throw new Error(d.up.err||"upload");map[k]=d.up.url;}
    if(d.up&&d.up.state==="ok")map[k]=d.up.url;
    else if(d.up&&d.up.state==="up")ps.push(d.up.p.then(fin));
    else if(d.file){var p=startUpload(k);if(p)ps.push(p.then(fin));}
  });
  return Promise.all(ps).then(function(){return map;});
}
window.addEventListener("beforeunload",function(e){if(uploadPct()!==null){e.preventDefault();e.returnValue="";}});

function plugNudge(){if(SCENE)SCENE.plugPulse();sayHold(t("say.needPower"));toast(t("toast.needPlug"),"bad");sfx("error");}
function handleFiles(list){
  var files=Array.prototype.slice.call(list||[]);if(!files.length)return;
  if(!S.power){plugNudge();return;}
  if(isLocked()){lockNudge();return;}
  var vids=files.filter(isVideo);
  if(!vids.length){sayHold(t("say.onlyVideo"));toast(t("err.onlyVideo"),"bad");sfx("error");return;}
  if(files.length>vids.length)toast(t("err.skipped",{n:files.length-vids.length}));
  var wj=watchJob(),busy=wj&&isActive(wj);
  if(busy)toast(t("err.busy"));else S.watchId="";
  if(S.pullOpen)closePull();
  sfx("drop");S.hold=0;
  var pending=vids.map(addDrop);
  sayHold(t("say.thinking"));
  if(SCENE)SCENE.bounce();
  update();
  /* thả xong → vải rơi vào lồng, camera zoom vào màn hình máy, mở bảng cài đặt */
  if(!busy)setTimeout(openPanel,REDUCE?0:900);
  Promise.all(pending).then(function(){applyActiveMeta();S.hold=0;S.typeNext=true;update();});
}
function pickFile(){$("fileIn").click();}
$("fileIn").addEventListener("change",function(){handleFiles(this.files);this.value="";});
$("doorHint").onclick=pickFile;$("noGLbtn").onclick=pickFile;$("btnPickBar").onclick=pickFile;
(function(){
  var depth=0;
  function hasFiles(e){return e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],"Files")>=0;}
  window.addEventListener("dragenter",function(e){if(!hasFiles(e))return;depth++;if(!S.dragging){S.dragging=true;document.body.classList.add("drag");renderMachine();}});
  window.addEventListener("dragleave",function(e){if(!hasFiles(e))return;depth=Math.max(0,depth-1);if(!depth&&S.dragging){S.dragging=false;document.body.classList.remove("drag");renderMachine();}});
  window.addEventListener("dragover",function(e){if(hasFiles(e))e.preventDefault();});
  window.addEventListener("drop",function(e){if(!hasFiles(e))return;e.preventDefault();depth=0;S.dragging=false;document.body.classList.remove("drag");handleFiles(e.dataTransfer.files);});
})();

/* ===================== mở cửa, lấy vải ra (xoá video) ===================== */
function openPull(){
  var vids=selectedVideos();
  if(!vids.length){pickFile();return;}
  S.pullOpen=true;if(SCENE)SCENE.openDoor(true);renderPull();
}
function closePull(){S.pullOpen=false;if(SCENE)SCENE.openDoor(false);$("pullBox").hidden=true;}
function renderPull(){
  var box=$("pullBox");if(!S.pullOpen){box.hidden=true;return;}
  var vids=selectedVideos();
  box.innerHTML='<b class="pt">'+esc(t("pull.title"))+'</b>'
    +vids.map(function(k){var d=S.drops[k];
      return '<div class="pr">'+(d&&d.thumb?'<img alt="" src="'+esc(d.thumb)+'">':'<span class="th0">🎞</span>')+'<span class="nm" title="'+esc(videoTitle(k))+'">'+esc(videoTitle(k))+'</span><button class="btn sec" data-take="'+esc(k)+'">'+esc(t("pull.take"))+'</button></div>';}).join("")
    +'<small>'+esc(t("pull.note"))+'</small><div class="pa"><button class="btn sec" id="pullAdd">'+esc(t("pull.add"))+'</button><button class="btn" id="pullClose">'+esc(t("pull.close"))+'</button></div>';
  box.hidden=false;
}
$("pullBox").addEventListener("click",function(e){
  var tk=e.target.closest("[data-take]");if(tk){takeOut(tk.dataset.take);return;}
  if(e.target.closest("#pullAdd")){closePull();pickFile();return;}
  if(e.target.closest("#pullClose"))closePull();
});
function takeOut(key){
  var shown=S.drops[key]&&S.drops[key]===activeDrop();
  $("pullBox").hidden=true;S.pullOpen=false;
  function done(){cancelUpload(key);delete S.videos[key];delete S.drops[key];S.hold=0;sayHold(t("say.pulled"));sfx("tick");update();}
  if(SCENE&&shown&&SCENE.hasCloth())SCENE.pullOut(done);
  else{if(SCENE)SCENE.openDoor(false);done();}
}

/* ===================== danh sách video (trong bảng cài đặt) ===================== */
function renderVideos(){
  var names=S.videoList.map(function(v){return v.name;});Object.keys(S.videos).forEach(function(k){if(names.indexOf(k)<0)names.push(k);});
  var html=names.map(function(n){
    var meta=S.videoList.filter(function(v){return v.name===n;})[0],d=S.drops[n],title=d?d.orig:n;
    var sub=d?(d.probing?t("video.read"):(d.w?d.w+"×"+d.h+(d.dur?" · "+secsLabel(d.dur):""):"")):(meta?meta.size:"");
    var up=d&&d.up,tag=up?(up.state==="up"?'<span class="tag warn">'+esc(t("tag.up",{p:Math.min(99,Math.floor(up.sent*100/Math.max(1,up.total)))}))+'</span>':up.state==="ok"?'<span class="tag ok">'+esc(t("tag.upok"))+'</span>':'<span class="tag warn">'+esc(t("tag.uperr"))+'</span>')
      :meta?'<span class="tag ok">'+esc(t("tag.kaggle"))+'</span>':(d?'<span class="tag warn">'+esc(t("tag.nokaggle"))+'</span>':'');
    return '<label class="vcard"><input type="checkbox" data-v="'+esc(n)+'"'+(S.videos[n]?" checked":"")+' aria-label="'+esc(title)+'">'
      +'<span class="th">'+(d&&d.thumb?'<img alt="" src="'+esc(d.thumb)+'">':'🎞')+'</span><span class="ck">✓</span>'
      +'<span class="mt"><span class="nm" title="'+esc(title)+'">'+esc(title)+'</span><span class="sub">'+esc(sub)+'</span>'+tag+'</span></label>';
  }).join("");
  $("videoList").innerHTML=html+'<button class="vadd" id="btnPick"><b>＋</b><span>'+esc(names.length?t("video.add"):t("video.choose"))+'</span></button>';
  var up=canUpload()?[]:Object.keys(S.drops).filter(function(k){return S.videos[k]&&!inDataset(k);}),box=$("upNote");
  if(!up.length){box.hidden=true;box.innerHTML="";return;}
  box.hidden=false;
  box.innerHTML='<b>'+esc(t("up.title"))+'</b> '+esc(t("up.run"))
    +up.map(function(k){var cmd="bash runner/add_video.sh '/path/to/"+S.drops[k].orig.replace(/'/g,"'\\''")+"'";
      return '<div class="cmd"><code>'+esc(cmd)+'</code><button class="btn sec" data-copy="'+esc(cmd)+'">'+esc(t("copy"))+'</button></div>';}).join("")
    +'<div class="hint" style="margin-top:6px">'+esc(t("up.hint"))+'</div>';
}
$("videoList").addEventListener("change",function(e){var i=e.target.closest("input");if(i){S.videos[i.dataset.v]=i.checked;applyActiveMeta();update();}});
$("videoList").addEventListener("click",function(e){if(e.target.closest("#btnPick")){e.preventDefault();pickFile();}});
$("upNote").addEventListener("click",function(e){var c=e.target.closest("[data-copy]");if(c)copyText(c.dataset.copy);});
$("btnVidAdd").onclick=function(){var n=$("vidManual").value.trim();if(!n)return;S.videos[n]=true;$("vidManual").value="";update();};

/* ===================== job ===================== */
function newId(){var d=new Date(),p=function(n){return String(n).padStart(2,"0");};
  return "j"+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"-"+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds())+Math.random().toString(36).slice(2,4);}
function buildJob(){
  var vids=selectedVideos(),dsFull=(S.dataset||"").split("/")[1]||"led-videos";
  return {
    id:newId(),label:(vids.join("+")||"job")+" → "+S.sizes.map(function(s){return s.w+"x"+s.h;}).join(", "),
    videos:vids,sizes:S.sizes.map(function(s){return {name:s.name,w:s.w,h:s.h};}),
    engine:S.engine,model:S.model,dtype:$("dtype").value,accelerator:accelerator(),
    steps:+$("steps").value,stride:+$("stride").value,gen_mpx:+$("mpx").value,scale:(+$("scale").value||100)/100,
    guidance:+$("guidance").value||5,seed:+$("seed").value||0,chunk:CHUNK,prompt:$("prompt").value.trim(),
    test_seconds:Math.max(0,+$("testSec").value||0),timeout_h:Math.min(12,Math.max(0.2,+$("timeout").value||11)),
    resume_from:$("resume").value||"",dataset:dsFull
  };
}
function validate(job){
  if(!job.videos.length)return t("val.noVideo");
  if(!job.sizes.length)return t("val.noSize");
  if(job.engine==="wan"&&!job.accelerator)return t("val.noGpu");
  return "";
}

/* ===================== kết nối: trạm điện (relay) hoặc token trực tiếp (?pro) ===================== */
function conn(){return {repo:($("repo").value||"").trim(),token:($("token").value||"").trim()};}
function relayURL(p){return CONFIG.relay.replace(/\/+$/,"")+p;}
function hasBackend(){var c=conn();return !!CONFIG.relay||!!(c.repo&&c.token);}
function gh(path,opts){
  var c=conn();opts=opts||{};opts.headers=Object.assign({"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},opts.headers||{});
  if(c.token)opts.headers.Authorization="Bearer "+c.token;
  return fetch("https://api.github.com/repos/"+c.repo+path,opts);
}
function checkConn(){
  var c=conn();if(!c.repo||!c.token)return Promise.resolve(false);
  return gh("").then(function(r){
    if(r.ok)return r.json().then(function(j){S.defaultBranch=j.default_branch||"main";$("connInfo").textContent="✓ "+c.repo;return true;});
    $("connInfo").textContent="✗ "+r.status;return false;
  }).catch(function(){$("connInfo").textContent="✗ network";return false;});
}
function connect(){
  if(CONFIG.relay){
    return fetchTimeout(relayURL("/health"),{cache:"no-store"},7000).then(function(r){return {ok:r.ok,why:r.ok?"":"relay"};},function(){return {ok:false,why:"relay"};});
  }
  var c=conn();
  if(c.repo&&c.token)return checkConn().then(function(ok){return {ok:ok,why:ok?"":"auth"};});
  return Promise.resolve({ok:false,why:"nobackend"});
}
function dispatch(workflow,inputs){
  if(CONFIG.relay)return fetchTimeout(relayURL("/dispatch"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workflow:workflow,inputs:inputs||{}})},15000);
  return gh("/actions/workflows/"+workflow+"/dispatches",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:S.defaultBranch,inputs:inputs||{}})});
}
function readJson(path,fallbackRel,name){
  function fb(){return fetch(fallbackRel+"?t="+Date.now(),{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();});}
  var c=conn();
  if(CONFIG.relay&&S.power)return fetchTimeout(relayURL("/data/"+name),{cache:"no-store"},8000).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).catch(fb);
  if(c.repo&&c.token)return gh("/contents/"+path+"?ref="+encodeURIComponent(S.defaultBranch),{headers:{"Accept":"application/vnd.github.raw+json"},cache:"no-store"})
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json();}).catch(fb);
  return fb();
}
function loadVideos(){return readJson("docs/data/videos.json","data/videos.json","videos").then(function(j){S.dataset=j.dataset||"";S.videoList=(j.videos||[]);update();}).catch(function(){update();});}
function loadJobs(){return readJson("docs/data/jobs.json","data/jobs.json","jobs").then(function(j){S.jobs=Array.isArray(j)?j:[];onJobs();}).catch(function(){onJobs();});}
function explain(status){var k="err."+status;var v=t(k);return v===k?t("err.http",{s:status}):v;}

/* ===================== cắm điện ===================== */
function renderPower(){
  var b=$("btnPower");b.classList.toggle("on",S.power);b.classList.toggle("busy",S.powering);
  $("powerLbl").textContent=S.power?t("power.on"):t("power.off");b.title=S.power?t("power.title.on"):t("power.title.off");
  b.setAttribute("aria-pressed",S.power?"true":"false");
}
function powerOn(){
  if(S.power||S.powering)return;
  S.powering=true;if(SCENE)SCENE.setPower(true);sayHold(t("say.powering"));sfx("plug");update();
  return connect().then(function(r){
    S.powering=false;
    if(r.ok){S.power=true;LS.setItem("led.power","1");sayHold(t("say.powered"));sfx("start");refreshAll();loadQuota();}
    else{
      if(SCENE)SCENE.setPower(false);LS.removeItem("led.power");
      toast(t("err.power."+r.why),"bad");sayHold(t("say.powerFail"));sfx("error");
      if(PRO){$("pro").hidden=false;$("pro").scrollIntoView({behavior:"smooth"});}
    }
    update();
  });
}
function powerOff(){
  if(!S.power)return;
  if(machineState()==="washing"){sayHold(t("say.noUnplug"));return;}
  if(S.panelOpen)closePanel();if(S.pullOpen)closePull();
  S.power=false;LS.removeItem("led.power");if(SCENE)SCENE.setPower(false);sfx("tick");update();
}
$("btnPower").onclick=function(){S.power?powerOff():powerOn();};
$("btnPowerBar").onclick=powerOn;
$("plugHint").onclick=powerOn;

/* ===================== lịch sử giặt ===================== */
var JSTAT={submitted:["job.queue","queue","loaded"],queued:["job.queue","queue","loaded"],running:["job.run","run","washing"],
  done:["job.ok","ok","done"],error:["job.bad","bad","error"],cancelled:["job.cancel","bad","idle"]};
function fmt(x){return x?String(x).replace("T"," ").replace("Z"," UTC"):"";}
function previewsOf(j){return (j&&Array.isArray(j.previews))?j.previews.filter(function(p){return p&&p.mp4;}):[];}
function posterOf(j){var p=previewsOf(j)[0];return p&&p.jpg?p.jpg:"";}
function doneJobs(){
  return S.jobs.filter(function(j){return j.status==="done";}).sort(function(a,b){return String(b.finished_at||b.submitted_at||"").localeCompare(String(a.finished_at||a.submitted_at||""));});
}
/* mẻ giặt vừa xong: tấm vải trong lồng phải bay ra TRƯỚC khi danh sách vải phơi được đồng bộ (tránh treo sẵn, không có đường bay) */
function maybeEject(){
  var wj=watchJob();
  if(SCENE&&wj&&wj.status==="done"&&S.ejected!==wj.id&&SCENE.hasCloth()){S.ejected=wj.id;SCENE.finishLoad(wj.id,posterOf(wj));}
}
function syncHung(){
  if(!SCENE)return;
  maybeEject();
  SCENE.setBasketCount(Math.min(6,doneJobs().length));
  SCENE.setHung(doneJobs().slice(0,4).map(function(j){return {id:j.id,poster:posterOf(j)};}));
}
function renderJobs(){
  var act=S.jobs.some(isActive);
  $("histN").textContent=S.jobs.length;$("jobsMeta").textContent=act?t("hist.meta.active"):"";
  $("resume").innerHTML='<option value="">(none)</option>'+S.jobs.filter(function(j){return j.kernel;}).map(function(j){return '<option value="'+esc(j.id)+'">'+esc(j.id)+' — '+esc(j.status)+'</option>';}).join("");
  $("jobs").innerHTML=S.jobs.length?S.jobs.map(function(j){
    var st=JSTAT[j.status]||[null,"queue","idle"],sizes=(j.sizes||[]).map(function(s){return s.w+"×"+s.h;}).join(", ");
    var h='<div class="job"><div class="ico" aria-hidden="true">'+mascotSVG(st[2])+'</div><div><div class="top2"><b>'+esc(j.id)+'</b><span class="badge b-'+st[1]+'">'+esc(st[0]?t(st[0]):(j.status||"?"))+'</span></div>';
    h+='<div class="meta">'+esc(j.label||"")+'<br>'+esc(sizes)+' · '+esc(modeLabel(j.engine==="blur"?"quick":(j.model==="14b"?"deep":"normal")))+(j.test_seconds?(' · '+esc(t("job.test",{s:j.test_seconds}))):'')+'<br>'+esc(t("job.sent"))+' '+esc(fmt(j.submitted_at))+(j.finished_at?(' · '+esc(t("job.finished"))+' '+esc(fmt(j.finished_at))):'')+'</div>';
    h+='<div class="acts">';
    if(j.status==="done")h+='<button class="btn mint" data-view="'+esc(j.id)+'">'+esc(t("job.view"))+'</button>';
    if(j.output_cmd)h+='<button class="btn sec" data-copy="'+esc(j.output_cmd)+'">'+esc(t("job.get"))+'</button>';
    if(j.kernel_url)h+='<a class="btn sec" target="_blank" rel="noopener" href="'+esc(j.kernel_url)+'">'+esc(t("job.kaggle"))+'</a>';
    if(j.run_url)h+='<a class="btn sec" target="_blank" rel="noopener" href="'+esc(j.run_url)+'">'+esc(t("job.log"))+'</a>';
    h+='<button class="btn sec" data-reuse="'+esc(j.id)+'">'+esc(t("job.reuse"))+'</button></div>';
    if(j.error_tail)h+='<details><summary>'+esc(t("job.errq"))+'</summary><pre>'+esc(j.error_tail)+'</pre></details>';
    return h+'</div></div>';
  }).join(""):'<div class="empty">'+t("hist.empty")+'</div>';
  syncHung();
}
function openHistory(open){$("history").hidden=!open;$("btnHist").setAttribute("aria-expanded",open?"true":"false");if(open)$("btnClose").focus();}
$("btnHist").onclick=function(){openHistory($("history").hidden);};
$("btnHist2").onclick=function(){openHistory(true);};
$("btnClose").onclick=function(){openHistory(false);$("btnHist").focus();};
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape")return;
  if(S.viewId)closeViewer();else if(!$("history").hidden)openHistory(false);else if(S.panelOpen)closePanel();else if(S.pullOpen)closePull();
});
$("jobs").addEventListener("click",function(e){
  var c=e.target.closest("[data-copy]");if(c){copyText(c.dataset.copy);return;}
  var v=e.target.closest("[data-view]");if(v){openHistory(false);openViewer(v.dataset.view);return;}
  var r=e.target.closest("[data-reuse]");
  if(r){var j=S.jobs.filter(function(x){return x.id===r.dataset.reuse;})[0];if(j){applyJob(j);openHistory(false);toast(t("toast.reused",{id:j.id}),"good");setTimeout(openPanel,300);}}
});
function applyJob(j){
  S.watchId="";S.videos={};(j.videos||[]).forEach(function(v){S.videos[v]=true;});
  S.sizes=(j.sizes||[]).map(function(s){return {name:s.name,w:s.w,h:s.h};});S.selSize=0;
  if(j.engine)setMode(modeFrom(j.engine,j.model));
  var g=GPUS.filter(function(x){return x.id===j.accelerator;})[0];if(g){$("gpu").value=g.id;}else if(j.accelerator&&j.accelerator!=="CPU"){$("gpu").value="custom";$("gpuCustom").value=j.accelerator;}
  if(j.steps)$("steps").value=j.steps;if(j.stride)$("stride").value=String(j.stride);if(j.gen_mpx)$("mpx").value=j.gen_mpx;
  if(j.scale)$("scale").value=Math.round(j.scale*100);$("testSec").value=j.test_seconds||0;update();
}

/* ===================== xem video đã resize (bấm vào tấm vải đang phơi) ===================== */
function openViewer(id){
  var j=S.jobs.filter(function(x){return x.id===id;})[0];if(!j)return;
  S.viewId=id;S.viewIdx=0;renderViewer();
  $("vscrim").hidden=$("viewwrap").hidden=false;$("viewer").classList.remove("in");void $("viewer").offsetWidth;$("viewer").classList.add("in");
  $("app").setAttribute("inert","");sfx("zoom");setTimeout(function(){$("viewer").focus({preventScroll:true});},50);
}
function renderViewer(){
  var j=S.jobs.filter(function(x){return x.id===S.viewId;})[0];if(!j)return;
  var pv=previewsOf(j),cur=pv[S.viewIdx||0],vid=$("vwVideo");
  $("vwTitle").textContent=t("view.title");
  $("vwTabs").innerHTML=pv.length>1?pv.map(function(p,i){return '<button class="tab'+(i===(S.viewIdx||0)?' on':'')+'" data-i="'+i+'">'+esc(p.label||t("view.out",{n:i+1}))+'</button>';}).join(""):"";
  var meta=[];if(cur&&cur.w)meta.push(t("view.size")+": "+cur.w+"×"+cur.h);if(j.label)meta.push(j.label);
  $("vwMeta").textContent=meta.join(" · ");
  if(cur){
    $("vwEmpty").hidden=true;vid.hidden=false;
    if(vid.getAttribute("src")!==cur.mp4){vid.setAttribute("src",cur.mp4);if(cur.jpg)vid.setAttribute("poster",cur.jpg);else vid.removeAttribute("poster");try{vid.play().catch(function(){});}catch(e){}}
  }else{vid.pause();vid.removeAttribute("src");vid.hidden=true;$("vwEmpty").hidden=false;$("vwEmpty").textContent=t("view.none");}
  var cmd=j.output_cmd||"";
  $("vwCopy").hidden=!cmd;$("vwCopy").dataset.copy=cmd;
  $("vwKaggle").hidden=!j.kernel_url;if(j.kernel_url)$("vwKaggle").href=j.kernel_url;
}
function closeViewer(){
  if(!S.viewId)return;S.viewId="";
  var vid=$("vwVideo");try{vid.pause();}catch(e){}vid.removeAttribute("src");vid.load();
  $("vscrim").hidden=$("viewwrap").hidden=true;$("app").removeAttribute("inert");
}
$("vwClose").onclick=closeViewer;$("vscrim").onclick=closeViewer;
$("vwTabs").addEventListener("click",function(e){var b=e.target.closest("[data-i]");if(b){S.viewIdx=+b.dataset.i;renderViewer();}});
$("vwCopy").onclick=function(){if(this.dataset.copy)copyText(this.dataset.copy);};

/* ===================== máy giặt: trạng thái ===================== */
function watchJob(){return S.watchId?(S.jobs.filter(function(j){return j.id===S.watchId;})[0]||null):null;}
function machineState(){
  if(!S.power)return "off";
  var wj=watchJob();
  if(S.sending)return "washing";
  if(S.watchId){if(!wj||isActive(wj))return "washing";return wj.status==="done"?"done":"error";}
  if(S.dragging)return "hungry";
  return selectedVideos().length?"loaded":"idle";
}
function loadedLine(){
  var sz=S.sizes[S.selSize];
  if(!S.sizes.length)return t("say.chooseLed");
  var f=info(sz);
  return f.pass?t("say.fit"):t("say.fill",{p:Math.round(f.fill*100)});
}
function hms(ms){var s=Math.max(0,Math.floor(ms/1000)),p=function(n){return String(n).padStart(2,"0");};return p(Math.floor(s/3600))+":"+p(Math.floor(s/60)%60)+":"+p(s%60);}
function renderMachine(){
  var st=machineState(),changed=st!==S.mstate,a=activeDrop();
  S.mstate=st;
  if(SCENE){
    SCENE.setState(st);
    var showCloth=a&&a.thumb&&(st==="loaded"||st==="hungry"||st==="washing"||st==="error");
    SCENE.setCloth(showCloth?a.thumb:null);
  }
  if(!SCENE&&!$("noGL").hidden)$("noGLm").innerHTML=mascotSVG(st==="off"?"idle":st);
  $("doorHint").hidden=!((st==="idle"||st==="hungry")&&!!SCENE&&!S.panelOpen&&!S.pullOpen&&!isLocked());
  $("hintText").innerHTML=st==="hungry"?t("door.hint.drag"):t("door.hint");
  $("plugHint").hidden=!(st==="off"&&!!SCENE&&!S.powering);
  if(Date.now()>S.hold){
    var typed=changed||S.typeNext;S.typeNext=false;
    if(isLocked()&&(st==="idle"||st==="hungry"||st==="loaded")){if(S.sayState!=="locked"||typed)say(t("say.locked"),typed);S.sayState="locked";}
    else{
      if(st==="loaded")say(loadedLine(),typed);
      else if(changed||S.sayState!==st)say(line("say."+st),typed);
      S.sayState=st;
    }
  }
  if(changed&&st==="done"){sfx("done");maybeEject();}
  if(changed&&st==="washing"){if(S.panelOpen)closePanel();if(S.pullOpen)closePull();}
  if(st==="off"&&S.pullOpen)closePull();
  renderLcd();renderBar();renderPower();
  document.title=(st==="washing"?t("doc.washing"):st==="done"?t("doc.done"):st==="error"?t("doc.error"):"")+t("meta.title");
  $("btnRun").disabled=$("btnRun2").disabled=!!S.sending||isLocked();
}
function renderLcd(){
  var st=S.mstate,wj=watchJob(),e=estimate(),main="",sub="",ph=-1,err=false,vids=selectedVideos().length,sz=S.sizes[S.selSize];
  var est=S.engine==="wan"&&e.chunks?" · ≈"+fmtDur(e.wallH):"";
  if(st==="off"||st==="idle"){main=t("lcd.ready");sub=t("lcd.ready.sub");}
  else if(st==="hungry"){main=t("lcd.hungry");sub=t("lcd.hungry.sub");}
  else if(st==="loaded"){main=S.sizes.length?t("lcd.press"):t("lcd.pickLed");sub=t("lcd.loaded.sub",{n:vids,size:sz?" · "+sz.w+"×"+sz.h:"",est:est});}
  else if(st==="washing"){
    var start=wj&&wj.submitted_at?Date.parse(wj.submitted_at):S.watchTs;
    var upl=S.sending?uploadPct():null;
    if(upl!==null){main=t("lcd.upload");ph=0;}else if(S.sending||!wj){main=t("lcd.send");ph=0;}else if(wj.status==="running"){main=t("lcd.wash");ph=2;}else{main=t("lcd.queue");ph=1;}
    sub=upl!==null?t("lcd.upload.sub",{p:upl}):t("lcd.wash.sub",{t:hms(Date.now()-(start||Date.now())),est:est});
  }
  else if(st==="done"){main=t("lcd.done");sub=t("lcd.done.sub");ph=3;}
  else{main=t("lcd.err");sub=wj&&wj.status==="cancelled"?t("lcd.err.cancel"):t("lcd.err.sub");err=true;}
  if(isLocked()&&(st==="idle"||st==="hungry"||st==="loaded")){main=t("lcd.locked");sub=resetLeft()>0?t("lcd.locked.sub",{t:fmtWait(resetLeft())}):"";err=true;}
  if(SCENE)SCENE.setLcd({main:main,sub:sub,phase:ph,err:err});
  $("srStatus").textContent=st==="off"?t("bar.off"):main+". "+sub;
  $("wTitle").textContent=ph===0?t("wash.send"):ph===1?t("wash.queue"):t("wash.run");
  $("wSub").textContent=sub;
  Array.prototype.forEach.call($("washSteps").children,function(li,i){li.className=i<ph?"done":(i===ph?"on":"");});
}
function renderBar(){
  var st=S.mstate,wj=watchJob(),a=activeDrop();
  $("barOff").hidden=st!=="off";
  $("barIdle").hidden=!(st==="idle"||st==="hungry");
  $("barLoaded").hidden=st!=="loaded";
  $("dkWash").hidden=st!=="washing";
  var th=$("barThumb");if(a&&a.thumb){th.src=a.thumb;th.hidden=false;}else{th.hidden=true;}
  var d=$("dkDone"),r=$("dkErr");
  if(st==="done"&&wj){
    d.hidden=false;
    d.innerHTML='<div class="big">'+esc(t("done.title"))+'</div><div class="hint">'+esc(t("done.hint"))+'</div>'
      +'<div class="acts"><button class="btn mint" data-view="'+esc(wj.id)+'">'+esc(t("done.view"))+'</button>'+(wj.output_cmd?'<button class="btn sec" data-copy="'+esc(wj.output_cmd)+'">'+esc(t("done.copy"))+'</button>':'')
      +(wj.kernel_url?'<a class="btn sec" target="_blank" rel="noopener" href="'+esc(wj.kernel_url)+'">'+esc(t("done.kaggle"))+'</a>':'')+'<button class="btn sec" id="btnNew">'+esc(t("done.new"))+'</button></div>';
  }else{d.hidden=true;d.innerHTML="";}
  if(st==="error"&&wj){
    r.hidden=false;
    r.innerHTML='<div class="big">'+esc(t("fail.title"))+'</div>'+(wj.error_tail?'<details style="width:100%"><summary class="hint" style="cursor:pointer">'+esc(t("fail.view"))+'</summary><pre>'+esc(wj.error_tail)+'</pre></details>':'')
      +'<div class="acts">'+(wj.run_url?'<a class="btn sec" target="_blank" rel="noopener" href="'+esc(wj.run_url)+'">'+esc(t("fail.log"))+'</a>':'')+'<button class="btn" id="btnNew">'+esc(t("fail.retry"))+'</button></div>';
  }else{r.hidden=true;r.innerHTML="";}
  if(SCENE)requestAnimationFrame(function(){SCENE.resize();});
}
function barClick(e){
  var c=e.target.closest("[data-copy]");if(c){copyText(c.dataset.copy);return;}
  var v=e.target.closest("[data-view]");if(v){openViewer(v.dataset.view);return;}
  if(e.target.closest("#btnNew")){var failed=S.mstate==="error";S.watchId="";if(!failed)S.videos={};update();if(failed)setTimeout(openPanel,200);}
}
$("dkDone").addEventListener("click",barClick);$("dkErr").addEventListener("click",barClick);

/* ===================== bảng cài đặt: màn LCD phóng to ===================== */
var panelState={last:null,closing:null};
function panelFlip(p,toTiny){
  var r=SCENE&&SCENE.screenRect&&SCENE.screenRect();
  if(!r||REDUCE)return false;
  var cr=$("gl").getBoundingClientRect(),f=p.getBoundingClientRect();
  var cx=cr.left+r.x+r.w/2,cy=cr.top+r.y+r.h/2,fx=f.left+f.width/2,fy=f.top+f.height/2;
  var sc=clamp(r.w/f.width,0.05,1);
  var tiny="translate("+(cx-fx)+"px,"+(cy-fy)+"px) scale("+sc+")";
  if(toTiny){p.style.transition="transform .42s cubic-bezier(.5,0,.8,.3),opacity .3s .12s";p.style.transform=tiny;p.style.opacity="0";}
  else{p.style.transition="none";p.style.transformOrigin="50% 50%";p.style.transform=tiny;p.style.opacity="0";void p.offsetWidth;
    p.style.transition="transform .6s cubic-bezier(.16,1,.3,1),opacity .25s";p.style.transform="none";p.style.opacity="1";}
  return true;
}
function setInert(on){var el=$("app");if(on)el.setAttribute("inert","");else if(!S.viewId)el.removeAttribute("inert");}
function openPanel(){
  if(S.panelOpen||S.mstate==="washing"||S.mstate==="off"||S.sending)return;
  if(isLocked()){lockNudge();return;}
  if(S.pullOpen)closePull();
  S.panelOpen=true;panelState.last=document.activeElement;clearTimeout(panelState.closing);
  var p=$("panel");
  $("scrim").hidden=$("panelwrap").hidden=false;
  p.style.transition="none";p.style.transform="none";p.style.opacity="1";
  setInert(true);$("panelMsg").textContent="";p.classList.remove("in");void p.offsetWidth;p.classList.add("in");
  renderVideos();drawPreview();
  if(!panelFlip(p,false)){p.style.opacity="0";void p.offsetWidth;p.style.transition="opacity .25s";p.style.opacity="1";}
  if(SCENE)SCENE.focus(true);
  sfx("zoom");renderMachine();
  setTimeout(function(){drawPreview();p.focus({preventScroll:true});},60);
}
function closePanel(){
  if(!S.panelOpen)return;S.panelOpen=false;
  var p=$("panel");
  function fin(){$("scrim").hidden=$("panelwrap").hidden=true;p.classList.remove("in");p.style.transition="none";p.style.transform="none";
    setInert(false);if(panelState.last&&panelState.last.focus&&document.contains(panelState.last))try{panelState.last.focus({preventScroll:true});}catch(e){}renderMachine();}
  if(SCENE)SCENE.focus(false);
  if(panelFlip(p,true)){panelState.closing=setTimeout(fin,430);}else fin();
  $("scrim").style.transition="opacity .3s";$("scrim").style.opacity="0";setTimeout(function(){$("scrim").style.opacity="";$("scrim").style.transition="";},450);
}
$("panelClose").onclick=closePanel;
$("scrim").onclick=closePanel;
$("barOpen").onclick=openPanel;

/* ===================== chạy / gửi phiếu ===================== */
function panelMsg(txt){var m=$("panelMsg");m.textContent=txt;clearTimeout(panelMsg._t);panelMsg._t=setTimeout(function(){m.textContent="";},6000);}
function run(){
  var job=buildJob(),err=validate(job);
  if(err){if(!S.panelOpen)openPanel();panelMsg(err);sayHold(err);sfx("error");if(!job.videos.length)flagNeed(1);else if(!job.sizes.length)flagNeed(2);$("pMascot").innerHTML=mascotSVG("error");panelMsg._face="";return;}
  if(!S.power){closePanel();plugNudge();return;}
  if(isLocked()){closePanel();lockNudge();return;}
  S.sending=true;S.watchId=job.id;S.watchTs=Date.now();S.hold=0;
  closePanel();update();
  ensureUploads(job.videos).then(function(map){
    if(Object.keys(map).length)job.uploads=map;
    var txt=JSON.stringify(job);if(txt.length>60000){var e=new Error("tooLong");e.tooLong=true;throw e;}
    S.watchTs=Date.now();
    return dispatch("submit.yml",{job:txt});
  }).then(function(r){
    S.sending=false;
    if(r.status===204||r.status===200){toast(t("toast.sent"),"good");sfx("start");pollSoon();}
    else{S.watchId="";r.text().then(function(b){var j=null;try{j=JSON.parse(b);}catch(e){}
      if(j&&j.error==="quota"){quotaHit(j);return;}
      toast(explain(r.status)+" "+(b||"").slice(0,120),"bad");sfx("error");});}
    if(r.status===204||r.status===200)loadQuota();
  }).catch(function(e){S.sending=false;S.watchId="";
    if(e.tooLong)toast(t("err.tooLong"),"bad");else if(!/^cancel$/.test(e.message)&&!/upload|network|timeout|rate|large|HTTP|configured/i.test(e.message))toast(t("err.net",{m:e.message}),"bad");
    sfx("error");})
    .then(function(){update();});
}
$("btnRun").onclick=run;$("btnRun2").onclick=run;

function onJobs(){
  S.jobs.forEach(function(j){
    var prev=S.prevStatus[j.id];
    if(j.id===S.watchId&&prev&&prev!==j.status){
      if(j.status==="done")toast(t("toast.done",{id:j.id}),"good");
      else if(j.status==="error"){toast(t("toast.failed",{id:j.id}),"bad");sfx("error");}
    }
    S.prevStatus[j.id]=j.status;
  });
  renderJobs();update();
}
$("btnSync").onclick=function(){
  if(!S.power){openHistory(false);plugNudge();return;}
  dispatch("poll.yml").then(function(r){if(r.status===204||r.status===200){toast(t("toast.sync"),"good");setTimeout(refreshAll,60000);}else toast(explain(r.status),"bad");}).catch(function(e){toast(t("err.net",{m:e.message}),"bad");});
};
$("btnRefresh").onclick=refreshAll;
function refreshAll(){return Promise.all([loadJobs(),loadVideos()]);}
function pollSoon(){
  var n=0;clearInterval(S.fast);
  S.fast=setInterval(function(){
    loadJobs();n++;
    if(S.watchId&&!watchJob()&&n>24){clearInterval(S.fast);toast(t("err.missing"),"bad");S.watchId="";update();}
    else if(n>24)clearInterval(S.fast);
  },15000);
}

/* ===================== lưu/khôi phục cài đặt ===================== */
var FIELDS=["srcW","srcH","srcDur","srcFps","scale","mpx","steps","stride","guidance","seed","prompt","testSec","timeout","secChunk","nWorkers","nShots","quota","dtype","gpuCustom"];
function saveSettings(){
  var o={};FIELDS.forEach(function(f){o[f]=$(f).value;});o.gpu=$("gpu").value;o.engine=S.engine;o.model=S.model;o.sizes=S.sizes;
  LS.setItem("led.settings",JSON.stringify(o));
}
function loadSettings(){
  var o;try{o=JSON.parse(LS.getItem("led.settings")||"null");}catch(e){o=null;}
  if(!o)return false;
  FIELDS.forEach(function(f){if(o[f]!=null)$(f).value=o[f];});if(o.gpu)$("gpu").value=o.gpu;
  if(o.engine)setMode(modeFrom(o.engine,o.model));
  if(Array.isArray(o.sizes)){S.sizes=o.sizes;}
  return true;
}

/* ===================== cập nhật chung ===================== */
function update(){
  var ts=+$("testSec").value||0;if(ts>0)$("testSec").dataset.last=ts;
  $("testOn").checked=ts>0;$("testV").textContent=(ts||+$("testSec").dataset.last||2)+"s";
  $("trialTitle").textContent=t("trial.title",{s:$("testV").textContent});
  $("scaleV").textContent=$("scale").value+"%";$("mpxV").textContent=(+$("mpx").value).toFixed(2)+" MP";$("stepsV").textContent=$("steps").value;
  var g=gpuObj();$("gpuNote").textContent=g.note;$("gpuCustom").style.display=g.id==="custom"?"block":"none";
  if(!update._w||update._gpu!==g.id){update._gpu=g.id;if(update._w)$("nWorkers").value=g.workers;update._w=true;}
  renderPresets();if(!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#videoList")))renderVideos();
  drawPreview();renderEstimate();
  if(SCENE)SCENE.setProgram(progIndex(),PRESETS.length+1);
  if(S.pullOpen)renderPull();
  renderQuota();renderMachine();saveSettings();
}
FIELDS.concat(["gpu"]).forEach(function(f){var el=$(f);el.addEventListener("input",update);el.addEventListener("change",update);});
$("btnJson").onclick=function(){var v=$("jsonView");v.style.display=v.style.display==="none"?"block":"none";v.textContent=JSON.stringify(buildJob(),null,2);};
$("btnDl").onclick=function(){var b=new Blob([JSON.stringify(buildJob(),null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="job.json";a.click();};
$("btnSaveConn").onclick=function(){var c=conn();LS.setItem("led.repo",c.repo);if(c.token)LS.setItem("led.token",c.token);checkConn().then(function(ok){if(ok){refreshAll();if(!S.power)powerOn();}});};
$("btnForget").onclick=function(){LS.removeItem("led.token");$("token").value="";$("connInfo").textContent="";};
$("btnSound").onclick=function(){S.sound=!S.sound;LS.setItem("led.sound",S.sound?"1":"0");renderSound();sfx("start");};
window.addEventListener("resize",function(){drawPreview();});

/* ===================== ngôn ngữ ===================== */
function sceneLabels(){return {quick:modeLabel("quick"),normal:modeLabel("normal"),deep:modeLabel("deep"),history:t("hist.btn"),phases:[t("lcd.ph0"),t("lcd.ph1"),t("lcd.ph2"),t("lcd.ph3")]};}
var NARROW=window.matchMedia&&matchMedia("(max-width:640px)");
function fillLangSel(){ /* màn hẹp: chỉ hiện mã ngôn ngữ (VI/EN/KO) cho khỏi chật thanh tiêu đề */
  var sel=$("langSel"),short=NARROW&&NARROW.matches;
  sel.innerHTML=LANGS.map(function(l){return '<option value="'+l.code+'">'+esc(short?l.code.toUpperCase():l.name)+'</option>';}).join("");sel.value=getLang();
}
if(NARROW){if(NARROW.addEventListener)NARROW.addEventListener("change",fillLangSel);else if(NARROW.addListener)NARROW.addListener(fillLangSel);}
function applyLang(code){
  setLang(code);applyStatic();fillLangSel();renderSound();
  if(SCENE)SCENE.setLabels(sceneLabels());
  S.sayState="";say._cur="";S.typeNext=true;S.hold=0;panelMsg._face="";
  update();renderJobs();if(S.viewId)renderViewer();if(S.pullOpen)renderPull();
}
$("langSel").onchange=function(){applyLang(this.value);};

/* ===================== cảnh 3D ===================== */
function insets(){
  var h=$("glwrap").clientHeight||innerHeight;
  return {top:clamp(h*0.15,40,92),bottom:$("bar").offsetHeight+28};
}
function onProject(p){
  var h=$("doorHint");
  if(!h.hidden){var d=Math.max(70,p.door.r*2*0.9);h.style.width=h.style.height=d+"px";h.style.transform="translate("+(p.door.x-d/2)+"px,"+(p.door.y-d/2)+"px)";}
  var s=$("say");
  if(!s.hidden){var x=clamp(p.bot.x,Math.min(130,p.w/2),Math.max(p.w-130,p.w/2));s.style.setProperty("--ax",(p.bot.x-x)+"px");s.style.transform="translate("+x+"px,"+(p.bot.y-4)+"px) translate(-50%,-100%)";}
  var ph=$("plugHint");
  if(!ph.hidden)ph.style.transform="translate("+clamp(p.plug.x,70,p.w-70)+"px,"+(p.plug.y-14)+"px) translate(-50%,-100%)";
  var pb=$("pullBox");
  if(!pb.hidden)pb.style.transform="translate("+clamp(p.door.x,Math.min(150,p.w/2),Math.max(p.w-150,p.w/2))+"px,"+(p.door.y+p.door.r*0.2)+"px) translate(-50%,0)";
}
function onPick(kind,mode,id){
  if(kind==="plug"){if(S.power)powerOff();else powerOn();return;}
  if(kind==="cloth"){if(id)openViewer(id);return;}
  if(S.mstate==="off"){if(kind==="door"||kind==="panel"||kind==="knob"||kind==="bot"){if(SCENE)SCENE.plugPulse();sayHold(line("say.off"));}else if(kind==="basket")openHistory(true);return;}
  if(kind==="door"){
    if(S.mstate==="washing"){sayHold(t("say.noOpen"));if(SCENE)SCENE.bounce();}
    else if(S.pullOpen)closePull();
    else if(selectedVideos().length&&S.mstate!=="done")openPull();
    else pickFile();
  }
  else if(kind==="panel"){if(S.mstate==="washing")openHistory(true);else openPanel();}
  else if(kind==="knob"){if(!S.sizes.length){openPanel();return;}S.selSize=(S.selSize+1)%S.sizes.length;sfx("tick");update();}
  else if(kind==="bottle"){setMode(mode);sfx("tick");update();}
  else if(kind==="basket"){openHistory(true);}
  else if(kind==="bot"){sayHold(line("say.poke"));}
}
function initScene(){
  var canvas=$("gl");
  if(!window.WebGLRenderingContext){fallback();return;}
  import("./scene.js").then(function(m){
    return m.createScene(canvas,{reduceMotion:REDUCE,lowPower:LOWPOWER,getInsets:insets,onProject:onProject,onPick:onPick,
      models:{machine:"models/machine.glb",bot:"models/bot.glb"}});
  }).then(function(api){
    SCENE=api;document.body.classList.add("gl");SCENE.setMode(S.mode);SCENE.setLabels(sceneLabels());SCENE.setPower(S.power,true);
    if(window.ResizeObserver)new ResizeObserver(function(){SCENE.resize();}).observe($("bar"));
    update();renderJobs();
  }).catch(function(e){console.error("[3D]",e);fallback();});
}
function fallback(){$("noGL").hidden=false;$("gl").hidden=true;$("noGLm").innerHTML=mascotSVG("idle");update();}

/* ===================== khởi động ===================== */
function loadConfig(){
  return fetchTimeout("config.json",{cache:"no-store"},2500).then(function(r){return r.ok?r.json():{};}).then(function(j){
    if(j&&typeof j.relay==="string"&&/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/i.test(j.relay))CONFIG.relay=j.relay; /* http chỉ cho localhost (demo) */
  }).catch(function(){});
}
function init(){
  setLang(detectLang());applyStatic();fillLangSel();
  renderGpu();
  var host=location.hostname||"",m=host.match(/^([^.]+)\.github\.io$/),guess="";
  if(m){var seg1=(location.pathname.split("/")[1]||"");guess=m[1]+"/"+(seg1||m[1]+".github.io");}
  $("repo").value=LS.getItem("led.repo")||guess;$("token").value=LS.getItem("led.token")||"";
  S.sound=LS.getItem("led.sound")==="1";renderSound();
  if(!loadSettings()){$("prompt").value=PROMPTS[2].text;S.sizes.push({name:"townhall",w:4128,h:1290});setMode("normal");}
  else if(!$("prompt").value)$("prompt").value=PROMPTS[2].text;
  $("pro").hidden=!PRO;document.body.classList.toggle("pro",PRO);
  return loadConfig().then(function(){
    S.power=LS.getItem("led.power")==="1"&&hasBackend();
    update();renderJobs();initScene();
    if(S.power)connect().then(function(r){if(!r.ok){S.power=false;LS.removeItem("led.power");if(SCENE)SCENE.setPower(false);update();}else loadQuota();});
    refreshAll();
    S.timer=setInterval(function(){if(S.jobs.some(isActive)||S.watchId)loadJobs();},30000);
    setInterval(function(){if(S.mstate==="washing")renderLcd();},1000);
    setInterval(function(){if(S.power&&CONFIG.relay&&!document.hidden)loadQuota();},45000);
    setInterval(function(){if(isLocked()){if(resetLeft()<=0)loadQuota();else renderLcd();}},10000);
  });
}
window.LED={layout:layout,autoGen:autoGen,genRect:genRect,chunkCount:chunkCount,buildJob:buildJob,estimate:estimate,state:S,config:CONFIG,slug:slug,addSize:addSize,update:update,dsName:dsName,
  scene:function(){return SCENE;},openPanel:openPanel,closePanel:closePanel,powerOn:powerOn,powerOff:powerOff,applyLang:applyLang,openViewer:openViewer,closeViewer:closeViewer,openPull:openPull,takeOut:takeOut,onJobs:onJobs};
init();
})();
