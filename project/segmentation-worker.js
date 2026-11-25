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

async function run({id, photo, box, points, guided, polygon, mode, hints=[], servings=[]}) {
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
    function insidePolygon(x, y) {
      if (!polygon?.length) return true;
      let inside = false;
      for (let i = 0, last = polygon.length - 1; i < polygon.length; last = i++) {
        const a = polygon[i], b = polygon[last];
        if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      return inside;
    }
    function interiorPrompts(logits, region) {
      const anchors = [];
      for (const ry of [.2,.4,.6,.8]) for (const rx of [.2,.4,.6,.8]) {
        const x = region.x + region.width * rx, y = region.y + region.height * ry;
        const index = Math.floor(y / 1000 * image.height) * image.width + Math.floor(x / 1000 * image.width);
        if (logits[index] > 0 && insidePolygon(x,y)) anchors.push({x,y,label:1});
      }
      return anchors;
    }
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
        const hasPositive = prompts.some(point => point.label === 1);
        const anchors = !hasPositive && region ? interiorPrompts(logits, region) : [];
        const cleaned = cleanMask(Uint8Array.from(logits,v=>v>0?1:0),image.width,image.height,[...prompts, ...anchors]);
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
        const fillRatio = cleaned.area / ((right-left+1)*(bottom-top+1));
        candidates.push({alpha,score,box:bounds,fillRatio,holeRatio:cleaned.largestHole/cleaned.area,signature:signature(cleaned.values,image.width,image.height),
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
        if (candidate) {
          // A thin mask inside a plate-sized hint may capture only part of the serving.
          const fragmentary = area(region) > 160000 && candidate.fillRatio < .46;
          candidates.push({...candidate,foodIndex,regionIndex,fragmentary});
        }
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
      const prompts = points ?? [];
      const positives = prompts.filter(point => point.label === 1);
      if (!positives.length && !box) throw new Error('请先选择食物。');
      report('segmenting');
      const guidePoint = box && [center(box), {...center(box), x:box.x + box.width * .35}, {...center(box), x:box.x + box.width * .65}]
        .find(point => insidePolygon(point.x, point.y));
      const regionPrompts = guided && guidePoint && !positives.length ? [guidePoint, ...prompts] : prompts;
      const regionMasks = box ? await decode(regionPrompts, box) : [];
      const pointMasks = !guided && positives.length ? await decode(prompts) : [];
      const negatives = prompts.filter(point => !point.label);
      const excludedCoverage = candidate => {
        if (!negatives.length) return 0;
        let filled = 0;
        for (const point of negatives) for (const dy of [-18, 0, 18]) for (const dx of [-18, 0, 18]) {
          const x = Math.min(image.width - 1, Math.max(0, Math.floor((point.x + dx) / 1000 * image.width)));
          const y = Math.min(image.height - 1, Math.max(0, Math.floor((point.y + dy) / 1000 * image.height)));
          if (candidate.alpha[y * image.width + x] > 127) filled++;
        }
        return filled / (9 * negatives.length);
      };
      const sortPointMasks = (items) => {
        const viable = items.filter(c => c.score >= .65 && c.holeRatio < .20 && area(c.box) < 480000);
        const rank = c => area(c.box) / 1e6 - .45 * excludedCoverage(c);
        return viable.sort((a,b) => rank(b) - rank(a));
      };
      const combined = [...regionMasks, ...pointMasks];
      if (guided && box) {
        const insideGuide = candidate => {
          let overlapPixels = 0, maskPixels = 0;
          candidate.signature.forEach((filled, index) => {
            if (!filled) return;
            const x = (index % 40 + .5) * 25, y = (Math.floor(index / 40) + .5) * 25;
            maskPixels++;
            if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height && insidePolygon(x, y)) overlapPixels++;
          });
          return maskPixels ? overlapPixels / maskPixels : 0;
        };
        const rank = c => .50 * insideGuide(c) + .35 * boxOverlap(c.box, box) + .15 * c.score - .35 * excludedCoverage(c);
        const suitable = c => insideGuide(c) >= .65;
        const guidedCandidates = combined.filter(suitable);
        if (guidePoint && !guidedCandidates.some(candidate => boxOverlap(candidate.box, box) >= .42)) {
          guidedCandidates.push(...(await decode(regionPrompts)).filter(suitable));
        }
        candidates = guidedCandidates.sort((a,b) => rank(b)-rank(a));
      } else if (box && regionMasks.length) {
        const rank = c => .60 * boxOverlap(c.box, box) + .40 * c.score - .35 * excludedCoverage(c);
        candidates = combined.sort((a,b) => rank(b) - rank(a));
      } else {
        candidates = [...sortPointMasks(combined), ...combined];
      }
      if (!guided && positives.length > 1 && positives.length <= 8 &&
          (!candidates.length || area(candidates[0].box) > 550000)) {
        const parts = [];
        for (const point of positives) {
          const part = sortPointMasks(await decode([point, ...negatives]))[0];
          if (part) parts.push(part);
        }
        if (parts.length === positives.length) {
          const alpha = new Uint8Array(pixelCount);
          for (const part of parts) for (let i = 0; i < pixelCount; i++) alpha[i] = Math.max(alpha[i], part.alpha[i]);
          const [left, top] = [Math.min(...parts.map(p => p.box.x)), Math.min(...parts.map(p => p.box.y))];
          const right = Math.max(...parts.map(p => p.box.x + p.box.width));
          const bottom = Math.max(...parts.map(p => p.box.y + p.box.height));
          candidates.unshift({alpha, box:{x:left, y:top, width:right-left, height:bottom-top}, score:Math.min(...parts.map(p => p.score)),
            signature:signature(Uint8Array.from(alpha,v=>v>127?1:0),image.width,image.height)});
        }
      }
      candidates = candidates.filter((item,i,all) => !all.slice(0,i).some(other => overlap(other.signature,item.signature) > .91)).slice(0,4);
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
