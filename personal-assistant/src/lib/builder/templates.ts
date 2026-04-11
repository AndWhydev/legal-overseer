import type { WebsiteTemplate, WebsiteCategory } from './types'

// ---------------------------------------------------------------------------
// Built-in Template Library
// ---------------------------------------------------------------------------

/**
 * Agency Landing Page — Modern agency homepage with hero, services grid,
 * testimonials section, and CTA. Clean, professional design.
 */
const agencyLanding: WebsiteTemplate = {
  id: 'agency-landing',
  name: 'Agency Landing',
  description: 'Modern agency homepage with hero, services grid, testimonials, and call-to-action',
  category: 'agency',
  thumbnail: '/templates/agency-landing.png',
  variables: [
    { key: 'business_name', label: 'Business Name', type: 'text', default: 'Acme Agency' },
    { key: 'tagline', label: 'Tagline', type: 'text', default: 'We build digital experiences that grow your business' },
    { key: 'primary_color', label: 'Primary Color', type: 'color', default: '#2563eb' },
    { key: 'accent_color', label: 'Accent Color', type: 'color', default: '#f59e0b' },
    { key: 'phone', label: 'Phone Number', type: 'text', default: '(02) 9000 0000' },
    { key: 'email', label: 'Email', type: 'text', default: 'hello@example.com' },
  ],
  css: '',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{business_name}}</title>
<style>
:root {
  --primary: {{primary_color}};
  --accent: {{accent_color}};
  --bg: #ffffff;
  --text: #1e293b;
  --muted: #64748b;
  --surface: #f8fafc;
  --radius: 12px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text); line-height: 1.6; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
a { color: var(--primary); text-decoration: none; }

