const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright-core');
const ethers=require('../frontend/vendor/ethers.umd.min.js');
const config=require('../frontend/product.json');
const base=path.join(__dirname,'..','frontend');
test('deployment status, unavailable RPC, and mainnet read-only operation',async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(base,req.url==='/'?'index.html':'.'+req.url);if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}try{res.setHeader('content-type',file.endsWith('.js')?'application/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  const executablePath=process.env.BROWSER_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined);
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let mode='pending',rpcCalls=0;
  await page.route(/https:\/\/(fonts\.|cdnjs\.|cdn\.)/,r=>r.abort());
  await page.route('**/product.json',r=>r.fulfill({json:{...config,address:mode==='pending'?null:'0x1111111111111111111111111111111111111111'}}));
  const abi=new ethers.Interface(config.abi);
  const zero=p=>p.type.endsWith('[]')?[]:p.type.startsWith('tuple')?p.components.map(zero):p.type==='address'?ethers.ZeroAddress:p.type==='bool'?false:p.type==='string'?'':p.type.startsWith('bytes')?'0x'+'00'.repeat(Number(p.type.slice(5))||0):0n;
  await page.route('https://rpc.botchain.ai/**',async route=>{
   rpcCalls++;if(mode==='failure')return route.fulfill({status:503,body:'unavailable'});
   const answer=p=>{let result;if(p.method==='eth_chainId')result='0x2a5';else if(p.method==='eth_getCode')result='0x60006000';else if(p.method==='eth_getBalance')result='0x0';else if(p.method==='eth_blockNumber')result='0x1';else if(p.method==='eth_call'){const f=abi.getFunction(p.params[0].data.slice(0,10));result=abi.encodeFunctionResult(f,f.outputs.map(zero));}else throw new Error('Unexpected RPC method '+p.method);return {jsonrpc:'2.0',id:p.id,result};};
   const data=route.request().postDataJSON();await route.fulfill({json:Array.isArray(data)?data.map(answer):answer(data)});
  });
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);await page.waitForFunction(()=>document.querySelector('#suite-network').textContent==='Mainnet deployment pending');assert.equal(rpcCalls,0);assert.equal(await page.locator('.suite-action button:enabled').count(),0);
  mode='failure';await page.reload();await page.waitForFunction(()=>document.querySelector('#suite-network').textContent==='Mainnet unavailable');assert.equal(await page.locator('.suite-action button:enabled').count(),0);
  mode='ready';await page.reload();await page.waitForFunction(()=>document.querySelector('#suite-network').textContent==='Mainnet verified');assert.equal(await page.locator('.suite-action button:enabled').count(),0);assert.equal(await page.locator('#suite-stats').innerText().then(t=>/demo|sample|12\.4%/i.test(t)),false);
  await page.click('#suite-wallet');await page.waitForFunction(()=>document.querySelector('#suite-message').textContent.includes('wallet browser'));assert.equal(await page.locator('#suite-network').innerText(),'Mainnet verified');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
