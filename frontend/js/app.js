document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('button');

  if (button) {
    button.addEventListener('click', () => {
      alert('Bienvenido al sistema de gestión de fondos mutuos.');
    });
  }
});
