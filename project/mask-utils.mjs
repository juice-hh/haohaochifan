// Deterministic cleanup of original-photo masks; only enclosed pinholes may be filled.
export function cleanMask(input,width,height,points=[]){
 const n=width*height,labels=new Int32Array(n),queue=new Int32Array(n),areas=[0];let count=0;
 for(let i=0;i<n;i++)if(input[i]&&!labels[i]){
  const id=++count;let head=0,tail=1;queue[0]=i;labels[i]=id;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const q=yy*width+xx;if(input[q]&&!labels[q]){labels[q]=id;queue[tail++]=q;}
  }}areas[id]=tail;
 }
 const keep=new Set();
 for(const p of points.filter(p=>p.label===1)){
  const x=Math.max(0,Math.min(width-1,Math.round(p.x/1000*width))),y=Math.max(0,Math.min(height-1,Math.round(p.y/1000*height)));
  let found=labels[y*width+x];
  for(let r=1;!found&&r<=3;r++)for(let yy=Math.max(0,y-r);yy<=Math.min(height-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(width-1,x+r);xx++)if(labels[yy*width+xx])found=labels[yy*width+xx];
  if(!found)return null;
  keep.add(found);
 }
 if(!keep.size)return null;
 const result=new Uint8Array(n);let area=0,removed=0;for(let i=0;i<n;i++){if(keep.has(labels[i])){result[i]=1;area++;}else if(input[i])removed++;}
 // Fill only small fully enclosed holes. Open gaps between food pieces stay transparent.
 const excluded=new Set(points.filter(p=>p.label===0).map(p=>Math.max(0,Math.min(height-1,Math.round(p.y/1000*height)))*width+Math.max(0,Math.min(width-1,Math.round(p.x/1000*width)))));
 const visited=new Uint8Array(n),maxHole=Math.min(256,Math.max(8,area*.015));let filled=0;
 for(let i=0;i<n;i++)if(!result[i]&&!visited[i]){
  let head=0,tail=1,touches=false,explicitlyExcluded=false;queue[0]=i;visited[i]=1;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);if(excluded.has(p))explicitlyExcluded=true;if(!x||!y||x===width-1||y===height-1)touches=true;
   for(const q of [x>0?p-1:-1,x<width-1?p+1:-1,y>0?p-width:-1,y<height-1?p+width:-1])if(q>=0&&!result[q]&&!visited[q]){visited[q]=1;queue[tail++]=q;}
  }
  if(!touches&&!explicitlyExcluded&&tail<=maxHole){for(let j=0;j<tail;j++)result[queue[j]]=1;filled+=tail;}
 }
 return {values:result,removed,filled,components:keep.size,area:area+filled};
}
export function signature(values,width,height){const out=new Uint8Array(1600);for(let y=0;y<40;y++)for(let x=0;x<40;x++)out[y*40+x]=values[Math.min(height-1,Math.floor((y+.5)*height/40))*width+Math.min(width-1,Math.floor((x+.5)*width/40))];return out;}
export function overlap(a,b){let intersection=0,union=0;for(let i=0;i<a.length;i++){if(a[i]&&b[i])intersection++;if(a[i]||b[i])union++;}return union?intersection/union:0;}
// Convert model logits to a subpixel alpha edge after binary component cleanup.
// The narrow transition follows the model's contour; food RGB pixels are untouched.
export function maskAlpha(logits,values,width,height,points=[]){
 const alpha=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,l=logits[i];
  if(!values[i]){
   if(l>0)continue; // A removed component cannot reappear through feathering.
   if(!(x>0&&values[i-1]||x<width-1&&values[i+1]||y>0&&values[i-width]||y<height-1&&values[i+width]))continue;
  }else if(l<=0){alpha[i]=255;continue;} // Deliberately filled pinhole.
  const gx=(logits[y*width+Math.min(width-1,x+1)]-logits[y*width+Math.max(0,x-1)])/2;
  const gy=(logits[Math.min(height-1,y+1)*width+x]-logits[Math.max(0,y-1)*width+x])/2;
  const t=Math.max(0,Math.min(1,.5+l/Math.max(.01,Math.hypot(gx,gy)*1.5)));
  alpha[i]=Math.round(255*t*t*(3-2*t));
 }
 for(const p of points.filter(p=>p.label===0)){
  const x=Math.max(0,Math.min(width-1,Math.round(p.x/1000*width))),y=Math.max(0,Math.min(height-1,Math.round(p.y/1000*height)));alpha[y*width+x]=0;
 }
 return alpha;
}
