import { App } from './app/app';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(canvas);
void app.start();
