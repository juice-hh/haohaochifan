import assert from 'node:assert/strict';
import {cleanMask,signature,overlap} from '../project/mask-utils.mjs';
const w=40,h=40,m=new Uint8Array(w*h);for(let y=8;y<28;y++)for(let x=8;x<28;x++)m[y*w+x]=1;
m[15*w+15]=0;m[2*w+2]=1;m[2*w+3]=1;
const r=cleanMask(m,w,h,[{x:500,y:500,label:1}]);assert.equal(r.removed,2);assert.equal(r.filled,1);assert.equal(r.values[15*w+15],1);assert.equal(r.values[2*w+2],0);assert.equal(r.components,1);
const negative=cleanMask(m,w,h,[{x:950,y:950,label:1}]);assert.equal(negative,null);
const multi=new Uint8Array(w*h);for(let y=2;y<8;y++)for(let x=2;x<8;x++)multi[y*w+x]=1;for(let y=25;y<35;y++)for(let x=25;x<35;x++)multi[y*w+x]=1;
const both=cleanMask(multi,w,h,[{x:100,y:100,label:1},{x:750,y:750,label:1}]);assert.equal(both.components,2);assert.equal(both.area,136);
const a=signature(r.values,w,h);assert.equal(overlap(a,a),1);assert.equal(overlap(a,new Uint8Array(1600)),0);
console.log('PASS anchored components, isolated fragments, small holes, multiple food pieces and mask overlap');

const excluded=cleanMask(m,w,h,[{x:500,y:500,label:1},{x:375,y:375,label:0}]);assert.equal(excluded.values[15*w+15],0);assert.equal(excluded.filled,0);
assert.equal(cleanMask(m,w,h,[{x:500,y:500,label:1},{x:950,y:950,label:1}]),null);
console.log('PASS explicit exclusion holes stay transparent; missing positive selection is rejected');
