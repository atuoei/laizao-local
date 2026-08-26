"use client";

import { useEffect, useRef, useState } from "react";

type ToolName = "拼豆图纸生成器" | "模板拼图" | "一键抠图" | "提词器" | "在线白板" | "图片高清放大" | "智能文案撰稿" | "PDF 合并";

const tools: { name: ToolName; icon: string; tag: string; desc: string }[] = [
  { name: "拼豆图纸生成器", icon: "豆", tag: "图像处理", desc: "把图片转成清晰的像素拼豆图，并下载图纸。" },
  { name: "模板拼图", icon: "拼", tag: "图像处理", desc: "上传多张图片，自动排版为方形拼图。" },
  { name: "一键抠图", icon: "抠", tag: "图像处理", desc: "去除纯色或近似纯色背景，导出透明 PNG。" },
  { name: "提词器", icon: "词", tag: "内容创作", desc: "设置字号与速度，在页面内滚动播放台词。" },
  { name: "在线白板", icon: "板", tag: "效率协作", desc: "直接书写、擦除并下载白板内容。" },
  { name: "图片高清放大", icon: "大", tag: "图像处理", desc: "在本地将图片放大 2 倍或 4 倍并下载。" },
  { name: "智能文案撰稿", icon: "写", tag: "内容创作", desc: "根据主题、平台和语气生成可编辑文案初稿。" },
  { name: "PDF 合并", icon: "合", tag: "文档处理", desc: "在浏览器本地合并多个 PDF，文件不会上传。" },
];

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCanvas(canvas: HTMLCanvasElement | null, name: string) {
  canvas?.toBlob((blob) => blob && download(blob, name), "image/png");
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });
  URL.revokeObjectURL(url);
  return img;
}

