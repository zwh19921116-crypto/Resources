const siteMenuScript = document.createElement('script');
siteMenuScript.src = '../../site-menu.js';
document.body.appendChild(siteMenuScript);

document.querySelectorAll('.resource-detail.has-inline-preview').forEach((article) => {
  const layout = article.querySelector('.resource-detail-layout');
  const related = article.querySelector('.related-resources');
  if (layout && related) layout.appendChild(related);
});
