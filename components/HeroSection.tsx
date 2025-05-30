
import React from 'react';

const HeroSection: React.FC = () => {
  const smoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };
  
  return (
    <section id="hero" className="relative h-screen flex items-center justify-center text-center bg-brand-primary overflow-hidden">
      {/* Animated background - simple version */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-primary opacity-70"></div>
        {/* You could add more complex particle animations or WebGL backgrounds here */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-brand-accent opacity-10 animate-pulse-glow"
            style={{
              width: `${Math.random() * 5 + 2}px`,
              height: `${Math.random() * 5 + 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDuration: `${Math.random() * 3 + 2}s`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
      
      <div className="relative z-10 p-6 container mx-auto">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-orbitron font-bold mb-6 animate-fade-in-up">
          <span className="text-brand-accent">Cargo</span>
          <span className="text-white">AGI</span>
        </h1>
        <p className="text-xl sm:text-2xl md:text-3xl text-brand-text-darker mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          Pioneering the Future of Intelligent Logistics
        </p>
        <p className="text-lg sm:text-xl text-brand-text mb-12 max-w-3xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          Harnessing Artificial General Intelligence to revolutionize global supply chains, enhance efficiency, and drive sustainable growth.
        </p>
        <div className="animate-fade-in-up" style={{ animationDelay: '0.9s' }}>
          <a
            href="#features"
            onClick={(e) => smoothScroll(e, '#features')}
            className="bg-brand-accent hover:bg-brand-accent-hover text-white font-semibold py-3 px-8 rounded-lg text-lg transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            Explore Our Vision
          </a>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
