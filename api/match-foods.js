const { matchingInstructions } = require('../lib/sticker-policy.cjs');
const schema={type:'object',additionalProperties:false,required:['matches'],properties:{matches:{type:'array',maxItems:16,items:{type:'object',additionalProperties:false,required:['foodIndex','maskIds','status','coverage','reason'],properties:{foodIndex:{type:'integer',minimum:0,maximum:15},maskIds:{type:'array',maxItems:8,items:{type:'integer',minimum:1,maximum:48}},status:{type:'string',enum:['matched','uncertain','missing']},coverage:{type:'string',enum:['complete','partial','none']},reason:{type:'string'}}}}}};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'请从记录页面核对贴纸。'});
 const origin=req.headers.origin;if(origin&&origin!=='https://'+req.headers.host&&origin!=='http://'+req.headers.host)return res.status(403).json({error:'请从好好吃饭打开。'});
 const {photo,sheet,tiles,foods,candidateCount}=req.body||{};
 const jpeg=(s,max)=>typeof s==='string'&&s.length<=max&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);
 if(!jpeg(photo,1500000)||!jpeg(sheet,2200000)||!Number.isInteger(candidateCount)||candidateCount<1||candidateCount>48||!Array.isArray(foods)||!foods.length||foods.length>16||foods.some(f=>typeof f!=='string'||!f.trim()||f.length>60))return res.status(400).json({error:'食物贴纸数据不完整，请重新识别。'});
 if(tiles!==undefined&&(!Array.isArray(tiles)||tiles.length!==candidateCount||tiles.some(t=>!jpeg(t,100000))))return res.status(400).json({error:'贴纸缩略图无效，请重试。'});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'贴纸核对服务未配置，可手动点选食物。'});
 try{
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:'gpt-5.4',reasoning:{effort:'low'},store:false,max_output_tokens:9000,
   instructions:matchingInstructions,
   input:[{role:'user',content:[{type:'input_text',text:JSON.stringify({foods:foods.map((name,foodIndex)=>({foodIndex,name})),candidateCount})},{type:'input_image',image_url:photo,detail:'high'},...(tiles?tiles.flatMap((image_url,i)=>[{type:'input_text',text:'Candidate ID '+(i+1)},{type:'input_image',image_url,detail:'high'}]):[{type:'input_image',image_url:sheet,detail:'high'}])]}],text:{format:{type:'json_schema',name:'food_mask_matches',strict:true,schema}}})});
  if(!r.ok)return res.status(r.status===429?429:502).json({error:'贴纸核对暂时不可用，可以手动点选后保存。'});
  const data=await r.json(),text=data.output?.flatMap(i=>i.content||[]).find(c=>c.type==='output_text')?.text;
  if(data.status!=='completed'||!text)throw Error('Incomplete');
  const result=JSON.parse(text),seen=new Set(),used=new Set();
  if(!Array.isArray(result.matches)||result.matches.length!==foods.length)throw Error('Incomplete matches');
  for(const m of result.matches){
   if(!Number.isInteger(m.foodIndex)||m.foodIndex<0||m.foodIndex>=foods.length||seen.has(m.foodIndex)||!['matched','uncertain','missing'].includes(m.status)||!['complete','partial','none'].includes(m.coverage)||typeof m.reason!=='string'||!Array.isArray(m.maskIds)||m.maskIds.length>8)throw Error('Invalid match');
   seen.add(m.foodIndex);m.reason=m.reason.slice(0,180);
   if(m.status!=='matched'){m.maskIds=[];continue;}
   if(!m.maskIds.length||m.coverage==='none')throw Error('Empty match');
   for(const id of m.maskIds){if(!Number.isInteger(id)||id<1||id>candidateCount||used.has(id))throw Error('Invalid mask id');used.add(id);}
  }
  return res.status(200).json(result);
 }catch(error){console.warn('food_match_failure',String(error.message).slice(0,120));return res.status(502).json({error:'这次没能核对贴纸，请重试或手动点选食物。'});}
};
