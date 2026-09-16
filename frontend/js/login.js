document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');
  const clienteForm = document.getElementById('clienteLoginForm');
  const cambioClaveForm = document.getElementById('cambioClaveForm');
  const resetClaveButton = document.getElementById('resetClaveButton');
  const resetClaveForm = document.getElementById('resetClaveForm');
  const empleadoAccessButton = document.getElementById('empleadoAccessButton');
  const clienteAccessButton = document.getElementById('clienteAccessButton');
  const empleadoInfo = document.getElementById('empleadoInfo');
  const clienteAccess = document.getElementById('clienteAccess');

  function mostrarAcceso(tipo) {
    const esCliente = tipo === 'cliente';
    form.hidden = esCliente;
    empleadoInfo.hidden = esCliente;
    clienteAccess.hidden = !esCliente;
    clienteForm.hidden = false;
    cambioClaveForm.hidden = true;
    resetClaveForm.hidden = true;
    empleadoAccessButton.classList.toggle('active', !esCliente);
    clienteAccessButton.classList.toggle('active', esCliente);
    message.textContent = '';
    message.className = 'message';
  }

  empleadoAccessButton.addEventListener('click', () => mostrarAcceso('empleado'));
  clienteAccessButton.addEventListener('click', () => mostrarAcceso('cliente'));

  resetClaveButton.addEventListener('click', () => {
    resetClaveForm.hidden = !resetClaveForm.hidden;
    if (!resetClaveForm.hidden) document.getElementById('resetCorreo').focus();
  });

  resetClaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clienteId = Number(document.getElementById('clienteId').value);
    const correo = document.getElementById('resetCorreo').value.trim();

    try {
      const response = await fetch('/api/clientes/solicitar-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId, correo }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo registrar la solicitud');

      const asunto = encodeURIComponent(data.asunto);
      const cuerpo = encodeURIComponent(data.detalle);
      window.location.href = `mailto:${data.administrador}?subject=${asunto}&body=${cuerpo}`;
      message.textContent = data.mensaje;
      message.className = 'message success';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });

  clienteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/clientes/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: Number(document.getElementById('clienteId').value),
          clave: document.getElementById('clienteClave').value,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo ingresar como cliente');

      localStorage.setItem('token', data.token);
      if (data.requiereCambioClave) {
        clienteForm.hidden = true;
        cambioClaveForm.hidden = false;
        document.getElementById('nuevaClave').focus();
        message.textContent = 'Por seguridad, debes cambiar la clave inicial';
        message.className = 'message error';
        return;
      }

      window.location.href = 'clientes.html';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });

  cambioClaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/clientes/cambiar-clave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ nueva_clave: document.getElementById('nuevaClave').value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo cambiar la clave');

      window.location.href = 'clientes.html';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const correo = document.getElementById('correo').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correo, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        message.textContent = data.mensaje || 'Error al iniciar sesión';
        message.className = 'message error';
        return;
      }

      localStorage.setItem('token', data.token);
      message.textContent = 'Inicio de sesión correcto';
      message.className = 'message success';
      window.location.href = data.cliente ? 'clientes.html' : 'dashboard.html';
    } catch (error) {
      message.textContent = 'No se pudo conectar con el servidor';
      message.className = 'message error';
    }
  });
});