export function NativeToolsView({ onExplore, onMentor, onCollab, flash }: { onExplore: () => void; onMentor: () => void; onCollab: () => void; flash: (s: string) => void }) {
  const [active, setActive] = useState<ToolName | null>(null);
  const [tag, setTag] = useState("全部");
  const tags = ["全部", "图像处理", "内容创作", "效率协作", "文档处理"];
  const list = tag === "全部" ? tools : tools.filter((tool) => tool.tag === tag);

  function open(name: ToolName) {
    setActive(name);
    window.setTimeout(() => document.getElementById("native-tool-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  return <section className="page"><div className="shell">
    <div className="page-head"><span>来造原生工具</span><h1>官方工具</h1><p>所有工具均在来造页面内运行；图片、白板和 PDF 默认只在当前浏览器处理。</p></div>
    <div className="official-toolbar"><div className="scene-chips">{tags.map((x) => <button key={x} className={tag === x ? "on" : ""} onClick={() => setTag(x)}>{x}</button>)}</div><button className="secondary" onClick={onExplore}>查看创作者作品 →</button></div>
    <div className="official-grid">{list.map((tool, i) => <article key={tool.name}><div className={`tool-mark tool-mark-${i % 4}`}>{tool.icon}</div><span>{tool.tag}</span><h3>{tool.name}</h3><p>{tool.desc}</p><footer><small>来造原生 · 站内使用</small><button onClick={() => open(tool.name)}>打开工具 →</button></footer></article>)}</div>
    {active && <div id="native-tool-workspace" className="native-tool-workspace"><div className="native-tool-head"><div><span>正在使用</span><h2>{active}</h2></div><button className="secondary" onClick={() => setActive(null)}>关闭</button></div><ToolWorkspace name={active} flash={flash}/></div>}
    <div className="official-route"><div><b>工具无法满足当前需求？</b><span>生成可复制到自有 AI 平台的提示词，或进入定制合作。</span></div><button onClick={onMentor}>生成提示词</button><button onClick={onCollab}>定制合作</button></div>
  </div></section>;
}

function ToolWorkspace({ name, flash }: { name: ToolName; flash: (s: string) => void }) {
  if (name === "拼豆图纸生成器") return <PixelTool flash={flash}/>;
  if (name === "模板拼图") return <CollageTool flash={flash}/>;
  if (name === "一键抠图") return <CutoutTool flash={flash}/>;
  if (name === "提词器") return <Teleprompter/>;
  if (name === "在线白板") return <Whiteboard flash={flash}/>;
  if (name === "图片高清放大") return <UpscaleTool flash={flash}/>;
  if (name === "智能文案撰稿") return <CopyTool flash={flash}/>;
  return <PdfMergeTool flash={flash}/>;
}

function PixelTool({ flash }: { flash: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(32);
  const [file, setFile] = useState<File | null>(null);
  async function render(next = file, grid = size) {
    if (!next || !canvas.current) return;
    const img = await loadImage(next);
    const ctx = canvas.current.getContext("2d")!;
    canvas.current.width = grid;
    canvas.current.height = grid;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, grid, grid);
    flash("拼豆图纸已生成");
  }
  return <div className="native-two"><div className="native-controls"><label>上传图片<input type="file" accept="image/*" onChange={(e) => { const f=e.target.files?.[0]||null; setFile(f); if(f) render(f,size); }}/></label><label>图纸尺寸<select value={size} onChange={(e)=>{const n=Number(e.target.value);setSize(n);render(file,n);}}><option value="24">24 × 24</option><option value="32">32 × 32</option><option value="48">48 × 48</option></select></label><button className="primary" onClick={()=>downloadCanvas(canvas.current,"来造-拼豆图纸.png")}>下载图纸</button></div><div className="canvas-stage pixel-stage"><canvas ref={canvas}/><span>上传图片后生成图纸</span></div></div>;
}

function CollageTool({ flash }: { flash: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  async function render(next: File[]) {
    if (!next.length || !canvas.current) return;
    const images = await Promise.all(next.slice(0, 9).map(loadImage));
    const cols = images.length === 1 ? 1 : images.length <= 4 ? 2 : 3;
    const rows = Math.ceil(images.length / cols);
    const ctx = canvas.current.getContext("2d")!;
    canvas.current.width = 1200; canvas.current.height = 1200;
    ctx.fillStyle = "#f5f1e9"; ctx.fillRect(0,0,1200,1200);
    const gap=18, cellW=(1200-gap*(cols+1))/cols, cellH=(1200-gap*(rows+1))/rows;
    images.forEach((img,i)=>{const x=gap+(i%cols)*(cellW+gap),y=gap+Math.floor(i/cols)*(cellH+gap);const scale=Math.max(cellW/img.width,cellH/img.height),w=img.width*scale,h=img.height*scale;ctx.save();ctx.beginPath();ctx.rect(x,y,cellW,cellH);ctx.clip();ctx.drawImage(img,x+(cellW-w)/2,y+(cellH-h)/2,w,h);ctx.restore();});
    flash("拼图已经排版完成");
  }
  return <div className="native-two"><div className="native-controls"><label>选择 1–9 张图片<input type="file" accept="image/*" multiple onChange={(e)=>{const next=Array.from(e.target.files||[]).slice(0,9);setFiles(next);render(next);}}/></label><p>当前已选择 {files.length} 张，系统会自动选择 1×1、2×2 或 3×3 排版。</p><button className="primary" onClick={()=>downloadCanvas(canvas.current,"来造-模板拼图.png")}>下载高清拼图</button></div><div className="canvas-stage"><canvas ref={canvas}/><span>选择图片后预览排版</span></div></div>;
}

function CutoutTool({ flash }: { flash: (s: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [tolerance,setTolerance]=useState(70);
  async function render(next=file,t=tolerance){if(!next||!canvas.current)return;const img=await loadImage(next);const max=1100,scale=Math.min(1,max/Math.max(img.width,img.height));const c=canvas.current;c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);const ctx=c.getContext("2d")!;ctx.drawImage(img,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height),p=data.data,bg=[p[0],p[1],p[2]];for(let i=0;i<p.length;i+=4){const d=Math.hypot(p[i]-bg[0],p[i+1]-bg[1],p[i+2]-bg[2]);if(d<t)p[i+3]=0;}ctx.putImageData(data,0,0);flash("背景处理完成");}
  return <div className="native-two"><div className="native-controls"><label>上传纯色背景图片<input type="file" accept="image/*" onChange={(e)=>{const f=e.target.files?.[0]||null;setFile(f);if(f)render(f,tolerance);}}/></label><label>背景容差：{tolerance}<input type="range" min="20" max="160" value={tolerance} onChange={(e)=>{const n=Number(e.target.value);setTolerance(n);render(file,n);}}/></label><p>以图片左上角颜色为背景参考，适合证件照、商品白底图等背景较单一的图片。</p><button className="primary" onClick={()=>downloadCanvas(canvas.current,"来造-透明背景.png")}>下载透明 PNG</button></div><div className="canvas-stage checker"><canvas ref={canvas}/><span>上传图片后预览抠图结果</span></div></div>;
}

function Teleprompter() {
  const [text,setText]=useState("欢迎使用来造提词器。\n把需要朗读的内容粘贴到左侧，然后点击开始播放。");
  const [speed,setSpeed]=useState(2); const [font,setFont]=useState(36); const [playing,setPlaying]=useState(false); const [offset,setOffset]=useState(0);
  useEffect(()=>{if(!playing)return;const id=window.setInterval(()=>setOffset(v=>v+speed),40);return()=>window.clearInterval(id);},[playing,speed]);
  return <div className="native-two"><div className="native-controls"><label>提词内容<textarea value={text} onChange={(e)=>{setText(e.target.value);setOffset(0);}}/></label><label>滚动速度<input type="range" min="1" max="6" value={speed} onChange={(e)=>setSpeed(Number(e.target.value))}/></label><label>文字大小<input type="range" min="24" max="64" value={font} onChange={(e)=>setFont(Number(e.target.value))}/></label><div className="native-actions"><button className="primary" onClick={()=>setPlaying(!playing)}>{playing?"暂停":"开始播放"}</button><button className="secondary" onClick={()=>{setPlaying(false);setOffset(0);}}>回到开头</button></div></div><div className="teleprompter-screen"><div style={{fontSize:font,transform:`translateY(-${offset}px)`}}>{text}</div></div></div>;
}

function Whiteboard({ flash }: { flash: (s: string) => void }) {
  const canvas=useRef<HTMLCanvasElement>(null);const [color,setColor]=useState("#173e30");const drawing=useRef(false);
  function point(e: React.PointerEvent<HTMLCanvasElement>){const c=canvas.current!;const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)};}
  function down(e:React.PointerEvent<HTMLCanvasElement>){drawing.current=true;const p=point(e),ctx=canvas.current!.getContext("2d")!;ctx.beginPath();ctx.moveTo(p.x,p.y);e.currentTarget.setPointerCapture(e.pointerId);}
  function move(e:React.PointerEvent<HTMLCanvasElement>){if(!drawing.current)return;const p=point(e),ctx=canvas.current!.getContext("2d")!;ctx.strokeStyle=color;ctx.lineWidth=color==="#ffffff"?26:6;ctx.lineCap="round";ctx.lineTo(p.x,p.y);ctx.stroke();}
  function clear(){const c=canvas.current!,ctx=c.getContext("2d")!;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);flash("白板已清空");}
  return <div><div className="whiteboard-bar"><label>画笔颜色<input type="color" value={color} onChange={(e)=>setColor(e.target.value)}/></label><button className="secondary" onClick={()=>setColor("#ffffff")}>橡皮擦</button><button className="secondary" onClick={clear}>清空</button><button className="primary" onClick={()=>downloadCanvas(canvas.current,"来造-白板.png")}>下载白板</button></div><div className="whiteboard-wrap"><canvas ref={canvas} width="1400" height="760" onPointerDown={down} onPointerMove={move} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}/></div></div>;
}

function UpscaleTool({ flash }: { flash:(s:string)=>void }) {
  const canvas=useRef<HTMLCanvasElement>(null);const [file,setFile]=useState<File|null>(null);const [factor,setFactor]=useState(2);
  async function render(next=file,f=factor){if(!next||!canvas.current)return;const img=await loadImage(next),c=canvas.current;c.width=img.width*f;c.height=img.height*f;const ctx=c.getContext("2d")!;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img,0,0,c.width,c.height);flash(`图片已放大 ${f} 倍`);}
  return <div className="native-two"><div className="native-controls"><label>上传图片<input type="file" accept="image/*" onChange={(e)=>{const f=e.target.files?.[0]||null;setFile(f);if(f)render(f,factor);}}/></label><label>放大倍数<select value={factor} onChange={(e)=>{const n=Number(e.target.value);setFactor(n);render(file,n);}}><option value="2">2 倍</option><option value="4">4 倍</option></select></label><p>采用浏览器高质量插值放大，适合插画、截图和轻度放大；不会把文件上传到服务器。</p><button className="primary" onClick={()=>downloadCanvas(canvas.current,"来造-高清放大.png")}>下载放大图片</button></div><div className="canvas-stage"><canvas ref={canvas}/><span>上传图片后预览</span></div></div>;
}

