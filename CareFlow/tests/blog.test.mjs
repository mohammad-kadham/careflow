import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { blogContent, parsePost, loadPosts } from '../scripts/blog-content.mjs';

const source = (metadata = '', body = '## Section\n\nArticle text.') => `---\ntitle: "مقال تجريبي"\ndescription: "ملخص المقال"\ndate: "2026-10-08"\n${metadata}---\n\n${body}`;

test('Markdown metadata handles Arabic, Windows line endings and a BOM', () => {
  const post = parsePost('\uFEFF' + source().replaceAll('\n', '\r\n'), 'test-post.md');
  assert.equal(post.slug, 'test-post');
  assert.equal(post.title, 'مقال تجريبي');
  assert.equal(post.author, 'فريق كيرفلو');
  assert.equal(post.draft, false);
  assert.match(post.body, /## Section/);
});

test('invalid publishing metadata fails with an actionable filename', () => {
  const badSources = [
    source().replace('2026-10-08', '2026-02-30'),
    source().replace('title: "مقال تجريبي"', 'title: ""'),
    source('draft: "false"\n'), source('author: []\n'), source('', ''),
    '# Missing metadata', source('title: Duplicate\n'),
  ];
  for (const value of badSources) assert.throws(() => parsePost(value, 'bad-post.md'), /Blog: bad-post.md:/);
  assert.throws(() => parsePost(source(), 'Bad Name.md'), /filename/);
});

test('publication excludes draft content and sorts posts newest first', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'careflow-blog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all([
    writeFile(path.join(directory, 'new-post.md'), source()),
    writeFile(path.join(directory, 'old-post.md'), source().replace('2026-10-08', '2026-10-01')),
    writeFile(path.join(directory, 'secret-draft.md'), source('draft: true\n', 'UNPUBLISHED-DRAFT-BODY')),
  ]);
  const posts = await loadPosts(directory);
  assert.deepEqual(posts.map(post => post.slug), ['new-post', 'old-post']);
  assert.doesNotMatch(JSON.stringify(posts), /UNPUBLISHED|secret-draft/);
});

test('blog routes render published articles, missing pages and safe Markdown', async t => {
  // Isolate fixtures from editable articles. A published post may reuse a draft's title.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'careflow-blog-routes-'));
  let server;
  t.after(async () => {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const sharedTitle = 'عنوان المقال الجديد';
  const fixture = body => source('', body).replace('مقال تجريبي', sharedTitle);
  await Promise.all([
    writeFile(path.join(directory, 'published-post.md'), fixture('## Section\n\nPUBLIC-ARTICLE-BODY\n\n| One | Two |\n| --- | --- |\n| A | B |')),
    writeFile(path.join(directory, 'draft-post.md'), fixture('UNPUBLISHED-DRAFT-BODY').replace('---\n\n', 'draft: true\n---\n\n')),
  ]);
  server = await createServer({
    configFile: false, plugins: [react(), blogContent({ contentDirectory: directory })],
    server: { middlewareMode: true, hmr: false }, logLevel: 'silent',
  });
  const clientModule = await server.transformRequest('virtual:blog-posts');
  assert.match(clientModule.code, /published-post/);
  assert.match(clientModule.code, new RegExp(sharedTitle));
  assert.doesNotMatch(clientModule.code, /draft-post|UNPUBLISHED-DRAFT-BODY/);
  const { default: BlogPage } = await server.ssrLoadModule('/src/pages/blog.jsx');
  const { default: BlogMarkdown } = await server.ssrLoadModule('/src/components/blog-markdown.jsx');
  const render = entry => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [entry] },
    createElement(Routes, null,
      createElement(Route, { path: '/blog', element: createElement(BlogPage) }),
      createElement(Route, { path: '/blog/:slug', element: createElement(BlogPage) }))));
  const listing = render('/blog');
  assert.match(listing, /\/blog\/published-post/);
  assert.match(listing, new RegExp(sharedTitle));
  assert.doesNotMatch(listing, /draft-post|UNPUBLISHED-DRAFT-BODY/);
  const article = render('/blog/published-post');
  assert.match(article, /PUBLIC-ARTICLE-BODY/);
  assert.match(article, /<table>/);
  assert.match(article, /<h2>Section<\/h2>/);
  assert.equal((article.match(/<h1>/g) || []).length, 1);
  for (const slug of ['missing', 'draft-post']) assert.match(render('/blog/' + slug), /المقال غير موجود/);
  const unsafe = renderToStaticMarkup(createElement(BlogMarkdown, null,
    '<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>\n\n**Safe text**'));
  assert.doesNotMatch(unsafe, /<script|onerror|javascript:/i);
  assert.match(unsafe, /<strong>Safe text<\/strong>/);
});
