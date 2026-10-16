import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EntregaLocal } from '../../models/entrega-local';
@Component({ selector: 'app-bandeja', standalone: true, imports: [CommonModule], templateUrl: './bandeja.component.html' })
export class BandejaComponent {
  @Input() entregas: EntregaLocal[] = [];
  @Input() pendientes = 0;
  @Input() online = false;
  @Input() cargando = false;
  @Input() errorLectura = '';
  @Input() reintentando = false;
  @Output() detalle = new EventEmitter<number>();
  @Output() eliminar = new EventEmitter<number>();
  @Output() recargar = new EventEmitter<void>();
  @Output() reintentar = new EventEmitter<void>();
  @Output() exportar = new EventEmitter<void>();
  @Output() nueva = new EventEmitter<void>();
}
