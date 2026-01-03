const track = document.getElementById("coachTrack");
const cards = document.querySelectorAll(".coach-card");
const dotsWrap = document.getElementById("coachDots");
let index = 0;
let interval;

// create dots
cards.forEach((_, i) => {
  const d = document.createElement("span");
  if(i === 0) d.classList.add("active");
  d.onclick = () => goTo(i);
  dotsWrap.appendChild(d);
});
const dots = dotsWrap.querySelectorAll("span");

function update(){
  track.style.transform = `translateX(-${index * 100}%)`;
  cards.forEach((c,i)=>c.classList.toggle("active", i===index));
  dots.forEach((d,i)=>d.classList.toggle("active", i===index));
}

function next(){
  index = (index + 1) % cards.length;
  update();
}

function goTo(i){
  index = i;
  update();
  restart();
}

function start(){
  interval = setInterval(next, 3500);
}

function stop(){
  clearInterval(interval);
}

function restart(){
  stop();
  start();
}

// pause on hover
const slider = document.getElementById("coachSlider");
slider.addEventListener("mouseenter", stop);
slider.addEventListener("mouseleave", start);

// swipe support (mobile)
let startX = 0;
slider.addEventListener("touchstart", e => startX = e.touches[0].clientX);
slider.addEventListener("touchend", e => {
  const diff = e.changedTouches[0].clientX - startX;
  if(diff > 50) index = (index - 1 + cards.length) % cards.length;
  if(diff < -50) index = (index + 1) % cards.length;
  update(); restart();
});

// init
cards[0].classList.add("active");
start();
const jTrack = document.getElementById("journeyTrack");
const jSlides = document.querySelectorAll(".journey-slide");
const jDotsWrap = document.getElementById("journeyDots");

let jIndex = 0;
let jInterval;

// create dots
jSlides.forEach((_, i) => {
  const d = document.createElement("span");
  if(i === 0) d.classList.add("active");
  d.onclick = () => goJourney(i);
  jDotsWrap.appendChild(d);
});
const jDots = jDotsWrap.querySelectorAll("span");

function updateJourney(){
  jTrack.style.transform = `translateX(-${jIndex * 100}%)`;
  jDots.forEach((d,i)=>d.classList.toggle("active", i===jIndex));
}

function nextJourney(){
  jIndex = (jIndex + 1) % jSlides.length;
  updateJourney();
}

function goJourney(i){
  jIndex = i;
  updateJourney();
  restartJourney();
}

function startJourney(){
  jInterval = setInterval(nextJourney, 4500);
}

function stopJourney(){
  clearInterval(jInterval);
}

function restartJourney(){
  stopJourney();
  startJourney();
}

// pause on hover
const jSlider = document.getElementById("journeySlider");
jSlider.addEventListener("mouseenter", stopJourney);
jSlider.addEventListener("mouseleave", startJourney);

// swipe mobile
let jStartX = 0;
jSlider.addEventListener("touchstart", e => jStartX = e.touches[0].clientX);
jSlider.addEventListener("touchend", e => {
  const diff = e.changedTouches[0].clientX - jStartX;
  if(diff > 50) jIndex = (jIndex - 1 + jSlides.length) % jSlides.length;
  if(diff < -50) jIndex = (jIndex + 1) % jSlides.length;
  updateJourney(); restartJourney();
});

startJourney();

// Event popup – show once per session

window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("startupPopup").classList.add("show");
  }, 500);
});

function closePopup() {
  document.getElementById("startupPopup").classList.remove("show");
}


