export function initPwa(notify, beforeDialog = () => {}) {
  let installPrompt;
  let offlineReady = false;
  const status = document.querySelector('#connection-status');
  const install = document.querySelector('#install');
  const dialog = document.querySelector('#install-dialog');
  const updateConnection = () => {
    if (!status) return;
    status.textContent = !navigator.onLine
      ? (offlineReady ? 'Offline. Still in your element.' : 'Offline. Reconnect to prepare offline play.')
      : (offlineReady ? 'Ready for offline play' : 'Preparing your offline happy place...');
  };
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    notify('Installed. A little joy is now on your home screen.');
  });
  install?.addEventListener('click', async () => {
    beforeDialog();
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
      } catch (error) {
        console.error('Install prompt failed:', error);
        notify('Automatic installation was unavailable. Use the browser menu or the instructions below.');
        dialog?.showModal();
      }
    } else if (dialog) {
      document.querySelector('#install-platform').textContent = matchMedia('(display-mode: standalone)').matches
        ? 'You are already enjoying the installed app.'
        : 'Keep your favorite little break one tap away. Choose the steps for your device:';
      dialog.showModal();
    }
  });
  dialog?.querySelectorAll('.dialog-close, .dialog-done').forEach(button => {
    button.addEventListener('click', () => dialog.close());
  });
  if ('serviceWorker' in navigator && window.isSecureContext) {
    updateConnection();
    navigator.serviceWorker.register('./sw.js').then(registration => {
      const watch = worker => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') notify('Offline setup did not finish. Reconnect and reload to try again.');
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify('An update is ready. Close all game tabs and reopen to use it.');
        });
      };
      if (registration.installing) watch(registration.installing);
      registration.addEventListener('updatefound', () => { if (registration.installing) watch(registration.installing); });
      return navigator.serviceWorker.ready;
    }).then(() => { offlineReady = true; updateConnection(); }).catch(error => {
      console.error('Offline setup failed:', error);
      if (status) status.textContent = 'Offline setup unavailable';
      notify('Offline setup failed. You can play online; reconnect and reload to retry.');
    });
  } else {
    if (status) status.textContent = 'Online only in this browser';
    notify('Offline installation requires a supported browser over HTTPS or localhost.');
  }
}
