import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';
@Directive({ selector: '[appDialog]', standalone: true })
export class DialogDirective implements AfterViewInit, OnDestroy {
    private element = inject<ElementRef<HTMLElement>>(ElementRef);
    private previous = document.activeElement as HTMLElement | null;
    ngAfterViewInit(): void { this.element.nativeElement.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled)')?.focus(); }
    @HostListener('keydown', ['$event'])
    key(event: KeyboardEvent): void {
        if (event.key !== 'Tab') return;
        const items = Array.from(this.element.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)'));
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    ngOnDestroy(): void { this.previous?.focus(); }
}
