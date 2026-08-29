const squishy=document.querySelector('#squishy');
const count=document.querySelector('#count');
const hint=document.querySelector('#playHint');
const message=document.querySelector('#message');
const colorButton=document.querySelector('#colorButton');
const soundButton=document.querySelector('#soundButton');
const palettes=[['#ffb79d','#f07d72','#ffd7bb'],['#9dc9ff','#5e8de2','#d4e7ff'],['#b7e8bd','#64bd86','#dff8d8'],['#d8b6ff','#9d71df','#f0ddff']];
let presses=0,holding=false,sound=false,palette=0,audio;
function tone(){if(!sound)return;audio??=new AudioContext();const osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.setValueAtTime(220,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(140,audio.currentTime+.12);gain.gain.setValueAtTime(.055,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.13);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+.14)}
function squeeze(){if(holding)return;holding=true;squishy.classList.add('is-squeezed');hint.textContent='很好，再停一会儿';tone()}
function release(){if(!holding)return;holding=false;squishy.classList.remove('is-squeezed');presses++;count.textContent=presses;hint.textContent='松开，慢慢呼吸';message.textContent=presses===1?'第一下已经完成。':presses%5===0?`已经捏了 ${presses} 下，休息十秒也可以。`:'就这样，继续放空。'}
squishy.addEventListener('pointerdown',event=>{event.preventDefault();squishy.setPointerCapture?.(event.pointerId);squeeze()});
['pointerup','pointercancel','pointerleave'].forEach(type=>squishy.addEventListener(type,release));
colorButton.addEventListener('click',()=>{palette=(palette+1)%palettes.length;const [main,dark,light]=palettes[palette];document.documentElement.style.setProperty('--bubble',main);document.documentElement.style.setProperty('--bubble-dark',dark);document.documentElement.style.setProperty('--bubble-light',light);message.textContent='换个颜色，换一种心情。'});
soundButton.addEventListener('click',()=>{sound=!sound;soundButton.textContent=`声音：${sound?'开':'关'}`;soundButton.setAttribute('aria-pressed',String(sound));message.textContent=sound?'已打开轻微回弹音。':'已关闭声音。'});
