import '@angular/compiler';
import { IDBFactory } from 'fake-indexeddb';
import ts from 'typescript';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { of, throwError } from 'rxjs';

const dir = new URL('../.test-runtime/', import.meta.url);
async function transpilar(folder) {
  for (const item of await readdir(new URL(folder, import.meta.url), { withFileTypes: true })) {
    const name = `${folder}/${item.name}`;
    if (item.isDirectory()) { await transpilar(name); continue; }
    if (!name.endsWith('.ts')) continue;
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    let code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, experimentalDecorators: true } }).outputText;
    code = code.replace(/from (['"])(\.[^'"]+)\1/g, (all, quote, specifier) => `from ${quote}${specifier}.mjs${quote}`);
    const out = new URL(name.replace('../src/app/', '').replace(/\.ts$/, '.mjs'), dir);
    await mkdir(new URL('.', out), { recursive: true }); await writeFile(out, code);
  }
}
await transpilar('../src/app');
const { StorageService } = await import(new URL('services/storage.service.mjs', dir));
const { TareaService } = await import(new URL('services/tarea.service.mjs', dir));
const { SincronizacionService } = await import(new URL('services/sincronizacion.service.mjs', dir));
const { TareasComponent } = await import(new URL('components/tareas/tareas.component.mjs', dir));
const { EntregaFormComponent } = await import(new URL('components/entrega-form/entrega-form.component.mjs', dir));
const { AppComponent } = await import(new URL('app.component.mjs', dir));
const catalogo = JSON.parse(await readFile(new URL('../public/assets/data/tareas.json', import.meta.url)));
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.matchMedia = () => ({ matches: false });
let storage;
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); globalThis.window = new EventTarget(); navigator.onLine = true; storage = new StorageService(); });
const nueva = (extra = {}) => ({ idRegistro: crypto.randomUUID(), tareaId: 101, tituloTarea: catalogo[0].titulo, curso: catalogo[0].curso, comentario: ' Evidencia de entrega ', usuario: 'Estudiante SENATI', tipo: 'Entrega', ...extra });
function contexto(overrides = []) {
  const injector = createEnvironmentInjector([{ provide: StorageService, useValue: storage }, { provide: TareaService, useValue: { obtenerTareas: () => of(catalogo) } }, SincronizacionService, ...overrides]);
  return { injector, app: runInInjectionContext(injector, () => new AppComponent()), sync: runInInjectionContext(injector, () => new SincronizacionService()) };
}
async function escribirFixture(records) {
  const db = await storage.abrirDB();
  await new Promise((resolve, reject) => { const tx = db.transaction('entregas_pendientes', 'readwrite'); for (const r of records) tx.objectStore('entregas_pendientes').add(r); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
}

test('Migración v1 → v2 conserva id, fecha y comentario y añade título, índices e intentos', async () => {
  const fecha = '2026-10-09T17:30:00.000Z';
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('senatiTaskDB', 1);
    req.onupgradeneeded = () => { const store = req.result.createObjectStore('entregas_pendientes', { keyPath: 'id', autoIncrement: true }); store.createIndex('tareaId', 'tareaId'); req.result.createObjectStore('catalogo_tareas', { keyPath: 'id' }); };
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('entregas_pendientes', 'readwrite'); tx.objectStore('entregas_pendientes').add({ id: 7, tareaId: 101, titulo: catalogo[0].titulo, curso: catalogo[0].curso, comentario: 'Comentario antiguo', fechaRegistro: fecha, estadoSincronizacion: 'PENDIENTE', tipo: 'Entrega', usuario: 'Estudiante SENATI' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
  const e = await storage.obtenerEntrega(7);
  assert.equal(e.comentario, 'Comentario antiguo'); assert.equal(e.fechaRegistro, fecha); assert.equal(e.tituloTarea, catalogo[0].titulo); assert.equal(e.id, 7); assert.equal(e.intentosSincronizacion, 0); assert.equal(e.idRegistro, 'legacy-7');
  const db = await storage.abrirDB(); assert.equal(db.version, 2); assert.ok(db.transaction('entregas_pendientes').objectStore('entregas_pendientes').indexNames.contains('estadoSincronizacion')); db.close();
});

test('T1 / TH-01: búsqueda por título, curso y estado funcionan individualmente y combinados', () => {
  const lista = new TareasComponent(); lista.tareas = catalogo;
  lista.buscando = 'SERVICE WORKER'; assert.deepEqual(lista.visibles.map(t => t.id), [101]);
  lista.curso = catalogo[1].curso; assert.equal(lista.visibles.length, 0);
  lista.buscando = ' SCRIPT '; assert.deepEqual(lista.visibles.map(t => t.id), [102]);
  lista.estado = 'Pendiente'; assert.equal(lista.visibles.length, 0);
  lista.limpiar(); assert.equal(lista.visibles.length, 2);
  lista.curso = catalogo[0].curso; assert.equal(lista.visibles.length, 1);
});

test('T2 / TH-02: formulario vacío, tarea inválida, espacios y longitudes muestran validaciones específicas', () => {
  const form = new EntregaFormComponent(); form.tareas = catalogo; let emisiones = 0; form.registrar.subscribe(() => emisiones++);
  form.enviar(); assert.match(form.validacion.tarea, /Selecciona/); assert.match(form.validacion.comentario, /comentario/); assert.equal(emisiones, 0);
  form.tareaId = 999; form.comentario = '   '; form.usuario = ' '; form.enviar(); assert.ok(form.validacion.tarea); assert.ok(form.validacion.comentario); assert.ok(form.validacion.usuario);
  form.tareaId = 101; form.comentario = 'a'.repeat(5001); form.usuario = 'Nombre'; form.enviar(); assert.match(form.validacion.comentario, /5000/);
  form.comentario = 'Comentario válido'; form.enviar(); assert.equal(emisiones, 1);
});

test('T3 y T8 / TH-03 y TH-04: guarda offline relación, fecha, id local y estado PENDIENTE tras commit', async () => {
  navigator.onLine = false;
  const id = await storage.guardarEntregaLocal(nueva());
  const e = await storage.obtenerEntrega(id);
  assert.equal(e.id, id); assert.equal(e.tareaId, 101); assert.equal(e.comentario, 'Evidencia de entrega'); assert.equal(e.estadoSincronizacion, 'PENDIENTE'); assert.equal(e.intentosSincronizacion, 0); assert.ok(!isNaN(Date.parse(e.fechaRegistro)));
});

test('T4 / TH-03: una nueva instancia de servicio y aplicación recupera el registro persistido', async () => {
  const id = await storage.guardarEntregaLocal(nueva()); storage = new StorageService();
  const { injector, app } = contexto(); await app.ngOnInit(); assert.equal(app.entregas[0].id, id); assert.equal(app.pendientesLocales, 1); app.ngOnDestroy(); injector.destroy();
});

test('T5 / TH-05: contador derivado de IndexedDB excluye ERROR y SINCRONIZADO', async () => {
  await storage.guardarEntregaLocal(nueva()); await storage.guardarEntregaLocal(nueva());
  await escribirFixture(['SINCRONIZADO', 'ERROR'].map(estadoSincronizacion => ({ ...nueva(), fechaRegistro: new Date().toISOString(), estadoSincronizacion, intentosSincronizacion: 1 })));
  const snapshot = await storage.obtenerBandeja(); assert.equal(snapshot.entregas.length, 4); assert.equal(snapshot.pendientes, 2); assert.equal(await storage.contarPendientes(), 2);
  const { injector, app } = contexto(); await app.cargarEntregas(); assert.equal(app.pendientesLocales, 2); injector.destroy();
});

test('T6 / TH-07: pedir y cancelar eliminación conserva; confirmar elimina y actualiza contador', async () => {
  const id = await storage.guardarEntregaLocal(nueva());
  const { injector, app } = contexto(); await app.cargarEntregas();
  app.pedirEliminar(id); assert.ok(await storage.obtenerEntrega(id)); app.cancelarEliminacion(); await app.eliminar(); assert.ok(await storage.obtenerEntrega(id));
  app.pedirEliminar(id); await app.eliminar(); assert.equal(await storage.obtenerEntrega(id), undefined); assert.equal(app.pendientesLocales, 0); assert.equal(app.entregas.length, 0); injector.destroy();
});

test('T7 / TH-06: Offline → Online actualiza indicador y ofrece reintento sin cambiar estados ni intentos', async () => {
  const id = await storage.guardarEntregaLocal(nueva());
  const { injector, app } = contexto(); await app.ngOnInit();
  navigator.onLine = false; window.dispatchEvent(new Event('offline')); assert.equal(app.online, false);
  navigator.onLine = true; window.dispatchEvent(new Event('online')); assert.equal(app.online, true); assert.equal(app.recuperoConexion, true);
  await app.reintentar(); assert.match(app.mensaje, /No hay una API/); const e = await storage.obtenerEntrega(id); assert.equal(e.estadoSincronizacion, 'PENDIENTE'); assert.equal(e.intentosSincronizacion, 0); app.ngOnDestroy(); injector.destroy();
});

test('TH-08: fallo al guardar conserva formulario y comentario y no confirma éxito', async () => {
  const fallida = new StorageService(); fallida.guardarEntregaLocal = async () => { throw new Error('QuotaExceededError'); };
  const { injector, app } = contexto([{ provide: StorageService, useValue: fallida }]); app.tareas = catalogo; app.abrir(catalogo[0]);
  const form = new EntregaFormComponent(); form.tareas = catalogo; form.tareaInicial = catalogo[0]; form.ngOnInit(); form.comentario = 'Conservar mi comentario';
  const datos = await new Promise(resolve => { form.registrar.subscribe(resolve); form.enviar(); }); await app.guardar(datos);
  assert.equal(form.comentario, 'Conservar mi comentario'); assert.equal(app.formularioAbierto, true); assert.match(app.errorGuardado, /QuotaExceededError/); assert.equal(app.error, true); assert.equal((await storage.listarEntregas()).length, 0); injector.destroy();
});

test('TH-08: error de lectura se informa sin vaciar silenciosamente la última bandeja', async () => {
  const { injector, app } = contexto(); await storage.guardarEntregaLocal(nueva()); await app.cargarEntregas();
  storage.obtenerBandeja = async () => { throw new Error('Lectura bloqueada'); }; await app.cargarEntregas();
  assert.equal(app.entregas.length, 1); assert.match(app.errorLectura, /bloqueada/); assert.equal(app.error, true); injector.destroy();
});

test('Persistencia: validar también en el servicio impide tareas inválidas y comentarios vacíos', async () => {
  for (const input of [{ tareaId: 0 }, { comentario: '  ' }, { comentario: 'a'.repeat(5001) }, { usuario: '' }, { tituloTarea: '' }]) await assert.rejects(storage.guardarEntregaLocal(nueva(input)));
  assert.equal(await storage.contarPendientes(), 0);
});

test('Idempotencia: doble clic y repetición del mismo idRegistro no crean registros duplicados', async () => {
  const datos = nueva(); const ids = await Promise.all([storage.guardarEntregaLocal(datos), storage.guardarEntregaLocal(datos)]);
  assert.equal(ids[0], ids[1]); assert.equal((await storage.listarEntregas()).length, 1);
  await assert.rejects(storage.guardarEntregaLocal({ ...datos, comentario: 'Datos distintos' }), /otros datos/); assert.equal(await storage.contarPendientes(), 1);
});

test('Formulario: una tarea seleccionada muestra contexto y usa el mismo idRegistro al reintentar', () => {
  const form = new EntregaFormComponent(); form.tareas = catalogo; form.tareaInicial = catalogo[1]; form.ngOnInit(); assert.equal(form.seleccionada.id, 102); assert.equal(form.tipo, 'Observación');
  const enviados = []; form.registrar.subscribe(e => enviados.push(e)); form.comentario = ' Mi avance '; form.enviar(); form.enviar();
  assert.equal(enviados[0].idRegistro, enviados[1].idRegistro); assert.equal(enviados[0].comentario, 'Mi avance');
});

test('Aplicación: bloquea doble envío y consulta detalle directamente desde IndexedDB', async () => {
  const { injector, app } = contexto(); app.tareas = catalogo; app.abrir(catalogo[0]);
  await Promise.all([app.guardar(nueva()), app.guardar(nueva())]);
  assert.equal(app.entregas.length, 1); assert.equal(app.formularioAbierto, false); await app.verDetalle(app.entregas[0].id); assert.equal(app.detalle.comentario, 'Evidencia de entrega'); injector.destroy();
});

test('Aplicación: guardado confirmado y fallo posterior de lectura no invitan a duplicar la entrega', async () => {
  const { injector, app } = contexto(); app.tareas = catalogo; app.abrir(catalogo[0]);
  storage.obtenerBandeja = async () => { throw new Error('Lectura fallida'); }; await app.guardar(nueva());
  assert.equal(app.formularioAbierto, false); assert.match(app.mensaje, /no vuelvas a enviarlo/); assert.equal(await storage.contarPendientes(), 1); injector.destroy();
});

test('Sin API: reintento offline, sin pendientes y detalle inexistente tienen resultados explícitos', async () => {
  const { injector, sync } = contexto();
  assert.equal((await sync.reintentar(false)).motivo, 'OFFLINE'); assert.equal((await sync.reintentar(true)).motivo, 'SIN_PENDIENTES');
  await assert.rejects(sync.reintentar(true, 999), /ya no existe/); injector.destroy();
});

test('Offline-First: catálogo de respaldo se conserva y se recupera ante error HTTP', async () => {
  await storage.guardarCatalogo(catalogo);
  const { injector, app } = contexto([{ provide: TareaService, useValue: { obtenerTareas: () => throwError(() => new Error('Offline')) } }]);
  await app.cargarTareas(); assert.equal(app.origenLocal, true); assert.deepEqual(app.tareas, catalogo); assert.equal(app.falloCatalogo, false); injector.destroy();
});

test('Error al eliminar: no se cierra confirmación ni se descuenta un registro que sigue persistido', async () => {
  const id = await storage.guardarEntregaLocal(nueva()); const { injector, app } = contexto(); await app.cargarEntregas(); app.pedirEliminar(id);
  storage.eliminarEntrega = async () => { throw new Error('Fallo de escritura'); }; await app.eliminar();
  assert.equal(app.eliminarId, id); assert.equal(app.pendientesLocales, 1); assert.ok(await storage.obtenerEntrega(id)); assert.equal(app.error, true); injector.destroy();
});
