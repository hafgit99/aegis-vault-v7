document.addEventListener('DOMContentLoaded', () => {
  // --- Platform Detection and Highlight ---
  const detectPlatform = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const downloadLabel = document.getElementById('platform-download-label');
    const primaryBtn = document.getElementById('hero-primary-btn');
    
    if (/android/i.test(userAgent)) {
      if (downloadLabel) downloadLabel.textContent = 'Android cihazınız algılandı';
      if (primaryBtn) {
        primaryBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Google Play Store'dan İndir
        `;
      }
    } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      if (downloadLabel) downloadLabel.textContent = 'iOS cihazınız algılandı';
      if (primaryBtn) {
        primaryBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          App Store'dan İndir
        `;
      }
    } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
      if (downloadLabel) downloadLabel.textContent = 'macOS sisteminiz algılandı';
      if (primaryBtn) {
        primaryBtn.setAttribute('href', '#download');
        primaryBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          macOS (DMG) İndir
        `;
      }
    } else if (/Linux/i.test(userAgent)) {
      if (downloadLabel) downloadLabel.textContent = 'Linux sisteminiz algılandı';
      if (primaryBtn) {
        primaryBtn.setAttribute('href', '#download');
        primaryBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Linux (AppImage) İndir
        `;
      }
    } else {
      // Default Windows
      if (downloadLabel) downloadLabel.textContent = 'Windows sisteminiz algılandı';
      if (primaryBtn) {
        primaryBtn.setAttribute('href', '#download');
        primaryBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Windows (Setup) İndir
        `;
      }
    }
  };
  
  detectPlatform();

  // --- Scroll Reveal Animation ---
  const revealElements = document.querySelectorAll('.reveal');
  const revealOnScroll = () => {
    const triggerBottom = (window.innerHeight / 5) * 4.2;
    revealElements.forEach(el => {
      const elTop = el.getBoundingClientRect().top;
      if (elTop < triggerBottom) {
        el.classList.add('active');
      }
    });
  };

  // Run on load and bind scroll
  revealOnScroll();
  window.addEventListener('scroll', revealOnScroll);

  // --- Password Strength Checker Demo Logic ---
  const pwdInput = document.getElementById('demo-password-input');
  const toggleBtn = document.getElementById('demo-toggle-visibility');
  const strengthBar = document.getElementById('demo-strength-bar');
  
  const scoreLabel = document.getElementById('demo-score-val');
  const entropyLabel = document.getElementById('demo-entropy-val');
  const crackTimeLabel = document.getElementById('demo-crack-val');

  if (pwdInput && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const type = pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
      pwdInput.setAttribute('type', type);
      toggleBtn.innerHTML = type === 'password' 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    });

    pwdInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (!val) {
        resetDemo();
        return;
      }
      
      const analysis = analyzePassword(val);
      updateUI(analysis);
    });
  }

  const resetDemo = () => {
    if (strengthBar) {
      strengthBar.style.width = '0%';
      strengthBar.style.background = 'transparent';
    }
    if (scoreLabel) scoreLabel.textContent = '-';
    if (entropyLabel) entropyLabel.textContent = '0 bits';
    if (crackTimeLabel) crackTimeLabel.textContent = '0 saniye';
  };

  const analyzePassword = (pwd) => {
    let charsetSize = 0;
    if (/[a-z]/.test(pwd)) charsetSize += 26;
    if (/[A-Z]/.test(pwd)) charsetSize += 26;
    if (/[0-9]/.test(pwd)) charsetSize += 10;
    if (/[^a-zA-Z0-9]/.test(pwd)) charsetSize += 33; // Approx special characters pool
    
    if (charsetSize === 0) charsetSize = 1;
    
    // Entropy = length * log2(charsetSize)
    const entropy = Math.round(pwd.length * Math.log2(charsetSize));
    
    // Estimate crack attempts
    const attempts = Math.pow(2, entropy);
    
    // Assuming 100 Billion attempts per second (high-end offline GPU rig)
    const attemptsPerSec = 100000000000;
    const secondsToCrack = attempts / attemptsPerSec;
    
    let timeText = '';
    if (secondsToCrack < 1) {
      timeText = 'Anında (< 1 sn)';
    } else if (secondsToCrack < 60) {
      timeText = `${Math.round(secondsToCrack)} saniye`;
    } else if (secondsToCrack < 3600) {
      timeText = `${Math.round(secondsToCrack / 60)} dakika`;
    } else if (secondsToCrack < 86400) {
      timeText = `${Math.round(secondsToCrack / 3600)} saat`;
    } else if (secondsToCrack < 31536000) {
      timeText = `${Math.round(secondsToCrack / 86400)} gün`;
    } else if (secondsToCrack < 3153600000) {
      timeText = `${Math.round(secondsToCrack / 31536000)} yıl`;
    } else {
      const years = secondsToCrack / 31536000;
      if (years > 1e12) {
        timeText = `${Math.round(years / 1e12)} trilyon yıl`;
      } else if (years > 1e9) {
        timeText = `${Math.round(years / 1e9)} milyar yıl`;
      } else if (years > 1e6) {
        timeText = `${Math.round(years / 1e6)} milyon yıl`;
      } else {
        timeText = `${Math.round(years)} yıl`;
      }
    }

    let score = 'Çok Zayıf';
    let color = 'var(--accent-red)';
    let pct = 15;
    
    if (entropy >= 80 && pwd.length >= 12) {
      score = 'Mükemmel';
      color = 'var(--accent-green)';
      pct = 100;
    } else if (entropy >= 60 && pwd.length >= 8) {
      score = 'Güçlü';
      color = 'var(--accent-cyan)';
      pct = 75;
    } else if (entropy >= 45) {
      score = 'Orta';
      color = 'var(--accent-yellow)';
      pct = 50;
    } else if (entropy >= 28) {
      score = 'Zayıf';
      color = '#f97316'; // Orange
      pct = 30;
    }
    
    return { entropy, timeText, score, color, pct };
  };

  const updateUI = (data) => {
    if (strengthBar) {
      strengthBar.style.width = `${data.pct}%`;
      strengthBar.style.background = data.color;
    }
    if (scoreLabel) {
      scoreLabel.textContent = data.score;
      scoreLabel.style.color = data.color;
    }
    if (entropyLabel) entropyLabel.textContent = `${data.entropy} bits`;
    if (crackTimeLabel) crackTimeLabel.textContent = data.timeText;
  };
});
