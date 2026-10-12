import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getMetadata, privatePaths, serializeStructuredData } from '../src/seo/metadata.js';
import { prerender, sitemapXml } from '../scripts/prerender.mjs';
import { loadPosts } from '../scripts/blog-content.mjs';

test('public SEO uses one production canonical and article-specific metadata', () => {
    const post = { slug: 'clinic-guide', title: 'دليل العيادة', description: 'تنظيم يوم العيادة', date: '2026-10-08', author: 'فريق كيرفلو' };
    assert.equal(getMetadata('/').canonical, 'https://app-careflow.com/');
    assert.equal(getMetadata('/blog').canonical, getMetadata('/blog/').canonical);
    const meta = getMetadata('/blog/clinic-guide/', [post]);
    assert.equal(meta.canonical, 'https://app-careflow.com/blog/clinic-guide/');
    assert.equal(meta.title, 'دليل العيادة | كيرفلو');
    assert.equal(meta.description, post.description);
    assert.equal(meta.noindex, false);
    assert.equal(meta.structuredData.find(item => item['@type'] === 'BlogPosting').datePublished, post.date);
    assert.equal(meta.structuredData.find(item => item['@type'] === 'BreadcrumbList').itemListElement[2].item, meta.canonical);
});

test('private, missing and draft pages cannot advertise indexable metadata', () => {
    for (const route of [...privatePaths, '/admin/', '/not-found', '/blog/draft-post']) {
        const meta = getMetadata(route, [{ slug: 'draft-post', draft: true }]);
        assert.equal(meta.noindex, true, route);
        assert.equal(meta.canonical, undefined, route);
        assert.deepEqual(meta.structuredData, [], route);
    }
});

test('structured data cannot break out of a script element', () => {
    const data = [{ '@type': 'BlogPosting', headline: '</script><script>alert(1)</script>' }];
    const serialized = serializeStructuredData(data);
    assert.doesNotMatch(serialized, /<\/script>/);
    assert.deepEqual(JSON.parse(serialized)['@graph'], data);
});

test('sitemap contains absolute canonical URLs and escaped XML', () => {
    const xml = sitemapXml(['/', '/blog/', '/blog/a&b/']);
    assert.match(xml, /<loc>https:\/\/app-careflow.com\/<\/loc>/);
    assert.match(xml, /a&amp;b/);
    assert.doesNotMatch(xml, /lastmod|priority|changefreq/);
});

test('build output delivers content and metadata before JavaScript runs', async t => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'careflow-seo-'));
    t.after(() => rm(outDir, { recursive: true, force: true }));
    await writeFile(path.join(outDir, 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><title>Placeholder</title><script type="module" src="/assets/main.js"></script></head><body><div id="root"></div></body></html>');
    await writeFile(path.join(outDir, 'asset-manifest.json'), JSON.stringify({ 'src/pages/blog.jsx': { css: ['assets/blog.css'] } }));
    const routes = await prerender({ outDir });
    const posts = await loadPosts('content/blog');
    const home = await readFile(path.join(outDir, 'index.html'), 'utf8');
    assert.match(home, /برنامج إدارة العيادات والمرضى في العراق/);
    assert.match(home, /<h1[^>]*>إدارة عيادتك في مكان واحد/);
    assert.match(home, /name="description"/);
    assert.match(home, /application\/ld\+json/);
    assert.equal((home.match(/<title\b/g) || []).length, 1);
    assert.equal((home.match(/rel="canonical"/g) || []).length, 1);
    assert.doesNotMatch(home, /noindex|Placeholder/);
    const blog = await readFile(path.join(outDir, 'blog/index.html'), 'utf8');
    assert.match(blog, /href="\/assets\/blog.css"/);
    for (const post of posts) {
        assert.ok(routes.includes(`/blog/${post.slug}/`));
        const html = await readFile(path.join(outDir, 'blog', post.slug, 'index.html'), 'utf8');
        assert.ok(html.includes(post.title));
        assert.match(html, /<article/);
        assert.match(html, /BlogPosting/);
        assert.match(html, /BreadcrumbList/);
        assert.equal((html.match(/name="description"/g) || []).length, 1);
        assert.equal((html.match(/<h1\b/g) || []).length, 1);
    }
    for (const route of privatePaths) {
        const html = await readFile(path.join(outDir, route.slice(1), 'index.html'), 'utf8');
        assert.match(html, /name="robots" content="noindex, follow"/);
        assert.doesNotMatch(html, /rel="canonical"|BlogPosting/);
    }
    const error = await readFile(path.join(outDir, '404.html'), 'utf8');
    assert.match(error, /noindex, follow/);
    assert.match(error, /الصفحة غير موجودة/);
    const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
    assert.equal((sitemap.match(/<loc>/g) || []).length, posts.length + 2);
    assert.doesNotMatch(sitemap, /\/app<|\/login|\/demo|post-template|\/test\//);
    const robots = await readFile(path.join(outDir, 'robots.txt'), 'utf8');
    assert.match(robots, /Sitemap: https:\/\/app-careflow.com\/sitemap.xml/);
    assert.doesNotMatch(robots, /Disallow: \/(?:login|app|assets)/);
});
