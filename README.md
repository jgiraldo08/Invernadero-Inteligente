# 🌿 Invernadero Inteligente — VERDE.LAB
### Corporación Universitaria Americana

Dashboard profesional y sistema de telemetría en tiempo real para mini invernadero basado en **ESP32**, **HiveMQ MQTT** y visualización web biomecánica desacoplada en **HTML5**, **CSS3** y **JavaScript (Vanilla)**.

---

## 📁 Estructura del Proyecto

El proyecto ha sido modularizado siguiendo las mejores prácticas de desarrollo web frontend y sistemas embebidos IoT:

```text
mini_invernadero_hivemq/
├── index.html                  # Punto de entrada principal HTML5 semántico
├── assets/
│   └── logo-americana.png      # Logo institucional Corporación Universitaria Americana
├── evidencias/                 # Capturas de prueba, esquemas y evidencias del montaje
├── css/
│   ├── style.css               # Design tokens, variables CSS, layout Grid/Flexbox y componentes UI
│   └── animation.css           # Animaciones de la plantica, balanceo orgánico, microaspersión y partículas
├── js/
│   └── app.js                  # Controlador general: cliente MQTT (WebSocket), gráficas Canvas y simulación
├── code/
│   └── mini_invernadero_hivemq.ino # Firmware C++ para ESP32 (WiFi, PubSubClient, DHT22, FC-28)
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
   - Abre `index.html` directamente en cualquier navegador moderno.
2. **Probar de inmediato sin hardware**:
   - Haz clic en **"Iniciar simulación"** en la sección de Conexión MQTT. Verás cómo la plantica cobra vida, las métricas varían naturalmente y puedes probar el botón de riego.
3. **Conectar tu ESP32**:
   - Carga `code/mini_invernadero_hivemq.ino` en tu placa con Arduino IDE.
   - Configura tu red Wi-Fi y topic.
   - En el dashboard, pulsa **"Conectar al broker"**.

---

## 📸 Evidencias y Pruebas del Sistema

En esta sección se presentan las capturas de pantalla, fotografías del circuito y pruebas de funcionamiento del invernadero inteligente. Las imágenes se ubican en la carpeta [`evidencias/`](evidencias/).

> 💡 **Instrucciones para adjuntar evidencias**:  
> Guarda tus archivos de imagen en la carpeta `evidencias/` con los nombres correspondientes (`.png`, `.jpg`, `.jpeg` o `.webp`). Automáticamente se visualizarán en este documento.

### 1. Pruebas de la Interfaz Web y Animación Biomecánica

| Vista General del Dashboard (Estado Normal) | Activación de Microaspersión (Riego ON) |
| :---: | :---: |
| ![Dashboard Vista General](evidencias/dashboard_general.png) | ![Animación de Riego Activo](evidencias/dashboard_riego.png) |
| *Cámara bio-climática con plantica protagonista en balanceo orgánico y métricas en vivo* | *Boquilla cenital activa, cono de micro-nebulización y cascada de gotas fluidas* |

| Análisis Temporal y Tendencias (Canvas) | Panel de Conectividad MQTT y Registro |
| :---: | :---: |
| ![Gráfica de Sensores](evidencias/grafica_tendencias.png) | ![Panel MQTT y Logs](evidencias/panel_conexion_mqtt.png) |
| *Curvas continuas Bézier en tiempo real de las últimas 50 muestras de telemetría* | *Historial de eventos, estado de sesión WSS :8884 y prefijo de topics* |

---

### 2. Montaje de Hardware y Sensores de Campo

| Montaje Completo del Circuito (ESP32) | Sensor de Humedad en Sustrato (FC-28) |
| :---: | :---: |
| ![Circuito ESP32](evidencias/circuito_esp32.png) | ![Sensor Suelo FC-28](evidencias/sensor_suelo_fc28.png) |
| *Microcontrolador ESP32 DevKit, protoboard, cableado y fuentes de alimentación* | *Sonda resistiva insertada en el sustrato del mini invernadero* |

| Sensor de Temperatura y Humedad (DHT22) | Módulo Relé Optoacoplado (GPIO 26) |
| :---: | :---: |
| ![Sensor DHT22](evidencias/sensor_dht22.png) | ![Módulo Relé](evidencias/modulo_rele.png) |
| *Sensor digital 1-Wire para temperatura ambiente y humedad relativa* | *Control de conmutación de potencia para la electrobomba de riego* |

---

### 3. Verificación de Comunicación y Transmisión MQTT

| Salida del Monitor Serie (Arduino IDE) | Consola de Pruebas HiveMQ WebSocket Client |
| :---: | :---: |
| ![Monitor Serie ESP32](evidencias/monitor_serie.png) | ![Consola HiveMQ](evidencias/hivemq_consola.png) |
| *Conexión a Wi-Fi, handshake con HiveMQ y publicación periódica de JSON* | *Monitoreo de tópicos en tiempo real desde la consola web del broker* |

---

## 👨‍💻 Créditos y Autores

Proyecto de Internet de las Cosas (IoT) y Agricultura de Precisión.  
**Corporación Universitaria Americana**  
Facultad de Ingeniería.
