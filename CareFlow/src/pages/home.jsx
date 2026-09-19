import Header from "../components/header";
import Hero from "../components/hero";
import Pricing from "../components/pricing";
import Footer from "../components/footer";

export default function HomePage(){

    return <>
   <Header/>
    <main>
      <Hero />
      <Pricing />
    </main>
    <Footer />
    </>
}
