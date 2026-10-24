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
  const fullscreen = reader.querySelector('[data-pdf-fullscreen]');
  const fallback = reader.querySelector('.pdf-reader-fallback');
  let documentProxy;
  let pageNumber = 1;
  let zoom = 1;
  let rendering = false;

  const updateFullscreenLabel = () => {
    if (fullscreen) fullscreen.textContent = document.fullscreenElement || reader.classList.contains('is-mobile-fullscreen') ? 'Exit full screen' : 'Full screen';
  };

  fullscreen?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (reader.classList.contains('is-mobile-fullscreen')) {
        reader.classList.remove('is-mobile-fullscreen');
        document.body.classList.remove('pdf-reader-fullscreen-open');
      } else if (typeof reader.requestFullscreen === 'function') {
        await reader.requestFullscreen();
      } else {
        reader.classList.add('is-mobile-fullscreen');
        document.body.classList.add('pdf-reader-fullscreen-open');
      }
    } catch (error) {
      reader.classList.add('is-mobile-fullscreen');
      document.body.classList.add('pdf-reader-fullscreen-open');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      reader.classList.remove('is-mobile-fullscreen');
      document.body.classList.add('pdf-reader-fullscreen-open');
    } else {
      document.body.classList.remove('pdf-reader-fullscreen-open');
    }
    updateFullscreenLabel();
  });

  const showFallback = () => {
    reader.classList.add('is-fallback');
    if (fallback) fallback.hidden = false;
    status.textContent = '';
  };

  const documentUrl = new URL(url, location.href);
  const canRenderExternalPdf = documentUrl.origin === 'https://files.edgeducate.com.au';
  if (documentUrl.origin !== location.origin && !canRenderExternalPdf) {
    document.querySelector('.resource-faq')?.setAttribute('hidden', '');
    reader.closest('.resource-detail')?.querySelector('.crumbs > span:last-child')?.setAttribute('hidden', '');
    const details = reader.closest('.resource-detail-layout')?.querySelector('.resource-detail-copy');
    if (details) {
      details.style.display = 'flex';
      const heading = details.querySelector('h1');
      if (heading) {
        heading.hidden = false;
        heading.style.width = '100%';
        heading.style.textAlign = 'center';
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
    const frameUrl = documentUrl;
    frameUrl.hash = 'page=1&view=Fit&zoom=page-fit';
    frame.src = frameUrl.href;
    frame.title = reader.querySelector('.pdf-reader-name')?.textContent || 'PDF document';
    frame.loading = 'eager';
    frame.className = 'pdf-reader-frame';
    frame.setAttribute('allow', 'fullscreen');
    frame.style.cssText = 'position:absolute;top:48px;right:0;bottom:0;left:0;width:100%;height:calc(100% - 48px);border:0;background:#fff';
    reader.querySelector('.pdf-reader-status')?.setAttribute('hidden', '');
    reader.querySelector('.pdf-reader-canvas')?.setAttribute('hidden', '');
    reader.querySelector('.pdf-reader-fallback')?.setAttribute('hidden', '');
    reader.append(frame);
    let iframeZoom = 1;
    const updateIframeZoom = () => {
      frame.style.transform = `scale(${iframeZoom})`;
      reader.style.overflow = iframeZoom > 1 ? 'auto' : 'hidden';
    };
    zoomOut?.addEventListener('click', () => {
      iframeZoom = Math.max(0.7, iframeZoom - 0.15);
      updateIframeZoom();
    });
    zoomIn?.addEventListener('click', () => {
      iframeZoom = Math.min(2, iframeZoom + 0.15);
      updateIframeZoom();
    });
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
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
    const data = await response.arrayBuffer();
    documentProxy = await Promise.race([pdfjsLib.getDocument({ data }).promise, timeout]);
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

document.querySelectorAll('.btn-solutions').forEach((solutionsLink) => {
  solutionsLink.href = 'solutions/index.html';
});

document.querySelectorAll('.resource-detail-copy dl > div').forEach((row) => {
  const label = row.querySelector('dt')?.textContent.trim().toLowerCase();
  if (label === 'solutions') row.querySelector('a')?.setAttribute('href', 'solutions/index.html');
});

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
