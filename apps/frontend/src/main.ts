import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { router } from './router';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(PiniaColada);
app.use(router);

void router.isReady().then(() => app.mount('#app'));
