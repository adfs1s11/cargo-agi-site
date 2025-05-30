
import React from 'react';
import Header from './components/Header';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import FeaturesSection from './components/FeaturesSection';
import TechnologySection from './components/TechnologySection';
import BenefitsSection from './components/BenefitsSection';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import { ScrollToTopButton } from './components/ScrollToTopButton';


const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-brand-primary overflow-x-hidden">
      <Header />
      <main className="flex-grow">
        <HeroSection />
        <div id="about" className="py-16 sm:py-24 bg-brand-secondary">
          <AboutSection />
        </div>
        <div id="features" className="py-16 sm:py-24 bg-brand-primary">
          <FeaturesSection />
        </div>
        <div id="technology" className="py-16 sm:py-24 bg-brand-secondary">
          <TechnologySection />
        </div>
         <div id="benefits" className="py-16 sm:py-24 bg-brand-primary">
          <BenefitsSection />
        </div>
        <div id="contact" className="py-16 sm:py-24 bg-brand-secondary">
          <CTASection />
        </div>
      </main>
      <Footer />
      <ScrollToTopButton />
    </div>
  );
};

export default App;
