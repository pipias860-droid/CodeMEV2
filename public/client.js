import * as THREE from '/vendor/three.module.js';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('arena');
  const catalog = {
    skins: [
      { id: 'carbon', name: 'Carbon', color: '#353c40', accent: '#8c9aa0' },
      { id: 'ember', name: 'Ember', color: '#9c482e', accent: '#e9a25a' },
      { id: 'arctic', name: 'Arctic', color: '#88a9ad', accent: '#e0e4db' },
      { id: 'field', name: 'Field Ops', color: '#586448', accent: '#b5aa73' }
    ],
    knives: [
      { id: 'utility', name: 'Utility', color: '#bbc3c2', grip: '#303c3d' },
      { id: 'tanto', name: 'Tanto', color: '#d6b37d', grip: '#69452e' },
      { id: 'tactical', name: 'Tactical', color: '#747e89', grip: '#222a35' }
    ]
  };
  const defaults = { name:'Operator',kills:0,wins:0,matches:0,elo:1000,skin:'carbon',knife:'utility',settings:{sensitivity:1,fov:88,crosshair:'#f5eee0',quality:'high',volume:.35,invertMouse:false} };
  let profile;
  try { const saved=JSON.parse(localStorage.getItem('strikepoint-profile')||'{}');profile={...defaults,...saved,settings:{...defaults.settings,...saved.settings}}; } catch { profile = { ...defaults, settings:{...defaults.settings} }; }
  const persistProfile = () => localStorage.setItem('strikepoint-profile', JSON.stringify(profile));
  let socket, myId, myTeam, snapshot, connected = false, keys = {}, mouseDown = false, interact = false, chatOpen = false;
  let ammo = 24, lastAmmoShot = 0, lastAudioShot = 0, reloadUntil = 0, knifeOut = false, yaw = 0, pitch = 0, lastKills = 0, audioContext;
  const actors = new Map(), bulletMeshes = new Map();
  const skinById = Object.fromEntries(catalog.skins.map(s => [s.id, s]));
  const knifeById = Object.fromEntries(catalog.knives.map(s => [s.id, s]));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(960, 620, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#a9b4b1');
  scene.fog = new THREE.FogExp2('#9ba8a5', 0.012);
  const camera = new THREE.PerspectiveCamera(profile.settings.fov, 960 / 620, 0.08, 180);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.HemisphereLight('#d6e0df', '#66594a', 2.15));
  const sun = new THREE.DirectionalLight('#ffe4bf', 3.1);
  sun.position.set(-24, 40, -15); sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536); sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45; sun.shadow.bias = -0.0002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#a6c7dc', 0.7); fill.position.set(38, 15, 42); scene.add(fill);

  const material = (color, roughness = 0.82, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const groundMat = material('#a49a83');
  const dustCanvas = document.createElement('canvas'); dustCanvas.width = dustCanvas.height = 512;
  const dustCtx = dustCanvas.getContext('2d'); dustCtx.fillStyle = '#a49a83'; dustCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { const v = 110 + Math.random() * 100; dustCtx.fillStyle = `rgba(${v},${v * .91},${v * .76},${Math.random() * .22})`; dustCtx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 4, 1 + Math.random() * 3); }
  const dustTexture = new THREE.CanvasTexture(dustCanvas); dustTexture.colorSpace = THREE.SRGBColorSpace; dustTexture.wrapS = dustTexture.wrapT = THREE.RepeatWrapping; dustTexture.repeat.set(10, 7); groundMat.map = dustTexture;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 62), groundMat); floor.rotation.x = -Math.PI / 2; floor.position.set(48, -0.12, 31); floor.receiveShadow = true; scene.add(floor);
  const site = new THREE.Mesh(new THREE.CircleGeometry(5.8, 64), new THREE.MeshBasicMaterial({ color: '#cc9d60', transparent: true, opacity: .16 })); site.rotation.x = -Math.PI / 2; site.position.set(76, -.105, 16.5); scene.add(site);
  const siteRing = new THREE.Mesh(new THREE.RingGeometry(5.65, 5.78, 64), new THREE.MeshBasicMaterial({ color: '#e6b16d', transparent: true, opacity: .65, side: THREE.DoubleSide })); siteRing.rotation.x = -Math.PI / 2; siteRing.position.set(76, -.09, 16.5); scene.add(siteRing);
  const siteB = new THREE.Mesh(new THREE.CircleGeometry(5.8, 64), new THREE.MeshBasicMaterial({ color: '#668ba0', transparent: true, opacity: .15 }));siteB.rotation.x=-Math.PI/2;siteB.position.set(19,-.105,15.5);scene.add(siteB);
  const siteBRing = new THREE.Mesh(new THREE.RingGeometry(5.65,5.78,64),new THREE.MeshBasicMaterial({color:'#8db4c7',transparent:true,opacity:.6,side:THREE.DoubleSide}));siteBRing.rotation.x=-Math.PI/2;siteBRing.position.set(19,-.09,15.5);scene.add(siteBRing);
  const plantedDevice=new THREE.Group();plantedDevice.visible=false;scene.add(plantedDevice);const deviceBody=new THREE.Mesh(new THREE.BoxGeometry(.22,.1,.16),material('#242a29',.35,.55));deviceBody.position.y=.07;plantedDevice.add(deviceBody);const deviceScreen=new THREE.Mesh(new THREE.BoxGeometry(.11,.012,.055),material('#df4135',.2,.15));deviceScreen.position.set(0,.128,0);plantedDevice.add(deviceScreen);const deviceLight=new THREE.PointLight('#ff3228',0,3);deviceLight.position.y=.35;plantedDevice.add(deviceLight);

  const wallMat = material('#c6b697'), topMat = material('#dac7a1'), darkStone = material('#827966');
  const walls = [[0,0,960,24],[0,596,960,24],[0,24,24,572],[936,24,24,572],[290,95,155,22],[515,95,155,22],[335,24,22,72],[603,24,22,72],[387,168,72,22],[501,168,72,22],[420,190,22,58],[518,190,22,58],[60,72,120,22],[60,72,22,112],[200,72,100,22],[278,94,22,94],[62,203,140,22],[250,203,57,22],[70,246,22,98],[220,270,88,22],[35,370,112,22],[182,370,128,22],[35,392,22,88],[286,390,22,74],[320,294,75,22],[320,316,22,94],[397,272,63,22],[500,272,63,22],[397,294,22,75],[541,294,22,75],[440,385,80,22],[397,407,22,65],[541,407,22,68],[670,72,105,22],[802,72,104,22],[670,94,22,94],[884,94,22,94],[695,205,130,22],[853,205,54,22],[654,247,22,92],[884,245,22,95],[670,378,112,22],[804,378,103,22],[670,400,22,100],[884,400,22,100],[604,455,58,22],[704,455,95,22],[841,455,62,22],[350,525,115,22],[495,525,115,22],[350,547,22,48],[588,547,22,48],[422,472,22,53],[518,472,22,53],[451,438,58,22]];
  const world = (x, z) => new THREE.Vector3(x * .1, 0, z * .1);
  const box = (parent, w, h, d, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };
  walls.forEach(([x, z, w, d], i) => {
    const cx = (x + w / 2) * .1, cz = (z + d / 2) * .1, ww = w * .1, dd = d * .1, height = i < 4 ? 4.6 : 3.65;
    box(scene, ww, height, dd, i % 3 === 0 ? topMat : wallMat, cx, height / 2 - .1, cz);
    box(scene, ww + .06, .12, dd + .06, darkStone, cx, height - .12, cz, false);
    for (let t = -Math.floor(ww / 1.3); t < Math.floor(ww / 1.3); t++) {
      if (Math.abs(t) < .1) continue;
      box(scene, .025, height - .35, .035, material('#655f51'), cx + t * .62, height / 2 - .1, cz + dd / 2 + .006, false);
    }
  });

  const crateMat = material('#665a43'), crateEdge = material('#988366'), metal = material('#454b4b', .42, .7);
  const decor = [[105,128,55,48],[190,150,25,38],[82,300,48,26],[230,320,56,36],[342,335,38,24],[431,325,28,31],[520,350,35,28],[626,300,46,22],[716,147,40,30],[790,150,38,34],[834,315,48,30],[735,420,45,31],[280,445,58,26],[490,500,62,30],[160,80,44,25],[770,80,50,25]];
  decor.forEach(([x,z,w,d], i) => {
    const cx=(x+w/2)*.1, cz=(z+d/2)*.1, ww=w*.1, dd=d*.1;
    if (i % 3 === 0) {
      const h = .72 + (i%2)*.22; const g = new THREE.Group(); g.position.set(cx, 0, cz); scene.add(g);
      box(g,ww,h,dd,crateMat,0,h/2,0); box(g,ww+.025,.07,dd+.025,crateEdge,0,h-.06,0);
      for(let k=-1;k<=1;k++)box(g,.07,h-.1,dd+.04,crateEdge,k*ww*.32,h/2,0,false);
      box(g,ww+.03,.055,.07,crateEdge,0,h*.52,dd*.2,false);
    } else {
      const h=.32+(i%4)*.11; box(scene,ww,h,dd,i%2?crateMat:darkStone,cx,h/2,cz);
      if(i%2) box(scene,.07,h+.03,dd+.04,crateEdge,cx-ww*.27,h/2,cz,false);
    }
  });
  for(let i=0;i<55;i++){
    const x=3+Math.random()*90,z=3+Math.random()*56;
    if(walls.some(([a,b,c,d])=>x*10>a-12&&x*10<a+c+12&&z*10>b-12&&z*10<b+d+12))continue;
    const pebble=new THREE.Mesh(new THREE.DodecahedronGeometry(.08+Math.random()*.18,0),i%2?darkStone:material('#8c8878'));
    pebble.position.set(x,.02+Math.random()*.06,z);pebble.rotation.set(Math.random(),Math.random(),Math.random());pebble.scale.y=.35;pebble.castShadow=true;scene.add(pebble);
  }
  function siteMarker(letter,x,z,color){const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d');g.fillStyle=color;g.beginPath();g.arc(64,64,54,0,Math.PI*2);g.fill();g.fillStyle='#f3ead2';g.font='bold 74px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(letter,64,66);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.position.set(x,3.1,z);sprite.scale.set(1.15,1.15,1);scene.add(sprite);}
  siteMarker('A',76,16.5,'#a96d32');siteMarker('B',19,15.5,'#527e96');

  const hands = new THREE.Group(); camera.add(hands); hands.position.set(.29, -.24, -.46);
  const glove = material('#262e31', .95), gloveLight = material('#42494a', .8), gunDark = material('#252a2b', .42, .68), gunMetal = material('#697270', .32, .82);
  const rifle = new THREE.Group(); hands.add(rifle);
  function makeSkinTexture(skinId){const s=skinById[skinId],c=document.createElement('canvas');c.width=256;c.height=256;const g=c.getContext('2d');g.fillStyle=s.color;g.fillRect(0,0,256,256);g.globalAlpha=.58;
    if(skinId==='ember'){g.strokeStyle=s.accent;g.lineWidth=13;for(let x=-180;x<380;x+=48){g.beginPath();g.moveTo(x,0);g.lineTo(x+170,256);g.stroke();}g.strokeStyle='#181b1b';g.lineWidth=5;for(let x=-180;x<380;x+=48){g.beginPath();g.moveTo(x+18,0);g.lineTo(x+188,256);g.stroke();}}
    else if(skinId==='arctic'){for(let i=0;i<50;i++){g.fillStyle=i%2?s.accent:'#4f7279';g.beginPath();g.moveTo(Math.random()*256,Math.random()*256);g.lineTo(Math.random()*256,Math.random()*256);g.lineTo(Math.random()*256,Math.random()*256);g.closePath();g.fill();}}
    else if(skinId==='field'){for(let i=0;i<85;i++){g.fillStyle=['#28362c','#b0a276','#8d744b'][i%3];g.beginPath();g.ellipse(Math.random()*256,Math.random()*256,9+Math.random()*22,4+Math.random()*12,Math.random()*3,0,Math.PI*2);g.fill();}}
    else {g.strokeStyle=s.accent;g.lineWidth=2;for(let y=0;y<256;y+=18){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}for(let x=0;x<256;x+=18){g.beginPath();g.moveTo(x,0);g.lineTo(x,256);g.stroke();}}
    g.globalAlpha=1;for(let i=0;i<1200;i++){g.fillStyle=`rgba(230,235,225,${Math.random()*.13})`;g.fillRect(Math.random()*256,Math.random()*256,1,1);}const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(1,1);return tx;}
  const receiverMat = material('#ffffff',.48,.35);receiverMat.map=makeSkinTexture(profile.skin);
  const hand = box(rifle,.12,.11,.34,glove,0,-.045,.18);
  box(rifle,.105,.12,.34,receiverMat,0,0,-.035);
  box(rifle,.085,.034,.36,gunDark,0,.075,-.03);
  box(rifle,.045,.046,.45,gunMetal,0,.015,-.32);
  box(rifle,.025,.024,.19,gunDark,0,.015,-.62);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.055,12),gunDark);muzzle.rotation.x=Math.PI/2;muzzle.position.set(0,.015,-.72);rifle.add(muzzle);
  box(rifle,.085,.125,.09,gunDark,0,-.12,-.13);
  box(rifle,.072,.16,.12,receiverMat,0,-.145,-.22).rotation.x=-.18;
  box(rifle,.09,.045,.19,gunDark,0,-.075,.15);
  box(rifle,.027,.08,.045,gunMetal,0,.102,-.055);
  box(rifle,.018,.055,.035,gunMetal,0,.12,-.31);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(.043,.043,.12,16),gunDark);scope.rotation.x=Math.PI/2;scope.position.set(0,.122,-.17);rifle.add(scope);
  const scopeGlass = new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.007,16),material('#526d72',.16,.65));scopeGlass.rotation.x=Math.PI/2;scopeGlass.position.set(0,.122,-.235);rifle.add(scopeGlass);
  box(rifle,.14,.025,.07,gunDark,0,-.065,.31);
  box(rifle,.028,.07,.2,gunMetal,.057,-.005,-.1,false);
  box(rifle,.018,.045,.115,gunDark,.063,.002,-.1,false);
  box(rifle,.012,.05,.17,gunMetal,-.056,.025,-.39,false);
  for(let z=-.48;z<-.18;z+=.055){box(rifle,.013,.012,.014,gunMetal,.061,.018,z,false);box(rifle,.013,.012,.014,gunMetal,-.061,.018,z,false);}
  for(const z of [-.03,.12]){const pin=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.009,12),gunMetal);pin.rotation.z=Math.PI/2;pin.position.set(.066,.01,z);rifle.add(pin);}
  const armMat=material('#454c4a'), armA=new THREE.Mesh(new THREE.CapsuleGeometry(.073,.32,4,8),armMat);armA.position.set(-.16,-.14,.27);armA.rotation.x=-.8;armA.rotation.z=-.38;rifle.add(armA);
  const armB=new THREE.Mesh(new THREE.CapsuleGeometry(.075,.36,4,8),armMat);armB.position.set(.13,-.17,.25);armB.rotation.x=-.75;armB.rotation.z=.36;rifle.add(armB);
  box(rifle,.12,.07,.13,glove,-.05,-.07,.02);box(rifle,.13,.07,.13,gloveLight,.07,-.08,.03);
  const knifeGroup = new THREE.Group();hands.add(knifeGroup);knifeGroup.visible=false;
  function createBlade(knifeId){const shape=new THREE.Shape(),pts=knifeId==='tanto'?[[-.04,0],[.04,0],[.04,.14],[.012,.14],[0,.31],[-.034,.16]]:knifeId==='tactical'?[[-.035,0],[.035,0],[.024,.11],[.043,.2],[0,.31],[-.028,.21]]:[[-.032,0],[.032,0],[.025,.19],[0,.31],[-.025,.2]];shape.moveTo(...pts[0]);pts.slice(1).forEach(pt=>shape.lineTo(...pt));shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.004,bevelThickness:.004});const mesh=new THREE.Mesh(geo,material(knifeById[knifeId].color,.25,.85));mesh.rotation.x=-Math.PI/2;mesh.position.set(0,.01,-.16);return mesh;}
  let knifeBlade=createBlade(profile.knife);knifeGroup.add(knifeBlade);
  const knifeGrip=box(knifeGroup,.074,.055,.17,material(knifeById[profile.knife].grip,.72,.1),0,-.025,.035);
  box(knifeGroup,.13,.025,.025,gunMetal,0,-.015,-.16);

  function createActor(p) {
    const group=new THREE.Group();scene.add(group);
    const teamMat=material(p.team==='blue'?'#527b88':'#98614d'), vestMat=material(p.team==='blue'?'#354a50':'#51403a'), skinMat=material('#b28a68'), dark=material('#292f30');
    const body= new THREE.Mesh(new THREE.CapsuleGeometry(.23,.58,4,8),teamMat);body.position.y=.76;body.castShadow=true;group.add(body);
    box(group,.48,.48,.29,vestMat,0,.9,0);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.18,12,10),skinMat);head.position.y=1.38;head.castShadow=true;group.add(head);
    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.2,12,8,0,Math.PI*2,0,Math.PI*.58),dark);helmet.position.y=1.46;helmet.castShadow=true;group.add(helmet);
    box(group,.3,.07,.3,dark,0,1.34,-.035,false);
    for(const side of [-1,1]){box(group,.17,.61,.2,teamMat,side*.15,.32,0);box(group,.085,.36,.09,dark,side*.15,.18,0);}
    const rifleMesh=box(group,.075,.08,.62,gunDark,.28,1.03,-.12);rifleMesh.rotation.y=-.1;
    const nameCanvas=document.createElement('canvas');nameCanvas.width=256;nameCanvas.height=64;const nc=nameCanvas.getContext('2d');nc.fillStyle='#101820dd';nc.fillRect(5,8,246,48);nc.fillStyle=p.team==='blue'?'#9ad7ed':'#ffb09a';nc.font='bold 25px monospace';nc.textAlign='center';nc.fillText(p.name.slice(0,16),128,40);
    const tex=new THREE.CanvasTexture(nameCanvas);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));sprite.scale.set(2.1,.52,1);sprite.position.y=2.05;group.add(sprite);
    return {group,team:p.team,body,teamMat,vestMat};
  }
  const actorSharedMat={};
  function updateActors(){if(!snapshot)return;const alive=new Set(snapshot.players.filter(p=>p.alive&&p.id!==myId).map(p=>p.id));for(const [id,a] of actors)if(!alive.has(id)){scene.remove(a.group);actors.delete(id);}
    for(const p of snapshot.players){if(!p.alive||p.id===myId)continue;let a=actors.get(p.id);if(!a){a=createActor(p);actors.set(p.id,a);}a.group.position.set(p.x*.1,0,p.y*.1);a.group.rotation.y=-(p.angle+Math.PI/2);a.body.material.color.set(p.team==='blue'?'#527b88':'#98614d');}
  }
  function updateBullets(){if(!snapshot)return;const ids=new Set(snapshot.bullets.map(b=>b.id));for(const [id,m] of bulletMeshes)if(!ids.has(id)){scene.remove(m);bulletMeshes.delete(id);}for(const b of snapshot.bullets){let m=bulletMeshes.get(b.id);if(!m){m=new THREE.Mesh(new THREE.SphereGeometry(.043,8,6),new THREE.MeshBasicMaterial({color:b.team==='blue'?'#8fe3ff':'#ff9d73'}));scene.add(m);bulletMeshes.set(b.id,m);}m.position.set(b.x*.1,.95,b.y*.1);}}

  const skins = $('skinChoices'), knives = $('knifeChoices');
  function buildChoices(){skins.innerHTML='';for(const s of catalog.skins){const b=document.createElement('button');b.className=`choice${profile.skin===s.id?' selected':''}`;b.innerHTML=`<i style="--swatch:${s.color};--swatch2:${s.accent}"></i><span>${s.name}</span><small>FREE</small>`;b.onclick=()=>{profile.skin=s.id;buildChoices();applyWeaponLook();};skins.append(b);}
    knives.innerHTML='';for(const k of catalog.knives){const b=document.createElement('button');b.className=`knife-choice${profile.knife===k.id?' selected':''}`;b.innerHTML=`<span class="knife-icon">/</span><span>${k.name}</span><small>FREE</small>`;b.onclick=()=>{profile.knife=k.id;buildChoices();applyKnifeLook();};knives.append(b);}}
  function applyWeaponLook(){if(receiverMat.map)receiverMat.map.dispose();receiverMat.map=makeSkinTexture(profile.skin);receiverMat.needsUpdate=true;}
  function applyKnifeLook(){knifeGroup.remove(knifeBlade);knifeBlade.geometry.dispose();knifeBlade.material.dispose();knifeBlade=createBlade(profile.knife);knifeGroup.add(knifeBlade);knifeGrip.material.color.set(knifeById[profile.knife].grip);}
  buildChoices();
  function levelForElo(elo){let level=1;for(const mark of [500,750,900,1050,1200,1350,1530,1750,2000])if(elo>=mark)level++;return level;}
  function updateProfileUi(){const level=levelForElo(profile.elo);$('profileLevel').textContent='LEVEL '+level;$('profileElo').textContent=Number(profile.elo).toLocaleString();$('profileWins').textContent=profile.wins;$('profileKills').textContent=profile.kills;$('topLevel').textContent='LVL '+level;$('profileName').textContent=profile.name.toUpperCase();$('profileAvatar').textContent=profile.name.slice(0,2).toUpperCase();}
  function showPanel(){$('profileInput').value=profile.name;updateProfileUi();$('settingsPanel').classList.add('hidden');$('loadoutPanel').classList.remove('hidden');}
  function showSettings(){$('loadoutPanel').classList.add('hidden');$('settingsPanel').classList.remove('hidden');$('fovSetting').value=profile.settings.fov;$('fovValue').textContent=profile.settings.fov;$('sensitivitySetting').value=profile.settings.sensitivity;$('sensitivityValue').textContent=Number(profile.settings.sensitivity).toFixed(2);$('crosshairSetting').value=profile.settings.crosshair;$('qualitySetting').value=profile.settings.quality;$('volumeSetting').value=profile.settings.volume;$('volumeValue').textContent=Math.round(profile.settings.volume*100)+'%';$('invertMouse').checked=!!profile.settings.invertMouse;}
  function applySettings(){camera.fov=Number(profile.settings.fov);camera.updateProjectionMatrix();const q=profile.settings.quality;renderer.shadowMap.enabled=q!=='low';renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,q==='high'?1.7:q==='medium'?1.25:1));$('reticle').querySelectorAll('i,b').forEach(x=>{x.style.background=profile.settings.crosshair;x.style.borderColor=profile.settings.crosshair;});resizeRenderer();}
  function saveSettings(){profile.settings.fov=Number($('fovSetting').value);profile.settings.sensitivity=Number($('sensitivitySetting').value);profile.settings.crosshair=$('crosshairSetting').value;profile.settings.quality=$('qualitySetting').value;profile.settings.volume=Number($('volumeSetting').value);profile.settings.invertMouse=$('invertMouse').checked;persistProfile();applySettings();$('settingsPanel').classList.add('hidden');}
  $('profileBtn').onclick=showPanel;$('arsenalBtn').onclick=showPanel;$('panelClose').onclick=()=>$('loadoutPanel').classList.add('hidden');$('settingsBtn').onclick=showSettings;$('settingsClose').onclick=()=>$('settingsPanel').classList.add('hidden');$('saveSettings').onclick=saveSettings;
  $('fovSetting').oninput=()=>{$('fovValue').textContent=$('fovSetting').value;profile.settings.fov=Number($('fovSetting').value);applySettings();};$('sensitivitySetting').oninput=()=>{$('sensitivityValue').textContent=Number($('sensitivitySetting').value).toFixed(2);profile.settings.sensitivity=Number($('sensitivitySetting').value);};$('crosshairSetting').onchange=()=>{profile.settings.crosshair=$('crosshairSetting').value;applySettings();};$('qualitySetting').onchange=()=>{profile.settings.quality=$('qualitySetting').value;applySettings();};$('volumeSetting').oninput=()=>{$('volumeValue').textContent=Math.round(Number($('volumeSetting').value)*100)+'%';profile.settings.volume=Number($('volumeSetting').value);};
  document.querySelectorAll('.settings-tabs button').forEach(button=>button.onclick=()=>{document.querySelectorAll('.settings-tabs button').forEach(x=>x.classList.toggle('selected',x===button));document.querySelectorAll('.settings-page').forEach(page=>page.classList.toggle('hidden',page.dataset.page!==button.dataset.tab));});
  $('fullscreenBtn').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();};
  $('saveProfile').onclick=()=>{profile.name=$('profileInput').value.trim().slice(0,16)||'Operator';$('playerName').value=profile.name;persistProfile();updateProfileUi();$('loadoutPanel').classList.add('hidden');};
  $('playerName').value=profile.name;$('profileInput').value=profile.name;updateProfileUi();applySettings();

  let isHost=false;
  function showWaiting(){$('lobby').classList.add('hidden');$('gameView').classList.remove('hidden');$('preMatch').classList.remove('hidden');$('liveMatch').classList.add('hidden');$('matchResultPanel').classList.add('hidden');resizeRenderer();}
  function showPlaying(){$('preMatch').classList.add('hidden');$('liveMatch').classList.remove('hidden');resizeRenderer();}
  function showLobby(){$('gameView').classList.add('hidden');$('lobby').classList.remove('hidden');$('loadoutPanel').classList.add('hidden');$('settingsPanel').classList.add('hidden');}
  function renderRoster(){if(!snapshot||snapshot.phase!=='waiting')return;$('lobbyCode').textContent=snapshot.code;$('playerCount').textContent=snapshot.players.length+' / 10';$('startMatchBtn').classList.toggle('hidden',myId!==snapshot.hostId);$('hostHint').textContent=myId===snapshot.hostId?'You are the host. Start when everyone is ready; any player count works.':'Waiting for the host to start the match.';const list=$('rosterList');list.innerHTML='';for(const team of ['blue','red']){const col=document.createElement('div');col.className='roster-team '+team;const title=document.createElement('h3');title.textContent=team==='blue'?'COUNTER-TERRORISTS':'TERRORISTS';col.append(title);const teamPlayers=snapshot.players.filter(p=>p.team===team);for(const p of teamPlayers){const row=document.createElement('div');row.className='roster-player';const name=document.createElement('span');name.textContent=p.name+(p.id===snapshot.hostId?' (HOST)':'');const elo=document.createElement('small');elo.textContent='LVL '+levelForElo(p.elo)+'  /  '+p.elo+' ELO';row.append(name,elo);col.append(row);}list.append(col);}}
  function connect(){const proto=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(proto+'//'+location.host);socket.onopen=()=>{connected=true;$('serverLabel').textContent='SERVER ONLINE - READY TO DEPLOY';$('serverLabel').style.color='#83be98';};socket.onclose=()=>{connected=false;$('serverLabel').textContent='SERVER CONNECTION LOST';$('serverLabel').style.color='#e97962';if(!$('gameView').classList.contains('hidden'))showLobby();};socket.onerror=()=>{$('serverLabel').textContent='SERVER CONNECTION ERROR';$('serverLabel').style.color='#e97962';};socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='joined'){myId=m.id;myTeam=m.team;isHost=!!m.host;lastKills=0;yaw=myTeam==='blue'?Math.PI/2:-Math.PI/2;$('roomLabel').textContent='MIRAGE / '+m.code;$('lobbyCode').textContent=m.code;$('hudName').textContent=profile.name.toUpperCase();showWaiting();}
      if(m.type==='state'){snapshot=m;if(m.phase==='waiting'){showWaiting();renderRoster();}else{showPlaying();renderHud();updateActors();updateBullets();if(m.phase==='matchover')$('matchResultPanel').classList.remove('hidden');}}
      if(m.type==='match-result')applyMatchResult(m);if(m.type==='notice')pushFeed(m.text);if(m.type==='chat')appendChat(m.name,m.text);if(m.type==='error')alert(m.text);};}
  function createMatch(){if(!connected)return;profile.name=$('playerName').value.trim().slice(0,16)||profile.name;persistProfile();socket.send(JSON.stringify({type:'create',name:profile.name,elo:profile.elo}));}
  function joinMatch(){if(!connected)return;const code=$('roomCode').value.trim();if(!code){alert('Enter the host match code first.');return;}profile.name=$('playerName').value.trim().slice(0,16)||profile.name;persistProfile();socket.send(JSON.stringify({type:'join',name:profile.name,elo:profile.elo,code:code}));}
  $('playBtn').onclick=createMatch;$('joinBtn').onclick=joinMatch;$('playerName').onkeydown=e=>{if(e.key==='Enter')createMatch();};$('roomCode').onkeydown=e=>{if(e.key==='Enter')joinMatch();};$('startMatchBtn').onclick=()=>{if(connected&&isHost)socket.send(JSON.stringify({type:'start'}));};$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(snapshot.code);$('copyCode').textContent='CODE COPIED';setTimeout(()=>$('copyCode').textContent='COPY MATCH CODE',1500);}catch{$('copyCode').textContent='CODE: '+snapshot.code;}};
  function leaveRoom(){document.exitPointerLock?.();if(socket)socket.close();myId=null;myTeam=null;isHost=false;keys={};mouseDown=false;showLobby();setTimeout(connect,250);}
  $('leaveBtn').onclick=leaveRoom;$('resultExit').onclick=leaveRoom;
  function applyMatchResult(m){if(profile.lastMatchId===m.matchId)return;profile.lastMatchId=m.matchId;profile.matches++;const won=m.team===m.winner;if(won)profile.wins++;profile.elo=m.newElo;persistProfile();updateProfileUi();$('resultTitle').textContent=won?'VICTORY':'DEFEAT';$('resultScore').textContent=m.score.blue+' - '+m.score.red;$('resultDelta').textContent=(m.delta>0?'+':'')+m.delta;$('resultElo').textContent=Number(m.newElo).toLocaleString();$('resultLevel').textContent='LEVEL '+levelForElo(m.newElo);$('matchResultPanel').classList.remove('hidden');}  function resizeRenderer(){const r=canvas.parentElement.getBoundingClientRect();if(!r.width)return;renderer.setSize(r.width,r.width*620/960,false);camera.aspect=r.width/(r.width*620/960);camera.updateProjectionMatrix();}
  window.addEventListener('resize',resizeRenderer);window.addEventListener('orientationchange',resizeRenderer);
  function ensureAudio(){if(!audioContext){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audioContext=new Audio();}if(audioContext?.state==='suspended')audioContext.resume();}
  function playGunshot(){if(!audioContext||profile.settings.volume<=0)return;const now=audioContext.currentTime,volume=Number(profile.settings.volume),length=Math.floor(audioContext.sampleRate*.075),buffer=audioContext.createBuffer(1,length,audioContext.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const noise=audioContext.createBufferSource();noise.buffer=buffer;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(2200,now);filter.frequency.exponentialRampToValueAtTime(520,now+.07);const gain=audioContext.createGain();gain.gain.setValueAtTime(.28*volume,now);gain.gain.exponentialRampToValueAtTime(.001,now+.075);noise.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);noise.start(now);noise.stop(now+.08);const osc=audioContext.createOscillator(),thump=audioContext.createGain();osc.type='triangle';osc.frequency.setValueAtTime(105,now);osc.frequency.exponentialRampToValueAtTime(48,now+.06);thump.gain.setValueAtTime(.16*volume,now);thump.gain.exponentialRampToValueAtTime(.001,now+.065);osc.connect(thump);thump.connect(audioContext.destination);osc.start(now);osc.stop(now+.07);}
  canvas.addEventListener('click',()=>{if(canvas.requestPointerLock&&document.pointerLockElement!==canvas)canvas.requestPointerLock();});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas)mouseDown=false;});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas){yaw-=e.movementX*.0021*Number(profile.settings.sensitivity);const invert=profile.settings.invertMouse?-1:1;pitch=Math.max(-.55,Math.min(.55,pitch-e.movementY*.0018*Number(profile.settings.sensitivity)*invert));}});
  canvas.addEventListener('mousedown',e=>{if(e.button===0){mouseDown=true;ensureAudio();if(canvas.requestPointerLock&&document.pointerLockElement!==canvas)canvas.requestPointerLock();}});window.addEventListener('mouseup',()=>mouseDown=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{if(chatOpen)return;const k=e.key.toLowerCase();keys[k]=true;if(['w','a','s','d',' '].includes(k))e.preventDefault();if(k==='e')interact=true;if(k==='v'&&!e.repeat){knifeOut=!knifeOut;rifle.visible=!knifeOut;knifeGroup.visible=knifeOut;$('ammo').parentElement.style.visibility=knifeOut?'hidden':'visible';$('weaponLabel').innerHTML=knifeOut?`${knifeById[profile.knife].name.toUpperCase()} <small>KNIFE</small>`:'K-7 <small>CARBINE</small>';if(!knifeOut&&canvas.requestPointerLock&&document.pointerLockElement!==canvas)canvas.requestPointerLock();}if(k==='enter'&&!$('gameView').classList.contains('hidden')){$('chatForm').classList.add('active');$('chatInput').focus();chatOpen=true;}});
  window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;if(e.key.toLowerCase()==='e')interact=false;});
  $('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chatInput').value.trim();if(text&&connected)socket.send(JSON.stringify({type:'chat',text}));$('chatInput').value='';$('chatForm').classList.remove('active');chatOpen=false;canvas.focus();};$('chatInput').onkeydown=e=>{if(e.key==='Escape'){$('chatForm').classList.remove('active');chatOpen=false;}};

  function sendInput(){if(!connected||!myId||!snapshot)return;const me=snapshot.players.find(p=>p.id===myId);if(!me)return;const now=Date.now();if(mouseDown&&!knifeOut&&document.pointerLockElement===canvas&&now>=reloadUntil&&ammo>0&&now-lastAmmoShot>=230){ammo--;lastAmmoShot=now;if(ammo===0)reloadUntil=now+1700;$('ammo').textContent=ammo===0?'R':ammo;}else if(ammo===0&&now>=reloadUntil){ammo=24;$('ammo').textContent=ammo;}
    const forward=(keys.w?1:0)-(keys.s?1:0),strafe=(keys.d?1:0)-(keys.a?1:0),fx=Math.cos(yaw),fz=Math.sin(yaw),rx=-fz,rz=fx,dx=fx*forward+rx*strafe,dy=fz*forward+rz*strafe;
    const shooting=mouseDown&&!knifeOut&&document.pointerLockElement===canvas&&ammo>0&&now>=reloadUntil;if(shooting&&now-lastAudioShot>230){playGunshot();lastAudioShot=now;}socket.send(JSON.stringify({type:'input',right:dx>0.1,left:dx<-.1,down:dy>0.1,up:dy<-.1,shift:!!keys.shift,shoot:shooting,melee:mouseDown&&knifeOut,plant:interact,defuse:interact,angle:yaw}));}
  setInterval(sendInput,40);
  function renderHud(){if(!snapshot)return;$('blueScore').textContent=snapshot.score.blue;$('redScore').textContent=snapshot.score.red;$('roundNum').textContent=String(snapshot.round).padStart(2,'0');const s=snapshot.time|0;$('clock').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;const me=snapshot.players.find(p=>p.id===myId);if(me){$('hp').textContent=me.hp;if(!me.alive)$('spectate').classList.remove('hidden');else $('spectate').classList.add('hidden');if(me.kills>lastKills){profile.kills+=me.kills-lastKills;lastKills=me.kills;persistProfile();$('profileKills').textContent=profile.kills;}}
    if(snapshot.phase==='bomb'&&snapshot.planted){$('spikeAlert').classList.remove('hidden');$('spikeAlert').querySelector('b').textContent='SPIKE PLANTED AT '+(snapshot.planted.site?.name||'A');const n=Math.ceil(snapshot.planted.left);$('spikeClock').textContent='0:'+String(n).padStart(2,'0');}else $('spikeAlert').classList.add('hidden');}
  function pushFeed(text){const box=$('killFeed'),el=document.createElement('div');el.className='feed-entry';el.textContent=text;box.prepend(el);while(box.children.length>4)box.lastChild.remove();setTimeout(()=>el.remove(),4500);if(/ win /i.test(text)){const b=$('roundBanner');b.textContent=text.toUpperCase();b.classList.remove('hidden');setTimeout(()=>b.classList.add('hidden'),3800);}}
  function appendChat(name,text){const line=document.createElement('div');line.className='chat-line';const n=document.createElement('b');n.textContent=name+': ';line.append(n,document.createTextNode(text));$('chatLog').append(line);while($('chatLog').children.length>5)$('chatLog').firstChild.remove();setTimeout(()=>line.remove(),8000);}

  const cameraTarget=new THREE.Vector3();
  function animate(){requestAnimationFrame(animate);if(snapshot&&snapshot.planted){plantedDevice.visible=true;plantedDevice.position.set(snapshot.planted.site.x*.1,0.01,snapshot.planted.site.y*.1);deviceLight.intensity=1.5+Math.sin(performance.now()*.014)*1.4;}else{plantedDevice.visible=false;deviceLight.intensity=0;}if(snapshot&&myId){const me=snapshot.players.find(p=>p.id===myId);if(me){const targetX=me.x*.1,targetZ=me.y*.1;camera.position.x=THREE.MathUtils.lerp(camera.position.x,targetX,.55);camera.position.y=1.64;camera.position.z=THREE.MathUtils.lerp(camera.position.z,targetZ,.55);cameraTarget.set(camera.position.x+Math.cos(yaw),camera.position.y+Math.tan(pitch),camera.position.z+Math.sin(yaw));camera.lookAt(cameraTarget);if(me.alive&&me.hp<100){} }}
    const t=performance.now()*.001;hands.position.y=-.24+Math.sin(t*8)*.006;hands.position.x=.29+Math.sin(t*4)*.004;renderer.render(scene,camera);}
  resizeRenderer();connect();animate();
})();
