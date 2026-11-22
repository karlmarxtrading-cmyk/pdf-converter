// This probe opens a headed installed Chromium with an ephemeral profile. It never treats launch as a native save receipt.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';
import {distTreeSha256} from '../../../scripts/fingerprint.mjs';
const destination=process.env.PF_EVIDENCE_DIR||'evidence/rc11/browser/results';
const chrome=process.env.PF_HEADED_CHROME||'/usr/bin/chromium';
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const record={timestamp:new Date().toISOString(),distBefore:distTreeSha256(),launchBinary:chrome,
  version:spawnSync(chrome,['--version'],{encoding:'utf8'}).stdout?.trim(),hasDisplay:!!process.env.DISPLAY,hasWaylandDisplay:!!process.env.WAYLAND_DISPLAY,
  os:process.platform,pdfReadBack:false,method:'Installed headed Chromium, default native print path and ephemeral profile; no kiosk or headless PDF flags.',
  desktopPreflight:'Separate managed Linux desktop Chromium was launched. The local site on 127.0.0.1:4386 returned ERR_CONNECTION_REFUSED. The verified workspace file URL was blocked by managed policy. No public preview permitted. Native output could not be bound to this candidate on that surface.',
  status:'BLOCKED'};
let browser;
try{record.binarySha256=await hash(chrome);browser=await puppeteer.launch({executablePath:chrome,pipe:true,headless:false,timeout:12000,args:['--no-sandbox','--disable-dev-shm-usage']});record.headedLaunch='available';record.reason='Native save, cancel, retry and readback still require operating the platform print and file dialogs.';}
catch(error){record.headedLaunch='BLOCKED';record.reason=String(error.message).replaceAll(process.cwd(),'<project>').slice(0,1300);}
finally{await browser?.close();record.distAfter=distTreeSha256();await writeFile(join(destination,'native-save.json'),JSON.stringify(record,null,2)+'\n');}
console.log(JSON.stringify({status:record.status,headedLaunch:record.headedLaunch,hasDisplay:record.hasDisplay}));
