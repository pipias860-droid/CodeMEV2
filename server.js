const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/vendor/three.module.js'){
    let file;try{file=path.join(path.dirname(require.resolve('three')),'three.module.js')}catch{res.writeHead(503).end('Run npm install first');return;}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=86400'});res.end(data);});return;
  }
  let file=path.join(ROOT,decodeURIComponent(url.pathname==='/'?'index.html':url.pathname));
  if(!file.startsWith(ROOT)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
const wss=new WebSocket.Server({server}),rooms=new Map();
const MAP={name:'Mirage',w:960,h:620,sites:[{name:'A',x:760,y:165},{name:'B',x:190,y:155}],walls:[
  [0,0,960,24],[0,596,960,24],[0,24,24,572],[936,24,24,572],
  // CT spawn, ticket, and the northern edge of mid
  [290,95,155,22],[515,95,155,22],[335,24,22,72],[603,24,22,72],
  [387,168,72,22],[501,168,72,22],[420,190,22,58],[518,190,22,58],
  // B site, market and apartments
  [60,72,120,22],[60,72,22,112],[200,72,100,22],[278,94,22,94],
  [62,203,140,22],[250,203,57,22],[70,246,22,98],[220,270,88,22],
  [35,370,112,22],[182,370,128,22],[35,392,22,88],[286,390,22,74],
  [320,294,75,22],[320,316,22,94],
  // Mid, connector, window and catwalk
  [397,272,63,22],[500,272,63,22],[397,294,22,75],[541,294,22,75],
  [440,385,80,22],[397,407,22,65],[541,407,22,68],
  // A site, palace and ramp
  [670,72,105,22],[802,72,104,22],[670,94,22,94],[884,94,22,94],
  [695,205,130,22],[853,205,54,22],[654,247,22,92],[884,245,22,95],
  [670,378,112,22],[804,378,103,22],[670,400,22,100],[884,400,22,100],
  [604,455,58,22],[704,455,95,22],[841,455,62,22],
  // T spawn and mid approach
  [350,525,115,22],[495,525,115,22],[350,547,22,48],[588,547,22,48],
  [422,472,22,53],[518,472,22,53],[451,438,58,22]
]};
function freshRoom(code,hostId){return{code,hostId,players:new Map(),round:0,phase:'waiting',time:105,score:{blue:0,red:0},bullets:[],last:Date.now(),planted:null,matchId:crypto.randomUUID(),resultSent:false};}
function send(ws,data){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function state(room){return{type:'state',code:room.code,hostId:room.hostId,round:room.round,phase:room.phase,time:Math.ceil(room.time),score:room.score,planted:room.planted,players:[...room.players.values()].map(({id,name,team,x,y,hp,alive,angle,kills,elo})=>({id,name,team,x,y,hp,alive,angle,kills,elo})),bullets:room.bullets,map:MAP};}
function broadcast(room){const msg=JSON.stringify(state(room));room.players.forEach(p=>{if(p.ws.readyState===WebSocket.OPEN)p.ws.send(msg);});}
function notice(room,text){room.players.forEach(p=>send(p.ws,{type:'notice',text}));}
function makeCode(){let code;do{code='MRG-'+Array.from({length:4},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');}while(rooms.has(code));return code;}
function addPlayer(room,ws,m){if(room.players.size>=10)return null;const blue=[...room.players.values()].filter(p=>p.team==='blue').length,red=[...room.players.values()].filter(p=>p.team==='red').length,team=blue<=red?'blue':'red',id=crypto.randomUUID(),spread=(room.players.size%5)*38;
  const p={id,ws,name:String(m.name||'Operator').slice(0,16),team,x:team==='blue'?480+spread:480-spread,y:team==='blue'?68:552,hp:100,alive:true,angle:team==='blue'?Math.PI/2:-Math.PI/2,kills:0,elo:Math.max(100,Math.min(5000,Number(m.elo)||1000)),cash:800,input:{}};
  room.players.set(id,p);ws.room=room;ws.player=p;return p;
}
function startMatch(room){if(room.phase!=='waiting'||room.players.size<1)return;room.phase='live';room.round=1;room.time=105;room.planted=null;room.players.forEach(p=>{p.alive=true;p.hp=100;p.input={};});notice(room,`MIRAGE â€” match started with ${room.players.size} operator${room.players.size===1?'':'s'}.`);broadcast(room);}
function startRound(room){room.round++;room.phase='live';room.time=105;room.planted=null;room.bullets=[];room.players.forEach((p,i)=>{p.hp=100;p.alive=true;p.x=(p.team==='blue'?480:480)+(i%5-2)*38;p.y=p.team==='blue'?68:552;p.input={};p.cash=(p.cash||800)+1400;});notice(room,`Round ${room.round} â€” move out.`);}
function matchComplete(room,winner){if(room.resultSent)return;room.resultSent=true;const blue=[...room.players.values()].filter(p=>p.team==='blue'),red=[...room.players.values()].filter(p=>p.team==='red'),avg=a=>a.length?a.reduce((s,p)=>s+p.elo,0)/a.length:1000,blueAvg=avg(blue),redAvg=avg(red);
  room.players.forEach(p=>{const own=p.team==='blue'?blueAvg:redAvg,opponent=p.team==='blue'?redAvg:blueAvg,expected=1/(1+10**((opponent-own)/400)),actual=p.team===winner?1:0,delta=Math.round(32*(actual-expected)),newElo=Math.max(100,p.elo+delta);send(p.ws,{type:'match-result',matchId:room.matchId,code:room.code,winner,team:p.team,score:{...room.score},oldElo:p.elo,newElo,delta});});
}
function endRound(room,winner,reason){if(room.phase!=='live'&&room.phase!=='bomb')return;room.phase='freeze';room.score[winner]++;notice(room,`${winner==='blue'?'COUNTER-TERRORISTS':'TERRORISTS'} win â€” ${reason}`);if(room.score[winner]>=13){room.phase='matchover';notice(room,`${winner==='blue'?'COUNTER-TERRORISTS':'TERRORISTS'} take the match!`);matchComplete(room,winner);return;}setTimeout(()=>startRound(room),5000);}
function collides(x,y,r,walls){return walls.some(([a,b,c,d])=>x+r>a&&x-r<a+c&&y+r>b&&y-r<b+d);}
function removePlayer(ws){const room=ws.room,p=ws.player;if(!room||!p)return;room.players.delete(p.id);notice(room,`${p.name} disconnected`);if(!room.players.size){rooms.delete(room.code);return;}if(room.hostId===p.id&&room.phase==='waiting'){room.hostId=room.players.keys().next().value;notice(room,'Host role transferred to another player.');}broadcast(room);}
function roomTick(room,now){const dt=Math.min(.05,(now-room.last)/1000);room.last=now;
  if(room.phase==='live'||room.phase==='bomb'){
    room.time-=dt;
    if(room.phase==='bomb'&&room.planted){room.planted.left-=dt;if(room.planted.left<=0)endRound(room,'red','bomb detonated');}
    if(room.phase==='live'&&room.time<=0)endRound(room,'blue','time expired');
    for(const b of room.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||collides(b.x,b.y,2,MAP.walls)){b.dead=true;continue;}for(const p of room.players.values())if(p.team!==b.team&&p.alive&&Math.hypot(p.x-b.x,p.y-b.y)<17){p.hp-=b.damage;b.dead=true;if(p.hp<=0){p.hp=0;p.alive=false;const shooter=room.players.get(b.owner);if(shooter)shooter.kills++;notice(room,`${p.name} was eliminated`);const alive=[...room.players.values()].filter(x=>x.alive);if(!alive.some(x=>x.team==='red'))endRound(room,'blue','team eliminated');if(!alive.some(x=>x.team==='blue'))endRound(room,'red','team eliminated');}break;}}
    room.bullets=room.bullets.filter(b=>!b.dead);
    if(room.phase==='live'&&room.planted===null){let plantedAt=null;const t=[...room.players.values()].find(p=>{if(p.team!=='red'||!p.alive||!p.input?.plant)return false;plantedAt=MAP.sites.find(s=>Math.hypot(p.x-s.x,p.y-s.y)<58)||null;return !!plantedAt;});if(t){room.phase='bomb';room.planted={left:40,by:t.name,site:plantedAt};notice(room,`Spike planted at ${plantedAt.name} by ${t.name}!`);}}
    if(room.phase==='bomb'&&room.planted){const site=room.planted.site,d=[...room.players.values()].find(p=>p.team==='blue'&&p.alive&&p.input?.defuse&&Math.hypot(p.x-site.x,p.y-site.y)<58);if(d){room.planted.defuse=(room.planted.defuse||0)+dt;if(room.planted.defuse>=4)endRound(room,'blue','spike defused');}else room.planted.defuse=0;}
    room.players.forEach(p=>{const i=p.input||{};if(!p.alive)return;let dx=(i.right?1:0)-(i.left?1:0),dy=(i.down?1:0)-(i.up?1:0),mag=Math.hypot(dx,dy)||1;dx/=mag;dy/=mag;const speed=i.shift?125:190,nx=Math.max(36,Math.min(924,p.x+dx*speed*dt)),ny=Math.max(36,Math.min(584,p.y+dy*speed*dt));if(!collides(nx,p.y,14,MAP.walls))p.x=nx;if(!collides(p.x,ny,14,MAP.walls))p.y=ny;p.angle=Number.isFinite(i.angle)?i.angle:p.angle;
      if(i.shoot&&now-(p.lastShot||0)>230){p.lastShot=now;room.bullets.push({id:crypto.randomUUID(),owner:p.id,team:p.team,x:p.x+Math.cos(p.angle)*20,y:p.y+Math.sin(p.angle)*20,vx:Math.cos(p.angle)*720,vy:Math.sin(p.angle)*720,life:1.15,damage:34});}
      if(i.melee&&now-(p.lastMelee||0)>720){p.lastMelee=now;let target=null,best=58;for(const enemy of room.players.values()){if(enemy.team===p.team||!enemy.alive)continue;const dx=enemy.x-p.x,dy=enemy.y-p.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx),turn=Math.atan2(Math.sin(a-p.angle),Math.cos(a-p.angle));if(d<best&&Math.abs(turn)<.85){target=enemy;best=d;}}if(target){target.hp=Math.max(0,target.hp-55);if(target.hp===0){target.alive=false;p.kills++;notice(room,`${target.name} was knifed by ${p.name}`);const alive=[...room.players.values()].filter(x=>x.alive);if(!alive.some(x=>x.team==='red'))endRound(room,'blue','team eliminated');if(!alive.some(x=>x.team==='blue'))endRound(room,'red','team eliminated');}}}
    });
  }
  if(now-(room.lastBroadcast||0)>50){room.lastBroadcast=now;broadcast(room);}
}
setInterval(()=>{const now=Date.now();rooms.forEach(r=>roomTick(r,now));},25);
wss.on('connection',ws=>{
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return;}
    if(m.type==='create'){
      const code=makeCode(),room=freshRoom(code,null),p=addPlayer(room,ws,m);room.hostId=p.id;rooms.set(code,room);ws.room=room;ws.player=p;send(ws,{type:'joined',id:p.id,team:p.team,code,host:true});broadcast(room);
    }else if(m.type==='join'){
      const code=String(m.code||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,12),room=rooms.get(code);
      if(!room){send(ws,{type:'error',text:'Room code not found. Ask the host for their match code.'});return;}
      if(room.phase!=='waiting'){send(ws,{type:'error',text:'That match has already started.'});return;}
      if(room.players.size>=10){send(ws,{type:'error',text:'Room is full (10 players maximum).'});return;}
      const p=addPlayer(room,ws,m);send(ws,{type:'joined',id:p.id,team:p.team,code,host:false});notice(room,`${p.name} joined the lobby.`);broadcast(room);
    }else if(m.type==='start'&&ws.room&&ws.player){if(ws.player.id!==ws.room.hostId){send(ws,{type:'error',text:'Only the host can start this match.'});return;}startMatch(ws.room);}
    else if(m.type==='input'&&ws.room&&ws.player){ws.player.input=m;}
    else if(m.type==='chat'&&ws.room&&ws.player){const text=String(m.text||'').slice(0,120);if(text)ws.room.players.forEach(p=>send(p.ws,{type:'chat',name:ws.player.name,team:ws.player.team,text}));}
  });
  ws.on('close',()=>removePlayer(ws));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Strikepoint running on port ${PORT}`));
