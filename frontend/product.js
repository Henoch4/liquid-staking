/* Shared product controller. No demo transactions, sample balances, or signing keys. */
(() => {
 'use strict';
 const $ = s => document.querySelector(s);
 const state = { phase:'loading', chain:677, account:null, wallet:null, reader:null, writer:null, owner:null, config:null, generation:0, recordActions:[], receipts:[] };
 const E = window.ethers;
 const ZERO = '0x0000000000000000000000000000000000000000';
 const RPC = 'https://rpc.botchain.ai';
 const EXPLORER = 'https://scan.botchain.ai';
 const el = (tag,text,cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
 const same = (a,b) => !!a&&!!b&&a.toLowerCase()===b.toLowerCase();
 const words = s => s.replace(/^_/, '').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
 const short = a => a.slice(0,6)+'…'+a.slice(-4);
 const validAddress = a => !!a&&E.isAddress(a)&&!/^0x0{30}/i.test(a)&&!/^0xca0{30}/i.test(a);
 const errorText = e => e.code===4001||e.code==='ACTION_REJECTED'?'Request declined in your wallet.':String(e.shortMessage||e.reason||e.message||'The request could not be completed.').slice(0,220);
 function status(text,error=false){ const n=$('#suite-message'); n.textContent=text;n.dataset.error=String(error); }
 const signature=f=>f.name+'('+f.inputs.map(p=>p.type).join(',')+')';
 function fragment(name){ return state.config.abi.find(f=>f.type==='function'&&(name.includes('(')?signature(f)===name:f.name===name)); }
 function unpack(fn,result){ const outs=fragment(fn)?.outputs||[]; if(outs.length===1&&outs[0].type.startsWith('tuple'))return result; const named={};outs.forEach((o,i)=>named[o.name||String(i)]=outs.length===1?result:result[i]);return named; }
 async function read(name,args=[]){if(!state.reader)throw new Error('Mainnet contract is unavailable.');return state.reader.getFunction(name).staticCall(...args);}
 function addressLink(address){const a=el('a',address);a.href=EXPLORER+'/address/'+address;a.target='_blank';a.rel='noopener noreferrer';return a;}
 function display(value,type,name){
  if(typeof value==='boolean')return value?'Yes':'No';
  if(typeof value==='bigint'){
   if(/timestamp|deadline|expiry|startTime|endTime|paidUntil|stakedAt|lastUpdated|lastUpdate|lastCompound|UpdatedAt|cycleStarted/i.test(name)&&value>1000000000n&&value<100000000000n)return new Date(Number(value)*1000).toLocaleString();
   if(/bps$/i.test(name))return value.toString()+' basis points';
   if(state.config.repo==='dynamic-nfts'&&/evolutionCost|collectedFees/i.test(name))return E.formatEther(value)+' BOT';
   if(state.config.repo==='ringwood-vaults'&&/shares|sharesOf|totalShares/i.test(name))return E.formatEther(value)+' shares';
   if(['notch','fulcrum'].includes(state.config.repo)&&/price|strike/i.test(name))return E.formatEther(value)+' price units';
   if(state.config.repo==='ringwood-vaults'&&/balance|rewardReserve|totalCompounded/i.test(name))return E.formatEther(value)+' tokens';
   if(state.config.repo==='dca-bot'&&/tokenReserve|tokensPerBOT/i.test(name))return E.formatEther(value)+(name==='tokensPerBOT'?' tokens / BOT':' tokens');
   if(state.config.repo==='tidewell'&&/balanceOf|totalSupply|shares|totalShares/i.test(name))return E.formatEther(value)+' shares';
   if(/premium|payout|principal|price|raised|revenue|received|totalVolume|totalFees|totalTipsVolume|totalBridged|yesPool|noPool|coverAmount|totalRepay|repayAmount|margin|totalStaked|totalRestaked|proceedsBOT|walletBalance|reservedCover/i.test(name))return E.formatEther(value)+' BOT';
   if(state.config.repo==='subscription-billing'&&name==='amount')return E.formatEther(value)+' BOT';
   if(state.config.repo==='clink'&&name==='balance')return E.formatEther(value)+' BOT';
   if(['mint-mix','laurel'].includes(state.config.repo)&&/balanceOf|supply|totalSupply/i.test(name))return E.formatEther(value)+' tokens';
   return value.toString();
  }
  return String(value);
 }
 function renderResult(host,fn,result){
  host.replaceChildren(); const outs=fn.outputs||[];
  const draw=(params,values)=>{const dl=el('dl',undefined,'suite-values');params.forEach((p,i)=>{
   const value=values[i]; if(p.type.startsWith('tuple')){dl.append(el('dt',words(p.name||'Record')),el('dd'));dl.lastChild.append(draw(p.components,value));return;}
   dl.append(el('dt',words(p.name||'Result')));const dd=el('dd');
   if(p.type==='address'&&E.isAddress(value))dd.append(addressLink(value));
   else if(p.type.endsWith('[]'))dd.textContent=Array.from(value).map(v=>String(v)).join(', ')||'None';
   else dd.textContent=display(value,p.type,p.name||fn.name);
   dl.append(dd);
  });return dl;};
  host.append(draw(outs,outs.length===1?[result]:result));
 }
 function paint(){
  const labels={loading:'Checking mainnet…',pending:'Mainnet deployment pending',ready:'Mainnet verified',error:'Mainnet unavailable'};
  $('#suite-network').textContent=labels[state.phase];
  $('#suite-wallet').textContent=state.account?short(state.account):'Connect wallet';
  $('#suite-disconnect').hidden=!state.account;
  $('#suite-address').replaceChildren();
  if(state.config?.address)$('#suite-address').append(addressLink(state.config.address));
  else $('#suite-address').textContent='Contract not deployed';
  $('#suite-actions-note').textContent=state.phase==='pending'?'Transactions will become available after a verified mainnet deployment.':state.config?.readOnlyReason||(!state.account?'Connect your wallet to use the available actions.':state.chain!==677?'Switch your wallet to BOT Chain mainnet (677).':'Inspect an existing record below to see the actions available to your wallet.');
  const ready=state.phase==='ready'&&!!state.writer&&!!state.account&&state.chain===677&&!state.config?.readOnlyReason&&!state.connecting;
  document.querySelectorAll('.suite-action input,.suite-action select,.suite-action textarea,#suite-query,#suite-query-form input,#suite-query-form select,#suite-query-form button').forEach(n=>n.disabled=!!state.connecting);
  document.querySelectorAll('.suite-action button[type=submit],.suite-action button[data-requires-wallet]').forEach(b=>b.disabled=!ready||b.dataset.busy==='true');
 }
 function paramSpec(fn,p,index){
  const key=fn.name+'.'+p.name;
  const monetary=state.config.money.includes(key);
  const datetime=p.type.startsWith('uint')&&/^(ts|deadline|expiry|startTime|endTime)$/.test(p.name);
  const duration=/durationSeconds|intervalSeconds|compoundIntervalSeconds|^interval$/.test(p.name);
  let label=words(p.name||((p.type==='address')?'Address':'Record ID'));
  const ids={cid:'Campaign ID',pid:'Plan ID',sid:'Subscription ID',tid:'Token ID',mid:'Market ID',rid:'Request ID',vid:'Vault ID',lid:'Loan ID',fid:'Fraction ID',eid:'Event ID',oid:'Option ID'};
  if(ids[p.name])label=ids[p.name];
  if(state.config.repo==='parametric-insurance'&&['id','pid'].includes(p.name))label=(p.name==='pid'?'Policy ID':'Event ID')+' (starts at '+(state.config.idBase||0)+')';
  if(state.config.repo==='pvp-arena'&&p.name==='mid')label='Match ID';
  if(state.config.repo==='restaking'&&p.name==='rid')label='Position ID';
  if(state.config.repo==='dynamic-nfts'&&p.name==='level')label='Starting level';
  let units='BOT';
  if(state.config.repo==='ringwood-vaults')units=p.name==='shares'?'shares':'tokens';
  if(['laurel','mint-mix'].includes(state.config.repo)&&/transfer|approve|mint|burn/.test(fn.name))units='tokens';
  if(state.config.repo==='tidewell'&&['transfer','transferFrom','approve'].includes(fn.name))units='shares';
  if(state.config.repo==='dca-bot'&&fn.name==='setMarket')units='tokens per BOT';
  if(state.config.repo==='dca-bot'&&/Liquidity/.test(fn.name))units='tokens';
  if(['notch','fulcrum'].includes(state.config.repo)&&/price/i.test(p.name))units='price units';
  if(monetary)label+=' ('+units+')';
  else if(duration)label+=' (seconds)';
  else if(/bps/i.test(p.name))label+=' (basis points; 100 = 1%)';
  else if(datetime)label+=' (local time)';
  else if(/strikePrice|currentPrice|entryPrice|closePrice|newPrice|^size$/.test(p.name))label+=' (contract units)';
  if(fn.name==='createOption'&&p.name==='optType')label='Option type (0 = call, 1 = put)';
  if(fn.name==='resolve'&&p.name==='outcome')label='Outcome (1 = yes, 2 = no)';
  return {label,monetary,datetime,duration};
 }
 function field(fn,p,index){
  const spec=paramSpec(fn,p,index),label=el('label',spec.label,'suite-field');
  let input;
  if(p.type==='bool'){input=el('select');for(const [v,t] of [['true','Yes'],['false','No']]){const option=el('option',t);option.value=v;input.append(option);}}
  else {input=el(p.type==='string'&&/description|reason|message|bio/.test(p.name)?'textarea':'input');if(input.tagName==='INPUT')input.type=spec.datetime?'datetime-local':'text';input.required=true;input.autocomplete='off';
   if(p.type==='address')input.placeholder='0x…';
   else if(p.type==='bytes32')input.placeholder='Feed name or 0x…';
   else if(p.type==='bytes'){input.placeholder='0x…';if(p.name==='data')input.value='0x';}
   else if(p.type.endsWith('[]'))input.placeholder='Comma-separated values';
   else if(/^u?int/.test(p.type))input.inputMode=spec.monetary?'decimal':'numeric';
  }
  input.name='arg'+index;input.dataset.param=p.name;input.dataset.type=p.type;
  input.setAttribute('aria-label',spec.label);label.append(input);return label;
 }
 function parseArg(fn,p,input,index){
  const text=input.value.trim(),spec=paramSpec(fn,p,index);
  if(p.type==='address'){if(!E.isAddress(text))throw new Error(spec.label+': enter a valid address.');return E.getAddress(text);}
  if(p.type==='bool')return text==='true';
  if(p.type.endsWith('[]'))return text?text.split(',').map(s=>s.trim()):[];
  if(p.type==='bytes32')return /^0x[0-9a-f]{64}$/i.test(text)?text:E.encodeBytes32String(text);
  if(p.type==='bytes'){if(!/^0x(?:[0-9a-f]{2})*$/i.test(text))throw new Error('Enter an even-length hexadecimal byte string.');return text;}
  if(spec.datetime){const n=Math.floor(new Date(text).getTime()/1000);if(!Number.isFinite(n))throw new Error('Choose a valid date and time.');return BigInt(n);}
  if(spec.monetary){if(!/^\d+(?:\.\d{1,18})?$/.test(text))throw new Error(spec.label+': enter a non-negative amount with at most 18 decimals.');return E.parseEther(text);}
  if(/^u?int/.test(p.type)){if(!/^-?\d+$/.test(text))throw new Error(spec.label+': enter a whole number.');const n=BigInt(text),bits=BigInt(p.type.replace(/\D/g,'')||256);const unsigned=p.type.startsWith('u');if(n<(unsigned?0n:-(1n<<(bits-1n)))||n>=(1n<<(unsigned?bits:bits-1n)))throw new Error(spec.label+': outside the supported range.');return n;}
  return text;
 }
 async function payment(fn,args,form){
  if(fn.stateMutability!=='payable')return 0n;
  const repo=state.config.repo,name=fn.name;
  if(!autoPayment(repo,name)){
   const input=form.querySelector('[name=payment]');if(!input)throw new Error('Payment amount unavailable.');
   const value=E.parseEther(input.value.trim());if(value<=0n)throw new Error('Enter a positive BOT amount.');return value;
  }
  if(repo==='span')return args[1];
  if(repo==='gasless-relayer')return args[name==='relayFor'?2:1];
  if(repo==='dca-bot')return args[1]*args[3];
  if(repo==='tidewell')return args[0];
  if(repo==='restaking')return args[1];
  if(repo==='pvp-arena')return name==='createMatch'?args[1]:(await read('getMatch',[args[0]])).stake;
  if(repo==='fulcrum')return args[3];
  if(repo==='stubhouse')return (await read('getEvent',[args[0]])).price*args[1];
  if(repo==='pitchside-pot')return (await read('getContest',[args[0]])).entryFee;
  if(repo==='loot-bazaar')return (await read('getListing',[args[0]])).price;
  if(repo==='liftoff')return (await read('getCollection',[args[0]])).price;
  if(repo==='subscription-billing'){
   const pid=name==='subscribe'?args[0]:(await read('subscriptionInfo',[args[0]])).planId;
   return (await read('planInfo',[pid])).amount;
  }
  if(repo==='notch'&&name==='buyOption')return (await read('getOption',[args[0]])).premium;
  if(repo==='shakehand-lending'){
   const loan=await read('getLoan',[args[0]]);return name==='fundLoan'?loan.principal:loan.totalRepay;
  }
  if(repo==='pawnvault'){const loan=await read('getLoan',[args[0]]);return name==='fundLoan'?loan.principal:loan.repayAmount;}
  if(repo==='parametric-insurance'&&name==='buyPolicy'&&fragment('premiumBps'))return args[1]*await read('premiumBps')/10000n;
  if(repo==='dynamic-nfts'&&name==='evolveNFT')return read('evolutionCost');
  const input=form.querySelector('[name=payment]');if(!input)throw new Error('Payment amount unavailable.');
  const value=E.parseEther(input.value.trim());if(value<=0n)throw new Error('Enter a positive BOT amount.');return value;
 }
 const autoPayment=(repo,name)=>({span:['initiateTransfer'],'dca-bot':['createPlan'],tidewell:['stake'],restaking:['restake'],'pvp-arena':['createMatch','joinMatch'],fulcrum:['openPosition'],stubhouse:['buyTicket'],'pitchside-pot':['joinContest'],'loot-bazaar':['buyItem'],liftoff:['mintNFT'],'subscription-billing':['subscribe','renew'],'shakehand-lending':['fundLoan','repayLoan'],pawnvault:['fundLoan','repayLoan'],'dynamic-nfts':['evolveNFT'],'gasless-relayer':['relay','relayFor'],notch:['buyOption'],'parametric-insurance':fragment('premiumBps')?['buyPolicy']:[]}[repo]||[]).includes(name);
 async function permitted(action,args){
  if(!state.account)return false;
  if(action.admin&&!same(state.owner,state.account))return false;
  if(action.actor==='oracle'&&!await read('isOracle',[state.account]))return false;
  if(action.actor==='creator'&&!await read('isCreator',[state.account]))return false;
  if(action.actor==='feeRecipient'&&!same(await read('feeRecipient'),state.account))return false;
  if(action.rule){const [getter,fields,extra]=action.rule;
   if(extra==='owner'&&same(state.owner,state.account))return true;
   if(extra==='guardian'){const g=await read('guardians',[args[0],state.account]);return !!g.active;}
   const record=unpack(getter,await read(getter,[args[0]]));return fields.some(f=>same(record[f],state.account));
  }
  return true;
 }
 function actionForm(action,preset){
  const fn=fragment(action.signature||action.name),form=el('form',undefined,'suite-action');form.dataset.action=action.name;
  form.append(el('h3',action.title));
  fn.inputs.forEach((p,i)=>{const f=field(fn,p,i);if(i===0&&preset!==undefined){f.lastChild.value=String(preset);f.lastChild.readOnly=true;}form.append(f);});
  if(fn.stateMutability==='payable'&&!autoPayment(state.config.repo,fn.name)){
   const label=el('label','Amount to send (BOT)','suite-field'),input=el('input');input.type='text';input.inputMode='decimal';input.name='payment';input.required=true;input.setAttribute('aria-label','Amount to send (BOT)');label.append(input);form.append(label);
  }else if(fn.stateMutability==='payable')form.append(el('p','The payment is calculated from current contract terms.'));
  const button=el('button','Review transaction');button.type='submit';button.disabled=true;form.append(button);
  const result=el('div',undefined,'suite-result');result.setAttribute('aria-live','polite');form.append(result);
  addActionHelpers(form,fn,button,result);
  form.addEventListener('submit',async event=>{
   event.preventDefault();button.dataset.busy='true';paint();
   try{
    if(state.phase!=='ready'||!state.account||state.config.readOnlyReason)throw new Error('Transactions are unavailable.');
    const args=fn.inputs.map((p,i)=>parseArg(fn,p,form.elements.namedItem('arg'+i),i));
    if(!await permitted(action,args))throw new Error('This action is not available to the connected wallet.');
    const chain=Number(await state.wallet.request({method:'eth_chainId'}));if(chain!==677)throw new Error('Switch to BOT Chain mainnet (677) before continuing.');
    const accounts=await state.wallet.request({method:'eth_accounts'});if(!same(accounts[0],state.account))throw new Error('Your wallet account changed. Reconnect and review again.');
    const value=await payment(fn,args,form);const method=state.writer.getFunction(signature(fn));const overrides=fn.stateMutability==='payable'?{value}:{};
    await method.staticCall(...args,overrides);
    const gas=await method.estimateGas(...args,overrides);
    const fee=await state.provider.getFeeData();
    showReview({action,fn,args,value,gas,gasPrice:fee.gasPrice||0n,generation:state.generation},result);
   }catch(e){result.textContent=errorText(e);status(errorText(e),true);}
   finally{button.dataset.busy='false';paint();}
  });return form;
 }
 function showReview(plan,result){
  const dialog=$('#suite-review'),content=$('#suite-review-content');const title=el('h2',plan.action.title);title.id='suite-review-title';content.replaceChildren(title,el('p','BOT Chain Mainnet · Chain ID 677'),el('p','From: '+state.account),el('p','Contract: '+(plan.externalTarget||state.config.address)));
  plan.fn.inputs.forEach((p,i)=>{
   const value=state.config.money.includes(plan.fn.name+'.'+p.name)?E.formatEther(plan.args[i]):String(plan.args[i]);
   content.append(el('p',paramSpec(plan.fn,p,i).label+': '+value));
  });
  if(plan.details)plan.details.forEach(line=>content.append(el('p',line)));
  content.append(el('p','Payment: '+E.formatEther(plan.value)+' BOT'),el('p','Estimated network fee: '+E.formatEther(plan.gas*plan.gasPrice)+' BOT'),el('p','Gas limit includes 25% headroom. Your wallet shows the final fee before signing.'));
  const confirm=$('#suite-confirm');confirm.disabled=false;confirm.textContent='Confirm in wallet';
  confirm.onclick=async()=>{
   confirm.disabled=true;confirm.textContent='Waiting for confirmation…';
   try{
    if(plan.generation!==state.generation)throw new Error('Account or network changed. Review the transaction again.');
    if(Number(await state.wallet.request({method:'eth_chainId'}))!==677)throw new Error('Wallet is no longer on mainnet.');
    const accounts=await state.wallet.request({method:'eth_accounts'});if(!same(accounts[0],state.account))throw new Error('Wallet account changed.');
    if(plan.externalContract)await plan.validate();else if(!await permitted(plan.action,plan.args))throw new Error('Your permissions changed.');
    const fn=(plan.externalContract||state.writer).getFunction(signature(plan.fn)),overrides={gasLimit:plan.gas*125n/100n,...(plan.fn.stateMutability==='payable'?{value:plan.value}:{})};
    const tx=await fn(...plan.args,overrides);dialog.close();
    result.replaceChildren(el('p','Submitted. Waiting for mainnet confirmation…'));const link=el('a',tx.hash);link.href=EXPLORER+'/tx/'+tx.hash;link.target='_blank';link.rel='noopener noreferrer';result.append(link);
    const receipt=await tx.wait();if(receipt.status!==1)throw new Error('The transaction reverted.');
    result.prepend(el('p','Confirmed on BOT Chain mainnet.'));state.receipts.unshift({hash:tx.hash,action:plan.action.title});renderReceipts();await refreshStats();
   }catch(e){result.textContent=errorText(e);status(errorText(e),true);dialog.close();}
  };
  dialog.showModal();
 }
 function addActionHelpers(form,fn,before,result){
  const nftApproval=['listItem','requestLoan','createFraction'].includes(fn.name);
  const tokenApproval=(state.config.repo==='dca-bot'&&fn.name==='provideLiquidity')||(state.config.repo==='ringwood-vaults'&&['deposit','fundRewards'].includes(fn.name));
  function helper(label,work){const button=el('button',label);button.type='button';button.dataset.requiresWallet='true';button.disabled=true;button.onclick=async()=>{button.dataset.busy='true';paint();try{if(!state.writer||state.chain!==677||state.config.readOnlyReason)throw new Error('Connect a mainnet wallet first.');if(Number(await state.wallet.request({method:'eth_chainId'}))!==677)throw new Error('Switch your wallet to mainnet.');const accounts=await state.wallet.request({method:'eth_accounts'});if(!same(accounts[0],state.account))throw new Error('Wallet account changed.');await work();}catch(e){result.textContent=errorText(e);}finally{button.dataset.busy='false';paint();}};form.insertBefore(button,before);return button;}
  if(nftApproval||tokenApproval)helper(nftApproval?'Approve this NFT transfer':'Approve this token amount',async()=>{
   let token,args,abi,details,validate;
   if(nftApproval){token=parseArg(fn,fn.inputs[0],form.elements.namedItem('arg0'),0);const tokenId=parseArg(fn,fn.inputs[1],form.elements.namedItem('arg1'),1);abi=['function approve(address spender,uint256 tokenId)','function ownerOf(uint256 tokenId) view returns(address)'];args=[state.config.address,tokenId];details=['Approves only NFT #'+tokenId+' for this product contract.'];validate=async c=>{if(!same(await c.getFunction('ownerOf').staticCall(tokenId),state.account))throw new Error('The connected wallet does not own this NFT.');};}
   else{const first=parseArg(fn,fn.inputs[0],form.elements.namedItem('arg0'),0),amount=parseArg(fn,fn.inputs[1],form.elements.namedItem('arg1'),1);if(amount<=0n)throw new Error('Enter a positive token amount.');token=state.config.repo==='dca-bot'?first:(await read('getVault',[first])).token;abi=['function approve(address spender,uint256 amount) returns(bool)','function decimals() view returns(uint8)'];args=[state.config.address,amount];details=['Exact allowance: '+E.formatEther(amount)+' tokens. No unlimited approval.'];validate=async c=>{if(await c.getFunction('decimals').staticCall()!==18n)throw new Error('This product supports 18-decimal tokens.');};}
   if(!E.isAddress(token)||await state.provider.getCode(token)==='0x')throw new Error('No token contract at this address.');
   const signer=await new E.BrowserProvider(state.wallet).getSigner(state.account);const c=new E.Contract(token,abi,signer);await validate(c);
   const method=c.getFunction('approve');await method.staticCall(...args);const gas=await method.estimateGas(...args);const fee=await state.provider.getFeeData();
   showReview({action:{name:'approve',title:nftApproval?'Approve this NFT transfer':'Approve this token amount'},fn:new E.Interface(abi).getFunction('approve'),args,value:0n,gas,gasPrice:fee.gasPrice||0n,generation:state.generation,externalTarget:token,externalContract:c,details,validate:()=>validate(c)},result);
  });
  if(state.config.repo==='gasless-relayer'&&['relay','relayFor'].includes(fn.name)&&fragment('getRelayHash'))helper('Sign this relay request',async()=>{
   const values={};fn.inputs.forEach((p,i)=>{if(p.name!=='signature')values[p.name]=parseArg(fn,p,form.elements.namedItem('arg'+i),i);});
   const from=fn.name==='relayFor'?values.from:state.account;if(!same(from,state.account))throw new Error('Connect the request sender to sign, then use a funded sponsor to submit.');
   const hash=await read('getRelayHash',[from,values.to,values.value,values.data,values.deadline]);const generation=state.generation;
   const signer=await new E.BrowserProvider(state.wallet).getSigner(state.account);const signed=await signer.signMessage(E.getBytes(hash));if(generation!==state.generation)throw new Error('Account changed while signing.');
   const i=fn.inputs.findIndex(p=>p.name==='signature');form.elements.namedItem('arg'+i).value=signed;result.textContent='Request signed. A sponsor can submit it with the exact payment; it cannot be replayed after execution.';
  });
 }
 async function renderActions(){
  const generation=state.generation;const host=$('#suite-action-grid'),forms=[],recordActions=[];
  for(const action of state.config.writes){
   if(action.rule){recordActions.push(action);continue;}
   if(action.admin&&!same(state.owner,state.account))continue;
   if(action.actor){try{if(!await permitted(action,[]))continue;}catch{continue;}}
   forms.push(actionForm(action));
  }
  if(generation!==state.generation)return;
  // Wallet/role refreshes must not discard a form the visitor already filled.
  const values=new Map();host.querySelectorAll('form[data-action]').forEach(form=>{
   form.querySelectorAll('input,textarea,select').forEach(input=>values.set(form.dataset.action+':'+input.name,input.value));
  });
  forms.forEach(form=>form.querySelectorAll('input,textarea,select').forEach(input=>{
   const key=form.dataset.action+':'+input.name;if(values.has(key))input.value=values.get(key);
  }));
  state.recordActions=recordActions;host.replaceChildren(...forms);
  if(!host.children.length)host.append(el('p','No actions are currently available to this wallet.'));
  paint();
 }
 function readForms(){
  const select=$('#suite-query');select.replaceChildren();
  const funcs=state.config.abi.filter(f=>f.type==='function'&&['view','pure'].includes(f.stateMutability)&&f.inputs.length&&(/^(get|is|balanceOf|allowance)|Info$|Stats$|^(events|policies|markets)$/.test(f.name)));
  const labels={events:'Find an event',policies:'Find a policy',markets:'Find a market',campaignInfo:'Find a campaign',tokenInfo:'Find a fan token',planInfo:'Find a plan',subscriptionInfo:'Find a subscription',creatorStats:'Find a creator',balanceOf:'Check a balance',isCreator:'Check creator registration',getWallet:'Find a recovery registry'};
  funcs.forEach(fn=>{const duplicated=funcs.filter(f=>f.name===fn.name).length>1;const option=el('option',(labels[fn.name]||words(fn.name).replace(/^Get /,'Find '))+(duplicated?' · '+fn.inputs.map(p=>p.name||p.type).join(', '):''));option.value=duplicated?signature(fn):fn.name;select.append(option);});
  $('#suite-lookup').hidden=!funcs.length;
  const redraw=()=>{const fn=fragment(select.value),form=$('#suite-query-form');form.replaceChildren();if(!fn)return;
   fn.inputs.forEach((p,i)=>form.append(field(fn,p,i)));
   const b=el('button','Look up on mainnet');b.type='submit';b.disabled=state.phase!=='ready';form.append(b);
   form.onsubmit=async event=>{event.preventDefault();b.disabled=true;const result=$('#suite-query-result');result.textContent='Reading mainnet…';$('#suite-record-actions').replaceChildren();
    try{const args=fn.inputs.map((p,i)=>parseArg(fn,p,form.elements.namedItem('arg'+i),i));const value=await read(signature(fn),args);renderResult(result,fn,value);
     if(args.length){for(const action of state.recordActions){try{
      const key=action.rule[0];const aliases={markets:'marketInfo',events:'getEvent',policies:'getPolicy',guardians:'getWallet'};
      if(key!==fn.name&&aliases[key]!==fn.name)continue;
      if(await permitted(action,args))$('#suite-record-actions').append(actionForm(action,args[0]));
     }catch{ /* No role proven: do not expose a privileged action. */ }}}
     paint();
    }catch(e){result.textContent=errorText(e);status(errorText(e),true);}finally{b.disabled=state.phase!=='ready';}
   };
  };select.onchange=redraw;redraw();
 }
 async function refreshStats(){
  const host=$('#suite-stats');host.replaceChildren();
  if(state.phase!=='ready'){host.append(el('p','No live data is available.'));return;}
  // This deployed reputation version does not maintain the global ratingCount;
  // per-profile totalRatings is authoritative and remains available in lookup.
  const funcs=state.config.abi.filter(f=>f.type==='function'&&['view','pure'].includes(f.stateMutability)&&!f.inputs.length&&f.name!=='owner'&&!/^[A-Z_]+$/.test(f.name)&&!(state.config.repo==='standing'&&f.name==='ratingCount'));
  const generation=state.generation;
  const stats=await Promise.all(funcs.map(async f=>{try{return {fn:f,value:await read(f.name)}}catch{return null;}}));
  if(generation!==state.generation)return;
  stats.filter(Boolean).forEach(({fn,value})=>{const c=el('div',undefined,'suite-stat');c.append(el('h3',words(fn.name)),el('strong',display(value,fn.outputs[0]?.type,fn.name)));host.append(c);});
  const balance=await state.provider.getBalance(state.config.address);const c=el('div',undefined,'suite-stat');c.append(el('h3','Contract balance'),el('strong',E.formatEther(balance)+' BOT'));host.append(c);
 }
 function renderReceipts(){const host=$('#suite-history');host.replaceChildren();if(!state.receipts.length){host.append(el('p','Your confirmed transactions from this session will appear here.'));return;}state.receipts.forEach(r=>{const p=el('p',r.action+' · '),a=el('a',short(r.hash));a.href=EXPLORER+'/tx/'+r.hash;a.target='_blank';a.rel='noopener noreferrer';p.append(a);host.append(p);});}
 async function attachAccount(){
  const generation=++state.generation;state.writer=null;state.account=null;state.owner=null;$('#suite-record-actions').replaceChildren();
  paint();
  if(state.wallet){const accounts=await state.wallet.request({method:'eth_accounts'});state.chain=Number(await state.wallet.request({method:'eth_chainId'}));
   if(accounts[0]){state.account=E.getAddress(accounts[0]);if(state.chain===677&&state.reader){const provider=new E.BrowserProvider(state.wallet);const signer=await provider.getSigner(state.account);if(generation!==state.generation)return;state.writer=new E.Contract(state.config.address,state.config.abi,signer);}}
  }
  if(state.reader){try{state.owner=fragment('owner')?await read('owner'):state.config.owner;}catch{state.owner=null;}}
  if(generation!==state.generation)return;
  await renderActions();readForms();paint();
 }
 async function connect(){
  const button=$('#suite-wallet');button.disabled=true;state.connecting=true;paint();
  try{
   if(!window.ethereum)throw new Error('Open this page in a wallet browser or install an Ethereum-compatible browser wallet.');
   state.wallet=window.ethereum;
   await state.wallet.request({method:'eth_requestAccounts'});
   if(Number(await state.wallet.request({method:'eth_chainId'}))!==677){
    try{await state.wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2a5'}]});}
    catch(e){if(e.code!==4902)throw e;await state.wallet.request({method:'wallet_addEthereumChain',params:[{chainId:'0x2a5',chainName:'BOT Chain Mainnet',nativeCurrency:{name:'BOT',symbol:'BOT',decimals:18},rpcUrls:[RPC],blockExplorerUrls:[EXPLORER]}]});await state.wallet.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2a5'}]});}
   }
   if(!state.listening&&state.wallet.on){state.wallet.on('accountsChanged',()=>attachAccount().catch(e=>status(errorText(e),true)));state.wallet.on('chainChanged',()=>attachAccount().catch(e=>status(errorText(e),true)));state.listening=true;}
   await attachAccount();status('Wallet connected. Review each transaction before signing.');
  }catch(e){status(errorText(e),true);await attachAccount().catch(()=>{});}finally{state.connecting=false;button.disabled=false;paint();}
 }
 async function boot(){
  $('#suite-wallet').disabled=true;
  state.config=await fetch('./product.json').then(r=>{if(!r.ok)throw new Error('Product configuration could not be loaded.');return r.json();});
  if(state.config.legacy){
   const legacyMode=new URLSearchParams(location.search).get('legacy')==='1';
   const link=el('a',legacyMode?'Open current contract':'Read legacy contract records');link.href=legacyMode?location.pathname:location.pathname+'?legacy=1';
   $('#suite-summary').after(link);
   if(legacyMode)state.config={...state.config,address:state.config.legacy.address,abi:state.config.legacy.abi,writes:[],idBase:0,readOnlyReason:state.config.legacy.reason,summary:'Legacy contract records. '+state.config.legacy.reason};
  }
  $('#suite-summary').textContent=state.config.summary;
  $('#suite-wallet').onclick=connect;
  $('#suite-disconnect').onclick=()=>{state.generation++;state.wallet=null;state.account=null;state.writer=null;state.owner=null;$('#suite-record-actions').replaceChildren();renderActions();status('Wallet disconnected from this page.');};
  $('#suite-review-cancel').onclick=()=>$('#suite-review').close();
  $('#suite-refresh').onclick=()=>refreshStats().catch(e=>status(errorText(e),true));
  $('#suite-query-form').addEventListener('submit',e=>e.preventDefault());
  renderReceipts();
  if(!E)throw new Error('Wallet library failed to load. Reload the page.');
  if(!validAddress(state.config.address)){state.phase='pending';}
  else{
   state.provider=new E.JsonRpcProvider(RPC,677,{staticNetwork:true});
   const chain=await state.provider.send('eth_chainId',[]);if(Number(chain)!==677)throw new Error('RPC network mismatch.');
   const code=await state.provider.getCode(state.config.address);if(code==='0x')throw new Error('No deployed code at the configured mainnet address.');
   state.reader=new E.Contract(state.config.address,state.config.abi,state.provider);state.phase='ready';
   const probe=state.config.abi.find(f=>f.type==='function'&&['view','pure'].includes(f.stateMutability)&&!f.inputs.length&&!/^[A-Z_]+$/.test(f.name));if(probe)await read(probe.name);
  }
  await attachAccount();await refreshStats();paint();
  $('#suite-wallet').disabled=false;
  status(state.phase==='pending'?'This product is awaiting mainnet deployment. No transactions or activity are simulated.':state.config.readOnlyReason||'Reading verified BOT Chain mainnet data.');
 }
 boot().catch(e=>{state.phase='error';$('#suite-wallet').disabled=false;status(errorText(e),true);if(state.config){paint();renderActions();readForms();}});
})();
