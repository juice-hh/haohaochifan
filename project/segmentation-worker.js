// Pixel segmentation runs locally. No photos or prompts leave this worker.
import {env, SamModel, AutoProcessor, RawImage, Tensor} from './vendor/transformers-2.17.2/transformers.min.js';
import {cleanMask,signature,overlap} from './mask-utils.mjs?v=20261117-1';
env.allowRemoteModels = false;
env.localModelPath = new URL('./models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/transformers-2.17.2/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
let runtime, cachedPhoto, inputs, embeddings, image;
function load(progress) {
  return runtime ||= Promise.all([
    SamModel.from_pretrained('slimsam-5850ab45', {quantized:true, progress_callback:progress}),
    AutoProcessor.from_pretrained('slimsam-5850ab45')
  ]).catch(error => {runtime=null;throw error;});
}
async function run({id, photo, box, points, mode, hints=[]}) {
  try {
    if(!runtime)postMessage({id,type:'progress',stage:'loading'});
    const [model, processor] = await load(()=>{});
    if (cachedPhoto !== photo) {
      postMessage({id,type:'progress',stage:'encoding'});
      image = await RawImage.read(photo);
      inputs = await processor(image);
      embeddings = await model.get_image_embeddings(inputs);
      cachedPhoto = photo;
    }
    const [height,width] = inputs.reshaped_input_sizes[0];
    async function decode(prompts){
      const coords=prompts.map(p=>[p.x/1000*width,p.y/1000*height]);
      const labels=prompts.map(p=>BigInt(p.label));
      // Point prompts preserve whole objects; imprecise language-model boxes no longer cut them off.
      const outputs=await model({...embeddings,
        input_points:new Tensor('float32',coords.flat(),[1,1,coords.length,2]),
        input_labels:new Tensor('int64',labels,[1,1,labels.length])});
      const masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
      const results=[],mask=masks[0],size=image.width*image.height;
      for(let i=0;i<3;i++){
        const cleaned=cleanMask(mask.data.subarray(i*size,(i+1)*size),image.width,image.height,prompts);
        if(!cleaned||cleaned.area<Math.max(24,size*.0008)||cleaned.area>size*(mode==='propose'?.42:.9))continue;
        const values=cleaned.values;let left=image.width,top=image.height,right=0,bottom=0;
        const pixels=new Uint8ClampedArray(size*4);
        for(let j=0;j<size;j++)if(values[j]){const x=j%image.width,y=Math.floor(j/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);pixels[j*4]=pixels[j*4+1]=pixels[j*4+2]=pixels[j*4+3]=255;}
        if(mode==='propose'&&(left===0||top===0||right===image.width-1||bottom===image.height-1)&&((right-left)/image.width>.7||(bottom-top)/image.height>.7))continue;
        const canvas=new OffscreenCanvas(image.width,image.height);
        canvas.getContext('2d').putImageData(new ImageData(pixels,image.width,image.height),0,0);
        const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        results.push({mask:'data:image/png;base64,'+btoa(binary),score:outputs.iou_scores.data[i],
          box:{x:left/image.width*1000,y:top/image.height*1000,width:(right-left+1)/image.width*1000,height:(bottom-top+1)/image.height*1000},
          cleanup:{removed:cleaned.removed,filled:cleaned.filled,components:cleaned.components},area:cleaned.area/size,signature:signature(values,image.width,image.height)});
      }
      return results.sort((a,b)=>b.score-a.score);
    }
    let candidates=[];
    if(mode==='propose'){
      const seeds=[];
      for(let y=0;y<8;y++)for(let x=0;x<8;x++)seeds.push({x:150+x*100,y:150+y*100,label:1});
      for(const hint of hints.slice(0,16)){const p={x:hint.x+hint.width/2,y:hint.y+hint.height/2,label:1};if(!seeds.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<45))seeds.push(p);}
      for(let i=0;i<seeds.length;i++){
        postMessage({id,type:'progress',stage:'proposing',current:i+1,total:seeds.length});
        for(const c of await decode([seeds[i]])){
          if(c.score<.78)continue;
          const same=candidates.findIndex(v=>overlap(v.signature,c.signature)>.87);
          if(same<0)candidates.push(c);else if(c.score>candidates[same].score)candidates[same]=c;
        }
      }
      candidates.sort((a,b)=>b.score-a.score);
      candidates=candidates.slice(0,48).sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
    }else{
      const prompts=points?.length?points:box?[{x:box.x+box.width/2,y:box.y+box.height/2,label:1}]:[];
      if(!prompts.length)throw new Error('Missing selection');
      postMessage({id,type:'progress',stage:'segmenting'});
      candidates=await decode(prompts);
    }
    candidates=candidates.map(({signature,area,...candidate},index)=>({...candidate,id:index+1}));
    if(!candidates.length)throw new Error('empty mask');
    postMessage({id,type:'result',candidates});
  }catch(error){postMessage({id,type:'error',message:String(error.message).slice(0,200)});}
}
let queue=Promise.resolve();
onmessage=event=>{queue=queue.then(()=>run(event.data));};
