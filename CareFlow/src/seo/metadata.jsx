import { siteName, socialImage, serializeStructuredData } from './metadata';

export default function SeoMetadata({ metadata }) {
    return <>
        <title data-seo="true">{metadata.title}</title>
        <meta data-seo="true" name="description" content={metadata.description} />
        <meta data-seo="true" name="robots" content={metadata.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'} />
        {metadata.canonical && <link data-seo="true" rel="canonical" href={metadata.canonical} />}
        <meta data-seo="true" property="og:locale" content="ar_IQ" />
        <meta data-seo="true" property="og:site_name" content={siteName} />
        <meta data-seo="true" property="og:type" content={metadata.type} />
        <meta data-seo="true" property="og:title" content={metadata.title} />
        <meta data-seo="true" property="og:description" content={metadata.description} />
        {metadata.canonical && <meta data-seo="true" property="og:url" content={metadata.canonical} />}
        <meta data-seo="true" property="og:image" content={socialImage} />
        <meta data-seo="true" property="og:image:alt" content="شعار كيرفلو" />
        <meta data-seo="true" name="twitter:card" content="summary" />
        <meta data-seo="true" name="twitter:title" content={metadata.title} />
        <meta data-seo="true" name="twitter:description" content={metadata.description} />
        <meta data-seo="true" name="twitter:image" content={socialImage} />
        <meta data-seo="true" name="twitter:image:alt" content="شعار كيرفلو" />
        {metadata.published && <meta data-seo="true" property="article:published_time" content={metadata.published} />}
        {!!metadata.structuredData.length && <script data-seo="true" type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeStructuredData(metadata.structuredData) }} />}
    </>;
}
