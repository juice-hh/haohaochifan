// Pixel segmentation runs locally. No photos or prompts leave this worker.
import {env, SamModel, AutoProcessor, RawImage, Tensor} from './vendor/transformers-2.17.2/transformers.min.js';
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
async function run({id, photo, box, points}) {
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
    const prompts = points?.length ? points : [{x:box.x+box.width/2,y:box.y+box.height/2,label:1}];
    const coords=prompts.map(p=>[p.x/1000*width,p.y/1000*height]);
    const labels=prompts.map(p=>BigInt(p.label));
    if(box){coords.push([box.x/1000*width,box.y/1000*height],[(box.x+box.width)/1000*width,(box.y+box.height)/1000*height]);labels.push(2n,3n);}
    postMessage({id,type:'progress',stage:'segmenting'});
    const outputs=await model({...embeddings,
      input_points:new Tensor('float32',coords.flat(),[1,1,coords.length,2]),
      input_labels:new Tensor('int64',labels,[1,1,labels.length])});
    const masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
    const candidates=[];
    const mask=masks[0],size=image.width*image.height;
    for(let i=0;i<3;i++){
      const values=mask.data.subarray(i*size,(i+1)*size);
      let area=0,left=image.width,top=image.height,right=0,bottom=0;
      const pixels=new Uint8ClampedArray(size*4);
      for(let j=0;j<size;j++)if(values[j]){area++;const x=j%image.width,y=Math.floor(j/image.width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);pixels[j*4]=255;pixels[j*4+1]=255;pixels[j*4+2]=255;pixels[j*4+3]=255;}
      if(area<16||area>size*.95)continue;
      const canvas=new OffscreenCanvas(image.width,image.height);
      canvas.getContext('2d').putImageData(new ImageData(pixels,image.width,image.height),0,0);
      const blob=await canvas.convertToBlob({type:'image/png'});
      const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
      candidates.push({mask:'data:image/png;base64,'+btoa(binary),score:outputs.iou_scores.data[i],
        box:{x:left/image.width*1000,y:top/image.height*1000,width:(right-left+1)/image.width*1000,height:(bottom-top+1)/image.height*1000}});
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(!candidates.length)throw new Error('empty mask');
    postMessage({id,type:'result',candidates});
  }catch(error){postMessage({id,type:'error',message:String(error.message).slice(0,200)});}
}
let queue=Promise.resolve();
onmessage=event=>{queue=queue.then(()=>run(event.data));};
