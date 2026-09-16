document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const buscarForm = document.getElementById('buscarRescateForm');
  const confirmacion = document.getElementById('rescateConfirmacion');
  const buscarMessage = document.getElementById('buscarRescateMessage');
  const message = document.getElementById('rescateMessage');
  const fechaInput = document.getElementById('rescateFecha');
  const cuotasInput = document.getElementById('rescateCuotas');
  const valorInput = document.getElementById('rescateValor');
  const importeInput = document.getElementById('rescateImporte');

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
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
  }

  function actualizarImporte() {
    const total = Number(cuotasInput.value || 0) * Number(valorInput.dataset.valor || 0);
    importeInput.value = total > 0 ? `S/ ${total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
  }

  buscarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const dni = document.getElementById('buscarRescateDni').value.trim();
    try {
      const response = await fetch(`/api/rescates/buscar?dni=${encodeURIComponent(dni)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo buscar el cliente');

      const cliente = data.cliente;
      document.getElementById('rescateClienteId').value = cliente.id;
      document.getElementById('rescateDni').textContent = cliente.dni;
      document.getElementById('rescateNombre').textContent = cliente.nombre;
      document.getElementById('rescateApellidos').textContent = cliente.apellidos;
      document.getElementById('rescateCuotasDisponibles').textContent = cliente.numero_cuotas;
      document.getElementById('rescateCuotas').max = cliente.numero_cuotas;
      fechaInput.value = fechaHoy();
      cuotasInput.value = '';
      importeInput.value = '';

      const cuotaResponse = await fetch('/api/clientes/valor-cuota', { headers: { Authorization: `Bearer ${token}` } });
      const cuotaData = await cuotaResponse.json();
      if (!cuotaResponse.ok || !cuotaData.cuotaCliente) throw new Error('No existe valor cuota del día anterior');
      valorInput.dataset.valor = cuotaData.cuotaCliente.valor_cuota;
      valorInput.value = `S/ ${Number(cuotaData.cuotaCliente.valor_cuota).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      confirmacion.hidden = false;
      cuotasInput.focus();
    } catch (error) {
      confirmacion.hidden = true;
      buscarMessage.textContent = error.message;
      buscarMessage.className = 'message error';
    }
  });

  cuotasInput.addEventListener('input', actualizarImporte);
  document.getElementById('rescateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/rescates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cliente_id: Number(document.getElementById('rescateClienteId').value), numero_cuotas: Number(cuotasInput.value) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'No se pudo registrar el rescate');
      message.textContent = `${data.mensaje}. Saldo actual: ${data.saldo_cuotas} cuotas`;
      message.className = 'message success';
      document.getElementById('rescateCuotasDisponibles').textContent = data.saldo_cuotas;
      cuotasInput.value = '';
      importeInput.value = '';
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });
});
