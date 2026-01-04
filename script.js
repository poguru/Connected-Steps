document.addEventListener("DOMContentLoaded", () => {

  /* ================= JOURNEY SLIDER ================= */
  const jTrack = document.getElementById("journeyTrack");
  const jSlides = document.querySelectorAll(".journey-slide");
  const jDotsWrap = document.getElementById("journeyDots");
  const jSlider = document.getElementById("journeySlider");

  if (jTrack && jSlides.length && jDotsWrap && jSlider) {
    let jIndex = 0;
    let jInterval;

    // Create dots
    jSlides.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === 0) dot.classList.add("active");
      dot.onclick = () => goJourney(i);
      jDotsWrap.appendChild(dot);
    });

    const jDots = jDotsWrap.querySelectorAll("span");

    function updateJourney() {
      jTrack.style.transform = `translateX(-${jIndex * 100}%)`;
      jDots.forEach((d, i) => d.classList.toggle("active", i === jIndex));
    }

    function nextJourney() {
      jIndex = (jIndex + 1) % jSlides.length;
      updateJourney();
    }

    function goJourney(i) {
      jIndex = i;
      updateJourney();
      restartJourney();
    }

    function startJourney() {
      jInterval = setInterval(nextJourney, 4500);
    }

    function stopJourney() {
      clearInterval(jInterval);
    }

    function restartJourney() {
      stopJourney();
      startJourney();
    }

    // Pause on hover
    jSlider.addEventListener("mouseenter", stopJourney);
    jSlider.addEventListener("mouseleave", startJourney);

    // Swipe support (mobile)
    let startX = 0;
    jSlider.addEventListener("touchstart", e => startX = e.touches[0].clientX);
    jSlider.addEventListener("touchend", e => {
      const diff = e.changedTouches[0].clientX - startX;
      if (diff > 50) jIndex = (jIndex - 1 + jSlides.length) % jSlides.length;
      if (diff < -50) jIndex = (jIndex + 1) % jSlides.length;
      updateJourney();
      restartJourney();
    });

    startJourney();
  }

  /* ================= EVENT POPUP ================= */
  const popup = document.getElementById("startupPopup");
  if (popup) {
    setTimeout(() => popup.classList.add("show"), 500);
  }

});

/* Close popup */
function closePopup() {
  const popup = document.getElementById("startupPopup");
  if (popup) popup.classList.remove("show");
}
