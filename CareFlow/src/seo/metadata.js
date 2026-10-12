export const siteUrl = 'https://app-careflow.com';
export const siteName = 'كيرفلو';
export const socialImage = `${siteUrl}/careflow.png`;
export const privatePaths = ['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password', '/app', '/subscription', '/demo'];

const description = 'كيرفلو برنامج عربي لإدارة العيادات في العراق. نظّم سجلات المرضى وقائمة الانتظار والزيارات، مع صلاحيات للطبيب والموظف. جرّب العرض التجريبي بدون تسجيل.';
const organization = { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: siteName, url: siteUrl, logo: socialImage };

export function getMetadata(pathname, posts = []) {
    const path = pathname.replace(/\/+$/, '') || '/';
    const base = { title: `${siteName} | إدارة العيادات`, description, noindex: true, type: 'website', structuredData: [] };
    if (path === '/') return {
        ...base, title: 'كيرفلو | برنامج إدارة العيادات والمرضى في العراق', canonical: `${siteUrl}/`, noindex: false,
        structuredData: [organization, { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: siteName,
            alternateName: 'CareFlow', url: `${siteUrl}/`, inLanguage: 'ar-IQ', publisher: { '@id': organization['@id'] } }],
    };
    if (path === '/blog') return {
        ...base, title: 'مدونة كيرفلو | أدلة تنظيم العيادة وإدارة المرضى',
        description: 'أدلة عملية لتنظيم يوم العيادة وإدارة سجلات المرضى وقائمة الانتظار والزيارات، والتعرّف على استخدام برنامج كيرفلو.',
        canonical: `${siteUrl}/blog/`, noindex: false,
    };
    const post = posts.find(item => !item.draft && path === `/blog/${item.slug}`);
    if (post) {
        const canonical = `${siteUrl}/blog/${post.slug}/`;
        return { ...base, title: `${post.title} | كيرفلو`, description: post.description, canonical,
            noindex: false, type: 'article', published: post.date, author: post.author,
            structuredData: [organization, {
                '@type': 'BlogPosting', '@id': `${canonical}#article`, headline: post.title,
                description: post.description, datePublished: post.date, inLanguage: 'ar-IQ',
                mainEntityOfPage: canonical, url: canonical,
                author: { '@type': post.author === 'فريق كيرفلو' ? 'Organization' : 'Person', name: post.author },
                publisher: { '@id': organization['@id'] },
            }, { '@type': 'BreadcrumbList', itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${siteUrl}/` },
                { '@type': 'ListItem', position: 2, name: 'المدونة', item: `${siteUrl}/blog/` },
                { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
            ] }],
        };
    }
    const titles = {
        '/login': 'تسجيل الدخول', '/signup': 'إنشاء حساب', '/verify-email': 'تأكيد البريد الإلكتروني',
        '/forgot-password': 'نسيت كلمة السر', '/reset-password': 'تغيير كلمة السر',
        '/app': 'مساحة العيادة', '/subscription': 'الاشتراك', '/demo': 'العرض التجريبي',
    };
    return { ...base, title: `${titles[path] || 'الصفحة غير موجودة'} | كيرفلو` };
}

export function serializeStructuredData(items) {
    return JSON.stringify({ '@context': 'https://schema.org', '@graph': items }).replace(/</g, '\\u003c');
}
