// Validation only: no paid API calls and no real credentials.
const assert=require('node:assert/strict');
const handler=require('../api/match-foods.js');
process.env.OPENAI_API_KEY='test-only';
const valid=[{foodIndex:0,maskIds:[1,2],status:'matched',coverage:'partial',reason:'Two pieces'},{foodIndex:1,maskIds:[],status:'uncertain',coverage:'none',reason:'Ambiguous'}];
let matches,upstreamStatus='completed';
global.fetch=async()=>({ok:true,json:async()=>({status:upstreamStatus,output:[{content:[{type:'output_text',text:JSON.stringify({matches})}]}]})});
async function request(overrides={}){
 const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await handler({method:'POST',headers:{host:'localhost'},body:{photo:'data:image/jpeg;base64,AAAA',sheet:'data:image/jpeg;base64,AAAA',foods:['鸡蛋','番茄'],candidateCount:3},...overrides},res);return res;
}
(async()=>{
 matches=structuredClone(valid);assert.equal((await request()).code,200);
 matches[1]={...matches[1],maskIds:[2],status:'matched',coverage:'partial'};assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches[0].maskIds=[4];assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches[1].foodIndex=0;assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches[0].coverage='unknown';assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches.pop();assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches[0].maskIds=[];assert.equal((await request()).code,502);
 matches=structuredClone(valid);matches[1].maskIds=[3];assert.deepEqual((await request()).body.matches[1].maskIds,[]);
 upstreamStatus='incomplete';assert.equal((await request()).code,502);upstreamStatus='completed';
 assert.equal((await request({method:'GET'})).code,405);
 assert.equal((await request({headers:{host:'localhost',origin:'https://unrelated.example'}})).code,403);
 assert.equal((await request({body:{}})).code,400);
 console.log('PASS candidate matching: completeness, unique food indices, duplicate/out-of-range/empty IDs, uncertain masks, upstream failure and input validation');
})().catch(e=>{console.error(e);process.exit(1)});
