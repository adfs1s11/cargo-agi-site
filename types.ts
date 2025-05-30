
// Example: Define shared types if needed.
// For instance, if you had a complex data structure for features or benefits
// that you wanted to type strictly across components.

export interface NavLink {
  href: string;
  label: string;
}

export interface Feature {
  icon: React.ReactNode; // For JSX elements like Heroicons
  title: string;
  description: string;
  delay?: string;
}

// This file can be expanded as the application grows.
// For now, it's mostly illustrative as many types are defined locally in components.
