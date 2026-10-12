import Header from "../components/header";
import Hero from "../components/hero";
import Features from "../components/features";
import Pricing from "../components/pricing";
import Footer from "../components/footer";
import Promotions from '../components/promotions';

export default function HomePage(){

    return <>
   <Header/>
    <main>
      <Hero />
      <Features />
      <Pricing />
      <Promotions />
    </main>
    <Footer />
    </>
}
