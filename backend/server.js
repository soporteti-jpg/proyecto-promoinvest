const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const { manejarClientes } = require('./routes/clientesRoutes');

const PORT = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '../frontend');
const secret = process.env.JWT_SECRET || 'promoinvest-saf-demo-secret';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function createToken(usuario) {
  const payload = Buffer.from(JSON.stringify({
    id: usuario.id,
    correo: usuario.correo,
    rol: usuario.rol,
    ...(usuario.clienteId ? { clienteId: usuario.clienteId } : {}),
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (signature !== expected) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

async function prepararCredencialesClientes() {
  const [columnas] = await db.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes'"
  );
  const nombres = new Set(columnas.map((columna) => columna.COLUMN_NAME));

  if (!nombres.has('clave')) {
    await db.query('ALTER TABLE clientes ADD COLUMN clave VARCHAR(255) NULL');
  }
  if (!nombres.has('requiere_cambio_clave')) {
    await db.query('ALTER TABLE clientes ADD COLUMN requiere_cambio_clave BOOLEAN NOT NULL DEFAULT TRUE');
  }
  if (!nombres.has('estado')) {
    await db.query("ALTER TABLE clientes ADD COLUMN estado VARCHAR(30) NOT NULL DEFAULT 'Pendiente'");
  }
  if (!nombres.has('correo')) {
    await db.query("ALTER TABLE clientes ADD COLUMN correo VARCHAR(150) NULL");
  }
  if (!nombres.has('dni')) {
    await db.query('ALTER TABLE clientes ADD COLUMN dni VARCHAR(20) NULL');
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS suscripciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      dni VARCHAR(20) NOT NULL,
      fecha DATE NOT NULL,
      numero_cuotas INT NOT NULL,
      valor_cuota DECIMAL(18,2) NOT NULL,
      importe_total DECIMAL(18,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CHECK (numero_cuotas > 0)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS rescates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      dni VARCHAR(20) NOT NULL,
      fecha DATE NOT NULL,
      numero_cuotas INT NOT NULL,
      valor_cuota DECIMAL(18,2) NOT NULL,
      importe_total DECIMAL(18,2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      CHECK (numero_cuotas > 0)
    )
  `);

  await db.query("UPDATE clientes SET correo = 'roggerw1@yahoo.es'");

  const claveInicial = await bcrypt.hash('123456', 10);
  await db.query('UPDATE clientes SET clave = ?, requiere_cambio_clave = TRUE WHERE clave IS NULL', [claveInicial]);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

async function getUsuarioByCorreo(correo) {
  const [rows] = await db.query('SELECT * FROM usuarios WHERE correo = ? AND activo = 1 LIMIT 1', [correo]);
  return rows[0] || null;
}

async function registrarBitacora(usuarioId, accion, entidad, entidadId, detalle = {}) {
  await db.query(
    'INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle) VALUES (?, ?, ?, ?, ?)',
    [usuarioId || null, accion, entidad, entidadId || null, JSON.stringify(detalle)]
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/clientes/solicitar-reset') {
      const { cliente_id, correo } = await readBody(req);
      const correoNormalizado = String(correo || '').trim().toLowerCase();
      const [rows] = await db.query(
        'SELECT id, nombre, apellidos, correo FROM clientes WHERE id = ? AND activo = 1 LIMIT 1',
        [Number(cliente_id)]
      );
      const cliente = rows[0];

      if (!cliente || !cliente.correo || !correoNormalizado || cliente.correo.toLowerCase() !== correoNormalizado) {
        return sendJson(res, 400, { mensaje: 'El ID y correo no coinciden con un cliente registrado' });
      }

      await registrarBitacora(null, 'SOLICITUD_RESETEO_CLAVE', 'clientes', cliente.id, {
        cliente_id: cliente.id,
        correo: cliente.correo,
        destinatario: 'roggerw1@gmail.com',
      });
      return sendJson(res, 200, {
        mensaje: 'Solicitud registrada. Se abrirá un mensaje dirigido al administrador.',
        administrador: 'roggerw1@gmail.com',
        asunto: `Solicitud de reseteo de clave - Cliente ${cliente.id}`,
        detalle: `El cliente ${cliente.nombre} ${cliente.apellidos} (ID ${cliente.id}) solicita el reseteo de su clave.`,
      });
    }

    if (req.method === 'POST' && req.url === '/api/clientes/login') {
      const { cliente_id, clave } = await readBody(req);
      const [rows] = await db.query(
        'SELECT id, nombre, apellidos, clave, requiere_cambio_clave FROM clientes WHERE id = ? AND activo = 1 LIMIT 1',
        [Number(cliente_id)]
      );
      const cliente = rows[0];

      if (!cliente || !clave || !(await bcrypt.compare(String(clave), cliente.clave))) {
        return sendJson(res, 401, { mensaje: 'Identificador o clave inválidos' });
      }

      await registrarBitacora(null, 'LOGIN_CLIENTE', 'clientes', cliente.id, { cliente_id: cliente.id, primer_ingreso: Boolean(cliente.requiere_cambio_clave) });
      return sendJson(res, 200, {
        mensaje: 'Ingreso de cliente exitoso',
        token: createToken({ id: cliente.id, correo: `cliente-${cliente.id}`, rol: 'cliente', clienteId: cliente.id }),
        requiereCambioClave: Boolean(cliente.requiere_cambio_clave),
        cliente: { id: cliente.id, nombre: cliente.nombre, apellidos: cliente.apellidos },
      });
    }

    if (req.method === 'POST' && req.url === '/api/clientes/cambiar-clave') {
      const authorization = req.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const usuario = verifyToken(token);
      const { nueva_clave } = await readBody(req);

      if (!usuario || usuario.rol !== 'cliente') return sendJson(res, 401, { mensaje: 'Sesión de cliente requerida' });
      if (!nueva_clave || String(nueva_clave).length < 6 || String(nueva_clave) === '123456') {
        return sendJson(res, 400, { mensaje: 'La nueva clave debe tener al menos 6 caracteres y ser diferente de 123456' });
      }

      const [result] = await db.query(
        'UPDATE clientes SET clave = ?, requiere_cambio_clave = FALSE WHERE id = ? AND requiere_cambio_clave = TRUE',
        [await bcrypt.hash(String(nueva_clave), 10), usuario.clienteId]
      );
      if (!result.affectedRows) return sendJson(res, 409, { mensaje: 'La clave ya fue modificada anteriormente' });

      await registrarBitacora(null, 'CAMBIO_CLAVE', 'clientes', usuario.clienteId, { cliente_id: usuario.clienteId, primer_ingreso: true });
      return sendJson(res, 200, { mensaje: 'Clave actualizada correctamente' });
    }

    if (req.url.startsWith('/api/clientes') || req.url.startsWith('/api/suscripciones') || req.url.startsWith('/api/rescates')) {
      return manejarClientes(req, res, { verifyToken, sendJson, readBody, db });
    }

    if (req.method === 'POST' && req.url === '/api/login') {
      const { correo, password } = await readBody(req);

      if (!correo || !password) {
        return sendJson(res, 400, { mensaje: 'Correo y contraseña requeridos' });
      }

      const usuario = await getUsuarioByCorreo(correo);
      if (!usuario) return sendJson(res, 401, { mensaje: 'Credenciales inválidas' });

      const passwordValida = await bcrypt.compare(password, usuario.password_hash);
      if (!passwordValida) return sendJson(res, 401, { mensaje: 'Credenciales inválidas' });

      const usuarioPublico = {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
      };

      await registrarBitacora(usuario.id, 'LOGIN', 'usuarios', usuario.id, { correo: usuario.correo });

      return sendJson(res, 200, {
        mensaje: 'Login exitoso',
        token: createToken(usuarioPublico),
        usuario: usuarioPublico,
      });
    }

    const requestedPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(frontendPath, requestedPath);
    if (!filePath.startsWith(frontendPath) || !fs.existsSync(filePath)) return sendJson(res, 404, { mensaje: 'No encontrado' });
    const extension = path.extname(filePath);
    const contentTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
    res.writeHead(200, { 'Content-Type': `${contentTypes[extension] || 'application/octet-stream'}; charset=utf-8` });
    return res.end(fs.readFileSync(filePath));
  } catch (error) {
    console.error(error);
    return sendJson(res, 400, { mensaje: 'Solicitud inválida' });
  }
});

async function iniciarServidor() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS bitacora (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NULL,
      accion VARCHAR(80) NOT NULL,
      entidad VARCHAR(80) NOT NULL,
      entidad_id BIGINT NULL,
      detalle TEXT,
      fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
  await prepararCredencialesClientes();

  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

iniciarServidor().catch((error) => {
  console.error('No se pudo preparar la base de datos:', error.message);
  process.exit(1);
});
