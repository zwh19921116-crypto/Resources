const siteMenuScript = document.createElement('script');
siteMenuScript.src = '../../site-menu.js';
document.body.appendChild(siteMenuScript);

const footer = document.querySelector('.site-footer');
if (footer) {
  footer.className = 'site-footer';
  footer.innerHTML = `<div class="container footer-grid">
    <nav class="footer-column" aria-label="Site links">
      <h2>Links</h2>
      <a href="../../index.html">Home</a>
      <a href="../../resources.html">Resources</a>
      <a href="#">Blogs</a>
      <a href="#">FAQ</a>
      <a href="#">Contact Us</a>
    </nav>
    <nav class="footer-column" aria-label="Resource links">
      <h2>Resources</h2>
      <a href="../../all-resources.html?type=interactive-app">Interactive Learning</a>
      <a href="../../all-resources.html?type=knowledge-sheet">VCE Study Tools</a>
      <a href="../../all-resources.html?type=practice-questions">VCE Practice Questions</a>
      <a href="../../all-resources.html?type=practice-exam">VCE Practice Exams</a>
    </nav>
    <nav class="footer-column" aria-label="Subject links">
      <h2>Subjects</h2>
      <a href="../../all-resources.html?q=VCE+Biology">VCE Biology</a>
      <a href="../../all-resources.html?q=VCE+Chemistry">VCE Chemistry</a>
      <a href="../../all-resources.html?q=VCE+Physics">VCE Physics</a>
      <a href="../../all-resources.html?q=VCE+Mathematics">VCE Mathematics</a>
    </nav>
    <nav class="footer-column" aria-label="Legal links">
      <h2>Legal</h2>
      <a href="#">Terms and Conditions</a>
      <a href="#">Payment and Refund</a>
      <a href="#">Privacy Policy</a>
      <a href="#">Child Safety</a>
    </nav>
  </div>`;
}

document.querySelectorAll('.resource-detail.has-inline-preview').forEach((article) => {
  const layout = article.querySelector('.resource-detail-layout');
  const related = article.querySelector('.related-resources');
  if (layout && related) layout.appendChild(related);
});
