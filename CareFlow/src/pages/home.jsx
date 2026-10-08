import Header from "../components/header";
import Hero from "../components/hero";
import Features from "../components/features";
import Pricing from "../components/pricing";
import Footer from "../components/footer";

export default function HomePage(){

    return <>
   <Header/>
    <main>
      <Hero />
      <Features />
      <Pricing />
    </main>
    <Footer />
    </>
}
