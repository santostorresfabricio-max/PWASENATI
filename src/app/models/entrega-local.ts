export type EstadoSincronizacion = 'PENDIENTE' | 'SINCRONIZADO' | 'ERROR';

export interface NuevaEntrega {
  idRegistro: string;
  tareaId: number;
  tituloTarea: string;
  curso: string;
  comentario: string;
  usuario: string;
  tipo: 'Entrega' | 'Observación';
}

export interface EntregaLocal extends NuevaEntrega {
  id: number;
  fechaRegistro: string;
  estadoSincronizacion: EstadoSincronizacion;
  intentosSincronizacion: number;
  ultimoError?: string;
}

export interface BandejaLocal {
  entregas: EntregaLocal[];
  pendientes: number;
}
