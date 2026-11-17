// Contract test with synthetic masks; semantic grouping is separately checked with real API photos.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome'}),p=await b.newPage();await p.goto('http://127.0.0.1:4176/Main.dc.html');
const result=await p.evaluate(async()=>{
 function mask(x){const c=document.createElement('canvas');c.width=c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(x,20,15,20);return {mask:c.toDataURL(),box:{x:x*10,y:200,width:150,height:200},score:.95,edgeVersion:1};}
 const candidates=[{...mask(10),id:1},{...mask(40),id:2},{...mask(65),id:3},{...mask(82),id:4}];
 const foods=[{name:'鸡蛋（2个）',kcal:160},{name:'沙拉（1碗）',kcal:200},{name:'牛奶（1瓶）',kcal:130}];
 const matches=[{foodIndex:0,status:'matched',coverage:'complete',maskIds:[1,2]},{foodIndex:1,status:'matched',coverage:'complete',maskIds:[3]},{foodIndex:2,status:'matched',coverage:'complete',maskIds:[4]}];
 const grouped=await FoodStickers.applyMatches(foods,candidates,matches);
 const img=new Image();await new Promise(r=>{img.onload=r;img.src=grouped[0].cutout.mask});const c=document.createElement('canvas');c.width=c.height=100;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
 return {names:grouped.map(f=>f.name),kcal:grouped.map(f=>f.kcal),count:grouped.length,eggAlpha:[ctx.getImageData(15,25,1,1).data[3],ctx.getImageData(45,25,1,1).data[3],ctx.getImageData(32,25,1,1).data[3]]};
});assert.equal(result.count,3);assert.deepEqual(result.names,['鸡蛋（2个）','沙拉（1碗）','牛奶（1瓶）']);assert.deepEqual(result.kcal,[160,200,130]);assert.deepEqual(result.eggAlpha,[255,255,0]);await b.close();
process.env.OPENAI_API_KEY='test-only';const handler=require('../api/recognize.js'),{servingPolicy}=require('../lib/sticker-policy.cjs');let sent;
const foods=result.names.map((name,i)=>({name,kcal:result.kcal[i],box:{x:i*250,y:100,width:200,height:300},contour:[]}));
global.fetch=async(_url,args)=>{sent=JSON.parse(args.body);return{ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({foodVisible:true,name:'鸡蛋、沙拉、牛奶',portion:500,kcal:490,carb:45,pro:30,fat:20,notes:'测试响应',foods})}]}]})}};
const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{host:'localhost'},body:{photo:'data:image/jpeg;base64,AAAA'}},res);assert.equal(res.code,200);assert.equal(res.body.foods.length,3);assert.equal(res.body.kcal,490);assert(sent.instructions.includes(servingPolicy));console.log('PASS three serving groups, both eggs in one transparent sticker, group calorie totals and recognition contract');process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
