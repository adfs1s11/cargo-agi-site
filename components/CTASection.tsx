
import React from 'react';

const CTASection: React.FC = () => {
  const smoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-3xl sm:text-4xl font-orbitron font-bold text-brand-accent mb-6 animate-fade-in-up">
        Ready to Embrace the Future of Logistics?
      </h2>
      <p className="text-lg sm:text-xl text-brand-text-darker mb-10 max-w-xl mx-auto animate-fade-in-up" style={{animationDelay: '0.2s'}}>
        Partner with CargoAGI and lead the transformation in your industry. Let's build a smarter, faster, and more sustainable supply chain together.
      </p>
      <div className="animate-fade-in-up" style={{animationDelay: '0.4s'}}>
        <a
          href="mailto:contact@cargoagi.com" // Placeholder email
          className="bg-brand-accent hover:bg-brand-accent-hover text-white font-semibold py-4 px-10 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl inline-block"
        >
          Contact Us to Learn More
        </a>
      </div>
      <p className="text-sm text-brand-text-darker mt-8 animate-fade-in-up" style={{animationDelay: '0.6s'}}>
        Or <a href="#hero" onClick={(e) => smoothScroll(e, '#hero')} className="text-brand-accent hover:underline">explore our vision again</a>.
      </p>
    </div>
  );
};

export default CTASection;
