import { initPwa } from './pwa.js';

initPwa(message => {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.hidden = false;
});
const video = document.querySelector('video');
video.addEventListener('error', () => {
  document.querySelector('#video-status').textContent = 'The video could not load. Reconnect and try again, download the MP4, or use the live demo link below.';
});
