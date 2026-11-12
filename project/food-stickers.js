// Food-level metadata and photo-region stickers. Original meal photos stay intact.
(() => {
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const amount = (value) => finite(value) && value >= 0 && value <= 10000 ? value : null;
  function box(value) {
    if (!value || !['x','y','width','height'].every(k=>finite(value[k]))) return null;
    const {x,y,width,height}=value;
    return x>=0 && y>=0 && width>0 && height>0 && x+width<=1000.01 && y+height<=1000.01
      ? {x,y,width,height} : null;
  }
  function cutout(value) {
    const region=box(value?.box);
    return region && typeof value.mask==='string' && value.mask.length<200000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.mask)
      ? {mask:value.mask,box:region,score:finite(value.score)?value.score:0} : null;
  }
  function normalize(items) {
    return Array.isArray(items) ? items.slice(0,16).filter(f=>f&&typeof f.name==='string').map(f=>({
      name:f.name.slice(0,60), kcal:amount(f.kcal), box:box(f.box), contour:[], cutout:cutout(f.cutout)
    })) : [];
  }
  function groups(meals,date,via='week') {
    return meals.map(meal=>{
      const photo=Journal.photoFor(meal);
      const foods=normalize(meal.foods);
      return {
        name:meal.name, kind:Journal.kinds[meal.kind]||'餐食', hasFoods:foods.length>0, missingFoods:!foods.length,
        editHref:Journal.link('Record',date,{edit:meal.id,from:'day',via}),
        wholeKcal:Number.isFinite(meal.kcal)?'整餐约 '+Math.round(meal.kcal)+' kcal':'整餐热量未填写',
        foods:foods.map(f=>({name:f.name,photo,box:JSON.stringify(f.box),cutout:JSON.stringify(f.cutout),
          kcal:f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' kcal',
          label:f.name+'，'+(f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' 千卡')}))
      };
    });
  }
  class FoodSticker extends HTMLElement {
    static get observedAttributes(){return ['photo','cutout','name'];}
    connectedCallback(){this.render();}
    attributeChangedCallback(){if(this.isConnected)this.render();}
    render(){
      const revision=this.revision=(this.revision||0)+1;
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
        const scale=232/Math.max(w,h),dx=(256-w*scale)/2,dy=(256-h*scale)/2;
        const layer=document.createElement('canvas');layer.width=layer.height=256;
        const lc=layer.getContext('2d');lc.drawImage(source,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);
        lc.globalCompositeOperation='destination-in';lc.drawImage(mask,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        canvas.setAttribute('aria-label',this.getAttribute('name')||'食物');canvas.setAttribute('role','img');
        const ctx=canvas.getContext('2d');
        for(let i=0;i<16;i++){const angle=i*Math.PI/8;ctx.drawImage(layer,Math.cos(angle)*3.5,Math.sin(angle)*3.5);}
        ctx.globalCompositeOperation='source-in';ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);
        ctx.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);
        this.replaceChildren(canvas);
      }).catch(()=>{});
    }
  }
  customElements.define('food-sticker',FoodSticker);
  let worker,sequence=0,pending=new Map();
  function cancel(){
    worker?.terminate();worker=null;
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(new DOMException('Cancelled','AbortError'));}
    pending.clear();
  }
  function segment(photo,options={},progress=()=>{}){
    if(!worker){
      worker=new Worker(new URL('./segmentation-worker.js?v=20261112-7',document.baseURI),{type:'module'});
      worker.onmessage=({data})=>{
        const job=pending.get(data.id);if(!job)return;
        if(data.type==='progress'){job.progress(data.stage);return;}
        pending.delete(data.id);clearTimeout(job.timer);
        data.type==='result'?job.resolve(data.candidates):job.reject(new Error(data.message));
      };
      worker.onerror=()=>cancel();
    }
    return new Promise((resolve,reject)=>{
      const id=++sequence,timer=setTimeout(()=>cancel(),90000);
      pending.set(id,{resolve,reject,progress,timer});worker.postMessage({id,photo,...options});
    });
  }
  const progressText=stage=>stage==='loading'?'首次使用正在加载抠图工具…':stage==='encoding'?'正在分析照片边缘…':'正在分离食物与背景…';
  function selectRegion(photo,food={}){
    document.activeElement?.blur?.();
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='app-sheet food-crop-sheet';dialog.setAttribute('aria-labelledby','food-crop-title');
      dialog.innerHTML='<h2 id="food-crop-title">单独抠出食物</h2><p>点选要保留的食物；多选了餐盘或背景时，切换「排除」再点它。</p><div class="cutout-modes"><button type="button" data-mode="1" aria-pressed="true">＋ 保留食物</button><button type="button" data-mode="0" aria-pressed="false">− 排除背景</button><button type="button" class="cutout-undo">撤销点选</button></div><div class="food-crop-stage" role="button" tabindex="0" aria-label="点选照片中的食物"><img alt="完整餐食照片" draggable="false"><div class="cutout-points"></div></div><p class="cutout-status" role="status">点一下食物，生成透明背景贴纸。抠图在本机完成。</p><div class="cutout-result"><food-sticker></food-sticker><button type="button" class="cutout-next">换一种轮廓</button></div><button type="button" class="app-sheet-confirm" disabled>使用这张贴纸</button><button type="button" class="app-sheet-cancel">取消</button>';
      const stage=dialog.querySelector('.food-crop-stage'),status=dialog.querySelector('.cutout-status'),preview=dialog.querySelector('food-sticker'),confirm=dialog.querySelector('.app-sheet-confirm'),next=dialog.querySelector('.cutout-next');
      dialog.querySelector('img').src=photo;preview.setAttribute('photo',photo);preview.setAttribute('name',food.name||'食物');
      let points=[],mode=1,candidates=cutout(food.cutout)?[food.cutout]:[],selected=0,request=0,closed=false,busy=false;
      function display(){preview.setAttribute('cutout',JSON.stringify(candidates[selected]||null));confirm.disabled=busy||!candidates.length;next.disabled=busy||candidates.length<2;}
      function marks(){const container=dialog.querySelector('.cutout-points');container.replaceChildren();for(const p of points){const dot=document.createElement('span');dot.className=p.label?'keep':'exclude';dot.textContent=p.label?'+':'−';dot.style.left=p.x/10+'%';dot.style.top=p.y/10+'%';container.append(dot);}}
      async function run(){
        const current=++request;busy=true;display();
        try{
          const result=await segment(photo,{points},stage=>{if(!closed&&current===request)status.textContent=progressText(stage)});
          if(closed||current!==request)return;
          candidates=result;selected=0;status.textContent='请核对边缘。可继续点选补充食物或排除背景。';
        }catch(error){if(!closed&&current===request)status.textContent='暂时没能抠出食物，请重新点选。仍可取消后保存饭记。';}
        finally{if(!closed&&current===request){busy=false;display();}}
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
      const overflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
      function done(value){closed=true;if(busy)cancel();dialog.close();dialog.remove();document.documentElement.style.overflow=overflow;resolve(value);}
      confirm.onclick=()=>{if(!confirm.disabled)done(candidates[selected]);};
      dialog.querySelector('.app-sheet-cancel').onclick=()=>done(null);
      dialog.oncancel=e=>{e.preventDefault();done(null);};
      document.body.append(dialog);display();dialog.showModal();
    });
  }
  window.FoodStickers={normalize,groups,selectRegion,segment,cancel,progressText};
})();
