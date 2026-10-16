import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../dialog.directive';
import { Tarea } from '../../services/tarea.service';
import { NuevaEntrega } from '../../models/entrega-local';
@Component({selector:'app-entrega-form', standalone:true, imports:[FormsModule, DialogDirective], templateUrl:'./entrega-form.component.html'})
export class EntregaFormComponent implements OnInit {
  @Input() tareas: Tarea[] = [];
  @Input() tareaInicial: Tarea | null = null;
  @Input() guardando = false;
  @Input() errorGuardado = '';
  @Output() cancelar = new EventEmitter<void>();
  @Output() registrar = new EventEmitter<NuevaEntrega>();
  tareaId: number | null = null;
  comentario = '';
  usuario = 'Estudiante SENATI';
  tipo: 'Entrega' | 'Observación' = 'Entrega';
  validacion: {tarea?: string; comentario?: string; usuario?: string} = {};
  private readonly idRegistro = crypto.randomUUID();
  ngOnInit(): void {
    this.tareaId = this.tareaInicial?.id ?? null;
    this.tipo = this.tareaInicial?.estado === 'Completado' ? 'Observación' : 'Entrega';
  }
  get seleccionada(): Tarea | undefined { return this.tareas.find(t => t.id === this.tareaId); }
  cerrar(): void { if (!this.guardando) this.cancelar.emit(); }
  enviar(): void {
    if (this.guardando) return;
    const tarea = this.seleccionada;
    this.validacion = {};
    if (!tarea) this.validacion.tarea = 'Selecciona una tarea del catálogo.';
    if (!this.comentario.trim()) this.validacion.comentario = 'Escribe un comentario para la entrega.';
    else if (this.comentario.length > 5000) this.validacion.comentario = 'El comentario admite como máximo 5000 caracteres.';
    if (!this.usuario.trim()) this.validacion.usuario = 'Escribe el nombre del estudiante o instructor.';
    else if (this.usuario.length > 120) this.validacion.usuario = 'El nombre admite como máximo 120 caracteres.';
    if (Object.keys(this.validacion).length || !tarea) return;
    this.registrar.emit({idRegistro: this.idRegistro, tareaId: tarea.id, tituloTarea: tarea.titulo, curso: tarea.curso,
      comentario: this.comentario.trim(), usuario: this.usuario.trim(), tipo: this.tipo});
  }
}
