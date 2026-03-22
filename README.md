# Iron Piggy · Iron Pig

**Iron Pig** es una bóveda de ahorro en **Cardano**: depositas **ADA** y monedas estables permitidas; el contrato solo libera los fondos cuando el **valor en dólares** de lo guardado —según el precio de ADA que aporta **Pyth** y las reglas de las stables— **alcanza la meta** que fijaste al crear la bóveda. Nadie puede cambiar esa regla después; solo tú puedes retirar cuando se cumple.

Este repositorio es el **primer ejemplo** de uso de oráculos Pyth en el ecosistema de demos: contrato en **Aiken**, listo para **preprod**, con pruebas que cubren depósito, retiro fallido y retiro exitoso.

---

## Integración con Pyth

En **PythFlow**, **Pyth Network** es la capa de oráculo para datos de mercado en tiempo real.

Los nodos del flujo pueden:

- **Leer** feeds de precio desde Pyth  
- **Definir** condiciones según esos datos  
- **Incorporar** la lógica del oráculo en el comportamiento del contrato  

**Flujo típico:**

1. Partir de un lienzo en blanco  
2. Añadir y configurar nodos a mano o con ayuda del agente de IA  
3. Usar nodos que integren datos de Pyth donde haga falta  
4. **Generar** la lógica del smart contract a partir del grafo de nodos  
5. **Enviar** la transacción para desplegar el contrato  

*Iron Pig encaja en el paso 4–5: la regla “valor total ≥ meta en USD” es exactamente el tipo de condición que Pyth permite materializar on-chain de forma verificable.*

---

## Entorno de ejecución

Pensado para **Cardano testnet** (en la práctica, **preprod** para alinear con Pyth en fase de pruebas):

- Incluye **wallet burner** nativa en la interfaz web  
- **Faucet** para obtener fondos de prueba con un clic  
- Un **agente de IA** usa un skill del sistema de nodos para **crear y conectar** nodos y acercar el grafo a un contrato desplegable  

Así se cierra el ciclo: de idea → nodos → contrato → transacción en red de pruebas.

---

## Tecnologías

| Capa | Rol |
|------|-----|
| **Pyth Network** | Precios de mercado (p. ej. ADA/USD) que alimentan la lógica de desbloqueo |
| **Aiken** | Contrato Iron Pig, pruebas on-chain y blueprint para despliegue |
| **MeshJS** | Construcción y firma de transacciones en el cliente (UI / flujo web) |
| **Agente de IA** | Orquestación de nodos y asistencia al diseño del flujo en PythFlow |

---

## Desarrollo (lo mínimo)

Necesitas [Aiken](https://aiken-lang.org) **v1.1.21+** (ver `aiken.toml`).

```bash
aiken fmt --check && aiken check -D && aiken build
```

- Contrato y pruebas: `validators/iron_pig.ak` · lógica compartida: `lib/iron_pig_logic.ak`  
- **Scripts** (`scripts/`) y **variables de entorno** de ejemplo (`env.preprod.example`) orientan a **preprod** (`TESTNET_MAGIC=1`).  
- El contrato asume un **dato de oráculo** en formato demo alineado con Pyth; cuando exista el payload oficial en preprod, se sustituye la forma del dato y la lectura —la idea (policy Pyth + feed + precio) se mantiene.

Apache-2.0 (ver `aiken.toml`).
