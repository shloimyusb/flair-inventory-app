const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(fs.existsSync('docs/scanner.html')?'docs/scanner.html':'scanner.html','utf8');
let resolveCamera,stops=0;const elements={status:{},video:{},capture:{},resultCard:{classList:{remove(){}}}};
const ctx=vm.createContext({Promise,navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>resolveCamera=resolve)}},$:id=>elements[id]});
vm.runInContext('let stream=null,reading=false,cameraRequest=0;'+source.slice(source.indexOf('    async function startCamera('),source.indexOf('    function loadOcr(')),ctx);
(async()=>{const pending=ctx.startCamera();ctx.stopCamera();resolveCamera({getTracks:()=>[{stop:()=>stops++}]});await pending;assert.equal(stops,1,'A camera request completed after upload/navigation must release its tracks');assert.equal(elements.video.srcObject,undefined);assert.equal(elements.capture.disabled,true);console.log('Scanner checks passed: late camera completion is cancelled and cannot overwrite photo/OCR state.');})().catch(error=>{console.error(error);process.exitCode=1;});
