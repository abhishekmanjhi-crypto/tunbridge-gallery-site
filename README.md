# Portfolio Site Deployment

This project deploys the portfolio from `source/Portfolio Site.dc.html`.

The public site is a static SPA with Vercel rewrites for:

- `/`
- `/about`
- `/contact`
- `/project/:slug`
- `/admin`

The CMS is at `/admin`. It edits About, Contact, Projects, and advanced JSON fields.

## CMS Storage

`/api/content` uses MongoDB when these Vercel environment variables are configured:

- `MONGODB_URI`
- `CMS_PASSWORD`

Optional:

- `MONGODB_DB`
- `MONGODB_COLLECTION`
- `CMS_DOC_ID`

Without MongoDB env vars, the public site still serves `content-defaults.json`, which was built from the supplied `Portfolio Site.dc.html`.
