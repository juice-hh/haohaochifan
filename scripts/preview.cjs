// Local preview uses deployed API handlers; API secrets stay on Vercel.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../project');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(['/api/recognize','/api/match-foods'].includes(url.pathname)){
   if(req.method!=='POST'){res.writeHead(405).end();return;}
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403).end();return;}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4000000){res.writeHead(413).end();return;}chunks.push(chunk);}
   const r=await fetch('https://haohaochifan-six.vercel.app'+url.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:Buffer.concat(chunks),signal:AbortSignal.timeout(60000)});
   res.writeHead(r.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(await r.text());return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/Main.dc.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const stat=await fs.promises.stat(file);if(!stat.isFile())throw Error('Not a file');
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'本地预览暂时无法读取，请稍后重试。'}));}
}).listen(Number(process.env.PORT||4177),'127.0.0.1',()=>console.log('Preview listening on 127.0.0.1:'+ (process.env.PORT||4177)));
