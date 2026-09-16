document.addEventListener('DOMContentLoaded', () => {
  const logoutButton = document.getElementById('logoutButton');

  if (!logoutButton) return;

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = 'login.html';
  });
});