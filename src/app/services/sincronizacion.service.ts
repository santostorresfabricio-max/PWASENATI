import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
export interface ResultadoReintento {
  mensaje: string;
  pendientes: number;
  motivo: 'OFFLINE' | 'SIN_API' | 'SIN_PENDIENTES';
}
/** No hay endpoint configurado. Una revisión local jamás cuenta como intento remoto. */
@Injectable({ providedIn: 'root' })
export class SincronizacionService {
  private readonly storage = inject(StorageService);
  async reintentar(online: boolean, id?: number): Promise<ResultadoReintento> {
    const pendientes = await this.storage.contarPendientes();
    if (id !== undefined && !await this.storage.obtenerEntrega(id)) throw new Error('La entrega ya no existe en el dispositivo.');
    if (!online) return { pendientes, motivo: 'OFFLINE', mensaje: 'Sin conexión. Tus entregas siguen guardadas; reintenta cuando vuelva la red.' };
    if (!pendientes) return { pendientes, motivo: 'SIN_PENDIENTES', mensaje: 'No hay entregas pendientes de sincronización.' };
    return { pendientes, motivo: 'SIN_API', mensaje: 'Con conexión: listo para intentar sincronizar. No hay una API configurada; las entregas permanecen PENDIENTE. No se realizó un envío remoto.' };
  }
}
