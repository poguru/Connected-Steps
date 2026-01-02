const toggle = document.querySelector(".mobile-toggle");
const nav = document.querySelector(".main-nav");

toggle.addEventListener("click", () => {
  nav.style.display = nav.style.display === "flex" ? "none" : "flex";
});
