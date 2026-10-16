import {readFile, access} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='dist/senati-taskhub-pwa/browser';
for (const name of ['index.html','ngsw-worker.js','ngsw.json','manifest.webmanifest','assets/data/tareas.json']) await access(`${root}/${name}`);
const ngsw=JSON.parse(await readFile(`${root}/ngsw.json`));
const group=ngsw.dataGroups.find(g=>g.name==='tareas-api'); assert.equal(group.strategy,'performance'); assert.equal(group.maxAge,86400000);assert.equal(group.maxSize,50);
assert.ok(!Object.keys(ngsw.hashTable).includes('/assets/data/tareas.json'),'JSON debe usar Runtime Caching');
assert.ok(Object.keys(ngsw.hashTable).some(k=>k.endsWith('.js')));assert.ok(ngsw.hashTable['/manifest.webmanifest']);
const m=JSON.parse(await readFile(`${root}/manifest.webmanifest`));assert.equal(m.theme_color,'#0033A0');assert.equal(m.display,'standalone');
for (const size of [192,512]) {const icon=m.icons.find(i=>i.sizes===`${size}x${size}`);const bytes=await readFile(`${root}/${icon.src}`);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);assert.ok(ngsw.hashTable['/'+icon.src]);}
const tareas=JSON.parse(await readFile(`${root}/assets/data/tareas.json`));assert.deepEqual(tareas.map(t=>[t.id,t.instructor,t.fechaEntrega,t.estado]),[[101,'Ing. Jorge Luque','2026-10-15','Pendiente'],[102,'Ing. Carlos Mendoza','2026-10-18','Completado']]);
console.log('OK: Angular Service Worker emitido, App Shell, runtime performance 1d/50, manifest e iconos 192/512, datos del PDF.');
