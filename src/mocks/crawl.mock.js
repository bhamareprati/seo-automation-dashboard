// Added to the spec's mocks. The spec's sample site does not exist on the internet,
// so its crawl uses this page instead. Steps 4, 5 and 6 still run for real on this content.
// The page has deliberate flaws, so an audit has something honest to find.

const homepage = (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name}</title>
  <script src="/assets/jquery-3.7.1.min.js"></script>
  <script src="/assets/slider.bundle.js"></script>
  <link rel="stylesheet" href="/assets/site.css">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Dentist",
    "name": "${name}",
    "url": "https://example-dental-clinic.com"
  }
  </script>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "WebSite", "name": "${name}", }
  </script>
</head>
<body>
  <header>
    <img src="/assets/logo.png">
    <nav>
      <a href="/">Home</a>
      <a href="/services">Services</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <h1>Welcome to ${name}</h1>
    <h1>Your smile is our priority</h1>
    <img src="/assets/hero-large.jpg">
    <p>We have been caring for families in Pune for over twelve years. Our team offers
       general dentistry, tooth extraction, dental implants, root canal treatment and
       cosmetic dentistry in a calm and friendly clinic.</p>
    <h3>Our services</h3>
    <ul>
      <li><a href="/services/implants">Dental implants</a></li>
      <li><a href="/services/extraction">Tooth extraction</a></li>
      <li><a href="/services/root-canal">Root canal treatment</a></li>
    </ul>
    <img src="/assets/clinic.jpg" alt="Reception area of the clinic">
    <img src="/assets/team.jpg">
    <h2>Book an appointment</h2>
    <p>Call us on <a href="tel:+912000000000">+91 20 0000 0000</a> to book a visit.</p>
    <p>Follow us on <a href="https://www.facebook.com/example">Facebook</a>.</p>
  </main>
  <footer>
    <p>Copyright ${name}</p>
  </footer>
</body>
</html>`;

const robotsTxt = `User-agent: *
Disallow: /admin/

Sitemap: https://example-dental-clinic.com/sitemap.xml
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example-dental-clinic.com/</loc></url>
  <url><loc>https://example-dental-clinic.com/services</loc></url>
  <url><loc>https://example-dental-clinic.com/about</loc></url>
  <url><loc>https://example-dental-clinic.com/contact</loc></url>
</urlset>
`;

const FIXTURES = {
  'example-dental-clinic.com': 'Example Dental Clinic',
  'overdue-dental.example': 'Overdue Dental',
};

/** The sample site for a listed hostname, or null for any other website. */
function getCrawlFixture(hostname) {
  const name = FIXTURES[String(hostname).toLowerCase()];
  if (!name) return null;
  return {
    status: 200,
    html: homepage(name),
    responseMs: 640,
    contentEncoding: null,
    robotsTxt,
    sitemapXml,
  };
}

module.exports = { getCrawlFixture, FIXTURE_HOSTNAMES: Object.keys(FIXTURES) };
