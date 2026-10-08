import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

export function parsePost(source, filename) {
  const slug = filename.replace(/\.md$/, '');
  const fail = message => { throw new Error(`Blog: ${filename}: ${message}`); };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail('use a lowercase, hyphen-separated filename ending in .md');
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) fail('start with YAML metadata between two --- lines');
  let data;
  try { data = parse(match[1], { maxAliasCount: 0 }); }
  catch (error) { fail(`invalid metadata: ${error.message}`); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('metadata must be a mapping');
  for (const field of ['title', 'description', 'date']) {
    if (typeof data[field] !== 'string' || !data[field].trim()) fail(`${field} is required`);
  }
  const date = new Date(`${data.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) {
    fail('date must be a real calendar date in YYYY-MM-DD format');
  }
  if (data.draft !== undefined && typeof data.draft !== 'boolean') fail('draft must be true or false, without quotes');
  for (const field of ['author', 'category']) {
    if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) fail(`${field} must be text`);
  }
  const body = match[2].trim();
  if (!body) fail('write the article below the metadata');
  return {
    slug, title: data.title.trim(), description: data.description.trim(), date: data.date,
    author: data.author?.trim() || 'فريق كيرفلو', category: data.category?.trim() || 'دليل كيرفلو',
    draft: data.draft ?? false, body,
    readingMinutes: Math.max(1, Math.ceil(body.split(/\s+/u).length / 180)),
  };
}

export async function loadPosts(directory) {
  const files = (await readdir(directory)).filter(file => file.endsWith('.md'));
  const posts = await Promise.all(files.map(async file => parsePost(await readFile(path.join(directory, file), 'utf8'), file)));
  return posts.filter(post => !post.draft).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function blogContent({ contentDirectory = 'content/blog' } = {}) {
  const publicId = 'virtual:blog-posts';
  const resolvedId = '\0' + publicId;
  let directory;
  let isBuild;
  return {
    name: 'careflow-blog',
    configResolved(config) {
      directory = path.resolve(config.root, contentDirectory);
      isBuild = config.command === 'build';
    },
    resolveId(id) { if (id === publicId) return resolvedId; },
    async load(id) {
      if (id !== resolvedId) return;
      if (isBuild) {
        this.addWatchFile(directory);
        for (const file of await readdir(directory)) this.addWatchFile(path.join(directory, file));
      }
      return `export default ${JSON.stringify(await loadPosts(directory))};`;
    },
    configureServer(server) {
      server.watcher.add(directory);
      const refresh = file => {
        if (path.dirname(path.resolve(file)) !== directory || !file.endsWith('.md')) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      };
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, refresh);
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, refresh);
      });
    },
  };
}
