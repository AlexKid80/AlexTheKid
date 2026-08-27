(function () {
  var year = document.getElementById("year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  var revealItems = document.querySelectorAll(".section, .topic-card, .hero-card");

  for (var i = 0; i < revealItems.length; i += 1) {
    revealItems[i].classList.add("reveal");
  }

  if (!("IntersectionObserver" in window)) {
    for (var j = 0; j < revealItems.length; j += 1) {
      revealItems[j].classList.add("is-visible");
    }
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.14
  });

  for (var k = 0; k < revealItems.length; k += 1) {
    observer.observe(revealItems[k]);
  }
})();