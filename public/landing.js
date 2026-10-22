export function initLandingVideo() {
  const video = document.querySelector('#gameplay-preview');
  const toggle = document.querySelector('#video-toggle');
  const status = document.querySelector('#preview-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let unavailable = false;

  function showPlaybackState() {
    toggle.textContent = video.paused ? 'Play preview' : 'Pause preview';
    if (!unavailable) status.textContent = video.paused ? 'Preview paused.' : 'Playing a muted gameplay preview.';
  }
  function showMediaError() {
    if (unavailable) return;
    unavailable = true;
    video.autoplay = false;
    toggle.disabled = true;
    console.warn('Gameplay preview could not load.', video.error?.message || 'Video source unavailable.');
    status.textContent = 'Preview unavailable. Reconnect to watch, or try the live demo in the game below.';
  }
  async function playPreview() {
    try {
      await video.play();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        console.warn('Browser blocked preview autoplay:', error);
        status.textContent = 'Your browser paused autoplay. Select Play preview to watch.';
      } else if (error.name === 'AbortError' && video.paused) {
        showPlaybackState();
      } else {
        console.error('Gameplay preview playback failed:', error);
        showMediaError();
      }
    }
  }
  video.addEventListener('play', () => {
    toggle.textContent = 'Pause preview';
    if (!unavailable) status.textContent = 'Loading your muted gameplay preview...';
  });
  video.addEventListener('playing', showPlaybackState);
  video.addEventListener('pause', showPlaybackState);
  video.addEventListener('error', showMediaError);
  video.querySelector('source').addEventListener('error', showMediaError);
  toggle.addEventListener('click', () => video.paused ? playPreview() : video.pause());
  reducedMotion.addEventListener('change', event => {
    if (event.matches) {
      video.autoplay = false;
      video.pause();
      if (!unavailable) status.textContent = 'Reduced motion is on. Select Play preview when you are ready.';
    }
  });
  video.muted = true;
  if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
    showMediaError();
  } else if (reducedMotion.matches) {
    status.textContent = 'Reduced motion is on. Select Play preview when you are ready.';
  } else {
    video.autoplay = true;
    playPreview();
  }
  return { pause: () => video.pause() };
}
