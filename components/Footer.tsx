
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-brand-secondary border-t border-brand-accent/20 text-brand-text-darker py-8">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="mb-4">
          <a href="#hero" className="font-orbitron text-2xl font-bold text-brand-accent">Cargo</a>
          <a href="#hero" className="font-orbitron text-2xl font-bold text-white">AGI</a>
        </div>
        <p className="text-sm mb-2">
          &copy; {new Date().getFullYear()} CargoAGI. All rights reserved.
        </p>
        <p className="text-xs">
          Pioneering Intelligent Logistics for a Connected Future.
        </p>
        <div className="mt-4 space-x-4">
          <a href="#" className="hover:text-brand-accent transition-colors">Privacy Policy</a>
          <span className="text-brand-text-darker">|</span>
          <a href="#" className="hover:text-brand-accent transition-colors">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
