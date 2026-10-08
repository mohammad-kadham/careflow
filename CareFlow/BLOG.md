# Publishing blog posts

The public blog lives at **https://app-careflow.com/blog**. Posts are Markdown files
in `CareFlow/content/blog/` (relative to the GitHub repository root). No database
or admin account is needed to write posts.

## Add a post on GitHub

1. Open `CareFlow/content/blog/` in the repository and choose **Add file → Create new file**.
2. Name the file using lowercase English words separated by hyphens, for example
   `clinic-reception-tips.md`. This becomes `/blog/clinic-reception-tips`.
3. Copy the contents of `post-template.md`, then change the title, summary, date,
   category, and article text. Keep quotes around text values.
4. Keep `draft: true` while writing. Set **`draft: false`** when ready to publish.
5. Commit to `main`, or open a pull request and merge it. The existing GitHub Actions
   pipeline tests, builds, and deploys the site. The article appears after deployment succeeds.

To edit a post, edit its file and commit again. Keep the filename unchanged to preserve
existing links. Delete the file or set `draft: true` to remove it from the next deployment.

## File format

```markdown
---
title: "عنوان المقال"
description: "ملخص قصير يظهر في قائمة المقالات."
date: "2026-10-08"
author: "فريق كيرفلو"
category: "إدارة العيادة"
draft: false
---

مقدمة المقال.

## عنوان فرعي

اكتب هنا باستخدام **نص عريض**، قوائم، أو [روابط](/demo).
```

`title`, `description`, and a valid `date` are required. `author` defaults to
`فريق كيرفلو`, `category` defaults to `دليل كيرفلو`, and `draft` defaults to `false`.
Dates control newest-first ordering; they do **not** schedule publication. Use
`draft: true` to keep a post unpublished. Draft bodies and metadata are excluded from
the browser bundle (files committed to a public GitHub repository are still public there).
Invalid metadata fails the build with the filename and a useful error message.

## Formatting and images

Use `##` for section headings; the page already displays the title. Standard Markdown
is supported, plus tables, task lists, and strikethrough. Raw HTML, scripts, and
embedded components are not supported. Unsafe link protocols are filtered.

Put images in `CareFlow/public/blog/` and reference them with a root-relative path:

```markdown
![وصف واضح للصورة](/blog/reception.jpg)
```

Use root-relative internal links such as `/blog/getting-started-with-careflow`, not
relative `.md` filenames. Uploaded images in `public/` are always public, including
images referenced only in drafts.

## Preview locally

From `CareFlow/`, run `npm run dev` and open `/blog`. Published posts update when you
save, add, or remove Markdown files. To preview a draft locally, temporarily set
`draft: false`; restore it before committing if it is not ready to publish.

Before publishing, run `npm test`, `npm run lint`, and `npm run build`.
