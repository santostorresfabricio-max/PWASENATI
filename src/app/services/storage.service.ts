import { Injectable } from '@angular/core';
import { BandejaLocal, EntregaLocal, NuevaEntrega } from '../models/entrega-local';
import { Tarea } from './tarea.service';

/** El éxito se resuelve siempre después del commit de la transacción. */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly dbName = 'senatiTaskDB';
  private readonly storeName = 'entregas_pendientes';

  abrirDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 2);
      let bloqueada = false;
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(this.storeName)
          ? request.transaction!.objectStore(this.storeName)
          : db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        if (!store.indexNames.contains('tareaId')) store.createIndex('tareaId', 'tareaId');
        if (!store.indexNames.contains('estadoSincronizacion')) store.createIndex('estadoSincronizacion', 'estadoSincronizacion');
        if (!store.indexNames.contains('idRegistro')) store.createIndex('idRegistro', 'idRegistro', { unique: true });
        if (!db.objectStoreNames.contains('catalogo_tareas')) db.createObjectStore('catalogo_tareas', { keyPath: 'id' });
        // Migración incremental: conserva ids, comentarios y fechas de la versión inicial.
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (!current) return;
          const old = current.value as EntregaLocal & { titulo?: string };
          current.update({ ...old, tituloTarea: old.tituloTarea ?? old.titulo ?? 'Tarea académica',
            idRegistro: old.idRegistro ?? `legacy-${String(current.primaryKey)}`,
            intentosSincronizacion: old.intentosSincronizacion ?? 0,
            estadoSincronizacion: old.estadoSincronizacion ?? 'PENDIENTE' });
          current.continue();
        };
      };
      request.onsuccess = () => {
        if (bloqueada) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
      request.onblocked = () => { bloqueada = true; reject(new Error('Cierra otras pestañas de TaskHub y vuelve a intentar para actualizar el almacenamiento.')); };
    });
  }

  private async consultar<T>(storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(storeName, mode);
        const request = operation(tx.objectStore(storeName));
        tx.oncomplete = () => { db.close(); resolve(request.result); };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Falló la transacción de IndexedDB.')); };
      } catch (error) { db.close(); reject(error); }
    });
  }

  async guardarEntregaLocal(entrega: NuevaEntrega): Promise<number> {
    if (!Number.isInteger(entrega.tareaId) || entrega.tareaId <= 0 || !entrega.tituloTarea.trim() || !entrega.curso.trim()) throw new Error('Selecciona una tarea válida del catálogo.');
    if (!entrega.comentario.trim()) throw new Error('Escribe un comentario para la entrega.');
    if (entrega.comentario.length > 5000) throw new Error('El comentario admite como máximo 5000 caracteres.');
    if (!entrega.usuario.trim() || entrega.usuario.length > 120) throw new Error('Escribe un nombre de hasta 120 caracteres.');
    if (!entrega.idRegistro.trim() || !['Entrega', 'Observación'].includes(entrega.tipo)) throw new Error('El registro no es válido. Vuelve a abrir el formulario.');
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      let id = 0;
      let problema: Error | null = null;
      const datos = { ...entrega, comentario: entrega.comentario.trim(), usuario: entrega.usuario.trim() };
      const found = store.index('idRegistro').get(entrega.idRegistro);
      found.onsuccess = () => {
        const anterior = found.result as EntregaLocal | undefined;
        if (anterior) {
          const claves: (keyof NuevaEntrega)[] = ['tareaId', 'tituloTarea', 'curso', 'comentario', 'usuario', 'tipo'];
          if (claves.some(key => anterior[key] !== datos[key])) {
            problema = new Error('Este formulario ya fue guardado con otros datos. Abre un registro nuevo.'); tx.abort(); return;
          }
          id = anterior.id; return;
        }
        const add = store.add({ ...datos, fechaRegistro: new Date().toISOString(), estadoSincronizacion: 'PENDIENTE', intentosSincronizacion: 0 });
        add.onsuccess = () => { id = Number(add.result); };
      };
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = tx.onabort = () => { db.close(); reject(problema ?? tx.error ?? new Error('No se pudo guardar en el dispositivo.')); };
    });
  }

  listarEntregas(): Promise<EntregaLocal[]> { return this.consultar(this.storeName, 'readonly', store => store.getAll()); }
  obtenerEntrega(id: number): Promise<EntregaLocal | undefined> { return this.consultar(this.storeName, 'readonly', store => store.get(id)); }
  contarPendientes(): Promise<number> { return this.consultar(this.storeName, 'readonly', store => store.index('estadoSincronizacion').count('PENDIENTE')); }
  eliminarEntrega(id: number): Promise<undefined> { return this.consultar(this.storeName, 'readwrite', store => store.delete(id)); }

  /** Lista y contador comparten una sola transacción para mostrar un estado consistente. */
  async obtenerBandeja(): Promise<BandejaLocal> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const records = store.getAll();
      const count = store.index('estadoSincronizacion').count('PENDIENTE');
      tx.oncomplete = () => {
        db.close();
        resolve({ entregas: (records.result as EntregaLocal[]).sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro) || b.id - a.id), pendientes: count.result });
      };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se pudo leer la bandeja.')); };
    });
  }

  async guardarCatalogo(tareas: Tarea[]): Promise<void> {
    const db = await this.abrirDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('catalogo_tareas', 'readwrite');
      const store = tx.objectStore('catalogo_tareas');
      store.clear(); tareas.forEach(tarea => store.put(tarea));
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No se pudo respaldar el catálogo.')); };
    });
  }
  leerCatalogo(): Promise<Tarea[]> { return this.consultar('catalogo_tareas', 'readonly', store => store.getAll()); }
}
