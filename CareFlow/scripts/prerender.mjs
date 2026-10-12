import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { loadPosts } from './blog-content.mjs';
import { getMetadata, privatePaths, siteUrl } from '../src/seo/metadata.js';

export function sitemapXml(paths) {
    const escapeXml = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(route => `  <url><loc>${escapeXml(`${siteUrl}${route}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export async function prerender({ root = fileURLToPath(new URL('../', import.meta.url)), outDir = 'dist' } = {}) {
    const output = path.resolve(root, outDir);
    const template = await readFile(path.join(output, 'index.html'), 'utf8');
    const manifest = JSON.parse(await readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
    const blogCss = manifest['src/pages/blog.jsx']?.css;
    if (!blogCss?.length) throw new Error('Missing blog CSS in the production asset manifest');
    const posts = await loadPosts(path.join(root, 'content/blog'));
    const publicPaths = ['/', '/blog/', ...posts.map(post => `/blog/${post.slug}/`)];
    const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false, watch: null }, logLevel: 'error' });
    try {
        const { renderSeoHead, renderPublicPage } = await server.ssrLoadModule('/src/seo/prerender.jsx');
        const makeHtml = (route, body = '') => template
            .replace(/<title\b[^>]*>[\s\S]*?<\/title>/, () => renderSeoHead(getMetadata(route, posts)))
            .replace('</head>', () => `${route.startsWith('/blog/') ? blogCss.map(file => `<link rel="stylesheet" href="/${file}">`).join('\n') : ''}</head>`)
            .replace('<div id="root"></div>', () => `<div id="root">${body}</div>`);
        for (const route of [...publicPaths, ...privatePaths]) {
            const filename = path.join(output, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`);
            await mkdir(path.dirname(filename), { recursive: true });
            await writeFile(filename, makeHtml(route, publicPaths.includes(route) ? renderPublicPage(route) : ''), 'utf8');
        }
        await writeFile(path.join(output, '404.html'), makeHtml('/404', renderPublicPage('/404')), 'utf8');
        await writeFile(path.join(output, 'sitemap.xml'), sitemapXml(publicPaths), 'utf8');
        // Allow crawlers to read noindex on account pages; robots.txt is not access control.
        await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8');
        return publicPaths;
    } finally {
        await server.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const pages = await prerender();
    console.log(`Pre-rendered ${pages.length} public pages, private-page metadata, 404, robots.txt and sitemap.xml.`);
}
