import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist/senati-taskhub-pwa/browser');
const port = Number(process.env.PORT || 8080);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'};
http.createServer(async (req,res) => {
 try {
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  let file = target;
  try { if ((await stat(file)).isDirectory()) file = path.join(file,'index.html'); }
  catch { if (path.extname(pathname)) { res.writeHead(404); res.end('Not found'); return; } file = path.join(root,'index.html'); }
  const bytes = await readFile(file);
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'}); res.end(bytes);
 } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`SENATI TaskHub: http://localhost:${port}`));
