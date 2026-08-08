import { Experience } from './core/Experience';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const experience = new Experience(container);
(window as unknown as { __EXP__: Experience }).__EXP__ = experience;
