import { test, expect } from '@playwright/test';

/** Se ejecuta sobre producción. Cada prueba tiene almacenamiento de navegador aislado. */
test('T1–T8: catálogo, validación, persistencia offline, detalle, contador, reconexión y eliminación', async ({ page, context }, testInfo) => {
  const errores: string[] = [];
  page.on('pageerror', error => errores.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu aprendizaje sigue.' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    await fetch('/assets/data/tareas.json');
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tareas académicas' }).click();
  await page.getByRole('textbox', { name: 'Buscar por título de tarea' }).fill('SERVICE WORKER');
  await page.getByRole('combobox', { name: 'Filtrar por curso' }).selectOption('Desarrollo de Software PWA');
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('Ing. Jorge Luque');
  await page.screenshot({ path: testInfo.outputPath('01-tareas-filtradas.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Filtrar por curso' }).selectOption('Base de Datos Avanzada');
  await expect(page.locator('.task-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click();
  await expect(page.locator('.task-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Nueva entrega +' }).click();
  await page.getByRole('button', { name: 'Guardar registro local' }).click();
  await expect(page.getByText('Selecciona una tarea del catálogo.')).toBeVisible();
  await expect(page.getByText('Escribe un comentario para la entrega.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('02-validacion-formulario.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Tarea académica' }).selectOption({ label: 'Entregable 01: Configuración de Service Worker' });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.connection')).toHaveText('OFFLINE');
  await expect(page.locator('.task-card')).toHaveCount(2);
  for (const comentario of ['Entrega offline uno', 'Observación offline dos']) {
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    await page.getByRole('textbox', { name: 'Comentario u observación' }).fill(comentario);
    await page.getByRole('button', { name: 'Guardar registro local' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('Registro guardado en este dispositivo');
  }
  await page.getByRole('button', { name: 'Mis entregas locales' }).click();
  await expect(page.locator('.delivery')).toHaveCount(2);
  await expect(page.locator('.queue-status strong')).toHaveText('2 pendientes de sincronización');
  await page.screenshot({ path: testInfo.outputPath('03-bandeja-offline.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Mis entregas locales' }).click();
  await expect(page.locator('.delivery')).toHaveCount(2);
  await page.getByRole('button', { name: 'Ver detalle' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Intentos remotos');
  await expect(page.getByRole('dialog')).toContainText('PENDIENTE');
  await page.screenshot({ path: testInfo.outputPath('04-detalle-local.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cerrar detalle' }).click();
  const registros = await page.evaluate(async () => {
    return new Promise<unknown[]>((resolve, reject) => {
      const req = indexedDB.open('senatiTaskDB', 2);
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('entregas_pendientes'); const get = tx.objectStore('entregas_pendientes').getAll(); tx.oncomplete = () => { db.close(); resolve(get.result); }; tx.onerror = () => reject(tx.error); };
      req.onerror = () => reject(req.error);
    });
  });
  expect(registros).toHaveLength(2);
  await testInfo.attach('indexeddb-registros.json', { body: JSON.stringify(registros, null, 2), contentType: 'application/json' });

  await context.setOffline(false);
  await expect(page.locator('.connection')).toHaveText('ONLINE');
  await expect(page.getByText('Recuperaste la conexión.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('05-conexion-recuperada.png'), fullPage: true });
  await page.locator('.queue-status').getByRole('button', { name: 'Reintentar sincronización' }).click();
  await expect(page.getByRole('alert')).toContainText('No hay una API configurada');
  await expect(page.locator('.delivery .badge')).toHaveText(['PENDIENTE', 'PENDIENTE']);
  await page.screenshot({ path: testInfo.outputPath('06-reintento-sin-api.png'), fullPage: true });

  await page.getByRole('button', { name: 'Eliminar registro' }).first().click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('.delivery')).toHaveCount(2);
  await page.getByRole('button', { name: 'Eliminar registro' }).first().click();
  await page.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(page.locator('.delivery')).toHaveCount(1);
  await expect(page.locator('.queue-status strong')).toHaveText('1 pendientes de sincronización');
  await page.reload();
  await page.getByRole('button', { name: 'Mis entregas locales' }).click();
  await expect(page.locator('.delivery')).toHaveCount(1);
  const sw = await page.evaluate(async () => ({ controlador: navigator.serviceWorker.controller?.scriptURL, caches: await caches.keys(), catalogo: await (await caches.match('/assets/data/tareas.json'))?.json() }));
  expect(sw.controlador).toContain('ngsw-worker.js'); expect(sw.catalogo).toHaveLength(2);
  await testInfo.attach('serviceworker-cache.json', { body: JSON.stringify(sw, null, 2), contentType: 'application/json' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(errores).toEqual([]);
});
