# CareFlow search setup

The primary audience is Arabic-speaking clinics in Iraq. Public copy describes
the actual patient-record, queue, visit, and doctor/staff features. No rankings,
reviews, clinical outcomes, or unsupported product claims are added.

## What the build produces

`npm run build` builds the app and then pre-renders the homepage, blog listing,
and every published Markdown article. Those pages include readable content and
their own metadata in the initial HTML, without requiring a crawler to run
JavaScript. Blog styles are included before JavaScript loads. The browser then
mounts the interactive React app, which manages metadata during navigation.

- Arabic titles and descriptions, canonical URLs, Open Graph and Twitter cards.
- Organization and WebSite JSON-LD on the homepage; BlogPosting and breadcrumbs
  on articles. Only existing author names and publication dates are used.
- `dist/sitemap.xml`, containing only the homepage, blog, and published articles.
  Drafts, account pages and demo data are excluded. `lastmod` is omitted because
  article publication dates are not reliable content-modification dates.
- `dist/robots.txt`, advertising the sitemap and excluding `/api/`. Other paths
  remain crawlable so crawlers can see their `noindex` directive.
- HTML entry points with `noindex` for login, signup, email verification, password
  recovery/reset, clinic, subscription and demo routes. The separate admin entry
  point already has `noindex`. Unknown/error pages also use `noindex`.
- `dist/404.html`, with the normal app assets and the missing-page screen.

Public canonical URLs use `https://app-careflow.com/` and trailing slashes on
blog paths, matching static directory indexes. Query strings are never added
to canonical URLs or structured data. The existing logo is the sharing image;
no new third-party scripts or SEO services are required.

## Production routing

The existing Nginx setup must serve directory indexes (`index index.html`) and
check real files/directories before its SPA fallback. This serves the generated
blog and account HTML instead of the homepage shell. Verify the **raw response**
for `/blog/`, an article and `/login/` after deployment.

For real HTTP 404 responses, replace the existing frontend `location /` fallback
with the following inside the HTTPS server block, keeping the current root,
API proxy, TLS and admin settings intact:

```nginx
index index.html;
error_page 404 /404.html;

location / {
    try_files $uri $uri/ =404;
}

location = /404.html {
    internal;
}
```

This is a server-administrator change: normal code deployment does not modify
Nginx. Validate with `nginx -t` before reloading. Until this change is applied,
unknown URLs still receive the old SPA fallback with HTTP 200 and only become
`noindex` after React runs. Existing public routes work with the current
file/directory-first configuration.

When adding routes in the future, include their static output in the prerender
step: indexable pages in `publicPaths`, excluded pages in `privatePaths`.

## After deployment

1. Verify that `/robots.txt` is plain text and `/sitemap.xml` is XML, not the app
   shell. Inspect page source on the homepage and an article for the title,
   description, canonical, schema and full page text.
2. Verify `/login/` and `/demo/` have `noindex` in their raw HTML. Visit an unknown
   URL and confirm an HTTP 404 after the Nginx update.
3. In Google Search Console, add and verify the `app-careflow.com` domain using
   Google's supplied DNS record, then submit `https://app-careflow.com/sitemap.xml`.
   Domain verification requires access to the owner's DNS account; no token or
   verification record is invented or committed by this change.
4. Inspect the homepage and one article with Search Console URL Inspection.
   Check structured data with Google's Rich Results Test. Search appearance and
   indexing are Google's decision; the metadata does not guarantee placement.

New published posts automatically enter the sitemap and receive pre-rendered
HTML on the next build. Cloudflare remains the traffic dashboard; Search Console
adds Google search queries, impressions, clicks, and indexing reports.

References: [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[robots metadata](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