/* Nav */
nav { padding: 20px 0; border-bottom: 1px solid #e2e8f0; }
nav .inner { display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
nav .links { display: flex; gap: 32px; list-style: none; }
nav .links a { color: var(--muted); font-weight: 500; transition: color 0.2s; }
nav .links a:hover { color: var(--text); }

/* Hero */
.hero { padding: 100px 0 80px; text-align: center; }
.hero h1 { font-size: 3.5rem; font-weight: 800; line-height: 1.1; margin-bottom: 24px; letter-spacing: -0.02em; }
.hero p { font-size: 1.25rem; color: var(--muted); max-width: 600px; margin: 0 auto 40px; }
.btn { display: inline-block; padding: 14px 32px; border-radius: var(--radius); font-weight: 600; font-size: 1rem; transition: transform 0.2s, box-shadow 0.2s; cursor: pointer; border: none; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(37,99,235,0.3); }
.btn-outline { background: transparent; border: 2px solid var(--primary); color: var(--primary); margin-left: 12px; }

/* Services */
.services { padding: 80px 0; background: var(--surface); }
.services h2 { text-align: center; font-size: 2.25rem; font-weight: 700; margin-bottom: 16px; }
.services .subtitle { text-align: center; color: var(--muted); margin-bottom: 48px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px; }
.card { background: var(--bg); padding: 32px; border-radius: var(--radius); box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.card h3 { font-size: 1.25rem; margin-bottom: 12px; }
.card p { color: var(--muted); font-size: 0.95rem; }
.card .icon { width: 48px; height: 48px; background: var(--primary); border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; color: #fff; font-size: 1.5rem; }

/* Testimonials */
.testimonials { padding: 80px 0; }
.testimonials h2 { text-align: center; font-size: 2.25rem; font-weight: 700; margin-bottom: 48px; }
.testimonial-card { background: var(--surface); padding: 32px; border-radius: var(--radius); margin-bottom: 24px; }
.testimonial-card p { font-style: italic; color: var(--muted); margin-bottom: 16px; }
.testimonial-card .author { font-weight: 600; }

/* CTA */
.cta { padding: 80px 0; background: var(--primary); color: #fff; text-align: center; }
.cta h2 { font-size: 2.5rem; font-weight: 700; margin-bottom: 16px; }
.cta p { opacity: 0.9; margin-bottom: 32px; font-size: 1.125rem; }
.btn-white { background: #fff; color: var(--primary); }

/* Footer */
footer { padding: 40px 0; border-top: 1px solid #e2e8f0; text-align: center; color: var(--muted); font-size: 0.875rem; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2.25rem; }
  nav .links { display: none; }
  .grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<nav><div class="container inner">
  <div class="logo">{{business_name}}</div>
  <ul class="links">
    <li><a href="#services">Services</a></li>
    <li><a href="#testimonials">Testimonials</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</div></nav>

<section class="hero"><div class="container">
  <h1>{{tagline}}</h1>
  <p>We help businesses like yours stand out online with strategy, design, and technology that delivers results.</p>
  <a href="#contact" class="btn btn-primary">Get Started</a>
  <a href="#services" class="btn btn-outline">Our Services</a>
</div></section>

<section class="services" id="services"><div class="container">
  <h2>What We Do</h2>
  <p class="subtitle">Full-service digital solutions for modern businesses</p>
  <div class="grid">
    <div class="card"><div class="icon">&lt;/&gt;</div><h3>Web Development</h3><p>Custom websites and web applications built with modern technology.</p></div>
    <div class="card"><div class="icon">&#x1F3A8;</div><h3>Brand Design</h3><p>Visual identity that captures your brand essence and resonates with your audience.</p></div>
    <div class="card"><div class="icon">&#x1F4C8;</div><h3>Digital Marketing</h3><p>SEO, paid advertising, and content strategies that drive growth.</p></div>
  </div>
</div></section>

<section class="testimonials" id="testimonials"><div class="container">
  <h2>What Our Clients Say</h2>
  <div class="grid">
    <div class="testimonial-card"><p>"They transformed our online presence completely. Highly recommended."</p><div class="author">Sarah M. — Business Owner</div></div>
    <div class="testimonial-card"><p>"Professional, responsive, and delivered beyond our expectations."</p><div class="author">James K. — Marketing Director</div></div>
  </div>
</div></section>

<section class="cta" id="contact"><div class="container">
  <h2>Ready to Get Started?</h2>
  <p>Contact us today for a free consultation — {{phone}} or {{email}}</p>
  <a href="mailto:{{email}}" class="btn btn-white">Get in Touch</a>
</div></section>

<footer><div class="container">&copy; 2026 {{business_name}}. All rights reserved.</div></footer>
</body>
</html>`,
}

/**
 * Trades & Services — Tradesperson site with hero photo area, service list,
 * quote request form placeholder, and Google Maps placeholder.
 */
const tradesServices: WebsiteTemplate = {
  id: 'trades-services',
  name: 'Trades & Services',
  description: 'Tradesperson site with hero, service list, quote request form, and location map',
  category: 'trades',
  thumbnail: '/templates/trades-services.png',
  variables: [
    { key: 'business_name', label: 'Business Name', type: 'text', default: 'Smith Plumbing' },
    { key: 'trade_type', label: 'Trade Type', type: 'text', default: 'Plumbing' },
    { key: 'service_area', label: 'Service Area', type: 'text', default: 'Sydney Metro' },
    { key: 'primary_color', label: 'Primary Color', type: 'color', default: '#0f766e' },
    { key: 'phone', label: 'Phone Number', type: 'text', default: '0400 000 000' },
  ],
  css: '',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{business_name}} — {{trade_type}} in {{service_area}}</title>
<style>
:root {
  --primary: {{primary_color}};
  --bg: #ffffff;
  --text: #1e293b;
  --muted: #64748b;
  --surface: #f1f5f9;
  --radius: 8px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text); line-height: 1.6; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
a { color: var(--primary); text-decoration: none; }

/* Nav */
nav { background: var(--primary); color: #fff; padding: 16px 0; }
nav .inner { display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-size: 1.5rem; font-weight: 700; color: #fff; }
nav .cta-phone { background: #fff; color: var(--primary); padding: 10px 24px; border-radius: var(--radius); font-weight: 700; font-size: 1rem; }

/* Hero */
.hero { background: linear-gradient(135deg, var(--primary), #065f5b); color: #fff; padding: 80px 0; text-align: center; }
.hero h1 { font-size: 3rem; font-weight: 800; margin-bottom: 16px; }
.hero p { font-size: 1.25rem; opacity: 0.9; margin-bottom: 32px; }
.btn { display: inline-block; padding: 14px 32px; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-size: 1rem; }
.btn-white { background: #fff; color: var(--primary); }

/* Services */
.services { padding: 80px 0; }
.services h2 { text-align: center; font-size: 2rem; font-weight: 700; margin-bottom: 48px; }
.service-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; }
.service-item { background: var(--surface); padding: 24px; border-radius: var(--radius); border-left: 4px solid var(--primary); }
.service-item h3 { margin-bottom: 8px; }
.service-item p { color: var(--muted); font-size: 0.9rem; }

/* Quote Form */
.quote { padding: 80px 0; background: var(--surface); }
.quote h2 { text-align: center; font-size: 2rem; font-weight: 700; margin-bottom: 32px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 600px; margin: 0 auto; }
.form-grid input, .form-grid textarea, .form-grid select { padding: 12px 16px; border: 1px solid #cbd5e1; border-radius: var(--radius); font-size: 1rem; font-family: inherit; }
.form-grid textarea { grid-column: 1 / -1; min-height: 120px; resize: vertical; }
.form-grid .submit { grid-column: 1 / -1; background: var(--primary); color: #fff; padding: 14px; border: none; border-radius: var(--radius); font-size: 1rem; font-weight: 600; cursor: pointer; }

/* Area */
.area { padding: 60px 0; text-align: center; }
.area h2 { font-size: 2rem; font-weight: 700; margin-bottom: 16px; }
.area p { color: var(--muted); max-width: 500px; margin: 0 auto 24px; }
.map-placeholder { background: var(--surface); height: 300px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 1.125rem; }

/* Footer */
footer { background: var(--text); color: #94a3b8; padding: 40px 0; text-align: center; font-size: 0.875rem; }
footer a { color: #fff; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .form-grid { grid-template-columns: 1fr; }
  .service-list { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<nav><div class="container inner">
  <div class="logo">{{business_name}}</div>
  <a href="tel:{{phone}}" class="cta-phone">Call {{phone}}</a>
</div></nav>

<section class="hero"><div class="container">
  <h1>Professional {{trade_type}} in {{service_area}}</h1>
  <p>Licensed, insured, and trusted by hundreds of local families and businesses.</p>
  <a href="#quote" class="btn btn-white">Get a Free Quote</a>
</div></section>

<section class="services"><div class="container">
  <h2>Our Services</h2>
  <div class="service-list">
    <div class="service-item"><h3>Emergency Repairs</h3><p>24/7 emergency callouts. Fast response times across {{service_area}}.</p></div>
    <div class="service-item"><h3>New Installations</h3><p>Quality installations for residential and commercial properties.</p></div>
    <div class="service-item"><h3>Maintenance</h3><p>Regular maintenance plans to prevent costly breakdowns.</p></div>
    <div class="service-item"><h3>Renovations</h3><p>Expert {{trade_type}} work for bathroom and kitchen renovations.</p></div>
  </div>
</div></section>

<section class="quote" id="quote"><div class="container">
  <h2>Request a Free Quote</h2>
  <form class="form-grid" onsubmit="event.preventDefault()">
    <input type="text" placeholder="Your Name" required>
    <input type="tel" placeholder="Phone Number" required>
    <input type="email" placeholder="Email" style="grid-column: 1 / -1">
    <textarea placeholder="Describe the work needed..."></textarea>
    <button type="submit" class="submit">Request Quote</button>
  </form>
</div></section>

<section class="area"><div class="container">
  <h2>Serving {{service_area}}</h2>
  <p>We cover the entire {{service_area}} area with fast, reliable service.</p>
  <div class="map-placeholder">Map — {{service_area}}</div>
</div></section>

<footer><div class="container">
  <p>&copy; 2026 {{business_name}} — Licensed {{trade_type}} | <a href="tel:{{phone}}">{{phone}}</a></p>
</div></footer>
</body>
</html>`,
}

/**
 * Professional Services — Accountant, lawyer, or consultant site with about,
 * services, team section, and contact form.
 */
const professionalServices: WebsiteTemplate = {
  id: 'professional-services',
  name: 'Professional Services',
  description: 'Accountant, lawyer, or consultant site with about, services, team, and contact',
  category: 'professional',
  thumbnail: '/templates/professional-services.png',
  variables: [
    { key: 'business_name', label: 'Business Name', type: 'text', default: 'Parker & Associates' },
    { key: 'profession', label: 'Profession', type: 'text', default: 'Accounting & Advisory' },
    { key: 'primary_color', label: 'Primary Color', type: 'color', default: '#1e3a5f' },
    { key: 'accent_color', label: 'Accent Color', type: 'color', default: '#c4922a' },
  ],
  css: '',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{business_name}} — {{profession}}</title>
<style>
:root {
  --primary: {{primary_color}};
  --accent: {{accent_color}};
  --bg: #ffffff;
  --text: #1e293b;
  --muted: #64748b;
  --surface: #f8fafc;
  --radius: 8px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Georgia', 'Times New Roman', serif; color: var(--text); line-height: 1.7; }
h1, h2, h3, nav { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }
a { color: var(--primary); text-decoration: none; }

/* Nav */
nav { background: var(--primary); padding: 16px 0; }
nav .inner { display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-size: 1.25rem; font-weight: 700; color: #fff; letter-spacing: 0.02em; }
nav .links { display: flex; gap: 28px; list-style: none; }
nav .links a { color: rgba(255,255,255,0.8); font-weight: 500; font-size: 0.9rem; }
nav .links a:hover { color: #fff; }

/* Hero */
.hero { background: var(--primary); color: #fff; padding: 80px 0 60px; }
.hero h1 { font-size: 2.75rem; font-weight: 700; margin-bottom: 16px; }
.hero p { font-size: 1.125rem; opacity: 0.85; max-width: 600px; margin-bottom: 32px; }
.btn { display: inline-block; padding: 12px 28px; border-radius: var(--radius); font-weight: 600; font-size: 0.95rem; border: none; cursor: pointer; font-family: -apple-system, sans-serif; }
.btn-accent { background: var(--accent); color: #fff; }
.divider { width: 60px; height: 3px; background: var(--accent); margin-bottom: 24px; }

/* About */
.about { padding: 80px 0; }
.about h2 { font-size: 2rem; margin-bottom: 8px; }
.about .text-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 24px; }
.about p { color: var(--muted); }

/* Services */
.services { padding: 80px 0; background: var(--surface); }
.services h2 { text-align: center; font-size: 2rem; margin-bottom: 48px; }
.services .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 24px; }
.services .card { background: #fff; padding: 28px; border-radius: var(--radius); border-top: 3px solid var(--accent); }
.services .card h3 { margin-bottom: 8px; font-size: 1.1rem; }
.services .card p { color: var(--muted); font-size: 0.9rem; }

/* Team */
.team { padding: 80px 0; }
.team h2 { text-align: center; font-size: 2rem; margin-bottom: 48px; }
.team .members { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; text-align: center; }
.team .member-photo { width: 120px; height: 120px; background: var(--surface); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 2rem; }
.team .member h3 { font-size: 1rem; margin-bottom: 4px; }
.team .member p { color: var(--muted); font-size: 0.85rem; }

/* Contact */
.contact { padding: 80px 0; background: var(--primary); color: #fff; }
.contact h2 { text-align: center; font-size: 2rem; margin-bottom: 32px; }
.contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; max-width: 800px; margin: 0 auto; }
.contact-info p { opacity: 0.85; margin-bottom: 12px; }
.contact form input, .contact form textarea { width: 100%; padding: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.1); color: #fff; border-radius: var(--radius); font-size: 0.95rem; font-family: inherit; }
.contact form textarea { min-height: 100px; resize: vertical; }
.contact form input::placeholder, .contact form textarea::placeholder { color: rgba(255,255,255,0.5); }

/* Footer */
footer { padding: 24px 0; background: #0f1b2d; color: rgba(255,255,255,0.5); text-align: center; font-size: 0.8rem; font-family: -apple-system, sans-serif; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  .about .text-cols, .contact-grid { grid-template-columns: 1fr; }
  nav .links { display: none; }
}
</style>
</head>
<body>
<nav><div class="container inner">
  <div class="logo">{{business_name}}</div>
  <ul class="links">
    <li><a href="#about">About</a></li>
    <li><a href="#services">Services</a></li>
    <li><a href="#team">Team</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</div></nav>

<section class="hero"><div class="container">
  <div class="divider"></div>
  <h1>{{business_name}}</h1>
  <p>Trusted {{profession}} services helping businesses and individuals achieve their financial goals with confidence.</p>
  <a href="#contact" class="btn btn-accent">Book a Consultation</a>
</div></section>

<section class="about" id="about"><div class="container">
  <h2>About Us</h2>
  <div class="divider"></div>
  <div class="text-cols">
    <p>With decades of combined experience, {{business_name}} provides expert {{profession}} services tailored to your unique needs. We believe in building long-term relationships based on trust and results.</p>
    <p>Our team stays at the forefront of industry changes to ensure you receive the most current and effective advice. Whether you are an individual or a growing business, we have the expertise to help.</p>
  </div>
</div></section>

<section class="services" id="services"><div class="container">
  <h2>Our Services</h2>
  <div class="grid">
    <div class="card"><h3>Tax Planning</h3><p>Strategic tax planning to minimise your obligations and maximise returns.</p></div>
    <div class="card"><h3>Business Advisory</h3><p>Expert guidance on business structure, growth strategy, and compliance.</p></div>
    <div class="card"><h3>Financial Reporting</h3><p>Clear, accurate financial reports that help you make informed decisions.</p></div>
    <div class="card"><h3>Compliance & Audit</h3><p>Ensure your business meets all regulatory requirements with confidence.</p></div>
  </div>
</div></section>

<section class="team" id="team"><div class="container">
  <h2>Our Team</h2>
  <div class="members">
    <div class="member"><div class="member-photo">JP</div><h3>Jane Parker</h3><p>Principal</p></div>
    <div class="member"><div class="member-photo">MR</div><h3>Michael Ross</h3><p>Senior Associate</p></div>
    <div class="member"><div class="member-photo">SL</div><h3>Sarah Lee</h3><p>Associate</p></div>
  </div>
</div></section>

<section class="contact" id="contact"><div class="container">
  <h2>Get in Touch</h2>
  <div class="contact-grid">
    <div class="contact-info">
      <p>We would love to hear from you. Book a free initial consultation to discuss how we can help.</p>
      <p>Level 10, 100 Market Street<br>Sydney NSW 2000</p>
      <p>Mon - Fri: 8:30am - 5:30pm</p>
    </div>
    <form onsubmit="event.preventDefault()">
      <input type="text" placeholder="Your Name" required>
      <input type="email" placeholder="Email Address" required>
      <input type="tel" placeholder="Phone (optional)">
      <textarea placeholder="How can we help?"></textarea>
      <button type="submit" class="btn btn-accent" style="width:100%">Send Message</button>
    </form>
  </div>
</div></section>

<footer><div class="container">&copy; 2026 {{business_name}}. All rights reserved.</div></footer>
</body>
</html>`,
}

/**
 * Restaurant / Cafe — Menu showcase, hours, location, reservation CTA.
 * Warm, inviting design.
 */
const restaurantCafe: WebsiteTemplate = {
  id: 'restaurant-cafe',
  name: 'Restaurant & Cafe',
  description: 'Menu showcase, opening hours, location, and reservation call-to-action',
  category: 'restaurant',
  thumbnail: '/templates/restaurant-cafe.png',
  variables: [
    { key: 'business_name', label: 'Restaurant Name', type: 'text', default: 'The Golden Fork' },
    { key: 'cuisine_type', label: 'Cuisine Type', type: 'text', default: 'Modern Australian' },
    { key: 'primary_color', label: 'Primary Color', type: 'color', default: '#92400e' },
    { key: 'address', label: 'Address', type: 'text', default: '42 Crown Street, Surry Hills NSW' },
    { key: 'phone', label: 'Phone Number', type: 'text', default: '(02) 9000 0000' },
  ],
  css: '',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{business_name}} — {{cuisine_type}}</title>
<style>
:root {
  --primary: {{primary_color}};
  --bg: #fffbf5;
  --text: #292524;
  --muted: #78716c;
  --surface: #fef3c7;
  --dark: #1c1917;
  --radius: 8px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Georgia', serif; color: var(--text); line-height: 1.7; background: var(--bg); }
h1, h2, h3, nav, .btn, footer { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.container { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
a { color: var(--primary); text-decoration: none; }

/* Nav */
nav { padding: 20px 0; }
nav .inner { display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); font-family: 'Georgia', serif; letter-spacing: 0.02em; }
nav .links { display: flex; gap: 28px; list-style: none; }
nav .links a { color: var(--muted); font-weight: 500; font-size: 0.9rem; }

/* Hero */
.hero { background: var(--dark); color: #fff; padding: 100px 0; text-align: center; }
.hero h1 { font-size: 3rem; font-weight: 400; font-family: 'Georgia', serif; margin-bottom: 12px; letter-spacing: 0.04em; }
.hero .cuisine { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.85rem; color: var(--surface); margin-bottom: 32px; font-family: -apple-system, sans-serif; }
.btn { display: inline-block; padding: 14px 32px; border-radius: var(--radius); font-weight: 600; border: none; cursor: pointer; font-size: 0.95rem; }
.btn-warm { background: var(--primary); color: #fff; }
.btn-outline-light { background: transparent; border: 1px solid rgba(255,255,255,0.4); color: #fff; margin-left: 12px; }

/* Menu */
.menu { padding: 80px 0; }
.menu h2 { text-align: center; font-size: 2rem; font-family: 'Georgia', serif; margin-bottom: 8px; }
.menu .subtitle { text-align: center; color: var(--muted); margin-bottom: 48px; font-size: 0.95rem; }
.menu-section { margin-bottom: 40px; }
.menu-section h3 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--primary); border-bottom: 1px solid #e7e5e4; padding-bottom: 8px; margin-bottom: 16px; }
.menu-item { display: flex; justify-content: space-between; padding: 8px 0; }
.menu-item .name { font-weight: 500; }
.menu-item .desc { color: var(--muted); font-size: 0.85rem; }
.menu-item .price { font-weight: 600; white-space: nowrap; margin-left: 16px; }

/* Hours */
.hours { padding: 60px 0; background: var(--surface); text-align: center; }
.hours h2 { font-size: 1.75rem; font-family: 'Georgia', serif; margin-bottom: 24px; }
.hours-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; max-width: 600px; margin: 0 auto; }
.hours-item { padding: 12px; }
.hours-item .day { font-weight: 600; font-family: -apple-system, sans-serif; }
.hours-item .time { color: var(--muted); font-size: 0.9rem; }

/* Location */
.location { padding: 60px 0; text-align: center; }
.location h2 { font-size: 1.75rem; font-family: 'Georgia', serif; margin-bottom: 16px; }
.location p { color: var(--muted); margin-bottom: 24px; }
.map-placeholder { background: #e7e5e4; height: 280px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--muted); }

/* CTA */
.reserve { padding: 80px 0; background: var(--dark); color: #fff; text-align: center; }
.reserve h2 { font-size: 2.25rem; font-family: 'Georgia', serif; margin-bottom: 16px; }
.reserve p { opacity: 0.7; margin-bottom: 32px; }

/* Footer */
footer { padding: 32px 0; text-align: center; color: var(--muted); font-size: 0.8rem; border-top: 1px solid #e7e5e4; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2rem; }
  nav .links { display: none; }
}
</style>
</head>
<body>
<nav><div class="container inner">
  <div class="logo">{{business_name}}</div>
  <ul class="links">
    <li><a href="#menu">Menu</a></li>
    <li><a href="#hours">Hours</a></li>
    <li><a href="#location">Location</a></li>
    <li><a href="#reserve">Reserve</a></li>
  </ul>
</div></nav>

<section class="hero"><div class="container">
  <div class="cuisine">{{cuisine_type}}</div>
  <h1>{{business_name}}</h1>
  <a href="#reserve" class="btn btn-warm">Reserve a Table</a>
  <a href="#menu" class="btn btn-outline-light">View Menu</a>
</div></section>

<section class="menu" id="menu"><div class="container">
  <h2>Our Menu</h2>
  <p class="subtitle">Seasonal dishes crafted with local ingredients</p>
  <div class="menu-section">
    <h3>Starters</h3>
    <div class="menu-item"><div><span class="name">Burrata & Heirloom Tomato</span><div class="desc">Fresh burrata, vine-ripened tomatoes, basil oil</div></div><span class="price">$22</span></div>
    <div class="menu-item"><div><span class="name">Crispy Calamari</span><div class="desc">Lemon aioli, pickled chilli</div></div><span class="price">$18</span></div>
    <div class="menu-item"><div><span class="name">Seasonal Soup</span><div class="desc">Ask your server for today's selection</div></div><span class="price">$16</span></div>
  </div>
  <div class="menu-section">
    <h3>Mains</h3>
    <div class="menu-item"><div><span class="name">Grilled Barramundi</span><div class="desc">Roasted vegetables, herb butter, lemon</div></div><span class="price">$38</span></div>
    <div class="menu-item"><div><span class="name">Wagyu Burger</span><div class="desc">Brioche bun, smoked cheddar, truffle fries</div></div><span class="price">$32</span></div>
    <div class="menu-item"><div><span class="name">Wild Mushroom Risotto</span><div class="desc">Porcini, parmesan, truffle oil</div></div><span class="price">$28</span></div>
  </div>
</div></section>

<section class="hours" id="hours"><div class="container">
  <h2>Opening Hours</h2>
  <div class="hours-grid">
    <div class="hours-item"><div class="day">Monday - Thursday</div><div class="time">11:30am - 9:30pm</div></div>
    <div class="hours-item"><div class="day">Friday - Saturday</div><div class="time">11:30am - 10:30pm</div></div>
    <div class="hours-item"><div class="day">Sunday</div><div class="time">10:00am - 9:00pm</div></div>
  </div>
</div></section>

<section class="location" id="location"><div class="container">
  <h2>Find Us</h2>
  <p>{{address}} | {{phone}}</p>
  <div class="map-placeholder">Map — {{address}}</div>
</div></section>

<section class="reserve" id="reserve"><div class="container">
  <h2>Reserve Your Table</h2>
  <p>Call us at {{phone}} or book online</p>
  <a href="tel:{{phone}}" class="btn btn-warm">Call to Reserve</a>
</div></section>

<footer><div class="container">&copy; 2026 {{business_name}}. All rights reserved.</div></footer>
</body>
</html>`,
}

/**
 * Portfolio — Minimal portfolio / personal brand site with grid gallery,
 * about section, and contact.
 */
const portfolio: WebsiteTemplate = {
  id: 'portfolio',
  name: 'Portfolio',
  description: 'Minimal portfolio or personal brand site with grid gallery, about, and contact',
  category: 'portfolio',
  thumbnail: '/templates/portfolio.png',
  variables: [
    { key: 'business_name', label: 'Name', type: 'text', default: 'Alex Chen' },
    { key: 'tagline', label: 'Tagline', type: 'text', default: 'Designer & Creative Director' },
    { key: 'primary_color', label: 'Primary Color', type: 'color', default: '#18181b' },
  ],
  css: '',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{business_name}} — {{tagline}}</title>
<style>
:root {
  --primary: {{primary_color}};
  --bg: #fafafa;
  --text: #18181b;
  --muted: #71717a;
  --surface: #f4f4f5;
  --radius: 8px;
}
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text); line-height: 1.6; background: var(--bg); }
.container { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
a { color: var(--text); text-decoration: none; }

/* Nav */
nav { padding: 24px 0; }
nav .inner { display: flex; justify-content: space-between; align-items: center; }
nav .logo { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; }
nav .links { display: flex; gap: 28px; list-style: none; }
nav .links a { color: var(--muted); font-size: 0.9rem; font-weight: 500; }
nav .links a:hover { color: var(--text); }

/* Hero */
.hero { padding: 100px 0 60px; }
.hero h1 { font-size: 3.5rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 16px; }
.hero p { font-size: 1.25rem; color: var(--muted); max-width: 500px; }

/* Work Grid */
.work { padding: 60px 0; }
.work h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 32px; }
.work-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.work-item { aspect-ratio: 4/3; background: var(--surface); border-radius: var(--radius); overflow: hidden; position: relative; cursor: pointer; transition: transform 0.2s; display: flex; align-items: center; justify-content: center; }
.work-item:hover { transform: scale(1.02); }
.work-item .label { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 20px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: #fff; }
.work-item .label h3 { font-size: 1rem; margin-bottom: 2px; }
.work-item .label p { font-size: 0.8rem; opacity: 0.8; }
.work-item .placeholder { color: var(--muted); font-size: 0.9rem; }

/* About */
.about { padding: 80px 0; }
.about .grid { display: grid; grid-template-columns: 1fr 2fr; gap: 48px; align-items: start; }
.about h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); margin-bottom: 16px; }
.about .photo { width: 100%; aspect-ratio: 1; background: var(--surface); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--muted); }
.about p { color: var(--muted); margin-bottom: 16px; }

/* Contact */
.contact { padding: 80px 0; border-top: 1px solid #e4e4e7; }
.contact h2 { font-size: 2rem; font-weight: 700; margin-bottom: 16px; }
.contact p { color: var(--muted); margin-bottom: 32px; }
.contact .links-row { display: flex; gap: 24px; }
.contact .links-row a { color: var(--text); font-weight: 600; border-bottom: 2px solid var(--text); padding-bottom: 2px; }

/* Footer */
footer { padding: 32px 0; text-align: center; color: var(--muted); font-size: 0.8rem; }

@media (max-width: 768px) {
  .hero h1 { font-size: 2.5rem; }
  .work-grid { grid-template-columns: 1fr; }
  .about .grid { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<nav><div class="container inner">
  <div class="logo">{{business_name}}</div>
  <ul class="links">
    <li><a href="#work">Work</a></li>
    <li><a href="#about">About</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</div></nav>

<section class="hero"><div class="container">
  <h1>{{business_name}}</h1>
  <p>{{tagline}}</p>
</div></section>

<section class="work" id="work"><div class="container">
  <h2>Selected Work</h2>
  <div class="work-grid">
    <div class="work-item"><span class="placeholder">Project 1</span><div class="label"><h3>Brand Identity</h3><p>Branding, Identity</p></div></div>
    <div class="work-item"><span class="placeholder">Project 2</span><div class="label"><h3>Web Design</h3><p>Design, Development</p></div></div>
    <div class="work-item"><span class="placeholder">Project 3</span><div class="label"><h3>Mobile App</h3><p>UI/UX, Mobile</p></div></div>
    <div class="work-item"><span class="placeholder">Project 4</span><div class="label"><h3>Campaign</h3><p>Art Direction</p></div></div>
  </div>
</div></section>

<section class="about" id="about"><div class="container">
  <h2>About</h2>
  <div class="grid">
    <div class="photo">Photo</div>
    <div>
      <p>I am a designer and creative director with over 10 years of experience crafting digital experiences for brands that want to make an impact.</p>
      <p>My work spans brand identity, web design, and art direction. I believe in simplicity, attention to detail, and designs that serve real people.</p>
      <p>Currently available for select freelance projects and collaborations.</p>
    </div>
  </div>
</div></section>

<section class="contact" id="contact"><div class="container">
  <h2>Let's Work Together</h2>
  <p>Have a project in mind? I'd love to hear about it.</p>
  <div class="links-row">
    <a href="mailto:hello@example.com">Email</a>
    <a href="#">LinkedIn</a>
    <a href="#">Dribbble</a>
  </div>
</div></section>

<footer><div class="container">&copy; 2026 {{business_name}}</div></footer>
</body>
</html>`,
}

// ---------------------------------------------------------------------------
// Template Library
// ---------------------------------------------------------------------------

/** All built-in starter templates */
export const BUILT_IN_TEMPLATES: WebsiteTemplate[] = [
  agencyLanding,
  tradesServices,
  professionalServices,
  restaurantCafe,
  portfolio,
]

/** Get a template by ID */
export function getTemplate(id: string): WebsiteTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((t) => t.id === id)
}

/** List templates, optionally filtered by category */
export function listTemplates(category?: WebsiteCategory): WebsiteTemplate[] {
  if (!category) return BUILT_IN_TEMPLATES
  return BUILT_IN_TEMPLATES.filter((t) => t.category === category)
}
