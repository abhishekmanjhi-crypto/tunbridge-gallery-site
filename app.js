(function () {
  "use strict";

  const API_URL = "/api/content";
  const DEFAULTS_URL = "/content-defaults.json";
  const app = document.getElementById("app");

  const state = {
    content: null,
    defaultContent: null,
    meta: null,
    page: "work",
    projectSlug: "",
    theme: null,
    now: new Date(),
    carousels: {},
    heroWordIndex: 0,
    adminSection: "dashboard",
    adminProjectKey: "",
    adminEditingProjectIndex: -1,
    adminDraft: null,
    adminMessage: "",
    adminError: "",
    cmsPassword: ""
  };

  const entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => entityMap[char]);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function mergeContent(base, override) {
    if (Array.isArray(base)) return Array.isArray(override) ? override : base;
    if (!isPlainObject(base)) return override === undefined || override === null ? base : override;
    const next = { ...base };
    if (!isPlainObject(override)) return next;
    for (const key of Object.keys(override)) {
      next[key] = key in base ? mergeContent(base[key], override[key]) : override[key];
    }
    return next;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeHref(value) {
    const href = String(value || "#").trim();
    if (!href) return "#";
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
    return "#";
  }

  function safeImageSrc(value) {
    const src = String(value || "").trim();
    if (!src) return "";
    if (/^data:image\//i.test(src)) return src;
    return safeHref(src);
  }

  function slugify(value) {
    return String(value || "project")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project";
  }

  function getPublishedProjects() {
    return asArray(state.content?.projects)
      .filter((project) => project && project.published !== false)
      .map((project) => ({ ...project, slug: project.slug || slugify(project.title) }));
  }

  function projectCaseStudy(project, content = state.content) {
    return mergeContent(content?.caseStudy || {}, project?.caseStudy || {});
  }

  function readRoute() {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    state.projectSlug = "";
    if (path === "/admin" || path.startsWith("/admin/")) {
      state.page = "admin";
      const adminParts = path.split("/").filter(Boolean).slice(1);
      state.adminSection = adminParts[0] || "dashboard";
      state.adminProjectKey = adminParts[1] ? decodeURIComponent(adminParts[1]) : "";
      return;
    }
    if (path === "/about") {
      state.page = "about";
      return;
    }
    if (path === "/contact") {
      state.page = "contact";
      return;
    }
    if (path.startsWith("/project/")) {
      state.page = "project";
      state.projectSlug = decodeURIComponent(path.slice("/project/".length));
      return;
    }
    state.page = "work";
  }

  function navigate(href) {
    window.history.pushState({}, "", href);
    readRoute();
    render();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function currentClock() {
    const timezone = state.content?.site?.timezone || "Europe/Dublin";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timezone
      }).format(state.now);
    } catch (_error) {
      return "";
    }
  }

  function applyTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    state.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    try {
      window.localStorage.setItem("om-portfolio-theme", nextTheme);
    } catch (_error) {}
  }

  function ensureTheme() {
    if (state.theme) {
      applyTheme(state.theme);
      return;
    }
    let saved = "";
    try {
      saved = window.localStorage.getItem("om-portfolio-theme") || "";
    } catch (_error) {}
    applyTheme(saved || state.content?.site?.defaultTheme || "light");
  }

  function applyBrand() {
    const accent = state.content?.site?.accentPrimary;
    if (accent) document.documentElement.style.setProperty("--accent", accent);
  }

  function navItem(href, label, active) {
    return `<a class="nav-pill${active ? " is-active" : ""}" href="${esc(href)}" data-link>${esc(label)}</a>`;
  }

  function renderNav() {
    const site = state.content.site;
    const onWork = state.page === "work" || state.page === "project";
    const glyph = state.theme === "dark" ? "☀" : "☾";
    return `
      <header class="topbar">
        <nav class="nav-shell" aria-label="Primary">
          <a class="brand-mark" href="/" data-link aria-label="${esc(site.name)} home">
            <img src="${esc(site.logoDark)}" alt="${esc(site.name)}" class="logo-dark">
            <img src="${esc(site.logoLight)}" alt="${esc(site.name)}" class="logo-light">
          </a>
          ${navItem("/", "Work", onWork)}
          ${navItem("/about", "About", state.page === "about")}
          ${navItem("/contact", "Contact", state.page === "contact")}
          <a class="resume-pill" href="${esc(safeHref(site.resumeUrl))}" download>Résumé <span>↓</span></a>
          <button class="theme-button" type="button" data-action="toggle-theme" aria-label="Toggle theme">${esc(glyph)}</button>
        </nav>
      </header>
    `;
  }

  function pageShell(inner) {
    return `<main class="page-shell"><div class="grid-frame">${inner}</div></main>`;
  }

  function metaParts(parts) {
    return asArray(parts)
      .map((part, index) => `${index ? `<span class="accent-dot">•</span>` : ""}<span class="${index === 0 ? "ink" : ""}">${esc(part)}</span>`)
      .join("");
  }

  function heroWords(home = state.content?.home) {
    const words = asArray(home?.rotatingWords)
      .map((word) => String(word || "").trim())
      .filter(Boolean);
    if (words.length) return words;
    const fallback = String(home?.headlineAccent || "").trim();
    return fallback ? [fallback] : ["decide"];
  }

  function renderHeroWord(home) {
    const words = heroWords(home);
    const index = ((state.heroWordIndex % words.length) + words.length) % words.length;
    return `<span class="accent-text rotating-word" data-hero-word>${esc(words[index])}</span>`;
  }

  function chipList(items, className = "") {
    return `<div class="chip-list ${esc(className)}">${asArray(items).map((item) => `<span class="chip">${esc(item)}</span>`).join("")}</div>`;
  }

  function sectionHead(index, label, panel = false) {
    return `
      <div class="section-head${panel ? " panel-line" : ""}">
        <span>${esc(index)}</span>
        <strong>${esc(label)}</strong>
      </div>
    `;
  }

  function renderFigure(label, className = "") {
    return `<div class="figure-box ${esc(className)}"><span>${esc(label)}</span></div>`;
  }

  function normalizeSlide(slide) {
    if (typeof slide === "string") return { label: slide, src: "" };
    return {
      label: slide?.label || slide?.caption || slide?.alt || "image",
      src: slide?.src || slide?.url || slide?.image || ""
    };
  }

  function getPerformanceSlides(performance) {
    const source = asArray(performance?.slides).length
      ? performance.slides
      : asArray(performance?.images).length
        ? performance.images
        : asArray(performance?.figures);
    const slides = asArray(source).map(normalizeSlide).filter((slide) => slide.label || slide.src);
    return slides.length ? slides : [{ label: "image", src: "" }];
  }

  function carouselIndex(id, total) {
    if (!total) return 0;
    const current = Number(state.carousels[id] || 0);
    return ((current % total) + total) % total;
  }

  function renderCarouselFigure(slide) {
    const src = safeImageSrc(slide.src);
    return `
      <div class="figure-box carousel-figure">
        ${src ? `<img src="${esc(src)}" alt="${esc(slide.label || "Project image")}">` : ""}
        <span>${esc(slide.label)}</span>
      </div>
    `;
  }

  function renderCarouselInner(id, slides) {
    const total = slides.length;
    const index = carouselIndex(id, total);
    const slide = slides[index];
    return `
      <div class="carousel-stage">
        ${renderCarouselFigure(slide)}
        ${total > 1 ? `
          <button class="carousel-button carousel-prev" type="button" data-carousel-action="prev" aria-label="Previous image">←</button>
          <button class="carousel-button carousel-next" type="button" data-carousel-action="next" aria-label="Next image">→</button>
        ` : ""}
      </div>
      ${total > 1 ? `
        <div class="carousel-footer">
          <div class="carousel-dots" aria-label="Image slides">
            ${slides.map((_item, dotIndex) => `<button class="${dotIndex === index ? "is-active" : ""}" type="button" data-carousel-action="go" data-carousel-index="${dotIndex}" aria-label="Show image ${dotIndex + 1}"></button>`).join("")}
          </div>
          <div class="carousel-count">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
        </div>
      ` : ""}
    `;
  }

  function getCarouselSlides(id) {
    if (id === "case-performance") return getPerformanceSlides(state.content?.caseStudy?.performance);
    return [];
  }

  function renderImageCarousel(id, slides) {
    return `
      <div class="image-carousel" data-carousel-id="${esc(id)}" data-carousel-total="${slides.length}">
        ${renderCarouselInner(id, slides)}
      </div>
    `;
  }

  function renderWork() {
    const site = state.content.site;
    const home = state.content.home;
    const projects = getPublishedProjects();
    const clock = currentClock();
    return pageShell(`
      <section class="card span-9 hero-card">
        <div class="eyebrow">${metaParts(home.eyebrowParts)}</div>
        <h1 class="hero-title">
          <span class="hero-title-line">${esc(home.headlineStart)}<span class="muted">${esc(home.headlineMutedA)}</span></span>
          <span class="hero-title-line hero-title-line-rotating">${renderHeroWord(home)}<span class="muted">${esc(home.headlineMutedB)}</span></span>
        </h1>
        <p class="hero-copy">${esc(home.intro)}</p>
        <div class="skill-row">${asArray(home.skills).map((skill, index) => `${index ? "<span>/</span>" : ""}<b>${esc(skill)}</b>`).join("")}</div>
      </section>

      <section class="card span-3 portrait-card">
        <div class="portrait-frame">${site.portrait ? `<img src="${esc(site.portrait)}" alt="${esc(site.name)} portrait">` : ""}</div>
        <div class="portrait-meta"><span>${esc(site.shortLocation)}</span><span>${esc(site.coordinates)}</span></div>
      </section>

      <section class="card span-4 stat-card accent-card">
        <div class="mono-label">${esc(home.experienceLabel)}</div>
        <div>
          <div class="stat-value">${esc(home.experienceValue)}</div>
          <p>${esc(home.experienceText)}</p>
        </div>
      </section>

      <section class="card span-4 stat-card panel-card">
        <div class="status-line"><span></span><b>${esc(home.statusLabel)}</b></div>
        <div class="clock">${esc(clock)}</div>
        <p>${esc(home.statusText)}</p>
      </section>

      <a class="card span-4 work-note" href="/contact" data-link>
        <div class="mono-label muted-label">${esc(home.selectedLabel)}</div>
        <strong>${esc(home.selectedText)} <span>↓</span></strong>
      </a>

      ${projects.map((project, index) => renderProjectCard(project, index)).join("")}
    `);
  }

  function renderProjectCard(project, index) {
    const slug = project.slug || slugify(project.title);
    return `
      <a class="card span-6 project-card" href="/project/${esc(slug)}" data-link>
        <div class="project-meta">
          <span class="accent-text">${String(index + 1).padStart(2, "0")}</span>
          <span>${esc(project.kind)}</span>
          <span>${esc(project.year)}</span>
        </div>
        ${renderFigure(project.figure)}
        <div class="project-body">
          <h2>${esc(project.title)}</h2>
          <p>${esc(project.summary)}</p>
          ${chipList(project.tags)}
        </div>
      </a>
    `;
  }

  function renderProjectDetail() {
    const projects = getPublishedProjects();
    const current = projects.find((project) => project.slug === state.projectSlug) || projects[0];
    const currentIndex = Math.max(0, projects.findIndex((project) => project.slug === current?.slug));
    const next = projects[(currentIndex + 1) % projects.length] || current;
    const caseStudy = projectCaseStudy(current);
    if (!current) return pageShell(`<section class="card span-12"><h1>No projects published.</h1></section>`);

    return pageShell(`
      <section class="card span-12 detail-hero center">
        <a class="back-link" href="/" data-link>← All work</a>
        <div class="eyebrow center-row">
          <span class="ink">${esc(current.kind)}</span><span class="accent-dot">•</span><span>${esc(current.year)}</span><span class="accent-dot">•</span><span>${esc(caseStudy.role)}</span>
        </div>
        <h1 class="detail-title">${esc(current.title)}</h1>
        <p class="hero-copy">${esc(current.summary)}</p>
        ${chipList(current.tags, "center-chips")}
      </section>

      ${asArray(caseStudy.metrics).map((metric) => `
        <section class="card span-4 metric-card ${metric.tone === "accent" ? "accent-card" : metric.tone === "panel" ? "panel-card" : ""}">
          <div class="metric-value">${esc(metric.value)}</div>
          <p>${esc(metric.label)}</p>
        </section>
      `).join("")}

      <section class="card span-12 essay-card">
        ${sectionHead(caseStudy.problem.index, caseStudy.problem.label)}
        <div class="essay-copy">
          <h2>${esc(caseStudy.problem.lead)}<span class="muted">${esc(caseStudy.problem.muted)}</span></h2>
          ${asArray(caseStudy.problem.paragraphs).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
        </div>
      </section>

      <section class="card span-7 essay-card">
        ${sectionHead(caseStudy.approach.index, caseStudy.approach.label)}
        <div class="number-list">
          ${asArray(caseStudy.approach.steps).map((step, index) => `
            <div><span>${String(index + 1).padStart(2, "0")}</span><p>${esc(step)}</p></div>
          `).join("")}
        </div>
      </section>

      <section class="card span-5 soft-card">
        ${sectionHead(caseStudy.modelComparison.index, caseStudy.modelComparison.label)}
        <table class="data-table">
          <thead><tr><th>Model</th><th>Prec</th><th>Rec</th><th>AUC</th></tr></thead>
          <tbody>
            ${asArray(caseStudy.modelComparison.rows).map((row) => `
              <tr class="${row.highlight ? "is-highlight" : ""}"><td>${esc(row.model)}</td><td>${esc(row.precision)}</td><td>${esc(row.recall)}</td><td>${esc(row.auc)}</td></tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="card span-12 essay-card">
        ${sectionHead(caseStudy.feature.index, caseStudy.feature.label)}
        ${renderFigure(caseStudy.feature.figure, "wide-figure")}
        <p class="note-copy">${esc(caseStudy.feature.note)}</p>
      </section>

      <section class="card span-7 essay-card">
        ${sectionHead(caseStudy.tradeoff.index, caseStudy.tradeoff.label)}
        <div class="essay-copy">
          <h2>${esc(caseStudy.tradeoff.lead)}<span class="muted">${esc(caseStudy.tradeoff.muted)}</span></h2>
          ${asArray(caseStudy.tradeoff.paragraphs).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}
        </div>
      </section>

      <section class="card span-5 panel-card">
        ${sectionHead(caseStudy.mistakeCost.index, caseStudy.mistakeCost.label, true)}
        <table class="data-table panel-table">
          <tbody>
            ${asArray(caseStudy.mistakeCost.rows).map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.value)}</td></tr>`).join("")}
          </tbody>
        </table>
      </section>

      <section class="card span-12 essay-card">
        ${sectionHead(caseStudy.performance.index, caseStudy.performance.label)}
        ${renderImageCarousel("case-performance", getPerformanceSlides(caseStudy.performance))}
        <p class="note-copy">${esc(caseStudy.performance.note)}</p>
      </section>

      <section class="card span-12 soft-card">
        ${sectionHead(caseStudy.results.index, caseStudy.results.label)}
        <table class="result-table">
          <tbody>${asArray(caseStudy.results.rows).map((row) => `<tr><td>${esc(row.value)}</td><td>${esc(row.label)}</td></tr>`).join("")}</tbody>
        </table>
      </section>

      <section class="card span-8 essay-card">
        ${sectionHead(caseStudy.differently.index, caseStudy.differently.label)}
        <h2 class="reflection"><span class="muted">${esc(caseStudy.differently.mutedA)}</span>${esc(caseStudy.differently.strong)}<span class="muted">${esc(caseStudy.differently.mutedB)}</span></h2>
      </section>

      <section class="card span-4 essay-card">
        ${sectionHead(caseStudy.handoff.index, caseStudy.handoff.label)}
        ${renderFigure(caseStudy.handoff.figure, "square-figure")}
        <p class="note-copy">${esc(caseStudy.handoff.note)}</p>
      </section>

      <a class="card span-6 next-card" href="/" data-link>
        <span>Index</span>
        <strong>← All work</strong>
      </a>
      <a class="card span-6 next-card next-accent" href="/project/${esc(next.slug)}" data-link>
        <span>Next project</span>
        <strong>${esc(next.title)} →</strong>
      </a>
    `);
  }

  function platformGlyph(label) {
    const key = String(label || "").toLowerCase();
    if (key.includes("linkedin")) return "in";
    if (key.includes("github")) return "GH";
    if (key.includes("email")) return "@";
    if (key.includes("resume")) return "CV";
    if (key.includes("calendar")) return "[]";
    return "↗";
  }

  function renderExperienceRow(row, index) {
    return `
      <div class="experience-row">
        <div class="experience-index">${String(index + 1).padStart(2, "0")}</div>
        <div class="experience-main">
          <div class="experience-topline">
            <span>${esc(row.period)}</span>
            <strong>${esc(row.role)}</strong>
          </div>
          <h2>${esc(row.company)}</h2>
          <p>${esc(row.focus)}</p>
          ${asArray(row.skills).length ? chipList(row.skills, "experience-chips") : ""}
        </div>
        <div class="experience-projects">
          ${asArray(row.projects).map((project) => `<span>${esc(project)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function renderAboutRecommendation(recommendation) {
    if (!recommendation?.visible || !recommendation.quote) return "";
    return `
      <section class="card span-12 recommendation-card">
        ${sectionHead(recommendation.index || "R01", recommendation.label || "Recommendation")}
        <blockquote>${esc(recommendation.quote)}</blockquote>
        <div class="recommendation-author">
          <strong>${esc(recommendation.author)}</strong>
          <span>${esc(recommendation.title)}</span>
        </div>
      </section>
    `;
  }

  function renderAboutPlatforms(about) {
    const links = asArray(about.platformLinks);
    if (!links.length) return "";
    return `
      <section class="card span-12 about-contact-card">
        <div class="contact-strip-title"><span></span><strong>${esc(about.contactLabel || "Contact")}</strong><span></span></div>
        <div class="platform-link-row">
          ${links.map((link) => `
            <a class="platform-link" href="${esc(safeHref(link.href))}" aria-label="${esc(link.label)}">
              <span>${esc(platformGlyph(link.label))}</span>
              <b>${esc(link.text || link.label)}</b>
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderAbout() {
    const about = state.content.about;
    return pageShell(`
      <section class="card span-8 hero-card">
        <div class="mono-label muted-label">${esc(about.label)}</div>
        <h1 class="section-title">${esc(about.headlineStart)}<span class="muted">${esc(about.headlineMuted)}</span>${esc(about.headlineEnd)}</h1>
        <div class="body-stack">${asArray(about.paragraphs).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</div>
      </section>

      <section class="card span-4 panel-card about-panel">
        <div class="mono-label">${esc(about.elsewhereLabel)}</div>
        <div class="key-value-list panel-list">
          ${asArray(about.elsewhere).map((row) => `<div><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`).join("")}
        </div>
      </section>

      <section class="card span-12 experience-card">
        ${sectionHead(about.experienceLabel || "Experience", about.experienceTitle || "Where the work happened")}
        <div class="experience-list">
          ${asArray(about.experience).map((row, index) => renderExperienceRow(row, index)).join("")}
        </div>
      </section>

      ${asArray(about.principles).map((principle, index) => `
        <section class="card span-4 principle-card">
          <div class="accent-text mono-number">${String(index + 1).padStart(2, "0")}</div>
          <h2>${esc(principle.title)}</h2>
          <p>${esc(principle.body)}</p>
        </section>
      `).join("")}

      <section class="card span-8 soft-card toolkit-card">
        <div class="mono-label muted-label">${esc(about.toolkitLabel)}</div>
        ${chipList(about.toolkit, "toolkit-chips")}
      </section>

      <a class="card span-4 cta-card accent-card" href="/contact" data-link>
        <span>${esc(about.ctaLabel)}</span>
        <strong>${esc(about.ctaText)} →</strong>
      </a>

      ${renderAboutRecommendation(about.recommendation)}
      ${renderAboutPlatforms(about)}
    `);
  }

  function renderContact() {
    const contact = state.content.contact;
    const site = state.content.site;
    const directRows = asArray(contact.direct).map((row) => ({
      ...row,
      href: row.label === "Résumé" && (!row.href || row.href === "#resume") ? site.resumeUrl : row.href
    }));
    return pageShell(`
      <section class="card span-8 hero-card">
        <div class="status-line text-status"><span></span><b>${esc(contact.statusLabel)}</b></div>
        <h1 class="section-title">${esc(contact.headlineStart)}<span class="muted">${esc(contact.headlineMuted)}</span></h1>
        <p class="hero-copy">${esc(contact.intro)}</p>
      </section>

      <section class="card span-4 panel-card local-time-card">
        <div class="mono-label">${esc(contact.localTimeLabel)}</div>
        <div class="clock large-clock">${esc(currentClock())}</div>
        <p>${esc(site.timezoneLabel)}</p>
      </section>

      <section class="card span-7 essay-card">
        ${sectionHead("01", contact.directLabel)}
        <div class="direct-list">
          ${directRows.map((row) => `<div><span>${esc(row.label)}</span><a href="${esc(safeHref(row.href))}">${esc(row.text)}</a></div>`).join("")}
        </div>
      </section>

      <section class="card span-5 soft-card">
        ${sectionHead("02", contact.fitLabel)}
        <div class="key-value-list">
          ${asArray(contact.fit).map((row) => `<div><span>${esc(row.label)}</span><strong>${esc(row.value)}</strong></div>`).join("")}
        </div>
      </section>

      <a class="card span-12 send-card accent-card" href="${esc(safeHref(contact.ctaHref))}">
        <strong>${esc(contact.ctaText)}</strong>
        <span>${esc(contact.ctaMeta)}</span>
      </a>
    `);
  }

  function renderFooter() {
    const site = state.content.site;
    return `
      <footer class="site-footer">
        <div>© ${esc(site.footerYear)} ${esc(site.name)}</div>
        <div>
          ${asArray(site.footerLinks).map((link) => `<a href="${esc(safeHref(link.href))}">${esc(link.label)}</a>`).join("")}
          <button type="button" data-action="top">Top ↑</button>
        </div>
      </footer>
    `;
  }

  function renderSite() {
    const body = state.page === "about"
      ? renderAbout()
      : state.page === "contact"
        ? renderContact()
        : state.page === "project"
          ? renderProjectDetail()
          : renderWork();
    return `${renderNav()}${body}${renderFooter()}`;
  }

  function pathValue(root, path) {
    return String(path).split(".").reduce((value, key) => value?.[key], root);
  }

  function setPath(root, path, value) {
    const keys = String(path).split(".");
    let target = root;
    keys.slice(0, -1).forEach((key) => {
      if (!isPlainObject(target[key]) && !Array.isArray(target[key])) target[key] = {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
  }

  function rowsToText(rows, keys) {
    return asArray(rows).map((row) => keys.map((key) => Array.isArray(row[key]) ? row[key].join(", ") : row[key] ?? "").join(" | ")).join("\n");
  }

  function splitList(value) {
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  }

  function parseRows(value, keys) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        return keys.reduce((row, key, index) => {
          row[key] = parts[index] || "";
          return row;
        }, {});
      });
  }

  function parseExperienceRows(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        return {
          period: parts[0] || "",
          role: parts[1] || "",
          company: parts[2] || "",
          focus: parts[3] || "",
          skills: splitList(parts[4]),
          projects: splitList(parts[5])
        };
      });
  }

  function parsePlatformRows(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        return { label: parts[0] || "", href: parts[1] || "", text: parts[2] || parts[0] || "" };
      });
  }

  function parseMetricRows(value) {
    return parseRows(value, ["value", "label", "tone"]).map((row) => ({
      value: row.value,
      label: row.label,
      tone: row.tone || "card"
    }));
  }

  function parseModelRows(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("|").map((part) => part.trim());
        return {
          model: parts[0] || "",
          precision: parts[1] || "",
          recall: parts[2] || "",
          auc: parts[3] || "",
          highlight: /^(yes|true|1|highlight)$/i.test(parts[4] || "")
        };
      });
  }

  function modelRowsToText(rows) {
    return asArray(rows)
      .map((row) => [row.model, row.precision, row.recall, row.auc, row.highlight ? "yes" : ""].join(" | "))
      .join("\n");
  }

  function adminInput(label, path, type = "text") {
    const value = pathValue(state.adminDraft, path) ?? "";
    return `
      <label class="cms-field">
        <span>${esc(label)}</span>
        <input type="${esc(type)}" value="${esc(value)}" data-path="${esc(path)}">
      </label>
    `;
  }

  function adminText(label, path, value, kind = "") {
    return `
      <label class="cms-field">
        <span>${esc(label)}</span>
        <textarea data-path="${esc(path)}" ${kind ? `data-kind="${esc(kind)}"` : ""}>${esc(value)}</textarea>
      </label>
    `;
  }

  function adminCheckbox(label, path) {
    const checked = Boolean(pathValue(state.adminDraft, path));
    return `
      <label class="cms-field checkbox-field">
        <input type="checkbox" ${checked ? "checked" : ""} data-path="${esc(path)}" data-kind="checkbox">
        <span>${esc(label)}</span>
      </label>
    `;
  }

  function adminPortraitUpload() {
    const portrait = state.adminDraft?.site?.portrait || "";
    return `
      <div class="cms-field cms-upload-field">
        <span>Upload photo</span>
        <div class="cms-upload-box">
          <div class="cms-portrait-preview">${portrait ? `<img src="${esc(portrait)}" alt="Portrait preview">` : "<b>No photo</b>"}</div>
          <div class="cms-upload-actions">
            <input type="file" accept="image/*" data-admin-upload="portrait">
            <button type="button" data-admin-action="clear-portrait">Remove photo</button>
          </div>
        </div>
      </div>
    `;
  }

  function ensureAdminPerformanceSlides() {
    if (!state.adminDraft.caseStudy) state.adminDraft.caseStudy = {};
    if (!state.adminDraft.caseStudy.performance) state.adminDraft.caseStudy.performance = {};
    const performance = state.adminDraft.caseStudy.performance;
    if (!Array.isArray(performance.slides)) {
      performance.slides = getPerformanceSlides(performance);
    }
    return performance.slides;
  }

  function renderAdminPerformanceSlide(slide, index) {
    const src = safeImageSrc(slide.src);
    return `
      <div class="cms-slide-row">
        <div class="cms-portrait-preview cms-slide-preview">${src ? `<img src="${esc(src)}" alt="${esc(slide.label || "Slide preview")}">` : "<b>No image</b>"}</div>
        <div class="cms-slide-fields">
          ${adminInput("Caption", `caseStudy.performance.slides.${index}.label`)}
          ${adminInput("Image URL", `caseStudy.performance.slides.${index}.src`)}
          <div class="cms-upload-actions horizontal-actions">
            <input type="file" accept="image/*" data-admin-upload="performance-slide" data-index="${index}">
            <button type="button" data-admin-action="remove-performance-slide" data-index="${index}">Remove slide</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminPerformanceSlides() {
    const slides = ensureAdminPerformanceSlides();
    return `
      <section class="cms-panel">
        <div class="cms-section-title">
          <h2>F02 Image Slider</h2>
          <button type="button" data-admin-action="add-performance-slide">Add image</button>
        </div>
        <p class="cms-help">These images show inside the Model Performance slider on each project detail page.</p>
        <div class="cms-slide-list">
          ${slides.map((slide, index) => renderAdminPerformanceSlide(slide, index)).join("")}
        </div>
      </section>
    `;
  }

  function renderAdminProject(project, index) {
    return `
      <details class="cms-project" open>
        <summary>
          <span>${esc(project.title || `Project ${index + 1}`)}</span>
          <button type="button" data-admin-action="remove-project" data-index="${index}">Remove</button>
        </summary>
        <div class="cms-grid compact">
          ${adminInput("Title", `projects.${index}.title`)}
          ${adminInput("Slug", `projects.${index}.slug`)}
          ${adminInput("Kind", `projects.${index}.kind`)}
          ${adminInput("Year", `projects.${index}.year`)}
          ${adminInput("Figure label", `projects.${index}.figure`)}
          <label class="cms-field checkbox-field">
            <input type="checkbox" ${project.published !== false ? "checked" : ""} data-path="projects.${index}.published" data-kind="checkbox">
            <span>Published</span>
          </label>
          ${adminText("Summary", `projects.${index}.summary`, project.summary || "")}
          ${adminText("Tags, comma separated", `projects.${index}.tags`, asArray(project.tags).join(", "), "csv")}
        </div>
      </details>
    `;
  }

  function adminNavItems() {
    return [
      { key: "dashboard", label: "Overview", href: "/admin", note: "CMS health and quick links" },
      { key: "site", label: "Site", href: "/admin/site", note: "Identity, theme, portrait" },
      { key: "home", label: "Home", href: "/admin/home", note: "Hero, cards, skills" },
      { key: "about", label: "About", href: "/admin/about", note: "Bio, experience, links" },
      { key: "contact", label: "Contact", href: "/admin/contact", note: "Direct links and CTA" },
      { key: "projects", label: "Projects", href: "/admin/projects", note: "Collection and detail pages" },
      { key: "media", label: "Media", href: "/admin/media", note: "Photos and project visuals" },
      { key: "advanced", label: "Advanced", href: "/admin/advanced", note: "JSON escape hatch" }
    ];
  }

  function activeAdminSection() {
    return adminNavItems().some((item) => item.key === state.adminSection) ? state.adminSection : "dashboard";
  }

  function adminProjectSlug(project, index) {
    return project?.slug || slugify(project?.title || `project-${index + 1}`);
  }

  function adminProjectIndex() {
    const projects = asArray(state.adminDraft?.projects);
    if (!projects.length) return -1;
    const key = String(state.adminProjectKey || "").trim();
    if (!key) return -1;
    const exact = projects.findIndex((project, index) => adminProjectSlug(project, index) === key || String(index) === key);
    if (exact >= 0) {
      state.adminEditingProjectIndex = exact;
      return exact;
    }
    return state.adminEditingProjectIndex >= 0 && state.adminEditingProjectIndex < projects.length ? state.adminEditingProjectIndex : 0;
  }

  function ensureProjectCaseStudy(index) {
    if (!state.adminDraft.projects) state.adminDraft.projects = [];
    const project = state.adminDraft.projects[index];
    if (!project) return clone(state.adminDraft.caseStudy || state.defaultContent?.caseStudy || {});
    const base = state.adminDraft.caseStudy || state.defaultContent?.caseStudy || {};
    if (!project.caseStudy) project.caseStudy = clone(base);
    project.caseStudy = mergeContent(base, project.caseStudy);
    return project.caseStudy;
  }

  function ensureProjectPerformanceSlides(projectIndex) {
    const caseStudy = ensureProjectCaseStudy(projectIndex);
    if (!caseStudy.performance) caseStudy.performance = {};
    if (!Array.isArray(caseStudy.performance.slides)) {
      caseStudy.performance.slides = getPerformanceSlides(caseStudy.performance);
    }
    return caseStudy.performance.slides;
  }

  function adminPanel(title, eyebrow, body, className = "") {
    return `
      <section class="cms-panel admin-editor-panel ${esc(className)}">
        <div class="admin-panel-head">
          <div>
            ${eyebrow ? `<p class="mono-label muted-label">${esc(eyebrow)}</p>` : ""}
            <h2>${esc(title)}</h2>
          </div>
        </div>
        ${body}
      </section>
    `;
  }

  function adminDashboard() {
    const projects = asArray(state.adminDraft.projects);
    return `
      <div class="admin-dashboard-grid">
        ${adminNavItems().filter((item) => item.key !== "dashboard").map((item) => `
          <a class="admin-dashboard-card" href="${esc(item.href)}" data-link>
            <span>${esc(item.label)}</span>
            <p>${esc(item.note)}</p>
          </a>
        `).join("")}
      </div>
      ${adminPanel("Content Model", "Wix-style structure", `
        <div class="admin-model-grid">
          <div><span>Static pages</span><strong>Site, Home, About, Contact</strong><p>Each page has its own editor and preview target.</p></div>
          <div><span>Collection</span><strong>${projects.length} Projects</strong><p>Projects behave like dynamic items with one shared visual system and item-specific content.</p></div>
          <div><span>Preview</span><strong>Live draft preview</strong><p>Typing updates the right-side preview without publishing.</p></div>
        </div>
      `)}
    `;
  }

  function renderSiteEditor(draft) {
    return adminPanel("Site Settings", "Global identity", `
      <div class="cms-grid">
        ${adminInput("Name", "site.name")}
        ${adminInput("Role", "site.role")}
        ${adminInput("Location", "site.location")}
        ${adminInput("Short location", "site.shortLocation")}
        ${adminInput("Coordinates", "site.coordinates")}
        ${adminInput("Timezone", "site.timezone")}
        ${adminInput("Timezone label", "site.timezoneLabel")}
        ${adminInput("Accent", "site.accentPrimary", "color")}
        ${adminInput("Resume URL", "site.resumeUrl")}
        ${adminInput("Portrait URL", "site.portrait")}
        ${adminPortraitUpload()}
      </div>
    `);
  }

  function renderHomeEditor(draft) {
    return `
      ${adminPanel("Hero", "Home page", `
        <div class="cms-grid">
          ${adminText("Eyebrow parts, comma separated", "home.eyebrowParts", asArray(draft.home.eyebrowParts).join(", "), "csv")}
          ${adminInput("Headline start", "home.headlineStart")}
          ${adminInput("Headline muted before word", "home.headlineMutedA")}
          ${adminInput("Fallback accent word", "home.headlineAccent")}
          ${adminText("Rotating words, comma separated", "home.rotatingWords", heroWords(draft.home).join(", "), "csv")}
          ${adminInput("Headline muted after word", "home.headlineMutedB")}
          ${adminText("Intro", "home.intro", draft.home.intro || "")}
          ${adminText("Skills, comma separated", "home.skills", asArray(draft.home.skills).join(", "), "csv")}
        </div>
      `)}
      ${adminPanel("Home Cards", "Status and selected work", `
        <div class="cms-grid">
          ${adminInput("Experience value", "home.experienceValue")}
          ${adminInput("Experience label", "home.experienceLabel")}
          ${adminText("Experience text", "home.experienceText", draft.home.experienceText || "")}
          ${adminInput("Status label", "home.statusLabel")}
          ${adminText("Status text", "home.statusText", draft.home.statusText || "")}
          ${adminInput("Selected work label", "home.selectedLabel")}
          ${adminText("Selected work text", "home.selectedText", draft.home.selectedText || "")}
        </div>
      `)}
    `;
  }

  function renderAboutEditor(draft) {
    return `
      ${adminPanel("Story", "About page", `
        <div class="cms-grid">
          ${adminInput("Headline start", "about.headlineStart")}
          ${adminInput("Headline muted", "about.headlineMuted")}
          ${adminInput("Headline end", "about.headlineEnd")}
          ${adminText("Paragraphs, one per line", "about.paragraphs", asArray(draft.about.paragraphs).join("\n"), "lines")}
          ${adminText("Elsewhere rows: Label | Value", "about.elsewhere", rowsToText(draft.about.elsewhere, ["label", "value"]), "labelValueRows")}
        </div>
      `)}
      ${adminPanel("Experience", "Timeline", `
        <div class="cms-grid">
          ${adminInput("Experience label", "about.experienceLabel")}
          ${adminInput("Experience title", "about.experienceTitle")}
          ${adminText("Experience rows: Period | Role | Company | Focus | Skills comma list | Projects comma list", "about.experience", rowsToText(draft.about.experience, ["period", "role", "company", "focus", "skills", "projects"]), "experienceRows")}
          ${adminText("Principles: Title | Body", "about.principles", rowsToText(draft.about.principles, ["title", "body"]), "principleRows")}
          ${adminText("Toolkit, comma separated", "about.toolkit", asArray(draft.about.toolkit).join(", "), "csv")}
        </div>
      `)}
      ${adminPanel("Links and Recommendation", "Optional blocks", `
        <div class="cms-grid">
          ${adminInput("CTA label", "about.ctaLabel")}
          ${adminInput("CTA text", "about.ctaText")}
          ${adminInput("Contact strip label", "about.contactLabel")}
          ${adminText("Platform links: Label | URL | Display text", "about.platformLinks", rowsToText(draft.about.platformLinks, ["label", "href", "text"]), "platformRows")}
          ${adminCheckbox("Show recommendation", "about.recommendation.visible")}
          ${adminInput("Recommendation label", "about.recommendation.label")}
          ${adminText("Recommendation quote", "about.recommendation.quote", draft.about.recommendation?.quote || "")}
          ${adminInput("Recommendation author", "about.recommendation.author")}
          ${adminInput("Recommendation title", "about.recommendation.title")}
        </div>
      `)}
    `;
  }

  function renderContactEditor(draft) {
    return adminPanel("Contact Page", "Direct conversion", `
      <div class="cms-grid">
        ${adminInput("Status label", "contact.statusLabel")}
        ${adminInput("Headline start", "contact.headlineStart")}
        ${adminInput("Headline muted", "contact.headlineMuted")}
        ${adminText("Intro", "contact.intro", draft.contact.intro || "")}
        ${adminText("Direct rows: Label | Text | URL", "contact.direct", rowsToText(draft.contact.direct, ["label", "text", "href"]), "directRows")}
        ${adminText("Good fit rows: Label | Value", "contact.fit", rowsToText(draft.contact.fit, ["label", "value"]), "labelValueRows")}
        ${adminInput("CTA text", "contact.ctaText")}
        ${adminInput("CTA meta", "contact.ctaMeta")}
        ${adminInput("CTA URL", "contact.ctaHref")}
      </div>
    `);
  }

  function renderProjectCollection(draft) {
    const projects = asArray(draft.projects);
    return `
      <section class="cms-panel admin-editor-panel">
        <div class="admin-panel-head">
          <div>
            <p class="mono-label muted-label">Collection</p>
            <h2>Projects</h2>
          </div>
          <button type="button" data-admin-action="add-project">Add project</button>
        </div>
        <div class="admin-collection-tools">
          <span>${projects.length} items</span>
          <span>Dynamic item URL: /project/{slug}</span>
          <span>List view</span>
        </div>
        <div class="admin-project-list">
          ${projects.map((project, index) => {
            const slug = adminProjectSlug(project, index);
            return `
              <article class="admin-project-item">
                <div>
                  <span class="admin-item-index">${String(index + 1).padStart(2, "0")}</span>
                  <h3>${esc(project.title || `Project ${index + 1}`)}</h3>
                  <p>${esc(project.summary || "No summary yet.")}</p>
                  <div class="admin-item-meta">
                    <span>${esc(project.kind || "Type")}</span>
                    <span>${esc(project.year || "Year")}</span>
                    <span>${project.published === false ? "Draft" : "Published"}</span>
                  </div>
                </div>
                <div class="admin-item-actions">
                  <a href="/admin/projects/${esc(slug)}" data-link>Edit</a>
                  <a href="/project/${esc(slug)}" data-link>View</a>
                  <button type="button" data-admin-action="duplicate-project" data-index="${index}">Duplicate</button>
                  <button type="button" data-admin-action="remove-project" data-index="${index}">Remove</button>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderProjectSlideEditor(projectIndex, slide, slideIndex) {
    const src = safeImageSrc(slide.src);
    return `
      <div class="cms-slide-row project-slide-row">
        <div class="cms-portrait-preview cms-slide-preview">${src ? `<img src="${esc(src)}" alt="${esc(slide.label || "Slide preview")}">` : "<b>No image</b>"}</div>
        <div class="cms-slide-fields">
          ${adminInput("Caption", `projects.${projectIndex}.caseStudy.performance.slides.${slideIndex}.label`)}
          ${adminInput("Image URL", `projects.${projectIndex}.caseStudy.performance.slides.${slideIndex}.src`)}
          <div class="cms-upload-actions horizontal-actions">
            <input type="file" accept="image/*" data-admin-upload="project-performance-slide" data-project-index="${projectIndex}" data-index="${slideIndex}">
            <button type="button" data-admin-action="remove-project-performance-slide" data-project-index="${projectIndex}" data-index="${slideIndex}">Remove slide</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderProjectEditor(draft) {
    const projects = asArray(draft.projects);
    const index = adminProjectIndex();
    if (index < 0 || !projects[index]) return renderProjectCollection(draft);
    const project = projects[index];
    const caseStudy = ensureProjectCaseStudy(index);
    const slides = ensureProjectPerformanceSlides(index);
    const slug = adminProjectSlug(project, index);

    return `
      <div class="admin-project-edit-head">
        <a href="/admin/projects" data-link>← Projects</a>
        <div>
          <p class="mono-label muted-label">Dynamic item</p>
          <h2>${esc(project.title || `Project ${index + 1}`)}</h2>
          <span>/project/${esc(slug)}</span>
        </div>
      </div>

      ${adminPanel("Card and URL", "Collection fields", `
        <div class="cms-grid">
          ${adminInput("Title", `projects.${index}.title`)}
          ${adminInput("Slug", `projects.${index}.slug`)}
          ${adminInput("Kind", `projects.${index}.kind`)}
          ${adminInput("Year", `projects.${index}.year`)}
          ${adminInput("Figure label", `projects.${index}.figure`)}
          <label class="cms-field checkbox-field">
            <input type="checkbox" ${project.published !== false ? "checked" : ""} data-path="projects.${index}.published" data-kind="checkbox">
            <span>Published</span>
          </label>
          ${adminText("Summary", `projects.${index}.summary`, project.summary || "")}
          ${adminText("Tags, comma separated", `projects.${index}.tags`, asArray(project.tags).join(", "), "csv")}
        </div>
      `)}

      ${adminPanel("Project Hero and Metrics", "Detail page", `
        <div class="cms-grid">
          ${adminInput("Role", `projects.${index}.caseStudy.role`)}
          ${adminText("Metrics: Value | Label | Tone", `projects.${index}.caseStudy.metrics`, rowsToText(caseStudy.metrics, ["value", "label", "tone"]), "metricRows")}
        </div>
      `)}

      ${adminPanel("Narrative Sections", "Problem, approach, tradeoff", `
        <div class="cms-grid">
          ${adminInput("Problem index", `projects.${index}.caseStudy.problem.index`)}
          ${adminInput("Problem label", `projects.${index}.caseStudy.problem.label`)}
          ${adminText("Problem lead", `projects.${index}.caseStudy.problem.lead`, caseStudy.problem?.lead || "")}
          ${adminText("Problem muted text", `projects.${index}.caseStudy.problem.muted`, caseStudy.problem?.muted || "")}
          ${adminText("Problem paragraphs, one per line", `projects.${index}.caseStudy.problem.paragraphs`, asArray(caseStudy.problem?.paragraphs).join("\n"), "lines")}
          ${adminText("Approach steps, one per line", `projects.${index}.caseStudy.approach.steps`, asArray(caseStudy.approach?.steps).join("\n"), "lines")}
          ${adminText("Tradeoff lead", `projects.${index}.caseStudy.tradeoff.lead`, caseStudy.tradeoff?.lead || "")}
          ${adminText("Tradeoff muted text", `projects.${index}.caseStudy.tradeoff.muted`, caseStudy.tradeoff?.muted || "")}
          ${adminText("Tradeoff paragraphs, one per line", `projects.${index}.caseStudy.tradeoff.paragraphs`, asArray(caseStudy.tradeoff?.paragraphs).join("\n"), "lines")}
        </div>
      `)}

      ${adminPanel("Tables and Results", "Structured data", `
        <div class="cms-grid">
          ${adminText("Model rows: Model | Precision | Recall | AUC | Highlight yes/no", `projects.${index}.caseStudy.modelComparison.rows`, modelRowsToText(caseStudy.modelComparison?.rows), "modelRows")}
          ${adminText("Mistake cost rows: Label | Value", `projects.${index}.caseStudy.mistakeCost.rows`, rowsToText(caseStudy.mistakeCost?.rows, ["label", "value"]), "labelValueRows")}
          ${adminText("Result rows: Value | Label", `projects.${index}.caseStudy.results.rows`, rowsToText(caseStudy.results?.rows, ["value", "label"]), "resultRows")}
        </div>
      `)}

      ${adminPanel("Visual Blocks", "Figures and slider", `
        <div class="cms-grid">
          ${adminInput("Feature index", `projects.${index}.caseStudy.feature.index`)}
          ${adminInput("Feature label", `projects.${index}.caseStudy.feature.label`)}
          ${adminInput("Feature figure label", `projects.${index}.caseStudy.feature.figure`)}
          ${adminText("Feature note", `projects.${index}.caseStudy.feature.note`, caseStudy.feature?.note || "")}
          ${adminInput("Performance index", `projects.${index}.caseStudy.performance.index`)}
          ${adminInput("Performance label", `projects.${index}.caseStudy.performance.label`)}
          ${adminText("Performance note", `projects.${index}.caseStudy.performance.note`, caseStudy.performance?.note || "")}
          ${adminInput("Handoff figure label", `projects.${index}.caseStudy.handoff.figure`)}
          ${adminText("Handoff note", `projects.${index}.caseStudy.handoff.note`, caseStudy.handoff?.note || "")}
        </div>
        <div class="admin-nested-section">
          <div class="admin-panel-head compact-head">
            <div><p class="mono-label muted-label">F02</p><h3>Image slider</h3></div>
            <button type="button" data-admin-action="add-project-performance-slide" data-project-index="${index}">Add slide</button>
          </div>
          <div class="cms-slide-list">
            ${slides.map((slide, slideIndex) => renderProjectSlideEditor(index, slide, slideIndex)).join("")}
          </div>
        </div>
      `)}

      ${adminPanel("Reflection", "Closing section", `
        <div class="cms-grid">
          ${adminInput("Differently index", `projects.${index}.caseStudy.differently.index`)}
          ${adminInput("Differently label", `projects.${index}.caseStudy.differently.label`)}
          ${adminText("Muted before strong text", `projects.${index}.caseStudy.differently.mutedA`, caseStudy.differently?.mutedA || "")}
          ${adminText("Strong text", `projects.${index}.caseStudy.differently.strong`, caseStudy.differently?.strong || "")}
          ${adminText("Muted after strong text", `projects.${index}.caseStudy.differently.mutedB`, caseStudy.differently?.mutedB || "")}
        </div>
      `)}
    `;
  }

  function renderMediaEditor(draft) {
    return `
      ${adminPanel("Portrait", "Reusable media", `
        <div class="cms-grid">
          ${adminInput("Portrait URL", "site.portrait")}
          ${adminPortraitUpload()}
        </div>
      `)}
      ${adminPanel("Project Media", "Slider assets", `
        <p class="cms-help">Open a project editor to upload and caption images for that project's performance slider.</p>
        <div class="admin-media-grid">
          ${asArray(draft.projects).map((project, index) => {
            const slides = asArray(project.caseStudy?.performance?.slides);
            return `<a href="/admin/projects/${esc(adminProjectSlug(project, index))}" data-link><strong>${esc(project.title)}</strong><span>${slides.length || 0} custom slides</span></a>`;
          }).join("")}
        </div>
      `)}
    `;
  }

  function renderAdvancedEditor(draft) {
    const rawJson = JSON.stringify(draft, null, 2);
    return adminPanel("Advanced JSON", "Escape hatch", `
      <p class="cms-help">Use this only when a field is not exposed in the page editors yet.</p>
      <textarea id="rawContent" class="raw-json" spellcheck="false">${esc(rawJson)}</textarea>
      <div class="admin-inline-actions">
        <button type="button" data-admin-action="apply-json">Apply JSON to draft</button>
      </div>
    `);
  }

  function renderAdminPreviewContent(previewPage, projectIndex = -1) {
    const draft = state.adminDraft || state.content;
    const previewContent = clone(draft);
    const previous = {
      content: state.content,
      page: state.page,
      projectSlug: state.projectSlug
    };

    if (previewPage === "project") {
      previewContent.projects = asArray(previewContent.projects).map((project) => ({ ...project, published: true }));
    }

    state.content = previewContent;
    state.page = previewPage;
    state.projectSlug = "";
    if (previewPage === "project") {
      const project = asArray(previewContent.projects)[projectIndex] || asArray(previewContent.projects)[0];
      state.projectSlug = adminProjectSlug(project, Math.max(0, projectIndex));
    }

    const html = previewPage === "about"
      ? renderAbout()
      : previewPage === "contact"
        ? renderContact()
        : previewPage === "project"
          ? renderProjectDetail()
          : renderWork();

    state.content = previous.content;
    state.page = previous.page;
    state.projectSlug = previous.projectSlug;

    const label = previewPage === "project" ? "Project detail preview" : `${previewPage === "work" ? "Home" : previewPage} preview`;
    return `
      <div class="admin-preview-toolbar">
        <span>${esc(label)}</span>
        <strong>Draft</strong>
      </div>
      <div class="admin-preview-canvas">
        <div class="admin-preview-stage">${html}</div>
      </div>
    `;
  }

  function renderAdminPreviewPanel(previewPage, projectIndex = -1) {
    return `
      <aside class="admin-preview-panel">
        <div data-admin-preview>${renderAdminPreviewContent(previewPage, projectIndex)}</div>
      </aside>
    `;
  }

  function refreshAdminPreview() {
    const host = document.querySelector("[data-admin-preview]");
    if (!host) return;
    const section = activeAdminSection();
    const projectIndex = section === "projects" && state.adminProjectKey ? adminProjectIndex() : -1;
    const previewPage = section === "about"
      ? "about"
      : section === "contact"
        ? "contact"
        : section === "projects" && projectIndex >= 0
          ? "project"
          : "work";
    host.innerHTML = renderAdminPreviewContent(previewPage, projectIndex);
  }

  function renderAdmin() {
    if (!state.adminDraft) state.adminDraft = clone(state.content);
    const draft = state.adminDraft;
    const meta = state.meta || {};
    const storageText = meta.backendConfigured ? `MongoDB connected${meta.hasSavedContent ? " · saved content active" : " · defaults active"}` : "MongoDB not configured · previewing defaults";
    const section = activeAdminSection();
    const projectIndex = section === "projects" && state.adminProjectKey ? adminProjectIndex() : -1;
    const previewPage = section === "about"
      ? "about"
      : section === "contact"
        ? "contact"
        : section === "projects" && projectIndex >= 0
          ? "project"
          : "work";
    const sectionTitle = section === "dashboard"
      ? "CMS Overview"
      : section === "projects" && projectIndex >= 0
        ? "Project Editor"
        : `${section.charAt(0).toUpperCase()}${section.slice(1)} Editor`;
    const sectionNote = section === "projects" && projectIndex >= 0
      ? "Edit one dynamic project item with structured content blocks."
      : adminNavItems().find((item) => item.key === section)?.note || "Edit portfolio content.";
    const editor = section === "dashboard"
      ? adminDashboard()
      : section === "site"
        ? renderSiteEditor(draft)
        : section === "home"
          ? renderHomeEditor(draft)
          : section === "about"
            ? renderAboutEditor(draft)
            : section === "contact"
              ? renderContactEditor(draft)
              : section === "projects"
                ? (projectIndex >= 0 ? renderProjectEditor(draft) : renderProjectCollection(draft))
                : section === "media"
                  ? renderMediaEditor(draft)
                  : renderAdvancedEditor(draft);

    return `
      <main class="admin-studio">
        <aside class="admin-sidebar">
          <a class="admin-public-link" href="/" data-link>← Public site</a>
          <div class="admin-brand">
            <span>Custom CMS</span>
            <strong>Prathamesh</strong>
          </div>
          <nav class="admin-side-nav" aria-label="CMS sections">
            ${adminNavItems().map((item) => `
              <a class="${item.key === section ? "is-active" : ""}" href="${esc(item.href)}" data-link>
                <span>${esc(item.label)}</span>
                <small>${esc(item.note)}</small>
              </a>
            `).join("")}
          </nav>
          <div class="admin-storage-card">
            <span>Storage</span>
            <p>${esc(storageText)}</p>
          </div>
        </aside>

        <section class="admin-main">
          <header class="admin-topbar">
            <div>
              <p class="mono-label muted-label">${esc(section === "projects" ? "Collection" : "Workspace")}</p>
              <h1>${esc(sectionTitle)}</h1>
              <p>${esc(sectionNote)}</p>
            </div>
            <div class="admin-save-cluster">
              <label class="cms-field password-field">
                <span>CMS password</span>
                <input type="password" value="${esc(state.cmsPassword)}" data-password autocomplete="current-password">
              </label>
              <button type="button" class="primary-button" data-admin-action="save">Save</button>
              <button type="button" data-admin-action="reset-defaults">Reset draft</button>
            </div>
          </header>

          ${state.adminMessage ? `<div class="cms-message">${esc(state.adminMessage)}</div>` : ""}
          ${state.adminError ? `<div class="cms-error">${esc(state.adminError)}</div>` : ""}

          <form id="adminForm" class="cms-form admin-workbench">
            <div class="admin-editor-stack">${editor}</div>
            ${renderAdminPreviewPanel(previewPage, projectIndex)}
          </form>
        </section>
      </main>
    `;
  }

  function updateRawJson() {
    const raw = document.getElementById("rawContent");
    if (raw) raw.value = JSON.stringify(state.adminDraft, null, 2);
  }

  function parseFieldValue(input) {
    const kind = input.dataset.kind || "";
    if (kind === "checkbox") return Boolean(input.checked);
    if (kind === "csv") return String(input.value || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (kind === "lines") return String(input.value || "").split("\n").map((item) => item.trim()).filter(Boolean);
    if (kind === "labelValueRows") return parseRows(input.value, ["label", "value"]);
    if (kind === "principleRows") return parseRows(input.value, ["title", "body"]);
    if (kind === "directRows") return parseRows(input.value, ["label", "text", "href"]);
    if (kind === "experienceRows") return parseExperienceRows(input.value);
    if (kind === "platformRows") return parsePlatformRows(input.value);
    if (kind === "metricRows") return parseMetricRows(input.value);
    if (kind === "modelRows") return parseModelRows(input.value);
    if (kind === "resultRows") return parseRows(input.value, ["value", "label"]);
    return input.value;
  }

  function bindAdminForm() {
    const form = document.getElementById("adminForm");
    if (!form) return;
    form.addEventListener("input", (event) => {
      const input = event.target;
      if (input.matches("[data-path]")) {
        setPath(state.adminDraft, input.dataset.path, parseFieldValue(input));
        updateRawJson();
        refreshAdminPreview();
      }
    });
    form.addEventListener("change", (event) => {
      const input = event.target;
      if (input.matches("[data-path]")) {
        setPath(state.adminDraft, input.dataset.path, parseFieldValue(input));
        updateRawJson();
        refreshAdminPreview();
      }
    });
  }

  async function saveAdmin() {
    state.adminMessage = "Saving...";
    state.adminError = "";
    render();
    try {
      const response = await fetch(API_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: state.cmsPassword, content: state.adminDraft })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Save failed with ${response.status}`);
      state.content = mergeContent(state.defaultContent, payload.content || state.adminDraft);
      state.adminDraft = clone(state.content);
      state.meta = payload.meta || state.meta;
      state.adminMessage = "Saved. Public site is now using the CMS content.";
      state.adminError = "";
      applyBrand();
      render();
    } catch (error) {
      state.adminMessage = "";
      state.adminError = error.message || "Save failed.";
      render();
    }
  }

  function handleAdminAction(action, button) {
    state.adminMessage = "";
    state.adminError = "";

    if (action === "save") {
      saveAdmin();
      return;
    }

    if (action === "apply-json") {
      const raw = document.getElementById("rawContent");
      try {
        state.adminDraft = JSON.parse(raw.value);
        state.adminMessage = "JSON applied to draft. Save to publish it.";
      } catch (error) {
        state.adminError = `JSON is invalid: ${error.message}`;
      }
      render();
      return;
    }

    if (action === "reset-defaults") {
      state.adminDraft = clone(state.defaultContent);
      state.adminMessage = "Draft reset to the source defaults from Portfolio Site.dc.html.";
      render();
      return;
    }

    if (action === "add-project") {
      state.adminDraft.projects = asArray(state.adminDraft.projects);
      const nextProject = {
        slug: `new-project-${Date.now()}`,
        title: "New project",
        kind: "Type",
        year: "2026",
        figure: "figure label",
        summary: "Short project summary.",
        tags: ["Tag"],
        published: true
      };
      state.adminDraft.projects.push(nextProject);
      navigate(`/admin/projects/${nextProject.slug}`);
      return;
    }

    if (action === "duplicate-project") {
      const index = Number(button.dataset.index);
      const source = asArray(state.adminDraft.projects)[index];
      if (!source) return;
      const copy = clone(source);
      copy.title = `${copy.title || "Project"} copy`;
      copy.slug = `${slugify(copy.title)}-${Date.now()}`;
      state.adminDraft.projects.push(copy);
      state.adminMessage = "Project duplicated. Save to publish the duplicate.";
      navigate(`/admin/projects/${copy.slug}`);
      return;
    }

    if (action === "add-performance-slide") {
      ensureAdminPerformanceSlides().push({ label: "New image", src: "" });
      state.adminMessage = "Image slide added to draft. Save to publish it.";
      render();
      return;
    }

    if (action === "remove-performance-slide") {
      const index = Number(button.dataset.index);
      const slides = ensureAdminPerformanceSlides();
      state.adminDraft.caseStudy.performance.slides = slides.filter((_slide, slideIndex) => slideIndex !== index);
      state.adminMessage = "Image slide removed from draft. Save to publish it.";
      render();
      return;
    }

    if (action === "add-project-performance-slide") {
      const projectIndex = Number(button.dataset.projectIndex);
      ensureProjectPerformanceSlides(projectIndex).push({ label: "New image", src: "" });
      state.adminMessage = "Project image slide added to draft. Save to publish it.";
      render();
      return;
    }

    if (action === "remove-project-performance-slide") {
      const projectIndex = Number(button.dataset.projectIndex);
      const index = Number(button.dataset.index);
      const slides = ensureProjectPerformanceSlides(projectIndex);
      const caseStudy = ensureProjectCaseStudy(projectIndex);
      caseStudy.performance.slides = slides.filter((_slide, slideIndex) => slideIndex !== index);
      state.adminMessage = "Project image slide removed from draft. Save to publish it.";
      render();
      return;
    }

    if (action === "clear-portrait") {
      setPath(state.adminDraft, "site.portrait", "");
      state.adminMessage = "Photo removed from draft. Save to publish it.";
      render();
      return;
    }

    if (action === "remove-project") {
      const index = Number(button.dataset.index);
      state.adminDraft.projects = asArray(state.adminDraft.projects).filter((_project, projectIndex) => projectIndex !== index);
      navigate("/admin/projects");
    }
  }

  function fileToResizedDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Choose an image file."));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not load that image."));
        image.onload = () => {
          const maxSide = 1200;
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/webp", 0.82));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleCmsImageUpload(input, path, successMessage) {
    const file = input.files && input.files[0];
    if (!file) return;
    state.adminMessage = "Processing image...";
    state.adminError = "";
    render();

    try {
      const dataUrl = await fileToResizedDataUrl(file);
      if (dataUrl.length > 1_900_000) {
        throw new Error("That image is still too large after resizing. Use a smaller source image.");
      }
      setPath(state.adminDraft, path, dataUrl);
      state.adminMessage = successMessage;
      state.adminError = "";
      render();
    } catch (error) {
      state.adminMessage = "";
      state.adminError = error.message || "Image upload failed.";
      render();
    }
  }

  async function handlePortraitUpload(input) {
    return handleCmsImageUpload(input, "site.portrait", "Photo uploaded to draft. Save to publish it.");
  }

  function render() {
    if (!state.content) {
      app.innerHTML = `<main class="loading-screen"><p>Loading portfolio...</p></main>`;
      return;
    }
    ensureTheme();
    applyBrand();
    app.innerHTML = state.page === "admin" ? renderAdmin() : renderSite();
    if (state.page === "admin") bindAdminForm();
    document.title = state.page === "admin"
      ? "Portfolio CMS"
      : `${state.content.site.name} — ${state.content.site.role}`;
  }

  function advanceHeroWord() {
    if (state.page !== "work" || !state.content?.home) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const words = heroWords();
    if (words.length < 2) return;
    const node = document.querySelector("[data-hero-word]");
    if (!node) return;

    state.heroWordIndex = (state.heroWordIndex + 1) % words.length;
    node.textContent = words[state.heroWordIndex];
    node.classList.remove("is-changing");
    void node.offsetWidth;
    node.classList.add("is-changing");
  }

  async function loadContent() {
    readRoute();
    const defaults = await fetchJson(DEFAULTS_URL);
    state.defaultContent = defaults;
    try {
      const payload = await fetchJson(API_URL);
      state.content = mergeContent(defaults, payload.content || defaults);
      state.meta = payload.meta || null;
    } catch (_error) {
      state.content = defaults;
      state.meta = { backendConfigured: false, storage: "static-defaults", hasSavedContent: false };
    }
    state.adminDraft = clone(state.content);
    render();
  }

  document.addEventListener("click", (event) => {
    const carouselButton = event.target.closest("[data-carousel-action]");
    if (carouselButton) {
      event.preventDefault();
      const host = carouselButton.closest("[data-carousel-id]");
      const id = host?.dataset.carouselId;
      const total = Number(host?.dataset.carouselTotal || 0);
      if (!id || !total) return;
      const action = carouselButton.dataset.carouselAction;
      const current = carouselIndex(id, total);
      const next = action === "go"
        ? Number(carouselButton.dataset.carouselIndex || 0)
        : current + (action === "prev" ? -1 : 1);
      const normalized = ((next % total) + total) % total;
      state.carousels = { ...state.carousels, [id]: normalized };
      const slides = getCarouselSlides(id);
      if (slides.length) {
        host.dataset.carouselTotal = String(slides.length);
        host.innerHTML = renderCarouselInner(id, slides);
      }
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "toggle-theme") applyTheme(state.theme === "dark" ? "light" : "dark");
      if (action === "top") window.scrollTo({ top: 0, behavior: "smooth" });
      render();
      return;
    }

    const adminButton = event.target.closest("[data-admin-action]");
    if (adminButton) {
      event.preventDefault();
      handleAdminAction(adminButton.dataset.adminAction, adminButton);
      return;
    }

    const link = event.target.closest("a[data-link]");
    if (!link) return;
    if (link.closest("[data-admin-preview]")) {
      event.preventDefault();
      return;
    }
    const url = new URL(link.href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-password]")) state.cmsPassword = event.target.value;
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-admin-upload='portrait']")) {
      handlePortraitUpload(event.target);
    }
    if (event.target.matches("[data-admin-upload='performance-slide']")) {
      const index = Number(event.target.dataset.index || 0);
      handleCmsImageUpload(
        event.target,
        `caseStudy.performance.slides.${index}.src`,
        "Slider image uploaded to draft. Save to publish it."
      );
    }
    if (event.target.matches("[data-admin-upload='project-performance-slide']")) {
      const projectIndex = Number(event.target.dataset.projectIndex || 0);
      const index = Number(event.target.dataset.index || 0);
      handleCmsImageUpload(
        event.target,
        `projects.${projectIndex}.caseStudy.performance.slides.${index}.src`,
        "Project slider image uploaded to draft. Save to publish it."
      );
    }
  });

  window.addEventListener("popstate", () => {
    readRoute();
    render();
  });

  window.setInterval(() => {
    state.now = new Date();
    if (state.page !== "admin") render();
  }, 30000);

  window.setInterval(advanceHeroWord, 2800);

  loadContent().catch((error) => {
    app.innerHTML = `<main class="loading-screen"><p>${esc(error.message || "Unable to load portfolio.")}</p></main>`;
  });
})();
