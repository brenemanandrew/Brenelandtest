// screenshot GLB files side by side with the stock three.js loader: node glbshot.mjs ROOT 'a.glb,b.glb' OUT.png
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import puppeteer from 'puppeteer-core';
const [ROOT,FILES,OUT]=process.argv.slice(2),PORT=9100+Math.floor(Math.random()*90);
const srv=http.createServer((q,r)=>{const u=decodeURIComponent(q.url.split('?')[0]);const f=path.join(ROOT,u==='/'?'index.html':u);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':'application/octet-stream'});r.end(d);});}).listen(PORT);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});const p=await b.newPage();await p.setViewport({width:1200,height:650});
const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(`http://localhost:${PORT}/?f=${FILES}`);await p.waitForFunction(()=>window.done,{timeout:120000});await new Promise(r=>setTimeout(r,800));await p.screenshot({path:OUT});console.log('errors',errs);await b.close();srv.close();
