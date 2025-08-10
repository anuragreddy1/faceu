
/* src/App.jsx - Pro version */
import React, { useEffect, useRef, useState } from "react";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

/*
Pro Handsome Score — deterministic scoring using landmarks,
golden-ratio fit, symmetry, smile, eye openness, plus ego-friendly mapping.
Styles injected inline for plug-and-play.
*/

export default function App(){
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const cardRef = useRef(null);
  const cameraRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [metrics, setMetrics] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  // inject some professional styles
  useEffect(()=>{
    const css = `
    .app{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px;background:linear-gradient(135deg,#071026,#0b1220);}
    .frame{width:100%;max-width:1100px;display:grid;grid-template-columns:1fr 360px;gap:20px;}
    .card{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.03);}
    .title{font-size:20px;font-weight:700;color:#eaf2ff;margin-bottom:6px;}
    .subtitle{color:#9fb0d8;font-size:13px;margin-bottom:12px;}
    video{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,0.03);display:block;}
    .controls{display:flex;gap:8px;align-items:center;margin-top:12px;}
    .btn{background:linear-gradient(90deg,#8b5cf6,#06b6d4);border:none;color:white;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:700;}
    .muted{background:transparent;border:1px solid rgba(255,255,255,0.05);color:#cfe2ff;padding:8px 10px;border-radius:10px;cursor:pointer;}
    .metrics{display:flex;flex-direction:column;gap:10px;margin-top:12px;}
    .bigscore{font-size:48px;font-weight:800;color:white;}
    .param{display:flex;justify-content:space-between;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:8px;font-weight:700;color:#dbeafe;}
    @media(max-width:980px){.frame{grid-template-columns:1fr}}
    `;
    const s = document.createElement("style"); s.id="handsome-pro-style"; s.innerHTML = css; document.head.appendChild(s);
    return ()=>{ const ex = document.getElementById("handsome-pro-style"); ex && ex.remove(); }
  },[]);

  // helper distance in pixels
  function distPx(a,b,w,h){ const dx=(a.x-b.x)*w; const dy=(a.y-b.y)*h; return Math.sqrt(dx*dx+dy*dy); }

  function computeSymmetry(landmarks){
    // pairs (left, right)
    const pairs = [[33,263],[133,362],[61,291],[199,1],[234,454],[127,356]];
    let diffs=[];
    for(const [l,r] of pairs){
      const L = landmarks[l], R = landmarks[r];
      if(!L||!R) continue;
      const diff = Math.abs(L.x - (1 - R.x));
      diffs.push(diff);
    }
    if(diffs.length===0) return 55;
    const avg = diffs.reduce((a,b)=>a+b,0)/diffs.length;
    const score = Math.max(0, Math.min(100, Math.round((1 - avg/0.12)*100)));
    return score;
  }

  function computeGolden(landmarks,w,h){
    const top = landmarks[10]||landmarks[1];
    const mid = landmarks[1]||landmarks[4];
    const tip = landmarks[4]||landmarks[5];
    const chin = landmarks[152]||landmarks[199];
    if(!top||!mid||!tip||!chin) return 60;
    const dTopMid = distPx(top,mid,w,h);
    const dMidTip = distPx(mid,tip,w,h);
    const dTipChin = distPx(tip,chin,w,h);
    const ratioA = (dTopMid + dMidTip) / (dTipChin + 1e-6);
    const ratioB = dTopMid / (dMidTip + 1e-6);
    const phi = 1.618;
    const diffA = Math.abs(ratioA - phi) / phi;
    const diffB = Math.abs(ratioB - phi) / phi;
    const combined = (diffA + diffB)/2;
    const fit = Math.max(0, Math.min(100, Math.round((1 - combined/0.6)*100)));
    return fit;
  }

  function computeSmile(landmarks,w,h){
    const left = landmarks[61], right = landmarks[291], top=landmarks[13], bottom=landmarks[14];
    if(!left||!right||!top||!bottom) return 55;
    const width = distPx(left,right,w,h);
    const height = distPx(top,bottom,w,h);
    const ratio = width/(height+1e-6);
    // map ratio to 0..100 with neutral around 3, smile strong around 6
    return Math.max(0,Math.min(100,Math.round((ratio-2.5)/3.5*100)));
  }

  function computeEyes(landmarks,w,h){
    const lt = landmarks[159], lb = landmarks[145], rt = landmarks[386], rb = landmarks[374];
    if(!lt||!lb||!rt||!rb) return 60;
    const l = distPx(lt,lb,w,h), r = distPx(rt,rb,w,h);
    const eyeOuterLeft = landmarks[33], eyeOuterRight = landmarks[263];
    const span = eyeOuterLeft && eyeOuterRight ? distPx(eyeOuterLeft,eyeOuterRight,w,h) : 40;
    const avg = (l+r)/2;
    return Math.max(0, Math.min(100, Math.round((avg/(span+1e-6))*200)));
  }

  // ego-friendly mapping: push final into comfortable range so users share
  function egoMap(raw){
    // raw 0..100 -> map to 60..98 (preserve ordering)
    // using non-linear easing so high raw get higher boost
    const min = 60, max = 98;
    const eased = Math.pow(raw/100, 1.05); // slight easing
    return Math.round(min + (max-min)*eased);
  }

  // draw overlay points for UX
  function drawOverlay(landmarks, img){
    const canvas = overlayRef.current; if(!canvas||!landmarks) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = videoRef.current.videoWidth || 640;
    const h = canvas.height = videoRef.current.videoHeight || 480;
    ctx.clearRect(0,0,w,h);
    try{ ctx.drawImage(img,0,0,w,h); }catch(e){}
    ctx.fillStyle = "rgba(139,92,246,0.9)";
    for(let i=0;i<landmarks.length;i++){
      const p = landmarks[i]; ctx.beginPath(); ctx.arc(p.x*w,p.y*h,2,0,Math.PI*2); ctx.fill();
    }
  }

  // init mediapipe and camera
  useEffect(()=>{
    let faceMesh = null;
    try{
      faceMesh = new FaceMesh({ locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    }catch(e){
      setStatus("MediaPipe load error");
      return;
    }
    faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
    faceMesh.onResults((results)=>{
      if(!results || !results.multiFaceLandmarks || results.multiFaceLandmarks.length===0){ setStatus("No face"); return; }
      setStatus("Face detected");
      const lm = results.multiFaceLandmarks[0];
      drawOverlay(lm, results.image);
      const w = overlayRef.current.width, h = overlayRef.current.height;
      const symmetry = computeSymmetry(lm);
      const golden = computeGolden(lm,w,h);
      const smile = computeSmile(lm,w,h);
      const eyes = computeEyes(lm,w,h);
      const raw = Math.round(symmetry*0.36 + golden*0.32 + smile*0.18 + eyes*0.14);
      const final = egoMap(raw);
      setMetrics({ symmetry, golden, smile, eyes, raw, final });
    });

    if(running && videoRef.current){
      cameraRef.current = new Camera(videoRef.current, {
        onFrame: async ()=> { await faceMesh.send({image: videoRef.current}); },
        width:1280, height:720
      });
      cameraRef.current.start();
    }

    return ()=>{
      try{ cameraRef.current && cameraRef.current.stop(); }catch(e){};
      try{ faceMesh.close && faceMesh.close(); }catch(e){};
    }
  },[running]);

  const start = ()=>{ setRunning(true); setStatus("Starting..."); setTimeout(()=>setStatus("Hold still for 2s"),600); }
  const stop = ()=>{ setRunning(false); setStatus("Stopped"); try{ cameraRef.current && cameraRef.current.stop(); }catch(e){} }

  const captureCard = ()=>{
    const src = overlayRef.current;
    if(!src || !metrics) { alert("Start camera and wait for detection."); return; }
    const cw=1080,ch=1350; const c = cardRef.current; c.width=cw; c.height=ch; const ctx=c.getContext("2d");
    const grad = ctx.createLinearGradient(0,0,cw,ch); grad.addColorStop(0,"#081126"); grad.addColorStop(1,"#071226");
    ctx.fillStyle=grad; ctx.fillRect(0,0,cw,ch);
    // photo box
    ctx.fillStyle="#021020"; ctx.fillRect(50,70,640,860);
    try{ ctx.drawImage(src,0,0,src.width,src.height,60,80,620,820); }catch(e){}
    // score
    ctx.fillStyle="#fff"; ctx.font="bold 64px Inter, Arial"; ctx.fillText(`${metrics.final}%`,760,180);
    ctx.font="18px Inter, Arial"; ctx.fillStyle="#bcd2ff"; ctx.fillText("Handsome Score — Pro",760,130);
    // params
    let py=260;
    const pairs=[["Symmetry",metrics.symmetry],["Golden Fit",metrics.golden],["Smile",metrics.smile],["Eyes",metrics.eyes]];
    for(const [n,v] of pairs){
      ctx.fillStyle="#dbe9ff"; ctx.font="600 18px Inter, Arial"; ctx.fillText(n,760,py);
      ctx.fillStyle="rgba(255,255,255,0.08)"; ctx.fillRect(760,py+8,270,12);
      const pct = (typeof v==="number"?v:0)/100; ctx.fillStyle="#8b5cf6"; ctx.fillRect(760,py+8,Math.round(270*pct),12); py+=52;
    }
    ctx.fillStyle="#9fb0d8"; ctx.font="16px Inter, Arial"; ctx.fillText("For entertainment only — share with #HandsomeScore",60,ch-40);
    const data = c.toDataURL("image/png");
    setSnapshot(data);
    const a=document.createElement("a"); a.href=data; a.download=`handsome-${Date.now()}.png`; a.click();
  }

  return (
    <div className="app">
      <div className="frame">
        <div className="card">
          <div className="title">Handsome Score — Pro</div>
          <div className="subtitle">Fast · Local · Evidence-based (symmetry & golden ratio)</div>
          <video ref={videoRef} autoPlay playsInline muted style={{borderRadius:8}}></video>
          <canvas ref={overlayRef} style={{display:"block", marginTop:8, width:"100%", borderRadius:8}} />
          <div className="controls">
            {!running ? <button className="btn" onClick={start}>Start Camera</button> : <button className="muted" onClick={stop}>Stop</button>}
            <button className="muted" onClick={()=>{ if(overlayRef.current) { const link=document.createElement("a"); link.href=overlayRef.current.toDataURL(); link.download=`preview-${Date.now()}.png`; link.click(); } }}>Download Preview</button>
            <div style={{marginLeft:10,color:"#9fb0d8",fontWeight:700}}>{status}</div>
          </div>
          <div style={{marginTop:10,color:"#9fb0d8"}}>Privacy: processed locally in your browser — no uploads.</div>
        </div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:13,color:"#bcd2ff"}}>Your Score</div>
              <div className="bigscore">{metrics? `${metrics.final}%` : "--"}</div>
              <div style={{color:"#9fb0d8",marginTop:6}}>{metrics? (metrics.final>88?"🔥 Cinematic!":metrics.final>74?"😎 Very Handsome":metrics.final>60?"🙂 Charming":"😊 Cute") : "—"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,color:"#9fb0d8"}}>Quick Metrics</div>
              <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                <div style={{background:"rgba(255,255,255,0.03)",padding:"6px 10px",borderRadius:999,fontWeight:700,color:"#dbeafe"}}>Symmetry</div>
                <div style={{background:"rgba(255,255,255,0.03)",padding:"6px 10px",borderRadius:999,fontWeight:700,color:"#dbeafe"}}>Golden Fit</div>
              </div>
            </div>
          </div>

          <div className="metrics">
            <div className="param"><div>Symmetry</div><div>{metrics? `${metrics.symmetry}`:"--"}</div></div>
            <div className="param"><div>Golden Ratio Fit</div><div>{metrics? `${metrics.golden}`:"--"}</div></div>
            <div className="param"><div>Smile</div><div>{metrics? `${metrics.smile}`:"--"}</div></div>
            <div className="param"><div>Eye Openness</div><div>{metrics? `${metrics.eyes}`:"--"}</div></div>
          </div>

          <div style={{marginTop:12,display:"flex",gap:8}}>
            <button className="btn" onClick={captureCard} style={{flex:1}}>Generate & Download Card</button>
            <button className="muted" onClick={()=>{ const txt=`I scored ${metrics?metrics.final:'--'}% on Handsome Score — try it!`; navigator.clipboard && navigator.clipboard.writeText(txt); alert("Share text copied!")}}>Copy</button>
          </div>

          <div style={{marginTop:12,fontSize:13,color:"#9fb0d8"}}>
            <strong>Pro tips</strong>
            <ul style={{margin:6,paddingLeft:18}}>
              <li>Good lighting helps detection and score.</li>
              <li>Keep phone at eye level and smile slightly.</li>
            </ul>
          </div>
        </div>
      </div>

      <canvas ref={cardRef} style={{display:"none"}} />
      {snapshot && <img src={snapshot} alt="snapshot" style={{position:"fixed",right:18,bottom:18,width:120,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}} />}
    </div>
  )
}
