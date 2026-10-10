
import './App.css';
import { lazy, Suspense } from 'react';
import {createBrowserRouter,RouterProvider} from "react-router-dom";
import HomePage from './pages/home';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import VerifyEmailPage from './pages/verify-email';
import ForgotPasswordPage from './pages/forgot-password';
import ResetPasswordPage from './pages/reset-password';
import ProtectedApp from './auth/protected-app';
const DemoPage = lazy(() => import('./pages/demo'));
const BlogPage = lazy(() => import('./pages/blog'));
const blogElement = <Suspense fallback={<p dir="rtl" role="status">جارٍ تحميل المدونة…</p>}><BlogPage/></Suspense>;

const router = createBrowserRouter([
  {path:"/",element:<HomePage/>},
  {path:"/blog",element:blogElement},
  {path:"/blog/:slug",element:blogElement},
  {path:"/login",element:<LoginPage/>},
  {path:"/signup",element:<SignupPage/>},
  {path:"/verify-email",element:<VerifyEmailPage/>},
  {path:"/forgot-password",element:<ForgotPasswordPage/>},
  {path:"/reset-password",element:<ResetPasswordPage/>},
  {path:"/app",element:<ProtectedApp/>},
  {path:"/subscription",element:<ProtectedApp billingOnly/>},
  {path:"/demo",element:<Suspense fallback={<p dir="rtl" role="status">جارٍ تحميل العرض التجريبي…</p>}><DemoPage/></Suspense>},

])
function App() {
  return (
    <RouterProvider router={router}/>
  )
}

export default App
