// 모바일 메뉴 토글
const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const mobileMenu = document.querySelector('.mobile-menu');
const mobileMenuLinks = document.querySelectorAll('.mobile-menu nav a');

mobileMenuBtn.addEventListener('click', () => {
  mobileMenuBtn.classList.toggle('active');
  mobileMenu.classList.toggle('active');
  document.body.classList.toggle('menu-open');
});

// 모바일 메뉴 링크 클릭 시 메뉴 닫기
mobileMenuLinks.forEach(link => {
  link.addEventListener('click', () => {
    mobileMenuBtn.classList.remove('active');
    mobileMenu.classList.remove('active');
    document.body.classList.remove('menu-open');
  });
});

// 스크롤 시 헤더 스타일 변경
const header = document.querySelector('.site-header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll <= 0) {
    header.classList.remove('scroll-up');
    return;
  }
  
  if (currentScroll > lastScroll && !header.classList.contains('scroll-down')) {
    header.classList.remove('scroll-up');
    header.classList.add('scroll-down');
  } else if (currentScroll < lastScroll && header.classList.contains('scroll-down')) {
    header.classList.remove('scroll-down');
    header.classList.add('scroll-up');
  }
  lastScroll = currentScroll;
});

// 폼 유효성 검사
const contactForm = document.querySelector('.contact-form');

contactForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = contactForm.querySelector('input[name="Name"]');
  const email = contactForm.querySelector('input[name="Email"]');
  const phone = contactForm.querySelector('input[name="Phone"]');
  const inquiry = contactForm.querySelector('select[name="Inquiry"]');
  const message = contactForm.querySelector('textarea[name="Message"]');
  
  let isValid = true;
  
  // 이름 검사
  if (name.value.trim() === '') {
    showError(name, '이름을 입력해주세요.');
    isValid = false;
  } else {
    removeError(name);
  }
  
  // 이메일 검사
  if (email.value.trim() === '') {
    showError(email, '이메일을 입력해주세요.');
    isValid = false;
  } else if (!isValidEmail(email.value)) {
    showError(email, '올바른 이메일 형식이 아닙니다.');
    isValid = false;
  } else {
    removeError(email);
  }
  
  // 전화번호 검사 (선택사항)
  if (phone.value.trim() !== '' && !isValidPhone(phone.value)) {
    showError(phone, '올바른 전화번호 형식이 아닙니다.');
    isValid = false;
  } else {
    removeError(phone);
  }
  
  // 문의 유형 검사
  if (inquiry.value === '') {
    showError(inquiry, '문의 유형을 선택해주세요.');
    isValid = false;
  } else {
    removeError(inquiry);
  }
  
  // 메시지 검사
  if (message.value.trim() === '') {
    showError(message, '문의 내용을 입력해주세요.');
    isValid = false;
  } else {
    removeError(message);
  }
  
  if (isValid) {
    // 폼 제출 처리
    const formData = new FormData(contactForm);
    const data = Object.fromEntries(formData);
    
    // 여기에 실제 폼 제출 로직 추가
    console.log('Form submitted:', data);
    
    // 성공 메시지 표시
    showSuccess('문의가 성공적으로 전송되었습니다.');
    contactForm.reset();
  }
});

// 유효성 검사 헬퍼 함수
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function isValidPhone(phone) {
  const re = /^[0-9]{2,3}-[0-9]{3,4}-[0-9]{4}$/;
  return re.test(phone);
}

function showError(input, message) {
  const formControl = input.parentElement;
  const error = formControl.querySelector('.error-message') || document.createElement('div');
  error.className = 'error-message';
  error.textContent = message;
  
  if (!formControl.querySelector('.error-message')) {
    formControl.appendChild(error);
  }
  
  input.classList.add('error');
}

function removeError(input) {
  const formControl = input.parentElement;
  const error = formControl.querySelector('.error-message');
  
  if (error) {
    formControl.removeChild(error);
  }
  
  input.classList.remove('error');
}

function showSuccess(message) {
  const success = document.createElement('div');
  success.className = 'success-message';
  success.textContent = message;
  
  contactForm.insertBefore(success, contactForm.firstChild);
  
  setTimeout(() => {
    success.remove();
  }, 3000);
}

// 스크롤 애니메이션
const sections = document.querySelectorAll('.section');

const observerOptions = {
  root: null,
  rootMargin: '0px',
  threshold: 0.1
};

const observer = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

sections.forEach(section => {
  observer.observe(section);
}); 