import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tarea } from '../../services/tarea.service';
@Component({selector: 'app-tareas', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './tareas.component.html'})
export class TareasComponent {
  @Input() tareas: Tarea[] = [];
  @Input() cargando = false;
  @Input() fallo = false;
  @Input() origenLocal = false;
  @Output() elegir = new EventEmitter<Tarea>();
  @Output() nueva = new EventEmitter<void>();
  @Output() recargar = new EventEmitter<void>();
  buscando = '';
  curso = '';
  estado = '';
  get cursos(): string[] { return [...new Set(this.tareas.map(t => t.curso))].sort(); }
  get visibles(): Tarea[] {
    const titulo = this.buscando.trim().toLocaleLowerCase('es');
    return this.tareas.filter(t => t.titulo.toLocaleLowerCase('es').includes(titulo)
      && (!this.curso || t.curso === this.curso) && (!this.estado || t.estado === this.estado));
  }
  limpiar(): void { this.buscando = ''; this.curso = ''; this.estado = ''; }
}
