(() => {
  document.querySelectorAll('[data-share-button]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = button.dataset.shareUrl || window.location.href;
      const title = button.dataset.shareTitle || document.title;
      const status = button.parentElement?.querySelector('[data-share-status]');
      const setStatus = (message) => {
        if (status) status.textContent = message;
      };

      if (navigator.share) {
        try {
          await navigator.share({ title, url });
          setStatus('Shared');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setStatus('Link copied');
          return;
        }
      } catch (error) {
        setStatus('Copy was blocked');
      }

      window.prompt('Copy this link:', url);
    });
  });
})();
