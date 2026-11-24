// Food-level metadata and photo-region stickers. Original meal photos stay intact.
(() => {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const amount = (value) => finite(value) && value >= 0 && value <= 10000 ? value : null;
  const nutrientLabels = { carb: '碳水', pro: '蛋白质', fat: '脂肪', ...Journal.focusNutrients };
  function box(value) {
    if (!value || !['x','y','width','height'].every(k=>finite(value[k]))) return null;
    const {x,y,width,height}=value;
    return x>=0 && y>=0 && width>0 && height>0 && x+width<=1000.01 && y+height<=1000.01
      ? {x,y,width,height} : null;
  }
  function cutout(value) {
    const region=box(value?.box);
    return region && typeof value.mask==='string' && value.mask.length<200000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.mask)
      ? {mask:value.mask,box:region,score:finite(value.score)?value.score:0,edgeVersion:value.edgeVersion===1?1:0} : null;
  }
  function normalize(items) {
    return Array.isArray(items) ? items.slice(0,16).filter(f=>f&&typeof f.name==='string').map(f=>({
      name:f.name.slice(0,60), kcal:amount(f.kcal), box:box(f.box), contour:[], cutout:cutout(f.cutout), reviewReason:typeof f.reviewReason==='string'?f.reviewReason.slice(0,180):'',
      ...(f.nutrients && typeof f.nutrients === 'object' ? {
        nutrients: Object.fromEntries(Object.keys(nutrientLabels).map(key => [key, amount(f.nutrients[key])]))
      } : {})
    })) : [];
  }
  function groups(meals,date,via='week') {
    return meals.map(meal=>{
      const photo=Journal.photoFor(meal);
      const foods=normalize(meal.foods);
      return {
        id:meal.id, name:meal.name, kind:Journal.kinds[meal.kind]||'餐食', kindKey:meal.kind,
        hasFoods:foods.length>0, missingFoods:!foods.length,
        editHref:Journal.link('Record',date,{edit:meal.id,from:'day',via}),
        wholeKcal:Number.isFinite(meal.kcal)?'整餐约 '+Math.round(meal.kcal)+' kcal':'整餐热量未填写',
        foods:foods.map(f=>({name:f.name,photo,box:JSON.stringify(f.box),cutout:JSON.stringify(f.cutout),
          energy:f.kcal, nutrients:f.nutrients,
          hasSticker:!!photo&&!!f.cutout, partial:!!f.cutout&&!!f.reviewReason,
          kcal:f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' kcal',
          label:f.name+'，'+(f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' 千卡')}))
      };
    });
  }
  class FoodSticker extends HTMLElement {
    static get observedAttributes(){return ['photo','cutout','name'];}
    connectedCallback(){
      this.scheduleRender();
      this.resizeObserver=new ResizeObserver(()=>{
        if (this.clientWidth!==this.renderedWidth) this.scheduleRender();
      });
      this.resizeObserver.observe(this);
    }
    disconnectedCallback(){
      this.resizeObserver?.disconnect();
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame=0;
      this.revision=(this.revision||0)+1;
    }
    attributeChangedCallback(){if(this.isConnected)this.scheduleRender();}
    scheduleRender(){
      this.revision=(this.revision||0)+1;
      if(!this.renderFrame)this.renderFrame=requestAnimationFrame(()=>{
        this.renderFrame=0;
        this.render();
      });
    }
    render(){
      const revision=this.revision;
      this.renderedWidth=this.clientWidth;
      let item;try{item=cutout(JSON.parse(this.getAttribute('cutout')))}catch{}
      const photo=this.getAttribute('photo');
      this.replaceChildren();
      const fallback=document.createElement('span');fallback.className='food-sticker-fallback';
      const label=document.createElement('span');label.textContent=this.getAttribute('name')||'食物';
      const hint=document.createElement('small');hint.textContent='待抠图';fallback.append(label,hint);this.append(fallback);
      // A rectangle or language-model polygon is not a segmentation mask.
      if(!photo||!item)return;
      const source=new Image(),mask=new Image();
      Promise.all([new Promise((r,j)=>{source.onload=r;source.onerror=j;source.src=photo}),new Promise((r,j)=>{mask.onload=r;mask.onerror=j;mask.src=item.mask})]).then(()=>{
        if(this.revision!==revision)return;
        const {x,y,width,height}=item.box,left=x/1000*source.width,top=y/1000*source.height,w=width/1000*source.width,h=height/1000*source.height;
        const logicalSize=Math.max(24,this.renderedWidth||112);
        const size=Math.min(512,Math.ceil(logicalSize*Math.min(3,window.devicePixelRatio||2)));
        const density=size/logicalSize;
        // A 20px kernel must not become a blurry 100px food. Preserve available source detail.
        const scale=Math.min(size*.9/Math.max(w,h),1.25*density),dx=(size-w*scale)/2,dy=(size-h*scale)/2;
        const layer=document.createElement('canvas');layer.width=layer.height=size;
        const lc=layer.getContext('2d');lc.imageSmoothingEnabled=true;lc.imageSmoothingQuality='high';
        lc.drawImage(source,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);
        const matte=document.createElement('canvas');matte.width=matte.height=size;
        const mc=matte.getContext('2d');mc.imageSmoothingEnabled=true;mc.imageSmoothingQuality='high';
        mc.drawImage(mask,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);
        // Smooth only legacy hard alpha edges, never the food's RGB texture.
        if(!item.edgeVersion){
          const pixels=mc.getImageData(0,0,size,size),src=pixels.data;
          let alpha=Float32Array.from({length:size*size},(_,i)=>src[i*4+3]);
          const passes=Math.min(8,Math.max(2,Math.ceil(scale*scale/2)));
          for(let pass=0;pass<passes;pass++){
            const next=new Float32Array(alpha.length);
            for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
              let total=0;for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)total+=alpha[(y+yy)*size+x+xx]*(xx===0?2:1)*(yy===0?2:1);
              next[y*size+x]=total/16;
            }alpha=next;
          }
          for(let i=0;i<alpha.length;i++){const t=Math.max(0,Math.min(1,(alpha[i]-64)/127));src[i*4+3]=Math.round(255*t*t*(3-2*t));}
          mc.putImageData(pixels,0,0);
        }
        lc.globalCompositeOperation='destination-in';lc.drawImage(matte,0,0);
        const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        canvas.setAttribute('aria-label',this.getAttribute('name')||'食物');canvas.setAttribute('role','img');
        const ctx=canvas.getContext('2d'),border=1.1*density;
        for(let i=0;i<24;i++){const angle=i*Math.PI/12;ctx.drawImage(layer,Math.cos(angle)*border,Math.sin(angle)*border);}
        ctx.globalCompositeOperation='source-in';ctx.fillStyle='#fff';ctx.fillRect(0,0,size,size);
        ctx.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);
        this.replaceChildren(canvas);
        matte.width=matte.height=layer.width=layer.height=0;
      }).catch(()=>{});
    }
  }
  customElements.define('food-sticker',FoodSticker);
  let worker,sequence=0,pending=new Map();
  function cancel(error = new DOMException('Cancelled','AbortError')){
    worker?.terminate();worker=null;
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}
    pending.clear();
  }
  function segment(photo,options={},progress=()=>{}){
    if(!worker){
      worker=new Worker(new URL('./segmentation-worker.js?v=20261124-1',document.baseURI),{type:'module'});
      worker.onmessage=({data})=>{
        const job=pending.get(data.id);if(!job)return;
        if(data.type==='progress'){job.progress(data.stage,data);return;}
        pending.delete(data.id);clearTimeout(job.timer);
        data.type==='result'?job.resolve(data.candidates):job.reject(new Error(data.message));
      };
      worker.onerror=()=>cancel(new Error("抠图工具未能运行。"));
      worker.onmessageerror=()=>cancel(new Error("无法读取贴纸结果。"));
    }
    return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>cancel(new Error("自动抠图超时。")),options.mode ? 35000 : 25000);
      pending.set(id,{resolve,reject,progress,timer});
      try { worker.postMessage({id,photo,...options}); } catch (error) { cancel(error); }
    });
  }
  const progressText=stage=>stage==='loading'?'首次使用正在加载抠图工具…':stage==='encoding'?'正在分析照片边缘…':'正在分离食物与背景…';
  function selectRegion(photo,food={}){
    let processing = false;
    return JournalUI.openSheet({title:'调整贴纸',className:'food-crop-sheet',render(dialog,done){
      dialog.insertAdjacentHTML('beforeend','<p>按整份餐品点选。同组有两个鸡蛋时，可分别点中；沙拉保留整碗，饮料保留整瓶。多选了其他餐品或桌面时，切换「排除」。</p><div class="cutout-modes"><button type="button" data-mode="1" aria-pressed="true">＋ 保留食物</button><button type="button" data-mode="0" aria-pressed="false">− 排除背景</button><button type="button" class="cutout-undo">撤销点选</button></div><div class="food-crop-stage" role="button" tabindex="0" aria-label="点选照片中的食物"><img alt="完整餐食照片" draggable="false"><div class="cutout-points"></div></div><p class="cutout-status" role="status">点一下食物，生成透明背景贴纸。抠图在本机完成。</p><div class="cutout-result"><food-sticker></food-sticker><button type="button" class="cutout-next">换一种轮廓</button></div><button type="button" class="app-sheet-confirm" disabled>使用这张贴纸</button><button type="button" class="app-sheet-cancel">取消</button>');
      const stage=dialog.querySelector('.food-crop-stage'),status=dialog.querySelector('.cutout-status'),preview=dialog.querySelector('food-sticker'),confirm=dialog.querySelector('.app-sheet-confirm'),next=dialog.querySelector('.cutout-next');
      dialog.querySelector('img').src=photo;preview.setAttribute('photo',photo);preview.setAttribute('name',food.name||'食物');
      let points=[],mode=1,candidates=cutout(food.cutout)?[food.cutout]:[],selected=0,request=0,busy=false;
      function display(){preview.setAttribute('cutout',JSON.stringify(candidates[selected]||null));confirm.disabled=busy||!candidates.length;next.disabled=busy||candidates.length<2;}
      function marks(){const container=dialog.querySelector('.cutout-points');container.replaceChildren();for(const p of points){const dot=document.createElement('span');dot.className=p.label?'keep':'exclude';dot.textContent=p.label?'+':'−';dot.style.left=p.x/10+'%';dot.style.top=p.y/10+'%';container.append(dot);}}
      async function run(){
        const current=++request;processing=busy=true;display();
        try{
          const result=await segment(photo,{points},stage=>{if(dialog.isConnected&&current===request)status.textContent=progressText(stage)});
          if(!dialog.isConnected||current!==request)return;
          candidates=result;selected=0;status.textContent='请核对边缘。可继续点选补充食物或排除背景。';
        }catch(error){if(dialog.isConnected&&current===request)status.textContent='暂时没能抠出食物，请重新点选。仍可取消后保存饭记。';}
        finally{if(dialog.isConnected&&current===request){processing=busy=false;display();}}
      }
      let down;
      stage.onpointerdown=e=>{down={x:e.clientX,y:e.clientY};};
      stage.onpointerup=e=>{
        if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>12)return;down=null;
        if(busy){status.textContent='正在抠图，请稍候再点选。';return;}
        if(mode===0&&!points.some(p=>p.label===1)){status.textContent='请先用「保留食物」点选食物。';return;}
        if(points.length>=20){status.textContent='点选已满，可以撤销后重新调整。';return;}
        const b=stage.getBoundingClientRect();points.push({x:Math.max(0,Math.min(1000,(e.clientX-b.left)/b.width*1000)),y:Math.max(0,Math.min(1000,(e.clientY-b.top)/b.height*1000)),label:mode});marks();run();
      };
      stage.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!busy&&points.length<20){e.preventDefault();points.push({x:500,y:500,label:1});marks();run();}};
      dialog.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=Number(button.dataset.mode);dialog.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
      dialog.querySelector('.cutout-undo').onclick=()=>{if(busy||!points.length)return;points.pop();marks();if(points.some(p=>p.label===1))run();else{candidates=[];display();status.textContent='点一下要保留的食物。';}};
      next.onclick=()=>{selected=(selected+1)%candidates.length;display();};
      confirm.onclick=()=>{if(!confirm.disabled)done(candidates[selected]);};
      dialog.querySelector('.app-sheet-cancel').onclick=()=>done(null);
      display();
    }}).finally(()=>{if(processing)cancel();});
  }
  async function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
  async function recognitionPhoto(photo){
    const source=await loadImage(photo),canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(source.width,source.height));
    canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
    const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const jpeg=canvas.toDataURL('image/jpeg',.88);
    canvas.width=canvas.height=0;
    return jpeg;
  }
  async function contactSheet(photo,candidates){
    const source=await loadImage(photo),canvas=document.createElement('canvas'),cell=230,row=190;
    canvas.width=cell*6;canvas.height=row*Math.ceil(candidates.length/6);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeaf5';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i],mask=await loadImage(c.mask),x=(i%6)*cell,y=Math.floor(i/6)*row;
      const layer=document.createElement('canvas');layer.width=layer.height=140;const lc=layer.getContext('2d'),b=c.box;
      const left=b.x/1000*source.width,top=b.y/1000*source.height,w=b.width/1000*source.width,h=b.height/1000*source.height,scale=132/Math.max(w,h),dx=(140-w*scale)/2,dy=(140-h*scale)/2;
      lc.drawImage(source,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);lc.globalCompositeOperation='destination-in';lc.drawImage(mask,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);
      ctx.fillStyle='#fff';ctx.fillRect(x+2,y+2,cell-4,row-4);ctx.fillStyle='#19151f';ctx.font='bold 18px sans-serif';ctx.fillText('ID '+c.id,x+10,y+24);ctx.drawImage(layer,x+4,y+32);
      // Context is only for visual verification; final stickers still use the alpha mask.
      const side=Math.max(w*2,h*2,Math.min(source.width,source.height)*.22),sx=Math.max(0,Math.min(source.width-side,left+w/2-side/2)),sy=Math.max(0,Math.min(source.height-side,top+h/2-side/2));
      ctx.drawImage(source,sx,sy,side,side,x+146,y+64,80,80);
      ctx.strokeStyle='#ef3c31';ctx.lineWidth=1.5;ctx.strokeRect(x+146+(left-sx)/side*80,y+64+(top-sy)/side*80,w/side*80,h/side*80);
      ctx.fillStyle='#666';ctx.font='10px sans-serif';ctx.fillText('context',x+146,y+157);
      layer.width=layer.height=0;
    }
    const jpeg=canvas.toDataURL('image/jpeg',.9);
    canvas.width=canvas.height=0;
    return jpeg;
  }
  async function candidateTiles(sheet,count){
    const source=await loadImage(sheet),tiles=[];
    for(let i=0;i<count;i++){
      const canvas=document.createElement('canvas');canvas.width=230;canvas.height=190;
      canvas.getContext('2d').drawImage(source,i%6*230,Math.floor(i/6)*190,230,190,0,0,230,190);
      tiles.push(canvas.toDataURL('image/jpeg',.92));
      canvas.width=canvas.height=0;
    }
    return tiles;
  }
  async function mergeMasks(candidates){
    if(!candidates.length)return null;
    if(candidates.length===1)return cutout(candidates[0]);
    const first=await loadImage(candidates[0].mask),canvas=document.createElement('canvas');canvas.width=first.width;canvas.height=first.height;const ctx=canvas.getContext('2d');
    for(const c of candidates)ctx.drawImage(await loadImage(c.mask),0,0,canvas.width,canvas.height);
    let left=canvas.width,top=canvas.height,right=0,bottom=0,area=0;const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>127){const x=i/4%canvas.width,y=Math.floor(i/4/canvas.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);area++;}
    if(!area)return null;
    const png=canvas.toDataURL('image/png');
    const {width,height}=canvas;
    canvas.width=canvas.height=0;
    return cutout({mask:png,edgeVersion:candidates.every(c=>c.edgeVersion===1)?1:0,score:Math.min(...candidates.map(c=>c.score)),box:{x:left/width*1000,y:top/height*1000,width:(right-left+1)/width*1000,height:(bottom-top+1)/height*1000}});
  }

  async function applyMatches(foods,candidates,matches){
    if(!Array.isArray(matches)||matches.length!==foods.length)throw new Error('贴纸核对结果不完整。');
    const ids=new Set(),indices=new Set();
    const result=foods.map(f=>({...f,cutout:null,reviewReason:'贴纸暂未生成。'}));
    for(const m of matches){
      if(!Number.isInteger(m.foodIndex)||m.foodIndex<0||m.foodIndex>=foods.length||indices.has(m.foodIndex)||!Array.isArray(m.maskIds))throw new Error('贴纸对应关系无效。');
      indices.add(m.foodIndex);
      if(m.status!=='matched'){result[m.foodIndex].reviewReason='贴纸待核对：'+(m.reason||'自动生成未完成');continue;}
      if(!m.maskIds.length)throw new Error('缺少贴纸。');
      const selected=m.maskIds.map(id=>{if(ids.has(id))throw new Error('贴纸重复分配。');ids.add(id);const c=candidates.find(c=>c.id===id);if(!c)throw new Error('贴纸编号无效。');return c;});
      result[m.foodIndex]={...foods[m.foodIndex],cutout:await mergeMasks(selected),reviewReason:m.coverage==='partial'?'贴纸已生成部分内容。':''};
    }
    return result;
  }
  async function generate(photo, foods, rawFoods, { signal, progress, onMasks }) {
    const servings = rawFoods.map((food, foodIndex) => {
      const regions = (Array.isArray(food.regions) ? food.regions : []).slice(0,8).map(box).filter(Boolean);
      return {foodIndex, regions: regions.length ? regions : [box(food.box)].filter(Boolean)};
    }).slice(0,foods.length);
    let result = foods;
    const needMasks = servings.filter(({foodIndex,regions})=>regions.length && (!foods[foodIndex].cutout || foods[foodIndex].reviewReason));
    if (needMasks.length) {
      const direct = await segment(photo,{mode:'servings',servings},progress);
      signal.throwIfAborted();
      result = await Promise.all(foods.map(async (food, foodIndex) => {
        const pieces = direct.filter(candidate=>candidate.foodIndex===foodIndex);
        const mask = await mergeMasks(pieces);
        if (!mask || (food.cutout && pieces.length < servings[foodIndex]?.regions.length)) return food;
        return { ...food, cutout:mask,
          reviewReason: pieces.length < servings[foodIndex]?.regions.length ? '贴纸已生成部分内容。' : '' };
      }));
      signal.throwIfAborted();
      onMasks(result);
    }

    const unresolved = result.flatMap((food,index)=>!food.cutout || food.reviewReason ? [index] : []);
    if (!unresolved.length) return result;
    const available = await segment(photo,{mode:'propose',hints:unresolved.flatMap(index=>servings[index]?.regions || [])},progress);
    signal.throwIfAborted();
    const completed = result.filter(food=>food.cutout&&!food.reviewReason);
    const candidates = available.filter(({box:b})=>!completed.some(({cutout:{box:c}})=>{
      const w=Math.max(0,Math.min(b.x+b.width,c.x+c.width)-Math.max(b.x,c.x));
      const h=Math.max(0,Math.min(b.y+b.height,c.y+c.height)-Math.max(b.y,c.y));
      return w*h > .6*Math.min(b.width*b.height,c.width*c.height);
    })).map((candidate,index)=>({...candidate,id:index+1}));
    if (!candidates.length) return result;
    const sheet = await contactSheet(photo,candidates);
    const tiles = await candidateTiles(sheet,candidates.length);
    signal.throwIfAborted();
    progress('matching');
    const matching = new AbortController();
    const abort = () => matching.abort();
    const timer = setTimeout(abort,25000);
    signal.addEventListener('abort',abort,{once:true});
    let matches;
    try {
      const response = await fetch('/api/match-foods',{
        method:'POST',headers:{'Content-Type':'application/json'},signal:matching.signal,
        body:JSON.stringify({photo,sheet,tiles,foods:unresolved.map(index=>foods[index].name),candidateCount:candidates.length})
      });
      const data = await response.json();
      if(!response.ok)throw new Error(data.error||'贴纸核对暂时不可用。');
      matches = data.matches;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort',abort);
    }
    signal.throwIfAborted();
    const checked = await applyMatches(unresolved.map(index=>foods[index]),candidates,matches);
    return result.map((food,index)=>{
      const match = checked[unresolved.indexOf(index)];
      if (!match) return food;
      return match.cutout && (!match.reviewReason || !food.cutout) ? match : food.cutout ? food : match;
    });
  }

  window.FoodStickers={nutrientLabels,normalize,groups,selectRegion,segment,generate,cancel,progressText,recognitionPhoto,contactSheet,candidateTiles,mergeMasks,applyMatches};
})();
