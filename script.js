// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        target.scrollIntoView({ behavior: 'smooth' });
    });
});

// Form submission handler
document.querySelector('.contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Thanks for reaching out! I\'ll waddle back to you soon! 🐧');
    this.reset();
});

// Create falling snowflakes
function createSnowflakes() {
    const container = document.getElementById('snowflakes');
    const snowflakeCount = 15;
    
    for (let i = 0; i < snowflakeCount; i++) {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.innerHTML = '❄';
        snowflake.style.left = Math.random() * 100 + '%';
        snowflake.style.animationDuration = (Math.random() * 3 + 5) + 's';
        snowflake.style.animationDelay = Math.random() * 5 + 's';
        snowflake.style.fontSize = (Math.random() * 10 + 15) + 'px';
        snowflake.style.opacity = Math.random() * 0.5 + 0.3;
        container.appendChild(snowflake);
    }
}

// Initialize snowflakes when page loads
createSnowflakes();