function CopyTool({ flash }: { flash:(s:string)=>void }) {
  const [topic,setTopic]=useState("周末城市散步路线");const [platform,setPlatform]=useState("小红书");const [tone,setTone]=useState("真诚自然");const [result,setResult]=useState("");
  function generate(){const opening=tone==="专业清晰"?"把复杂的信息整理简单，才是真正有用的内容。":"这个周末，不妨给自己留出半天，慢慢走一条不赶时间的路线。";setResult(`${opening}\n\n这次想和你分享：${topic}。\n\n① 先确定最想体验的一件事\n② 只安排三个停留点，给意外留出时间\n③ 收藏路线，出发前再按天气调整\n\n适合发布平台：${platform}\n表达语气：${tone}\n\n#周末灵感 #城市生活 #来造工具`);flash("文案初稿已生成");}
  return <div className="native-two"><div className="native-controls"><label>主题<input value={topic} onChange={(e)=>setTopic(e.target.value)}/></label><label>发布平台<select value={platform} onChange={(e)=>setPlatform(e.target.value)}><option>小红书</option><option>朋友圈</option><option>微博</option><option>公众号</option></select></label><label>表达语气<select value={tone} onChange={(e)=>setTone(e.target.value)}><option>真诚自然</option><option>专业清晰</option><option>轻松活泼</option></select></label><button className="primary" onClick={generate}>生成文案初稿</button></div><div className="copy-result"><textarea value={result} onChange={(e)=>setResult(e.target.value)} placeholder="生成结果会出现在这里"/><button className="secondary" onClick={async()=>{await navigator.clipboard.writeText(result);flash("文案已复制");}}>复制文案</button></div></div>;
}

