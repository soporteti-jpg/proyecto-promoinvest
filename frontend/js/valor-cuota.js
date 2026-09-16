document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const form = document.getElementById('valorCuotaForm');
  const message = document.getElementById('valorCuotaMessage');
  const table = document.getElementById('valorCuotaTable');
  const fechaInput = document.getElementById('valorCuotaFecha');
  const montoInput = document.getElementById('valorCuotaMonto');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const usuario = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    if (usuario.rol === 'cliente') {
      window.location.href = 'clientes.html';
      return;
    }
  } catch (error) {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
    return;
  }

  function getFechaHoy() {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  function formatearFecha(fecha) {
    const [anio, mes, dia] = String(fecha).slice(0, 10).split('-');
    return dia && mes && anio ? `${dia}/${mes}/${anio}` : fecha;
  }

  async function cargarValores() {
    const response = await fetch('/api/clientes/valor-cuota', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || 'No puedes consultar valores de cuota');
    }

    const fechaDefault = data.fechaHoy || getFechaHoy();
    fechaInput.value = fechaDefault;
    fechaInput.min = '2000-01-01';
    fechaInput.max = getFechaHoy();

    const selected = data.cuotaDefecto;
    if (selected) {
      montoInput.value = Number(selected.valor_cuota).toFixed(2);
    } else {
      montoInput.value = '';
      montoInput.focus();
    }

    table.innerHTML = data.valores.map((valor) => `
      <tr>
        <td>${formatearFecha(valor.fecha)}</td>
        <td>S/ ${Number(valor.valor_cuota).toLocaleString('es-PE')}</td>
        <td>${valor.descripcion || 'Cuota diaria'}</td>
      </tr>
    `).join('');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const body = {
      fecha: fechaInput.value,
      valor_cuota: Number(montoInput.value),
      descripcion: 'Cuota diaria registrada',
    };

    try {
      const response = await fetch('/api/clientes/valor-cuota', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'Error al registrar valor cuota');

      message.textContent = 'Valor cuota registrado correctamente';
      message.className = 'message success';
      await cargarValores();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });

  try {
    await cargarValores();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
  }
});
