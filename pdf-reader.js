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

  if (new URL(url, location.href).origin !== location.origin) {
    document.querySelector('.resource-faq')?.setAttribute('hidden', '');
    reader.closest('.resource-detail')?.querySelector('.crumbs > span:last-child')?.setAttribute('hidden', '');
    const details = reader.closest('.resource-detail-layout')?.querySelector('.resource-detail-copy');
    if (details) {
      details.style.display = 'flex';
      const heading = details.querySelector('h1');
      if (heading) {
        heading.hidden = true;
      }
      details.querySelectorAll('.btn-solutions').forEach((button) => {
        button.style.justifyContent = 'center';
        button.style.textAlign = 'center';
      });
      const backLink = details.querySelector('.resource-back');
      if (backLink) {
        backLink.classList.add('btn', 'btn-light', 'btn-block');
        backLink.style.display = 'flex';
        backLink.style.justifyContent = 'center';
        backLink.style.textAlign = 'center';
      }
    }
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.title = reader.querySelector('.pdf-reader-name')?.textContent || 'PDF document';
    frame.loading = 'eager';
    frame.setAttribute('allow', 'fullscreen');
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff';
    reader.replaceChildren(frame);
    return;
  }

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
      const renderTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('PDF render timed out')), 5000));
      await Promise.race([page.render({ canvasContext: context, viewport }).promise, renderTimeout]);
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

async function mountQuestionRegion(region) {
  const url = region.dataset.pdfUrl;
  const canvas = region.querySelector('canvas');
  const status = region.querySelector('span');
  const top = Math.max(0, Math.min(100, Number(region.dataset.pdfTop) || 0));
  const bottom = Math.max(top + 1, Math.min(100, Number(region.dataset.pdfBottom) || 100));
  try {
    const documentProxy = await pdfjsLib.getDocument(url).promise;
    const page = await documentProxy.getPage(Math.max(1, Number(region.dataset.pdfPage) || 1));
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(320, region.clientWidth - 24) / base.width);
    const viewport = page.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    region.style.height = `${Math.max(180, Math.floor(viewport.height * (bottom - top) / 100))}px`;
    canvas.style.position = 'absolute';
    canvas.style.top = `-${Math.floor(viewport.height * top / 100)}px`;
    status.remove();
  } catch (error) {
    region.classList.add('is-fallback');
    status.textContent = 'Open question to view this marked PDF region.';
  }
}

document.querySelectorAll('.question-region[data-pdf-url]').forEach(mountQuestionRegion);
