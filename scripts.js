// basic mobile toggle + simple form feedback
document.querySelectorAll('.mobile-toggle').forEach(btn=>{
  btn.addEventListener('click', ()=> {
    const nav = document.querySelector('.main-nav');
    nav.style.display = (nav.style.display === 'flex')? 'none':'flex';
  })
});

// optional: show a simple success message when using Formspree
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', e=>{
    // allow default Formspree submit + fallback: show quick message
    setTimeout(()=>alert('Thanks — we received your message!'), 700);
  });
}
