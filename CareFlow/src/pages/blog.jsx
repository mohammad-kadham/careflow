import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import posts from 'virtual:blog-posts';
import Header from '../components/header';
import Footer from '../components/footer';
import BlogMarkdown from '../components/blog-markdown';
import styles from './blog.module.css';

const formatDate = date => new Intl.DateTimeFormat('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

function PostMeta({ post }) {
  return <div className={styles.meta}>
    <time dateTime={post.date}>{formatDate(post.date)}</time>
    <span aria-hidden="true">·</span>
    <span>{post.readingMinutes.toLocaleString('ar-IQ')} د قراءة</span>
  </div>;
}

function PostCard({ post, featured = false }) {
  return <article className={`${styles.card} ${featured ? styles.featured : ''}`}>
    <span className={styles.category}>{post.category}</span>
    <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
    <p>{post.description}</p>
    <PostMeta post={post} />
    <Link className={styles.readMore} to={`/blog/${post.slug}`} aria-label={`اقرأ المقال: ${post.title}`}>اقرأ المقال <span aria-hidden="true">←</span></Link>
  </article>;
}

export default function BlogPage() {
  const { slug } = useParams();
  const post = slug ? posts.find(item => item.slug === slug) : null;
  const title = slug ? post?.title || 'المقال غير موجود' : 'مدونة كيرفلو';
  const description = post?.description || 'أدلة وأفكار عملية لتنظيم يوم العيادة والعمل مع كيرفلو.';
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | كيرفلو`;
    window.scrollTo(0, 0);
    return () => { document.title = previousTitle; };
  }, [title, slug]);

  return <div className={styles.page} dir="rtl">
    <meta name="description" content={description} />
    <Header />
    <main id="blog-content" className={styles.main}>
      {!slug ? <>
        <header className={styles.intro}>
          <span className={styles.eyebrow}>من فريق كيرفلو</span>
          <h1>مساحة لأفكار تجعل<br /><span>يوم العيادة أسهل.</span></h1>
          <p>{description}</p>
        </header>
        {posts.length ? <section className={styles.grid} aria-label="مقالات المدونة">
          {posts.map((item, index) => <PostCard key={item.slug} post={item} featured={index === 0} />)}
        </section> : <p className={styles.empty}>نعمل على إعداد مقالات جديدة. تابعنا قريبًا.</p>}
        <aside className={styles.cta}><div><h2>اكتشف كيرفلو بنفسك</h2><p>جرّب تنظيم المرضى والزيارات في العرض التجريبي.</p></div><Link to="/demo">جرّب بدون تسجيل <span aria-hidden="true">←</span></Link></aside>
      </> : post ? <article className={styles.article}>
        <Link className={styles.back} to="/blog">→ جميع المقالات</Link>
        <header className={styles.articleHeader}>
          <span className={styles.category}>{post.category}</span>
          <h1>{post.title}</h1>
          <p className={styles.lead}>{post.description}</p>
          <div className={styles.byline}><span>{post.author}</span><PostMeta post={post} /></div>
        </header>
        <div className={styles.prose}><BlogMarkdown>{post.body}</BlogMarkdown></div>
        <div className={styles.articleEnd}><span>كيرفلو — إدارة أسهل. رعاية أفضل.</span><Link to="/blog">استكشف المزيد من المقالات ←</Link></div>
      </article> : <section className={styles.empty}>
        <span className={styles.eyebrow}>٤٠٤</span><h1>المقال غير موجود</h1>
        <p>قد يكون الرابط غير صحيح أو أن المقال لم يعد متاحًا.</p><Link className={styles.back} to="/blog">العودة إلى المدونة ←</Link>
      </section>}
    </main>
    <Footer />
  </div>;
}
