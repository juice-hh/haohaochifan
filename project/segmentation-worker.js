// Pixel segmentation runs locally. No photos or prompts leave this worker.
import {env, SamModel, AutoProcessor, RawImage, Tensor} from './vendor/transformers-2.17.2/transformers.min.js';
import {cleanMask, signature, overlap, maskAlpha} from './mask-utils.mjs?v=20261124-1';
env.allowRemoteModels = false;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers-2.17.2/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;

let runtime, cachedPhoto, inputs, embeddings, image;
function load() {
  return runtime ||= Promise.all([
    SamModel.from_pretrained('slimsam-5850ab45', {quantized:true}),
    AutoProcessor.from_pretrained('slimsam-5850ab45')
  ]).catch(error => { runtime = null; throw error; });
}

const area = box => box.width * box.height;
function sharedArea(a, b) {
  return Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
    * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
}
function boxOverlap(a, b) {
  const shared = sharedArea(a, b);
  return shared / (area(a) + area(b) - shared);
}

async function run({id, photo, box, points, mode, hints=[], servings=[]}) {
  const report = (stage, detail={}) => postMessage({id,type:'progress',stage,...detail});
  try {
    if (!runtime) report('loading');
    const [model, processor] = await load();
    if (cachedPhoto !== photo) {
      report('encoding');
      cachedPhoto = inputs = embeddings = image = null;
      image = await RawImage.read(photo);
      const scale = Math.min(1, (mode ? 960 : 1024) / Math.max(image.width, image.height));
      if (scale < 1) image = await image.resize(Math.round(image.width*scale), Math.round(image.height*scale));
      inputs = await processor(image);
      embeddings = await model.get_image_embeddings(inputs);
      cachedPhoto = photo;
    }
    const [height,width] = inputs.reshaped_input_sizes[0];
    const pixelCount = image.width * image.height;
    async function decode(prompts, region) {
      const coords = prompts.map(p => [p.x/1000*width,p.y/1000*height]);
      const labels = prompts.map(p => BigInt(p.label));
      if (region) {
        coords.push([region.x/1000*width,region.y/1000*height],
          [(region.x+region.width)/1000*width,(region.y+region.height)/1000*height]);
        labels.push(2n,3n);
      }
      const outputs = await model({...embeddings,
        input_points:new Tensor('float32',coords.flat(),[1,1,coords.length,2]),
        input_labels:new Tensor('int64',labels,[1,1,labels.length])});
      const masks = await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes,{binarize:false});
      const candidates = [];
      for (let i=0;i<3;i++) {
        const score = outputs.iou_scores.data[i];
        if (!Number.isFinite(score) || (mode && score < .72)) continue;
        const logits = masks[0].data.subarray(i*pixelCount,(i+1)*pixelCount);
        const cleaned = cleanMask(Uint8Array.from(logits,v=>v>0?1:0),image.width,image.height,prompts);
        if (!cleaned || cleaned.area < Math.max(24,pixelCount*.0008) || cleaned.area > pixelCount*.9) continue;
        const alpha = maskAlpha(logits,cleaned.values,image.width,image.height,prompts);
        let left=image.width,top=image.height,right=0,bottom=0;
        for(let j=0;j<pixelCount;j++) if(alpha[j]>127){
          const x=j%image.width,y=Math.floor(j/image.width);
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        if(left>right||top>bottom)continue;
        const bounds={x:left/image.width*1000,y:top/image.height*1000,width:(right-left+1)/image.width*1000,height:(bottom-top+1)/image.height*1000};
        const touchesEdge=left===0||top===0||right===image.width-1||bottom===image.height-1;
        if(mode==='propose'&&!region&&touchesEdge&&(bounds.width>700||bounds.height>700))continue;
        candidates.push({alpha,score,box:bounds,holeRatio:cleaned.largestHole/cleaned.area,signature:signature(cleaned.values,image.width,image.height),
          cleanup:{removed:cleaned.removed,filled:cleaned.filled,components:cleaned.components}});
      }
      return candidates.sort((a,b)=>b.score-a.score);
    }

    const center = region => ({x:region.x+region.width/2,y:region.y+region.height/2,label:1});
    let candidates = [];
    if (mode==='servings') {
      // One pixel-mask prediction per independently visible serving or piece.
      // A box sets object scale, including when its center falls between pieces.
      const regions = servings.flatMap(({foodIndex,regions}) => regions.map((region,regionIndex) => ({foodIndex,regionIndex,region})));
      for (const [index, target] of regions.entries()) {
        report('servings',{current:index+1,total:regions.length});
        const {foodIndex,regionIndex,region} = target;
        const rank = candidate => .65*boxOverlap(candidate.box,region)+.35*candidate.score;
        const pick = decoded => decoded.filter(c =>
          c.score >= .78 && c.holeRatio < .08 && boxOverlap(c.box,region) >= .46 &&
          sharedArea(c.box,region)/area(c.box) >= .64 &&
          regions.every(other => other === target ||
            boxOverlap(c.box,region) > boxOverlap(c.box,other.region)+.08) &&
          candidates.every(other => overlap(c.signature,other.signature) < .35)
        ).sort((a,b)=>rank(b)-rank(a))[0];
        const middle = center(region);
        const point = [middle];
        let candidate = pick(await decode(point,region));
        if (!candidate) {
          const inner = [middle, {...middle,x:middle.x+region.width*.14}, {...middle,x:middle.x-region.width*.14}];
          candidate = pick(await decode(inner,region)) || pick(await decode(point));
        }
        if (candidate) candidates.push({...candidate,foodIndex,regionIndex});
      }
    } else if (mode==='propose') {
      const distinct = hints.filter((hint,index,all)=>all.findIndex(other=>boxOverlap(hint,other)>.92)===index).slice(0,8);
      const proposals = distinct.flatMap(region=>[{region,points:[center(region)]},{points:[center(region)]}]);
      // Sparse full-image fallback can recover an object missed by imprecise boxes.
      for (const y of [220,500,780]) for (const x of [220,500,780]) {
        if(!distinct.some(h=>x>=h.x&&x<=h.x+h.width&&y>=h.y&&y<=h.y+h.height))proposals.push({points:[{x,y,label:1}]});
      }
      for (const [index, proposal] of proposals.entries()) {
        report('proposing',{current:index+1,total:proposals.length});
        for (const c of (await decode(proposal.points,proposal.region)).slice(0,2)) {
          if(c.score<.78)continue;
          const same=candidates.findIndex(v=>overlap(v.signature,c.signature)>.87);
          if(same<0)candidates.push(c);else if(c.score>candidates[same].score)candidates[same]=c;
        }
        candidates.sort((a,b)=>b.score-a.score);
        candidates.length=Math.min(candidates.length,12);
      }
      candidates.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    } else {
      const prompts=points?.length?points:box?[center(box)]:[];
      if(!prompts.length)throw new Error('请先选择食物。');
      report('segmenting');
      candidates=await decode(prompts);
    }
    if(!candidates.length&&!mode)throw new Error('没有找到选中的食物。');
    const canvas = new OffscreenCanvas(image.width,image.height);
    const context = canvas.getContext('2d');
    const pixels = context.createImageData(image.width,image.height);
    const results = [];
    for(const {alpha, signature:_, ...candidate} of candidates) {
      for(let i=0;i<alpha.length;i++){
        pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;
        pixels.data[i*4+3]=alpha[i];
      }
      context.putImageData(pixels,0,0);
      const blob = await canvas.convertToBlob({type:'image/png'});
      const mask = new FileReaderSync().readAsDataURL(blob);
      results.push({...candidate,mask,edgeVersion:1,id:results.length+1});
    }
    postMessage({id,type:'result',candidates:results});
  } catch (error) {
    postMessage({id,type:'error',message:String(error.message).slice(0,200)});
  }
}
let queue=Promise.resolve();
onmessage=event=>{queue=queue.then(()=>run(event.data));};
