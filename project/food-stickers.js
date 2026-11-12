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
  function contour(value) {
    if (!Array.isArray(value) || value.length<3 || value.length>32 || !value.every(p=>finite(p.x)&&finite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1000&&p.y<=1000)) return [];
    const area=Math.abs(value.reduce((sum,p,i)=>{const q=value[(i+1)%value.length];return sum+p.x*q.y-q.x*p.y},0))/2;
    return area>=25 ? value.map(({x,y})=>({x,y})) : [];
  }
  function normalize(items) {
    return Array.isArray(items) ? items.slice(0,16).filter(f=>f&&typeof f.name==='string').map(f=>({
      name:f.name.slice(0,60), kcal:amount(f.kcal), box:box(f.box), contour:contour(f.contour)
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
        foods:foods.map(f=>({name:f.name,photo,box:JSON.stringify(f.box),contour:JSON.stringify(f.contour),
          kcal:f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' kcal',
          label:f.name+'，'+(f.kcal===null?'热量待补充':'约 '+Math.round(f.kcal)+' 千卡')}))
      };
    });
  }
  class FoodSticker extends HTMLElement {
    static get observedAttributes(){return ['photo','box','contour','name'];}
    connectedCallback(){this.render();}
    attributeChangedCallback(){if(this.isConnected)this.render();}
    render(){
      const revision=this.revision=(this.revision||0)+1;
      let region,points;
      try{region=box(JSON.parse(this.getAttribute('box')));points=contour(JSON.parse(this.getAttribute('contour')))}catch{points=[];}
      const photo=this.getAttribute('photo');
      this.replaceChildren();
      const fallback=document.createElement('span');fallback.className='food-sticker-fallback';
      fallback.textContent=this.getAttribute('name')||'食物';this.append(fallback);
      if(!photo||(!region&&!points.length))return;
      const source=new Image();
      source.onload=()=>{
        if(this.revision!==revision)return;
        if(!points.length)points=[{x:region.x,y:region.y},{x:region.x+region.width,y:region.y},{x:region.x+region.width,y:region.y+region.height},{x:region.x,y:region.y+region.height}];
        const xs=points.map(p=>p.x/1000*source.width),ys=points.map(p=>p.y/1000*source.height);
        const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
        if(width<1||height<1)return;
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
        canvas.setAttribute('aria-label',this.getAttribute('name')||'食物');canvas.setAttribute('role','img');
        const ctx=canvas.getContext('2d'),scale=232/Math.max(width,height),dx=(256-width*scale)/2,dy=(256-height*scale)/2;
        ctx.beginPath();points.forEach((_,i)=>{const x=dx+(xs[i]-left)*scale,y=dy+(ys[i]-top)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();
        ctx.save();ctx.clip();ctx.drawImage(source,dx-left*scale,dy-top*scale,source.width*scale,source.height*scale);ctx.restore();
        ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.lineJoin='round';ctx.stroke();
        this.replaceChildren(canvas);
      };
      source.src=photo;
    }
  }
  customElements.define('food-sticker',FoodSticker);

  function selectRegion(photo,initial) {
    document.activeElement?.blur?.();
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='app-sheet food-crop-sheet';dialog.setAttribute('aria-labelledby','food-crop-title');
      dialog.innerHTML='<h2 id="food-crop-title">选取食物区域</h2><p>在照片上拖出方框，或用下面的滑杆调整。</p><div class="food-crop-stage"><img alt="完整餐食照片" draggable="false"><span class="food-crop-box"></span></div><div class="food-crop-controls"></div><button type="button" class="app-sheet-confirm">使用此区域</button><button type="button" class="app-sheet-cancel">取消</button>';
      const img=dialog.querySelector('img');img.src=photo;
      const stage=dialog.querySelector('.food-crop-stage'),outline=dialog.querySelector('.food-crop-box');
      let region=box(initial)||{x:200,y:200,width:600,height:600};
      const fields={};
      for(const [key,label] of [['x','左右位置'],['y','上下位置'],['width','区域宽度'],['height','区域高度']]){
        const row=document.createElement('label');row.textContent=label;
        const input=document.createElement('input');input.type='range';input.min=key==='x'||key==='y'?'0':'20';input.max='1000';input.step='1';input.setAttribute('aria-label',label);fields[key]=input;
        input.oninput=()=>{region[key]=Number(input.value);region.width=Math.max(20,Math.min(region.width,1000-region.x));region.height=Math.max(20,Math.min(region.height,1000-region.y));region.x=Math.min(region.x,1000-region.width);region.y=Math.min(region.y,1000-region.height);update();};
        row.append(input);dialog.querySelector('.food-crop-controls').append(row);
      }
      function update(){outline.style.cssText=`left:${region.x/10}%;top:${region.y/10}%;width:${region.width/10}%;height:${region.height/10}%`;for(const key in fields)fields[key].value=region[key];}
      let start;
      function point(event){const b=stage.getBoundingClientRect();return {x:Math.max(0,Math.min(1000,(event.clientX-b.left)/b.width*1000)),y:Math.max(0,Math.min(1000,(event.clientY-b.top)/b.height*1000))};}
      stage.onpointerdown=event=>{start=point(event);stage.setPointerCapture(event.pointerId);};
      stage.onpointermove=event=>{if(!start)return;const end=point(event);if(Math.abs(start.x-end.x)<20||Math.abs(start.y-end.y)<20)return;region={x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)};update();};
      stage.onpointerup=stage.onpointercancel=()=>{start=null;};
      const overflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
      function done(value){dialog.close();dialog.remove();document.documentElement.style.overflow=overflow;resolve(value);}
      dialog.querySelector('.app-sheet-confirm').onclick=()=>done(region);
      dialog.querySelector('.app-sheet-cancel').onclick=()=>done(null);
      dialog.oncancel=event=>{event.preventDefault();done(null);};
      document.body.append(dialog);update();dialog.showModal();
    });
  }
  window.FoodStickers={normalize,groups,selectRegion};
})();
