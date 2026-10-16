import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { TareaService, Tarea } from './services/tarea.service';
import { StorageService } from './services/storage.service';
import { SincronizacionService } from './services/sincronizacion.service';
import { EntregaLocal, NuevaEntrega } from './models/entrega-local';
import { DialogDirective } from './dialog.directive';
import { TareasComponent } from './components/tareas/tareas.component';
import { EntregaFormComponent } from './components/entrega-form/entrega-form.component';
import { BandejaComponent } from './components/bandeja/bandeja.component';
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }>; }

@Component({
  selector: 'app-root', standalone: true,
  imports: [CommonModule, DialogDirective, TareasComponent, EntregaFormComponent, BandejaComponent],
  templateUrl: './app.component.html', styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly tareaService = inject(TareaService);
  private readonly storage = inject(StorageService);
  private readonly sincronizacion = inject(SincronizacionService);
  online = navigator.onLine;
  recuperoConexion = false;
  vista: 'dashboard' | 'tareas' | 'entregas' = 'dashboard';
  tareas: Tarea[] = [];
  entregas: EntregaLocal[] = [];
  pendientesLocales = 0;
  formularioAbierto = false;
  seleccion: Tarea | null = null;
  detalle: EntregaLocal | null = null;
  cargando = true;
  leyendoEntregas = false;
  guardando = false;
  eliminando = false;
  reintentando = false;
  errorGuardado = '';
  errorLectura = '';
  mensaje = '';
  error = false;
  falloCatalogo = false;
  origenLocal = false;
  eliminarId: number | null = null;
  promptInstalacion: InstallPrompt | null = null;
  instalada = matchMedia('(display-mode: standalone)').matches;
  private versionLectura = 0;
  get pendientes(): number { return this.tareas.filter(t => t.estado === 'Pendiente').length; }
  get completadas(): number { return this.tareas.filter(t => t.estado === 'Completado').length; }
  private readonly red = () => {
    const estabaOnline = this.online;
    this.online = navigator.onLine;
    if (!estabaOnline && this.online) { this.recuperoConexion = true; void this.cargarEntregas(); }
    if (!this.online) this.recuperoConexion = false;
  };
  private readonly foco = () => { void this.cargarEntregas(); };
  private readonly instalarEvento = (e: Event) => { e.preventDefault(); this.promptInstalacion = e as InstallPrompt; };
  private readonly instaladaEvento = () => { this.instalada = true; this.promptInstalacion = null; };
  private readonly controllerEvento = () => { void this.prepararCache(); };

  async ngOnInit(): Promise<void> {
    window.addEventListener('online', this.red); window.addEventListener('offline', this.red);
    window.addEventListener('focus', this.foco);
    window.addEventListener('beforeinstallprompt', this.instalarEvento); window.addEventListener('appinstalled', this.instaladaEvento);
    navigator.serviceWorker?.addEventListener('controllerchange', this.controllerEvento);
    await Promise.all([this.cargarTareas(), this.cargarEntregas()]);
  }
  ngOnDestroy(): void {
    window.removeEventListener('online', this.red); window.removeEventListener('offline', this.red);
    window.removeEventListener('focus', this.foco);
    window.removeEventListener('beforeinstallprompt', this.instalarEvento); window.removeEventListener('appinstalled', this.instaladaEvento);
    navigator.serviceWorker?.removeEventListener('controllerchange', this.controllerEvento);
  }
  private async prepararCache(): Promise<void> {
    try { await firstValueFrom(this.tareaService.obtenerTareas()); } catch { /* Se mantiene el respaldo local. */ }
  }
  async cargarTareas(): Promise<void> {
    if (this.cargando && this.tareas.length) return;
    this.cargando = true; this.falloCatalogo = false;
    try {
      this.tareas = await firstValueFrom(this.tareaService.obtenerTareas()); this.origenLocal = false;
      try { await this.storage.guardarCatalogo(this.tareas); }
      catch { this.notificar('Catálogo disponible; no se pudo crear su respaldo en IndexedDB.', true); }
    } catch {
      try { this.tareas = await this.storage.leerCatalogo(); this.origenLocal = this.tareas.length > 0; }
      catch { this.tareas = []; }
      this.falloCatalogo = !this.tareas.length;
    } finally { this.cargando = false; }
  }
  async cargarEntregas(): Promise<boolean> {
    const version = ++this.versionLectura;
    this.leyendoEntregas = true;
    try {
      const snapshot = await this.storage.obtenerBandeja();
      if (version !== this.versionLectura) return false;
      this.entregas = snapshot.entregas; this.pendientesLocales = snapshot.pendientes;
      this.errorLectura = ''; return true;
    } catch (error) {
      if (version === this.versionLectura) {
        this.errorLectura = this.describirError(error, 'Permite almacenamiento local en este navegador y vuelve a consultar.');
        this.notificar('No se pudo leer IndexedDB. No se han borrado tus registros.', true);
      }
      return false;
    } finally { if (version === this.versionLectura) this.leyendoEntregas = false; }
  }
  abrir(tarea: Tarea | null = null): void { this.seleccion = tarea; this.errorGuardado = ''; this.formularioAbierto = true; }
  cerrar(): void { if (!this.guardando) this.formularioAbierto = false; }
  async guardar(datos: NuevaEntrega): Promise<void> {
    if (this.guardando) return;
    if (!this.tareas.some(t => t.id === datos.tareaId && t.titulo === datos.tituloTarea && t.curso === datos.curso)) {
      this.errorGuardado = 'Selecciona una tarea válida del catálogo.'; return;
    }
    this.guardando = true; this.errorGuardado = '';
    try {
      await this.storage.guardarEntregaLocal(datos);
      this.formularioAbierto = false;
      const actualizado = await this.cargarEntregas();
      this.notificar(actualizado
        ? 'Registro guardado en este dispositivo. Estado: PENDIENTE. No se envió a un servidor.'
        : 'El registro se guardó en IndexedDB, pero no se pudo actualizar la bandeja. Pulsa Actualizar; no vuelvas a enviarlo.', !actualizado);
    } catch (error) {
      this.errorGuardado = this.describirError(error, 'No se pudo guardar en IndexedDB.') + ' Tu comentario sigue en el formulario; vuelve a intentarlo.';
      this.notificar('No se pudo guardar. Conservamos el formulario para que puedas reintentar.', true);
    } finally { this.guardando = false; }
  }
  async verDetalle(id: number): Promise<void> {
    try {
      const registro = await this.storage.obtenerEntrega(id);
      if (!registro) { this.notificar('El registro ya no está disponible. Actualiza la bandeja.', true); await this.cargarEntregas(); return; }
      this.detalle = registro;
    } catch (error) { this.notificar(this.describirError(error, 'No se pudo consultar el detalle en IndexedDB.'), true); }
  }
  pedirEliminar(id: number): void { if (!this.eliminando) { this.detalle = null; this.eliminarId = id; } }
  cancelarEliminacion(): void { if (!this.eliminando) this.eliminarId = null; }
  async eliminar(): Promise<void> {
    if (this.eliminarId === null || this.eliminando) return;
    this.eliminando = true;
    try {
      await this.storage.eliminarEntrega(this.eliminarId); this.eliminarId = null;
      const actualizado = await this.cargarEntregas();
      this.notificar(actualizado ? 'Registro local eliminado.' : 'Registro eliminado; no se pudo actualizar la bandeja. Pulsa Actualizar.', !actualizado);
    } catch (error) { this.notificar(this.describirError(error, 'No se pudo eliminar. El registro se conserva.'), true); }
    finally { this.eliminando = false; }
  }
  async reintentar(id?: number): Promise<void> {
    if (this.reintentando) return;
    this.reintentando = true;
    try {
      const resultado = await this.sincronizacion.reintentar(this.online, id);
      if (!await this.cargarEntregas()) return;
      this.notificar(resultado.mensaje);
      this.recuperoConexion = false;
    } catch (error) { this.notificar(this.describirError(error, 'No se pudo consultar la cola local. No se enviaron datos.'), true); }
    finally { this.reintentando = false; }
  }
  notificar(texto: string, error = false): void { this.mensaje = texto; this.error = error; }
  private describirError(error: unknown, alternativa: string): string { return error instanceof Error && error.message ? error.message : alternativa; }
  async exportar(): Promise<void> {
    try {
      const datos = await this.storage.listarEntregas();
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], {type: 'application/json'}));
      const a = document.createElement('a'); a.href = url; a.download = 'taskhub-entregas.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { this.notificar('No se pudo leer IndexedDB para crear el respaldo.', true); }
  }
  async instalar(): Promise<void> {
    if (!this.promptInstalacion) return;
    try {
      await this.promptInstalacion.prompt(); const resultado = await this.promptInstalacion.userChoice;
      if (resultado.outcome !== 'accepted') this.notificar('Puedes instalar TaskHub después desde el menú del navegador.');
    } catch { this.notificar('Usa la opción Instalar del navegador.', true); }
    finally { this.promptInstalacion = null; }
  }
}