function PdfMergeTool({ flash }: { flash:(s:string)=>void }) {
  const [files,setFiles]=useState<File[]>([]);const [busy,setBusy]=useState(false);
  async function merge(){if(files.length<2){flash("请至少选择两个 PDF");return;}setBusy(true);try{const {PDFDocument}=await import("pdf-lib");const merged=await PDFDocument.create();for(const file of files){const source=await PDFDocument.load(await file.arrayBuffer());const pages=await merged.copyPages(source,source.getPageIndices());pages.forEach((p)=>merged.addPage(p));}const bytes=await merged.save();download(new Blob([bytes as BlobPart],{type:"application/pdf"}),"来造-合并文档.pdf");flash("PDF 合并完成");}catch{flash("PDF 无法读取，请确认文件未加密");}finally{setBusy(false);}}
  return <div className="pdf-merge"><label>选择多个 PDF<input type="file" accept="application/pdf" multiple onChange={(e)=>setFiles(Array.from(e.target.files||[]))}/></label><div className="pdf-list">{files.length?files.map((f,i)=><div key={`${f.name}-${i}`}><span>{i+1}</span><b>{f.name}</b><small>{(f.size/1024/1024).toFixed(2)} MB</small></div>):<p>文件将按照选择顺序合并，处理过程只发生在当前浏览器。</p>}</div><button className="primary" disabled={busy} onClick={merge}>{busy?"正在合并…":"合并并下载"}</button></div>;
}
