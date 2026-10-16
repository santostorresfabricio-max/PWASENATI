import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeEsPe from '@angular/common/locales/es-PE';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
registerLocaleData(localeEsPe);
bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
