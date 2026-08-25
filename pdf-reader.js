import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

async function mountPdfReader(reader) {
  const url = reader.dataset.pdfUrl;
  const canvas = reader.querySelector('canvas');
  const context = canvas.getContext('2d');
  const status = reader.querySelector('[data-pdf-status]');
  const pageLabel = reader.querySelector('[data-pdf-page]');
  const previous = reader.querySelector('[data-pdf-prev]');
  const next = reader.querySelector('[data-pdf-next]');
  const zoomOut = reader.querySelector('[data-pdf-zoom-out]');
  const zoomIn = reader.querySelector('[data-pdf-zoom-in]');
  const fallback = reader.querySelector('.pdf-reader-fallback');
  let documentProxy;
  let pageNumber = 1;
  let zoom = 1;
  let rendering = false;

  const showFallback = () => {
    reader.classList.add('is-fallback');
    fallback.hidden = false;
    status.textContent = '';
  };

  const render = async () => {
    if (rendering || !documentProxy) return;
    rendering = true;
    try {
      status.textContent = 'Rendering page';
      const page = await documentProxy.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, reader.clientWidth - 40);
      const scale = Math.min(2, availableWidth / base.width) * zoom;
      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
      pageLabel.textContent = `${pageNumber} / ${documentProxy.numPages}`;
      previous.disabled = pageNumber === 1;
      next.disabled = pageNumber === documentProxy.numPages;
      status.textContent = '';
    } catch (error) {
      showFallback();
    } finally {
      rendering = false;
    }
  };

  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('PDF load timed out')), 8000));
    documentProxy = await Promise.race([pdfjsLib.getDocument(url).promise, timeout]);
    await render();
  } catch (error) {
    showFallback();
  }

  previous.addEventListener('click', () => { if (pageNumber > 1) { pageNumber -= 1; render(); } });
  next.addEventListener('click', () => { if (documentProxy && pageNumber < documentProxy.numPages) { pageNumber += 1; render(); } });
  zoomOut.addEventListener('click', () => { zoom = Math.max(0.7, zoom - 0.15); render(); });
  zoomIn.addEventListener('click', () => { zoom = Math.min(1.5, zoom + 0.15); render(); });
}

document.querySelectorAll('.pdf-reader[data-pdf-url]').forEach(mountPdfReader);
