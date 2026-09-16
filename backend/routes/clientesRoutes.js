const bcrypt = require('bcryptjs');

function verificarPermisoOperativo(usuario) {
  return usuario && ['admin', 'operaciones'].includes(usuario.rol);
}

function fechaLocalHoy() {
  const fecha = new Date();
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaLocalAyer() {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 1);
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaValida(fecha) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= fechaLocalHoy();
}

async function registrarBitacora(db, usuario, accion, entidad, entidadId, detalle = {}) {
  await db.query(
    'INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?)',
    [usuario.rol === 'cliente' ? null : usuario.id, accion, entidad, entidadId || null, JSON.stringify(detalle)]
  );
}

async function manejarClientes(req, res, deps) {
  const { verifyToken, sendJson, readBody, db } = deps;
  const ruta = req.url.split('?')[0];

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const usuario = verifyToken(token);

  if (!usuario) {
    return sendJson(res, 401, { mensaje: 'Token requerido o inválido' });
  }

  if (req.method === 'GET' && ruta === '/api/clientes') {
    if (usuario.rol === 'cliente') {
      try {
        const [clientes] = await db.query(`
          SELECT c.id, c.nombre, c.apellidos, c.dni, c.numero_cuotas,
                 c.numero_cuotas
                   - COALESCE((SELECT SUM(s.numero_cuotas) FROM suscripciones s WHERE s.cliente_id = c.id), 0)
                   + COALESCE((SELECT SUM(r.numero_cuotas) FROM rescates r WHERE r.cliente_id = c.id), 0) AS cuotas_iniciales,
                 c.importe_total,
                 c.estado, c.fecha_registro, c.requiere_cambio_clave,
                 v.fecha AS fecha_cuota, v.valor_cuota
          FROM clientes c
          LEFT JOIN valor_cuota_diario v ON v.id = c.valor_cuota_diario_id
          WHERE c.id = ? AND c.activo = 1
          LIMIT 1
        `, [usuario.clienteId]);

        const [suscripciones] = await db.query(
          'SELECT id, fecha, numero_cuotas, valor_cuota, importe_total FROM suscripciones WHERE cliente_id = ? ORDER BY fecha, id',
          [usuario.clienteId]
        );
        const [rescates] = await db.query(
          'SELECT id, fecha, numero_cuotas, valor_cuota, importe_total FROM rescates WHERE cliente_id = ? ORDER BY fecha, id',
          [usuario.clienteId]
        );
        await registrarBitacora(db, usuario, 'CONSULTA', 'clientes', usuario.clienteId, { cliente_id: usuario.clienteId });
        return sendJson(res, 200, { clientes, suscripciones, rescates });
      } catch (error) {
        console.error(error);
        return sendJson(res, 500, { mensaje: 'Error al consultar los datos del cliente' });
      }
    }

    if (!verificarPermisoOperativo(usuario)) {
      return sendJson(res, 403, { mensaje: 'No tienes permisos para consultar clientes' });
    }

    try {
      const [clientes] = await db.query(`
        SELECT c.id, c.nombre, c.apellidos, c.correo, c.dni, c.numero_cuotas, c.valor_cuota_diario_id,
           c.importe_total, c.fecha_registro, c.requiere_cambio_clave, c.estado,
               v.fecha AS fecha_cuota, v.valor_cuota
        FROM clientes c
        LEFT JOIN valor_cuota_diario v ON v.id = c.valor_cuota_diario_id
        WHERE c.activo = 1
        ORDER BY c.id DESC
      `);

      await registrarBitacora(db, usuario, 'CONSULTA', 'clientes', null, { cantidad: clientes.length });

      return sendJson(res, 200, { clientes });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al consultar clientes' });
    }
  }

  if (req.method === 'GET' && ruta === '/api/suscripciones/buscar') {
    if (!verificarPermisoOperativo(usuario)) return sendJson(res, 403, { mensaje: 'No tienes permisos para buscar clientes' });

    const url = new URL(`http://localhost${req.url}`);
    const dni = String(url.searchParams.get('dni') || '').trim();
    if (!/^\d{8,20}$/.test(dni)) return sendJson(res, 400, { mensaje: 'Ingresa un DNI válido' });

    const [rows] = await db.query(
      'SELECT id, nombre, apellidos, dni, correo, numero_cuotas, importe_total, estado FROM clientes WHERE dni = ? AND activo = 1 LIMIT 1',
      [dni]
    );
    await registrarBitacora(db, usuario, 'BUSQUEDA', 'clientes', rows[0]?.id || null, { dni });
    if (!rows.length) return sendJson(res, 404, { mensaje: 'No se encontró un cliente con ese DNI' });
    return sendJson(res, 200, { cliente: rows[0] });
  }

  if (req.method === 'POST' && ruta === '/api/suscripciones') {
    if (!verificarPermisoOperativo(usuario)) return sendJson(res, 403, { mensaje: 'No tienes permisos para registrar suscripciones' });

    try {
      const payload = await readBody(req);
      const clienteId = Number(payload.cliente_id);
      const fecha = fechaLocalHoy();
      const numeroCuotas = Number(payload.numero_cuotas);
      const [clientes] = await db.query('SELECT id, dni FROM clientes WHERE id = ? AND activo = 1 LIMIT 1', [clienteId]);
      if (!clientes.length) return sendJson(res, 404, { mensaje: 'Cliente no encontrado' });

      const [cuotas] = await db.query(
        "SELECT valor_cuota FROM valor_cuota_diario WHERE fecha = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND activo = 1 LIMIT 1"
      );
      if (!cuotas.length) return sendJson(res, 400, { mensaje: 'No existe valor cuota del día anterior' });
      if (!Number.isInteger(numeroCuotas) || numeroCuotas <= 0) return sendJson(res, 400, { mensaje: 'El número de cuotas debe ser mayor a cero' });

      const valorCuota = Number(cuotas[0].valor_cuota);
      const importeTotal = numeroCuotas * valorCuota;
      const [result] = await db.query(
        'INSERT INTO suscripciones (cliente_id, dni, fecha, numero_cuotas, valor_cuota, importe_total) VALUES (?, ?, ?, ?, ?, ?)',
        [clienteId, clientes[0].dni, fecha, numeroCuotas, valorCuota, importeTotal]
      );
      await db.query('UPDATE clientes SET numero_cuotas = numero_cuotas + ? WHERE id = ?', [numeroCuotas, clienteId]);
      const [saldoRows] = await db.query('SELECT numero_cuotas AS saldo_cuotas FROM clientes WHERE id = ?', [clienteId]);
      await registrarBitacora(db, usuario, 'REGISTRO', 'suscripciones', result.insertId, { cliente_id: clienteId, dni: clientes[0].dni, fecha, numeroCuotas, valorCuota, importeTotal });
      return sendJson(res, 201, { mensaje: 'Suscripción registrada correctamente', saldo_cuotas: saldoRows[0].saldo_cuotas, suscripcion: { id: result.insertId, cliente_id: clienteId, dni: clientes[0].dni, fecha, numero_cuotas: numeroCuotas, valor_cuota: valorCuota, importe_total: importeTotal } });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al registrar la suscripción' });
    }
  }

  if (req.method === 'GET' && ruta === '/api/rescates/buscar') {
    if (!verificarPermisoOperativo(usuario)) return sendJson(res, 403, { mensaje: 'No tienes permisos para buscar clientes' });

    const url = new URL(`http://localhost${req.url}`);
    const dni = String(url.searchParams.get('dni') || '').trim();
    if (!/^\d{8,20}$/.test(dni)) return sendJson(res, 400, { mensaje: 'Ingresa un DNI válido' });

    const [rows] = await db.query(
      'SELECT id, nombre, apellidos, dni, correo, numero_cuotas, importe_total, estado FROM clientes WHERE dni = ? AND activo = 1 LIMIT 1',
      [dni]
    );
    await registrarBitacora(db, usuario, 'BUSQUEDA', 'clientes', rows[0]?.id || null, { dni, modulo: 'rescates' });
    if (!rows.length) return sendJson(res, 404, { mensaje: 'No se encontró un cliente con ese DNI' });
    return sendJson(res, 200, { cliente: rows[0] });
  }

  if (req.method === 'POST' && ruta === '/api/rescates') {
    if (!verificarPermisoOperativo(usuario)) return sendJson(res, 403, { mensaje: 'No tienes permisos para registrar rescates' });

    try {
      const payload = await readBody(req);
      const clienteId = Number(payload.cliente_id);
      const numeroCuotas = Number(payload.numero_cuotas);
      if (!Number.isInteger(numeroCuotas) || numeroCuotas <= 0) return sendJson(res, 400, { mensaje: 'El número de cuotas debe ser mayor a cero' });

      const [clientes] = await db.query('SELECT id, dni, numero_cuotas FROM clientes WHERE id = ? AND activo = 1 LIMIT 1', [clienteId]);
      if (!clientes.length) return sendJson(res, 404, { mensaje: 'Cliente no encontrado' });
      if (numeroCuotas > clientes[0].numero_cuotas) return sendJson(res, 400, { mensaje: 'El rescate no puede superar las cuotas disponibles del cliente' });

      const [cuotas] = await db.query("SELECT valor_cuota FROM valor_cuota_diario WHERE fecha = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND activo = 1 LIMIT 1");
      if (!cuotas.length) return sendJson(res, 400, { mensaje: 'No existe valor cuota del día anterior' });

      const fecha = fechaLocalHoy();
      const valorCuota = Number(cuotas[0].valor_cuota);
      const importeTotal = numeroCuotas * valorCuota;
      const [result] = await db.query(
        'INSERT INTO rescates (cliente_id, dni, fecha, numero_cuotas, valor_cuota, importe_total) VALUES (?, ?, ?, ?, ?, ?)',
        [clienteId, clientes[0].dni, fecha, numeroCuotas, valorCuota, importeTotal]
      );
      await db.query('UPDATE clientes SET numero_cuotas = numero_cuotas - ? WHERE id = ?', [numeroCuotas, clienteId]);
      const [saldoRows] = await db.query('SELECT numero_cuotas AS saldo_cuotas FROM clientes WHERE id = ?', [clienteId]);
      await registrarBitacora(db, usuario, 'REGISTRO', 'rescates', result.insertId, { cliente_id: clienteId, dni: clientes[0].dni, fecha, numeroCuotas, valorCuota, importeTotal });
      return sendJson(res, 201, { mensaje: 'Rescate registrado correctamente', saldo_cuotas: saldoRows[0].saldo_cuotas, rescate: { id: result.insertId, cliente_id: clienteId, dni: clientes[0].dni, fecha, numero_cuotas: numeroCuotas, valor_cuota: valorCuota, importe_total: importeTotal } });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al registrar el rescate' });
    }
  }

  if (req.method === 'GET' && req.url === '/api/clientes/valor-cuota') {
    if (!verificarPermisoOperativo(usuario)) {
      return sendJson(res, 403, { mensaje: 'No tienes permisos para consultar cuotas' });
    }

    try {
      const [valores] = await db.query("SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, valor_cuota, descripcion, activo, created_at FROM valor_cuota_diario WHERE activo = 1 ORDER BY fecha DESC");
      const fechaHoy = fechaLocalHoy();
      const fechaAyer = fechaLocalAyer();
      const cuotaDefecto = valores.find((valor) => String(valor.fecha).slice(0, 10) === fechaHoy) || null;
      const cuotaCliente = valores.find((valor) => String(valor.fecha).slice(0, 10) === fechaAyer) || null;
      await registrarBitacora(db, usuario, 'CONSULTA', 'valor_cuota_diario', null, { cantidad: valores.length });
      return sendJson(res, 200, { valores, cuotaDefecto, cuotaCliente, fechaHoy, fechaAyer });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al consultar historial de cuotas' });
    }
  }

  if (req.method === 'POST' && req.url === '/api/clientes/valor-cuota') {
    if (!verificarPermisoOperativo(usuario)) {
      return sendJson(res, 403, { mensaje: 'No tienes permisos para registrar cuotas' });
    }

    try {
      const payload = await readBody(req);
      const fecha = payload.fecha || fechaLocalHoy();
      const valor_cuota = Number(payload.valor_cuota);
      const descripcion = String(payload.descripcion || 'Cuota diaria').trim();

      if (!fechaValida(fecha) || Number.isNaN(valor_cuota) || valor_cuota <= 0) {
        return sendJson(res, 400, { mensaje: 'La fecha debe ser válida y no puede ser posterior a hoy; el valor de cuota debe ser mayor a cero' });
      }

      const [existing] = await db.query('SELECT id, valor_cuota, descripcion FROM valor_cuota_diario WHERE fecha = ? LIMIT 1', [fecha]);

      if (existing.length) {
        if (usuario.rol !== 'admin') {
          return sendJson(res, 403, { mensaje: 'El valor cuota ya registrado solo puede ser modificado por un administrador' });
        }
        await db.query(
          'UPDATE valor_cuota_diario SET valor_cuota = ?, descripcion = ?, activo = 1 WHERE id = ?',
          [valor_cuota, descripcion, existing[0].id]
        );
        await registrarBitacora(db, usuario, 'ACTUALIZACION', 'valor_cuota_diario', existing[0].id, {
          fecha, anterior: existing[0], nuevo: { valor_cuota, descripcion }
        });
      } else {
        const [result] = await db.query(
          'INSERT INTO valor_cuota_diario (fecha, valor_cuota, descripcion, activo) VALUES (?, ?, ?, 1)',
          [fecha, valor_cuota, descripcion]
        );
        await registrarBitacora(db, usuario, 'REGISTRO', 'valor_cuota_diario', result.insertId, { fecha, valor_cuota, descripcion });
      }

      const [valores] = await db.query("SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, valor_cuota, descripcion, activo, created_at FROM valor_cuota_diario WHERE activo = 1 ORDER BY fecha DESC");
      const cuotaDefecto = valores.find((valor) => String(valor.fecha).slice(0, 10) === fecha) || valores[0] || null;
      return sendJson(res, 201, { mensaje: 'Valor cuota registrado correctamente', valores, cuotaDefecto });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al registrar el valor cuota' });
    }
  }

  if (req.method === 'POST' && req.url === '/api/clientes') {
    if (!verificarPermisoOperativo(usuario)) {
      return sendJson(res, 403, { mensaje: 'No tienes permisos para registrar clientes' });
    }

    try {
      const payload = await readBody(req);
      const { nombre, apellidos, correo, dni, numero_cuotas, valor_cuota_diario_id } = payload;

      if (!nombre || !apellidos || !correo || !dni || !numero_cuotas || !valor_cuota_diario_id) {
        return sendJson(res, 400, { mensaje: 'Nombre, apellidos, DNI, correo, número de cuotas y valor diario son requeridos' });
      }

      const dniNormalizado = String(dni).trim();
      if (!/^\d{8,20}$/.test(dniNormalizado)) {
        return sendJson(res, 400, { mensaje: 'El DNI debe contener entre 8 y 20 números' });
      }

      const correoNormalizado = String(correo).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado)) {
        return sendJson(res, 400, { mensaje: 'El correo del cliente no es válido' });
      }

      if (Number(numero_cuotas) <= 0) {
        return sendJson(res, 400, { mensaje: 'El número de cuotas debe ser mayor a cero' });
      }

      const [valorRows] = await db.query('SELECT id, valor_cuota, fecha FROM valor_cuota_diario WHERE id = ? AND activo = 1 LIMIT 1', [Number(valor_cuota_diario_id)]);
      if (!valorRows.length) {
        return sendJson(res, 400, { mensaje: 'El valor de cuota diario seleccionado no existe' });
      }

      const valorCuotaBase = Number(valorRows[0].valor_cuota || 0);
      const importeTotal = Number(numero_cuotas) * valorCuotaBase;

      const [result] = await db.query(
        'INSERT INTO clientes (nombre, apellidos, correo, dni, numero_cuotas, valor_cuota_diario_id, importe_total, clave, requiere_cambio_clave, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)',
        [String(nombre).trim(), String(apellidos).trim(), correoNormalizado, dniNormalizado, Number(numero_cuotas), Number(valor_cuota_diario_id), importeTotal, await bcrypt.hash('123456', 10), 'Pendiente']
      );

      await registrarBitacora(db, usuario, 'REGISTRO', 'clientes', result.insertId, {
        nombre: String(nombre).trim(), apellidos: String(apellidos).trim(), correo: correoNormalizado, dni: dniNormalizado, numero_cuotas: Number(numero_cuotas), importe_total: importeTotal
      });

      const [rows] = await db.query(
        `SELECT c.id, c.nombre, c.apellidos, c.correo, c.dni, c.numero_cuotas, c.valor_cuota_diario_id,
          c.importe_total, c.fecha_registro, c.requiere_cambio_clave, c.estado,
          v.fecha AS fecha_cuota, v.valor_cuota
         FROM clientes c
         LEFT JOIN valor_cuota_diario v ON v.id = c.valor_cuota_diario_id
         WHERE c.id = ? LIMIT 1`,
        [result.insertId]
      );

      return sendJson(res, 201, { mensaje: 'Cliente registrado correctamente', cliente: rows[0] });
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { mensaje: 'Error al registrar cliente' });
    }
  }

  return sendJson(res, 404, { mensaje: 'Ruta no encontrada' });
}

module.exports = { manejarClientes, verificarPermisoOperativo };
