import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import HomePage from '../pages/home';
import BlogPage from '../pages/blog';
import ErrorPage from '../pages/error';
import SeoMetadata from './metadata.jsx';

export function renderSeoHead(metadata) {
    return renderToStaticMarkup(<SeoMetadata metadata={metadata} />);
}

export function renderPublicPage(pathname) {
    const router = createMemoryRouter([
        { path: '/', element: <HomePage /> },
        { path: '/blog', element: <BlogPage /> },
        { path: '/blog/:slug', element: <BlogPage /> },
        { path: '*', element: <ErrorPage notFound manageMetadata={false} /> },
    ], { initialEntries: [pathname] });
    try { return renderToStaticMarkup(<RouterProvider router={router} />); }
    finally { router.dispose(); }
}
