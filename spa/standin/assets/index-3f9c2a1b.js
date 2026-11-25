// Stand-in for a roux-web build: reads what the server wrote into the page.
const theme = JSON.parse(document.getElementById("app-theme").textContent);
const context = JSON.parse(document.getElementById("app-context").textContent);
document.getElementById("root").textContent =
  `Hello from ${theme.appName} (${context.timeZone}, today is ${context.today}) at ${location.pathname}`;
