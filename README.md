# 🌿 Invernadero Inteligente — VERDE.LAB
### Corporación Universitaria Americana

Dashboard profesional y sistema de telemetría en tiempo real para mini invernadero basado en **ESP32**, **HiveMQ MQTT** y visualización web biomecánica desacoplada en **HTML5**, **CSS3** y **JavaScript (Vanilla)**.

---

## 📁 Estructura del Proyecto

El proyecto ha sido modularizado siguiendo las mejores prácticas de desarrollo web frontend y sistemas embebidos IoT:

```text
mini_invernadero_hivemq/
├── index.html                  # Punto de entrada principal HTML5 semántico
├── dashboard.html              # Vista espejo para compatibilidad directa
├── assets/
│   └── logo-americana.png      # Logo institucional Corporación Universitaria Americana
├── css/
│   ├── style.css               # Design tokens, variables CSS, layout Grid/Flexbox y componentes UI
│   └── animation.css           # Animaciones de la plantica, balanceo orgánico, microaspersión y partículas
├── js/
│   └── app.js                  # Controlador general: cliente MQTT (WebSocket), gráficas Canvas y simulación
├── mini_invernadero_hivemq.ino # Firmware C++ para ESP32 (WiFi, PubSubClient, DHT22, FC-28)
└── README.md                   # Documentación técnica del sistema
```

---

## ✨ Características Principales

1. **La Plantica como Protagonista**:
   - Escenario central vectorial (SVG) con una única planta detallada y estilizada.
   - Animación orgánica de vaivén y respiración celular (`plantSway`, `leafFlutter`, `apexBreeze`).
   - Sistema de microaspersión y nebulización activa cuando el relé de riego se enciende (`.relay-on`).
   - Partículas flotantes de polen bioluminiscente y radiación solar continua.
   - Indicador dinámico de humedad del sustrato y salud vegetal.

2. **Arquitectura Limpia y Modular**:
   - **HTML**: Semántica pura accesible (WAI-ARIA, roles, labels).
   - **CSS**: Variables de diseño (Obsidian Botanical), degradados suaves, responsive design (Desktop, Tablet, Mobile) y soporte para `prefers-reduced-motion`.
   - **JS**: Orientado a eventos, sin frameworks pesados, con manejo seguro de desconexiones y reconexiones MQTT.

3. **Telemetría y Control de Actuador en Tiempo Real**:
   - Conexión WebSocket WSS a broker HiveMQ (`wss://broker.hivemq.com:8884/mqtt`).
   - Monitor de **Humedad del Suelo** (FC-28 / ADC), **Temperatura** y **Humedad Relativa** (DHT22).
   - Botón de riego manual con **temporizador de seguridad por hardware y software a 8 segundos**.
   - Gráfico dinámico en Canvas HTML5 con interpolación Bézier de las últimas 50 muestras.
   - Modo de **Simulación Integrado**: permite probar toda la interfaz y las animaciones sin necesidad de tener el ESP32 conectado.

---

## 🔌 Esquema de Pines (ESP32)

| Componente | Pin Sensor / Módulo | Pin GPIO ESP32 | Protocolo / Modo |
| :--- | :--- | :--- | :--- |
| **Sensor de Suelo FC-28** | Salida analógica (AO) | `GPIO 34` | ADC1 (Compatible con Wi-Fi) |
| **Sensor DHT22** | Pin de datos (DATA) | `GPIO 21` | Digital 1-Wire (Pull-up 10k) |
| **Módulo Relé (Bomba)** | Entrada de control (IN) | `GPIO 26` | Salida digital (Activo en LOW) |

---

## 📡 Tópicos MQTT (HiveMQ)

Por defecto, el prefijo de topics es `lab/invernadero/demo-7f2c9d`:

- **Telemetría** (`.../telemetry`): Publica periódicamente el JSON del ESP32:
  ```json
  {
    "temperature": 24.8,
    "air_humidity": 65.2,
    "soil_percent": 58,
    "soil_raw": 2180,
    "relay": "OFF"
  }
  ```
- **Comando de Riego** (`.../relay/set`): Envía `"ON"` u `"OFF"`.
- **Estado del Relé** (`.../relay/state`): Confirmación del ESP32 (`"ON"` / `"OFF"`).
- **Presencia** (`.../status`): Mensaje `"online"` con la IP local del microcontrolador.

---

## 🚀 Cómo Ejecutar

1. **Abrir en Navegador**:
   - Puedes abrir `index.html` o `dashboard.html` directamente en tu navegador web.
2. **Probar de inmediato sin hardware**:
   - Haz clic en **"Iniciar simulación"** en la sección de Conexión MQTT. Verás cómo la plantica cobra vida, las métricas varían naturalmente y puedes probar el botón de riego.
3. **Conectar tu ESP32**:
   - Carga `mini_invernadero_hivemq.ino` en tu placa con Arduino IDE.
   - Configura tu red Wi-Fi y topic.
   - En el dashboard, pulsa **"Conectar al broker"**.
