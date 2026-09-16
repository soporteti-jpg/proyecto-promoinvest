document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const buscarForm = document.getElementById('buscarClienteForm');
  const confirmacion = document.getElementById('clienteConfirmacion');
  const buscarMessage = document.getElementById('buscarMessage');
  const suscripcionMessage = document.getElementById('suscripcionMessage');
  const fechaInput = document.getElementById('suscripcionFecha');
  const cuotasInput = document.getElementById('suscripcionCuotas');
  const valorInput = document.getElementById('suscripcionValor');
  const importeInput = document.getElementById('suscripcionImporte');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  function leerToken(tokenActual) {
    try {
      return JSON.parse(atob(tokenActual.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (error) {
      return null;
    }
  }

  const usuario = leerToken(token);
  if (!usuario || !['admin', 'operaciones'].includes(usuario.rol)) {
    window.location.href = usuario?.rol === 'cliente' ? 'clientes.html' : 'login.html';
    return;
  }

  function fechaHoy() {
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

  function actualizarImporte() {
    const cuotas = Number(cuotasInput.value || 0);
    const valor = Number(valorInput.dataset.valor || 0);
    const total = cuotas * valor;
    importeInput.value = total > 0 ? `S/ ${total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
  }

  function mostrarCliente(cliente) {
    document.getElementById('suscripcionClienteId').value = cliente.id;
    document.getElementById('confirmacionDni').textContent = cliente.dni;
    document.getElementById('confirmacionNombre').textContent = cliente.nombre;
    document.getElementById('confirmacionApellidos').textContent = cliente.apellidos;
    document.getElementById('confirmacionCorreo').textContent = cliente.correo || '';
    document.getElementById('confirmacionSaldoCuotas').textContent = cliente.numero_cuotas;
    fechaInput.value = fechaHoy();
    cuotasInput.value = '';
    importeInput.value = '';
    confirmacion.hidden = false;
    cuotasInput.focus();
  }

  buscarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dni = document.getElementById('buscarDni').value.trim();
    buscarMessage.textContent = '';

    try {
      const response = await fetch(`/api/suscripciones/buscar?dni=${encodeURIComponent(dni)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo buscar el cliente');

      mostrarCliente(data.cliente);
      const cuotaResponse = await fetch('/api/clientes/valor-cuota', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const cuotaData = await cuotaResponse.json();
      if (!cuotaResponse.ok || !cuotaData.cuotaCliente) {
        throw new Error('No existe valor cuota del día anterior');
      }
      valorInput.dataset.valor = cuotaData.cuotaCliente.valor_cuota;
      valorInput.value = `S/ ${Number(cuotaData.cuotaCliente.valor_cuota).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      actualizarImporte();
    } catch (error) {
      confirmacion.hidden = true;
      buscarMessage.textContent = error.message;
      buscarMessage.className = 'message error';
    }
  });

  cuotasInput.addEventListener('input', actualizarImporte);

  document.getElementById('suscripcionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
      cliente_id: Number(document.getElementById('suscripcionClienteId').value),
      numero_cuotas: Number(cuotasInput.value),
    };

    try {
      const response = await fetch('/api/suscripciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo registrar la suscripción');

      suscripcionMessage.textContent = `${data.mensaje}. Saldo actual: ${data.saldo_cuotas} cuotas`;
      suscripcionMessage.className = 'message success';
      cuotasInput.value = '';
      importeInput.value = '';
    } catch (error) {
      suscripcionMessage.textContent = error.message;
      suscripcionMessage.className = 'message error';
    }
  });
});
