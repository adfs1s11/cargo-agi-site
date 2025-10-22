// ===== Scroll Progress Bar =====
window.addEventListener('scroll', () => {
  const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  const scrolled = (window.scrollY / windowHeight) * 100;
  document.documentElement.style.setProperty('--scroll-progress', `${scrolled}%`);
});

// ===== Header Scroll Effect =====
const header = document.querySelector('.header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll > 100) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
  
  lastScroll = currentScroll;
});

// ===== Smooth Scroll for Navigation Links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    
    if (target) {
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ===== Intersection Observer for Fade-in Animation =====
const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.1
};

const fadeInObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

// Apply fade-in animation to sections
document.querySelectorAll('.section').forEach(section => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
  fadeInObserver.observe(section);
});

// ===== Animate List Items on Scroll =====
const listObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const listItems = entry.target.querySelectorAll('li');
      listItems.forEach((item, index) => {
        setTimeout(() => {
          item.style.opacity = '1';
          item.style.transform = 'translateX(0)';
        }, index * 100);
      });
      listObserver.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('.section ul').forEach(ul => {
  const listItems = ul.querySelectorAll('li');
  listItems.forEach(item => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-20px)';
    item.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
  });
  listObserver.observe(ul);
});

// ===== Parallax Effect for Hero Section =====
window.addEventListener('scroll', () => {
  const scrolled = window.pageYOffset;
  const hero = document.querySelector('.hero-overlay');
  
  if (hero) {
    hero.style.transform = `translateY(${scrolled * 0.5}px)`;
  }
});

// ===== Add Active State to Navigation on Scroll =====
const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav a');

window.addEventListener('scroll', () => {
  let current = '';
  
  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.clientHeight;
    
    if (window.pageYOffset >= sectionTop - 150) {
      current = section.getAttribute('id');
    }
  });
  
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

// ===== Loading Animation =====
window.addEventListener('load', () => {
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.transition = 'opacity 0.5s ease-in';
    document.body.style.opacity = '1';
  }, 100);
});

// ===== Cursor Custom Effect (Optional - Premium Touch) =====
const cursor = document.createElement('div');
cursor.className = 'custom-cursor';
cursor.style.cssText = `
  width: 20px;
  height: 20px;
  border: 2px solid rgba(37, 99, 235, 0.5);
  border-radius: 50%;
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  transition: transform 0.15s ease-out;
  display: none;
`;

document.body.appendChild(cursor);

document.addEventListener('mousemove', (e) => {
  cursor.style.display = 'block';
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});

document.querySelectorAll('a, button, .btn').forEach(element => {
  element.addEventListener('mouseenter', () => {
    cursor.style.transform = 'scale(1.5)';
    cursor.style.borderColor = 'rgba(124, 58, 237, 0.8)';
  });
  
  element.addEventListener('mouseleave', () => {
    cursor.style.transform = 'scale(1)';
    cursor.style.borderColor = 'rgba(37, 99, 235, 0.5)';
  });
});

// ===== Mobile Menu Toggle (for future mobile optimization) =====
const createMobileMenu = () => {
  if (window.innerWidth <= 768) {
    const nav = document.querySelector('.nav');
    if (nav && !document.querySelector('.mobile-menu-btn')) {
      const menuBtn = document.createElement('button');
      menuBtn.className = 'mobile-menu-btn';
      menuBtn.innerHTML = '☰';
      menuBtn.style.cssText = `
        display: block;
        background: none;
        border: none;
        font-size: 28px;
        cursor: pointer;
        color: var(--dark-color);
      `;
      
      header.appendChild(menuBtn);
      
      menuBtn.addEventListener('click', () => {
        nav.classList.toggle('mobile-active');
      });
    }
  }
};

window.addEventListener('resize', createMobileMenu);
createMobileMenu();

// ===== Performance Optimization: Debounce Scroll Events =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Apply debounce to scroll-heavy operations
const debouncedScroll = debounce(() => {
  // Additional scroll operations can be added here
}, 10);

window.addEventListener('scroll', debouncedScroll);

console.log('🚀 Car Go AGi - 사이트가 성공적으로 로드되었습니다!');
