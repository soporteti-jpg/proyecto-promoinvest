document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  const form = document.getElementById('clienteForm');
  const valorCuotaForm = document.getElementById('valorCuotaForm');
  const message = document.getElementById('clienteMessage');
  const valorCuotaMessage = document.getElementById('valorCuotaMessage');
  const valorCuotaField = document.getElementById('valor_cuota_diario_id');
  const importeInput = document.getElementById('importe_total');
  const table = document.getElementById('clientesTable');
  const suscripcionesTable = document.getElementById('suscripcionesClienteTable');
  const suscripcionesPanel = document.getElementById('suscripcionesClientePanel');
  const resumenCliente = document.getElementById('resumenCliente');
  const cuotaFechaInput = document.getElementById('valorCuotaFecha');
  const cuotaMontoInput = document.getElementById('valorCuotaMonto');
  const cuotasInput = document.getElementById('numero_cuotas');

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

  let valorCuotaActual = 0;
  let valorCuotaIdActual = 0;
  let dataValores = [];

  function getFechaAyer() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - 1);
    return fecha.toISOString().slice(0, 10);
  }

  function actualizarImporte() {
    const cuotas = Number(cuotasInput.value || 0);
    const total = cuotas * valorCuotaActual;
    importeInput.value = total > 0 ? `S/ ${total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
  }

  async function cargarValores() {
    const response = await fetch('/api/clientes/valor-cuota', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || 'No puedes consultar valores de cuota');
    }

    dataValores = data.valores || [];
    const fechaDefault = data.fechaAyer || getFechaAyer();
    if (cuotaFechaInput) cuotaFechaInput.value = fechaDefault;

    const selected = data.cuotaCliente;
    if (selected) {
      valorCuotaActual = Number(selected.valor_cuota || 0);
      valorCuotaIdActual = Number(selected.id || 0);
      if (cuotaMontoInput) cuotaMontoInput.value = valorCuotaActual.toFixed(2);
      if (valorCuotaField) valorCuotaField.value = `S/ ${valorCuotaActual.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    actualizarImporte();
  }

  async function cargarClientes() {
    const response = await fetch('/api/clientes', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.mensaje || 'Error al cargar clientes');
    }

    table.innerHTML = data.clientes.map((cliente) => `
      <tr>
        <td>${cliente.id}</td>
        <td>${cliente.nombre}</td>
        <td>${cliente.apellidos}</td>
        <td>${cliente.dni || 'No registrado'}</td>
        <td>${cliente.correo || ''}</td>
        <td>${cliente.numero_cuotas}</td>
        <td>S/ ${Number(cliente.valor_cuota || 0).toLocaleString('es-PE')}</td>
        <td>S/ ${Number(cliente.importe_total || 0).toLocaleString('es-PE')}</td>
        <td>${cliente.estado || 'Pendiente'}</td>
      </tr>
    `).join('');

    if (usuario && usuario.rol === 'cliente' && suscripcionesTable) {
      const cliente = data.clientes[0];
      document.getElementById('cuotasActuales').textContent = cliente?.numero_cuotas || 0;
      document.getElementById('importeActual').textContent = `S/ ${Number(cliente?.importe_total || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      resumenCliente.hidden = false;
      const historial = [
        cliente ? `<tr><td>Ingreso</td><td>${formatearFecha(cliente.fecha_registro)}</td><td>${cliente.cuotas_iniciales || cliente.numero_cuotas}</td><td>S/ ${Number(cliente.valor_cuota || 0).toLocaleString('es-PE')}</td><td>S/ ${Number(cliente.importe_total || 0).toLocaleString('es-PE')}</td><td>${cliente.numero_cuotas}</td></tr>` : '',
        ...(data.suscripciones || []).map((suscripcion) => `<tr><td>Suscripción</td><td>${formatearFecha(suscripcion.fecha)}</td><td>${suscripcion.numero_cuotas}</td><td>S/ ${Number(suscripcion.valor_cuota).toLocaleString('es-PE')}</td><td>S/ ${Number(suscripcion.importe_total).toLocaleString('es-PE')}</td><td>Actualizado</td></tr>`),
        ...(data.rescates || []).map((rescate) => `<tr><td>Rescate</td><td>${formatearFecha(rescate.fecha)}</td><td>-${rescate.numero_cuotas}</td><td>S/ ${Number(rescate.valor_cuota).toLocaleString('es-PE')}</td><td>S/ ${Number(rescate.importe_total).toLocaleString('es-PE')}</td><td>Actualizado</td></tr>`),
      ];
      suscripcionesTable.innerHTML = historial.join('');
      suscripcionesPanel.hidden = false;
    }
  }

  function formatearFecha(fecha) {
    const [anio, mes, dia] = String(fecha).slice(0, 10).split('-');
    return dia && mes && anio ? `${dia}/${mes}/${anio}` : fecha;
  }

  if (usuario && usuario.rol === 'cliente') {
    document.body.classList.add('cliente-solo-lectura');
    document.querySelectorAll('.staff-only').forEach((elemento) => elemento.hidden = true);
    document.getElementById('clientesTitle').textContent = 'Mi información';

    try {
      await cargarClientes();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
    return;
  }

  valorCuotaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const body = {
      fecha: cuotaFechaInput?.value,
      valor_cuota: Number(cuotaMontoInput?.value),
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

      valorCuotaMessage.textContent = 'Valor cuota registrado correctamente';
      valorCuotaMessage.className = 'message success';
      await cargarValores();
    } catch (error) {
      valorCuotaMessage.textContent = error.message;
      valorCuotaMessage.className = 'message error';
    }
  });

  cuotasInput?.addEventListener('input', actualizarImporte);

  try {
    await cargarValores();
    await cargarClientes();
  } catch (error) {
    message.textContent = error.message;
    message.className = 'message error';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const body = {
      nombre: document.getElementById('nombre').value.trim(),
      apellidos: document.getElementById('apellidos').value.trim(),
      dni: document.getElementById('dni').value.trim(),
      correo: document.getElementById('correo').value.trim(),
      numero_cuotas: Number(document.getElementById('numero_cuotas').value),
      valor_cuota_diario_id: valorCuotaIdActual,
    };

    if (!valorCuotaIdActual) {
      message.textContent = 'No hay valor cuota del día anterior disponible';
      message.className = 'message error';
      return;
    }

    try {
      const response = await fetch('/api/clientes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.mensaje || 'Error al registrar cliente');

      message.textContent = 'Cliente registrado correctamente';
      message.className = 'message success';
      form.reset();
      await cargarClientes();
      await cargarValores();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'message error';
    }
  });
});
