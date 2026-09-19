
import './App.css';
import {createBrowserRouter,RouterProvider} from "react-router-dom";
import HomePage from './pages/home';
import LoginPage from './pages/login';
import SignupPage from './pages/signup';
import AppPage from './pages/app-page';
function App() {
 
const router = createBrowserRouter([
  {path:"/",element:<HomePage/>},
  {path:"/login",element:<LoginPage/>},
  {path:"/signup",element:<SignupPage/>},
  {path:"/app",element:<AppPage/>}
])
  return (
    <RouterProvider router={router}/>
  )
}

export default App
