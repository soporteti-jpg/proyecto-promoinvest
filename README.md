# Promoinvest SAF

Sistema web para gestionar clientes, valor cuota diario, suscripciones y rescates de fondos mutuos.

## Funcionalidades

- Acceso separado para empleados y clientes.
- Registro y consulta de clientes por DNI.
- Clave inicial y cambio obligatorio durante el primer ingreso.
- Gestión del valor cuota diario.
- Suscripciones que incrementan el saldo de cuotas.
- Rescates que descuentan el saldo disponible.
- Historial, resumen del cliente y bitácora de operaciones.

## Estructura

```text
proyecto-promoinvest-saf/
├── backend/
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   └── server.js
├── database/
│   └── schema.sql
├── frontend/
│   ├── login.html
│   ├── clientes.html
│   ├── valor-cuota.html
│   ├── suscripciones.html
│   └── rescates.html
└── package.json
```

## Ejecución

```bash
npm install
node backend/server.js
```

La aplicación queda disponible en `http://localhost:3000`.

La base de datos utiliza MySQL y su estructura vigente está en `database/schema.sql`.
