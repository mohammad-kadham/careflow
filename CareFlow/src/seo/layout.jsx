import { Outlet, useLocation } from 'react-router-dom';
import posts from 'virtual:blog-metadata';
import { getMetadata } from './metadata';
import SeoMetadata from './metadata.jsx';

export default function SeoLayout() {
    const { pathname } = useLocation();
    return <><SeoMetadata metadata={getMetadata(pathname, posts)} /><Outlet /></>;
}
