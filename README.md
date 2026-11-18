# 🌿 VERDE.LAB — Mini Invernadero Inteligente IoT
### Corporación Universitaria Americana — Ingeniería y Tecnologías de la Información

![IoT](https://img.shields.io/badge/IoT-ESP32%20DevKit%20v1-green?style=for-the-badge&logo=espressif)
![Broker](https://img.shields.io/badge/Broker-HiveMQ%20MQTT-yellow?style=for-the-badge&logo=mqtt)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20HTML5%20%2F%20CSS3%20%2F%20JS-blue?style=for-the-badge&logo=javascript)
![Protocol](https://img.shields.io/badge/Protocol-MQTT%20TCP%20%26%20WSS-orange?style=for-the-badge)

**VERDE.LAB** es un ecosistema de telemetría bioclimática, visualización interactiva y automatización de riego en tiempo real para mini invernaderos de laboratorio. El proyecto integra un microcontrolador **ESP32 DevKit**, sensores agroambientales (**DHT22** y **FC-28**), un actuador por relé optoacoplado para microaspersión, comunicación mediante el broker MQTT público de **HiveMQ** y una interfaz web desacoplada en **HTML5 semántico, CSS3 y JavaScript Vanilla** con animaciones biomecánicas SVG de la planta y gráficos dinámicos en Canvas.

---

## 📑 Tabla de Contenidos

1. [Arquitectura General del Sistema](#-arquitectura-general-del-sistema)
2. [Componentes de Hardware y Sensores](#-componentes-de-hardware-y-sensores)
   - [ESP32 DevKit clásico (MCU)](#1-microcontrolador-esp32-devkit-v1)
   - [Sensor de Humedad de Suelo FC-28](#2-sensor-de-humedad-de-sustrato-fc-28)
   - [Sensor de Temperatura y Humedad DHT22](#3-sensor-de-temperatura-y-humedad-relativa-dht22-am2302)
   - [Módulo Relé de 1 Canal (Bomba / Actuador)](#4-módulo-de-relé-de-1-canal-control-de-riego)
3. [Esquema de Conexiones y Pinout](#-esquema-de-conexiones-y-pinout)
4. [Protocolo y Arquitectura MQTT (HiveMQ)](#-protocolo-y-arquitectura-mqtt-hivemq)
   - [Canales de Comunicación (TCP vs WSS)](#canales-de-comunicación-tcp-vs-wss)
   - [Estructura de Tópicos (Topic Hierarchy)](#estructura-de-tópicos-topic-hierarchy)
   - [Especificación del Payload JSON](#especificación-del-payload-json-telemetry)
   - [Seguridad y Last Will and Testament (LWT)](#seguridad-y-last-will-and-testament-lwt)
5. [Lógica y Estructura del Firmware ESP32 (`mini_invernadero_hivemq.ino`)](#-lógica-y-estructura-del-firmware-esp32)
   - [Filtrado por Sobremuestreo (ADC)](#1-lectura-analógica-y-filtrado-por-sobremuestreo)
   - [Calibración Matemática de Humedad](#2-calibración-matemática-de-humedad)
   - [Temporizador de Seguridad de Riego (8 segundos)](#3-temporizador-de-seguridad-por-software-8-segundos)
   - [Bucle de Telemetría y Reconexión Asíncrona](#4-bucle-de-telemetría-y-reconexión-asíncrona)
6. [Sitio Web y Dashboard Frontend](#-sitio-web-y-dashboard-frontend)
   - [Arquitectura Modular Web](#arquitectura-modular-web)
   - [Escenario SVG Biomecánico: La Plantica Protagonista](#escenario-svg-biomecánico-la-plantica-protagonista)
   - [Gráfico Dinámico en Canvas HTML5](#gráfico-dinámico-en-canvas-html5)
   - [Modo Simulación Matemática Integrado](#modo-simulación-matemática-integrado)
   - [Manejo de Heartbeat y Bloqueo de Comandos](#manejo-de-heartbeat-y-bloqueo-de-comandos)
7. [Guía de Puesta en Marcha Paso a Paso](#-guía-de-puesta-en-marcha-paso-a-paso)
8. [Resolución de Problemas Frecuentes (Troubleshooting)](#-resolución-de-problemas-frecuentes-troubleshooting)
9. [Estructura del Repositorio](#-estructura-del-repositorio)

---

## 🏛 Arquitectura General del Sistema

El sistema implementa una arquitectura IoT de tres capas desacopladas (Captura/Actuación, Transporte de Mensajería y Presentación/Control):

```mermaid
flowchart TD
    subgraph CAPA_HARDWARE["1. Capa de Hardware (Invernadero Físico)"]
        FC28["Sensor FC-28\n(Humedad Suelo)"] -->|Señal Analógica 0-3.3V| ESP32["ESP32 DevKit v1\n(Firmware C++ / FreeRTOS)"]
        DHT22["Sensor DHT22\n(Temp & Humedad Aire)"] -->|Protocolo Digital 1-Wire| ESP32
        ESP32 -->|GPIO 26 (Señal LOW/HIGH)| RELE["Módulo Relé 5V/3.3V\n(Optoacoplado)"]
        RELE -->|Circuito Potencia| BOMBA["Bomba 5V / Microaspersión"]
    end

    subgraph CAPA_RED["2. Capa de Mensajería (HiveMQ Public Broker)"]
        ESP32 -->|WiFi 802.11 b/g/n \n MQTT TCP :1883| HIVEMQ["Broker MQTT: broker.hivemq.com\n- Topico /telemetry (JSON)\n- Topico /relay/set (Comandos)\n- Topico /relay/state (Confirmación)\n- Topico /status (LWT online/offline)"]
    end

    subgraph CAPA_WEB["3. Capa de Supervisión (Dashboard Web)"]
        HIVEMQ <-->|WSS Seguro :8884/mqtt\n(MQTT.js over WebSocket)| APPJS["Controlador app.js\n(Motor Reactivo)"]
        APPJS --> DOM["index.html / dashboard.html\n- Animación Biomecánica SVG\n- Gráfica Dinámica Canvas\n- Métricas en Tiempo Real"]
        APPJS --> SIM["Simulador Matemático Local\n(Pruebas sin Hardware)"]
        DOM -->|Botón Riego Manual| APPJS
    end
```

---

## 🔬 Componentes de Hardware y Sensores

### 1. Microcontrolador: ESP32 DevKit v1
- **Procesador**: Tensilica Xtensa Dual-Core 32-bit LX6 a 240 MHz.
- **Conectividad**: Wi-Fi 802.11 b/g/n (2.4 GHz) integrado.
- **Convertidor Analógico-Digital (ADC)**:
  > [!IMPORTANT]
  > En el ESP32, el bloque **ADC2** se encuentra compartido internamente con el módulo Wi-Fi. Por esta razón, el sensor de suelo debe conectarse obligatoriamente a los pines del **ADC1** (`GPIO 32` a `GPIO 39`). En este proyecto se utiliza el **GPIO 34**, garantizando lecturas analógicas continuas sin interferencias con la radio Wi-Fi.

### 2. Sensor de Humedad de Sustrato: FC-28
- **Principio de funcionamiento**: Medición resistiva/conductiva indirecta. Cuenta con dos pistas metálicas conductoras expuestas que se insertan en la tierra. La resistencia eléctrica entre los electrodos varía de forma inversamente proporcional a la concentración de agua del suelo:
  - *Suelo Seco*: Alta resistencia dieléctrica $\rightarrow$ Tensión de salida analógica alta (~3.3V).
  - *Suelo Húmedo*: Baja resistencia (alta conductividad iónica) $\rightarrow$ Tensión de salida analógica baja (~1.0V - 1.2V).
- **Módulo acondicionador**: Incorpora un comparador analógico LM393 con potenciómetro para umbral digital (DO) y salida analógica directa (AO). En este proyecto se utiliza la salida **AO** conectada al conversor ADC de 12 bits del ESP32.

### 3. Sensor de Temperatura y Humedad Relativa: DHT22 (AM2302)
- **Humedad del aire**: Sensor capacitivo de polímero sensible con rango del **0% al 100% HR** y precisión típica de $\pm 2\%$.
- **Temperatura ambiente**: Termistor NTC de alta precisión con rango de **-40 °C a +80 °C** y precisión de $\pm 0.5^\circ\text{C}$.
- **Protocolo de comunicación**: Bus digital propietario a 1 hilo (Single-Bus / 1-Wire). Envía tramas de 40 bits serializados con suma de verificación (checksum).
- **Frecuencia de lectura**: Requiere un intervalo mínimo de 2 segundos entre lecturas consecutivas para evitar autocalentamiento y lecturas corruptas (en el código se muestrea cada 2.5 segundos).

### 4. Módulo de Relé de 1 Canal (Control de Riego)
- **Aislamiento**: Optoacoplador integrado que previene que los picos inductivos de la bomba afecten al microcontrolador.
- **Lógica de activación**: **Activo en Bajo (Active-LOW)**.
  - Escribir `LOW` en el pin GPIO activa el optoacoplador y cierra el contacto normalmente abierto (NO), encendiendo la bomba.
  - Escribir `HIGH` desenergiza la bobina y abre el contacto, apagando la bomba.
- **Mecanismo de seguridad por software**: El firmware apaga automáticamente el relé tras **8 segundos continuos** de activación (`RELE_MAX_ON_MS = 8000UL`), evitando inundaciones o daños en la electroválvula/bomba si el usuario olvida apagarlo o si se pierde la conexión de red.

---

## 🔌 Esquema de Conexiones y Pinout

| Dispositivo / Sensor | Pin del Componente | Pin ESP32 (DevKit) | Tipo de Señal | Nivel de Voltaje | Observaciones Técnicas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sensor de Suelo FC-28** | `VCC` | `3V3` o `VIN (5V)` | Alimentación | 3.3V / 5.0V | Se recomienda 3.3V para proteger el ADC del ESP32. |
| | `GND` | `GND` | Tierra | 0V | Tierra común. |
| | `AO` (Analog Out) | **`GPIO 34`** | Entrada Analógica | 0 a 3.3V | Canal `ADC1_CH6`. Exclusivo de entrada (Input-Only). |
| | `DO` (Digital Out)| *No conectado* | Digital | -- | Umbral por potenciómetro no requerido. |
| **Sensor DHT22 (AM2302)** | `VCC` (Pin 1) | `3V3` | Alimentación | 3.3V | Funcionamiento verificado a 3.3V. |
| | `DATA` (Pin 2) | **`GPIO 21`** | Digital Bidireccional | 3.3V | Requiere resistencia Pull-Up de 10kΩ a 3.3V (muchos módulos ya la integran). |
| | `NC` (Pin 3) | *No conectado* | -- | -- | Sin conexión interna en el encapsulado. |
| | `GND` (Pin 4) | `GND` | Tierra | 0V | Tierra común. |
| **Módulo Relé (1 Canal)** | `VCC` | `VIN (5V)` o `3V3` | Alimentación | 5.0V | La bobina conmutadora suele operar con mayor torque a 5V. |
| | `GND` | `GND` | Tierra | 0V | Tierra común compartida con el ESP32. |
| | `IN` (Control) | **`GPIO 26`** | Salida Digital | 3.3V | Salida `OUTPUT`. Activo en nivel `LOW`. |

```text
       ESQUEMA SIMPLIFICADO DE CONEXIONES:
       
       +-------------------+             +-----------------------+
       |   SENSOR FC-28    |             |       DHT22           |
       |  VCC  GND   AO    |             |  VCC  DATA  NC  GND   |
       +---|----|----|-----+             +---|----|---------|----+
           |    |    |                       |    |         |
          3V3  GND  GPIO34                  3V3  GPIO21    GND
           |    |    |                       |    |         |
       +---|----|----|-----------------------|----|---------|----+
       |  3V3  GND  G34                     3V3  G21       GND   |
       |                                                         |
       |                    ESP32 DEVKIT V1                      |
       |                                                         |
       |  VIN  GND  G26                                          |
       +---|----|----|-------------------------------------------+
           |    |    |
           |    |    +-------------------+
           |    |                        |
          VIN  GND                      IN
           |    |                        |
       +---|----|------------------------|----+
       |  VCC  GND                      IN    |
       |             MÓDULO RELÉ              |
       |         (NO)   (COM)   (NC)          |
       +-----------|------|-------------------+
                   |      |
             [ Fuente ]  [ Micro-Bomba 5V ]
```

---

## 📡 Protocolo y Arquitectura MQTT (HiveMQ)

MQTT (*Message Queuing Telemetry Transport*) es un protocolo ligero de mensajería basado en el patrón **Publicador/Suscriptor (Pub/Sub)**, ideal para entornos de ancho de banda restringido y microcontroladores embebidos.

### Canales de Comunicación (TCP vs WSS)

1. **ESP32 (Hardware)**: Conexión mediante socket TCP puro en el puerto `1883`:
   - Host: `broker.hivemq.com`
   - Puerto: `1883` (Sin encriptación TLS, ideal para demostraciones ágiles en laboratorio).
2. **Dashboard Web (Navegador)**: Conexión mediante WebSocket Seguro (WSS) en el puerto `8884`:
   - Endpoint: `wss://broker.hivemq.com:8884/mqtt`
   - Permite que el navegador web establezca comunicación bidireccional en tiempo real sin requerir extensiones ni backends intermedios.

### Estructura de Tópicos (Topic Hierarchy)

El sistema utiliza un prefijo base configurable (`TOPIC_BASE = "lab/invernadero/<identificador>"`). Por defecto: `lab/invernadero/demo-7f2c9d`.

| Tópico Completo | Sentido | QoS | Retain | Descripción |
| :--- | :---: | :---: | :---: | :--- |
| `.../telemetry` | ESP32 $\rightarrow$ Broker | 0 | `false` | Envío periódico (cada 2.5 s) de todas las métricas en JSON. |
| `.../relay/set` | Web $\rightarrow$ ESP32 | 0 | `false` | Comando de control para accionar el relé: `"ON"` o `"OFF"`. |
| `.../relay/state`| ESP32 $\rightarrow$ Web | 0 | `true` | Confirmación real del estado de conmutación del actuador (`"ON"` / `"OFF"`). |
| `.../status` | ESP32 $\rightarrow$ Web | 0 | `true` | Señal de presencia del microcontrolador (`"online"` / `"offline"` vía LWT). |

### Especificación del Payload JSON (`/telemetry`)

Cada 2500 ms, el ESP32 genera y publica una trama de telemetría compacta en JSON:

```json
{
  "temperature": 24.8,
  "air_humidity": 65.2,
  "soil_percent": 58,
  "soil_raw": 2180,
  "relay": "OFF",
  "dht_ok": true,
  "wifi_rssi": -63,
  "uptime_s": 1420
}
```

#### Desglose de Parámetros:
- `temperature`: Temperatura ambiental en grados Celsius con un decimal (o `null` si hay fallo de lectura en el bus 1-Wire).
- `air_humidity`: Porcentaje de humedad relativa del aire en `% HR` con un decimal (o `null` ante error).
- `soil_percent`: Porcentaje calculado de humedad del sustrato ($0\%$ a $100\%$).
- `soil_raw`: Valor digital crudo del ADC de 12 bits ($0$ a $4095$) obtenido en el pin GPIO 34.
- `relay`: Cadena `"ON"` o `"OFF"` con el estado de conmutación del relé.
- `dht_ok`: Booleano (`true`/`false`) que valida la integridad física del sensor DHT22.
- `wifi_rssi`: Intensidad de la señal de red Wi-Fi recibida en dBm (permite diagnosticar la cobertura en campo).
- `uptime_s`: Segundos transcurridos desde el encendido o reinicio del ESP32.

### Seguridad y Last Will and Testament (LWT)

El protocolo MQTT implementa el mecanismo **LWT**: al momento de autenticar la sesión MQTT con el broker, el ESP32 registra un "testamento":
- Si el ESP32 sufre un corte de energía, reinicio por caída de tensión o pierde la señal Wi-Fi de forma abrupta, el broker HiveMQ detecta el cierre inesperado del socket TCP y publica automáticamente `"offline"` en el tópico `.../status` con bandera `Retain = true`.
- De esta manera, cualquier cliente web que se conecte sabrá inmediatamente que el dispositivo físico no se encuentra disponible.

---

## 💻 Lógica y Estructura del Firmware ESP32

El firmware `mini_invernadero_hivemq.ino` está optimizado para microcontroladores en tiempo real, priorizando seguridad, estabilidad y tiempos de respuesta sin bloqueos.

### 1. Lectura Analógica y Filtrado por Sobremuestreo

Las señales analógicas en microcontroladores pueden sufrir ruido electromagnético de la radio Wi-Fi. La función `leerSueloPromedio()` implementa un sobremuestreo promediado de 8 muestras con micro-retardos de estabilización:

```cpp
int leerSueloPromedio() {
  long suma = 0;
  for (int i = 0; i < 8; i++) {
    suma += analogRead(PIN_SUELO);
    delayMicroseconds(160);
  }
  return (int)(suma / 8);
}
```

Adicionalmente, en `setup()` se define la resolución y atenuación adecuadas del conversor analógico:
```cpp
analogReadResolution(12);                   // Resolución de 12 bits: valores de 0 a 4095
analogSetPinAttenuation(PIN_SUELO, ADC_11db); // Rango de entrada de 0 a 3.3V
```

### 2. Calibración Matemática de Humedad

El sensor FC-28 entrega valores altos cuando el suelo está seco y bajos cuando está húmedo. La función `calcularHumedadRelativa()` invierte y restringe la escala entre 0% y 100%:

```cpp
const int ADC_SECO = 3500;   // Lectura con el sensor al aire o en sustrato deshidratado
const int ADC_HUMEDO = 1200; // Lectura con el sensor en agua o sustrato saturado

int calcularHumedadRelativa(int raw) {
  if (ADC_SECO == ADC_HUMEDO) return 0;
  long porcentaje = map(raw, ADC_SECO, ADC_HUMEDO, 0, 100);
  return constrain(porcentaje, 0L, 100L);
}
```

### 3. Temporizador de Seguridad por Software (8 segundos)

Para mitigar riesgos de inundación provocados por mensajes maliciosos en brokers públicos o fallos en la conexión web, el relé cuenta con un temporizador estricto no bloqueante:

```cpp
void aplicarRele(bool encender) {
  if (encender && releEncendido) return; // Evita reinicios de temporizador por comandos repetidos
  releEncendido = encender;
  digitalWrite(PIN_RELE, RELE_ACTIVO_BAJO ? (encender ? LOW : HIGH)
                                          : (encender ? HIGH : LOW));
  if (encender) releInicioMs = millis();
  publicarEstadoRele = true;
}

// Dentro del bucle principal loop():
if (releEncendido && (ahora - releInicioMs >= RELE_MAX_ON_MS)) {
  Serial.println("[SEGURIDAD] Tiempo de rele agotado (8 s)");
  aplicarRele(false);
}
```

### 4. Bucle de Telemetría y Reconexión Asíncrona

El sketch evita deliberadamente la función bloqueante `delay()` en el `loop()`. Emplea un temporizador con `millis()` para coordinar tres tareas críticas:
1. Verificación del temporizador de seguridad de la bomba.
2. Reconexión autónoma de la interfaz Wi-Fi (cada 15 s si se desconecta).
3. Reconexión periódica y mantenimiento del socket MQTT (cada 5 s) con invocación continua a `mqtt.loop()`.
4. Envío periódico de la telemetría cada 2500 ms.

---

## 🌐 Sitio Web y Dashboard Frontend

El frontend ha sido diseñado bajo los principios de **diseño de alto rendimiento, modularidad e interacción biomecánica**.

### Arquitectura Modular Web

- **`index.html` / `dashboard.html`**: Estructura semántica con soporte de accesibilidad (ARIA labels, live regions, contrastes altos para laboratorio).
- **`css/style.css`**: Design tokens con paleta botánica *Obsidian Botanical* (`#060a0c`, `#090e11`, acentos esmeralda `#4ade80` y cian `#38bdf8`), tipografía moderna (*Space Grotesk* y *DM Sans*), y grilla responsive (Desktop, Tablet y Mobile).
- **`css/animation.css`**: Hojas de estilo dedicadas a cinemática física y transformaciones 2D vectoriales.
- **`js/app.js`**: Controlador en Vanilla JavaScript puro (sin librerías pesadas tipo React o Angular), implementando el cliente `MQTT.js` vía WebSockets, interpolación de curvas Bézier en Canvas y un simulador dinámico.

### Escenario SVG Biomecánico: La Plantica Protagonista

El centro visual del dashboard es un escenario bio-climático en formato vectorial SVG:
- **Respiración y vaivén vegetal**: Animaciones CSS `plantSway`, `leafFlutterLeft`, `leafFlutterRight` y `apexBreeze` que emulan el movimiento natural de las hojas y el brote apical ante corrientes de aire.
- **Microaspersión activa (`.relay-on`)**: Al activarse el relé de riego, la clase `.relay-on` se inyecta en el elemento raíz:
  - Se activa la boquilla superior con un cono de niebla (`spray-mist`).
  - Descienden 10 gotas animadas a diferentes velocidades hacia el follaje (`drop-1` a `drop-10`).
  - Se generan ondas dinámicas de agua en el sustrato (`splash-ring`).
  - La planta incrementa su luminosidad con un filtro `drop-shadow` esmeralda (`plantThrive`).
- **Partículas de Polen y Luz Espectral**: Efectos de iluminación con degradados radiales y partículas flotantes continuas.

### Gráfico Dinámico en Canvas HTML5

- **Buffer Circular de Datos**: Almacena localmente las últimas **50 muestras** recibidas sin saturar la memoria del navegador.
- **Curvas de Bézier Suavizadas**: Conexión continua de puntos mediante `bezierCurveTo` para una lectura visual sin dientes de sierra.
- **Soporte HiDPI / Pantallas Retina**: Calibración automática según `window.devicePixelRatio` para evitar pixelado en pantallas de alta densidad.
- **Multi-selector de Métricas**: Permite alternar instantáneamente entre:
  - Humedad del Suelo ($0 - 100\%$)
  - Temperatura ($0 - 50^\circ\text{C}$)
  - Humedad del Aire ($0 - 100\%$)

### Modo Simulación Matemática Integrado

El dashboard incluye un generador de telemetría armónica local activable con el botón **"Iniciar simulación"**:
- Utiliza funciones trigonométricas sinusoidales desfasadas para reproducir variaciones de temperatura ($26.5 \pm 2.2^\circ\text{C}$), humedad de aire ($66 \pm 10\%$) y humedad de sustrato ($52 \pm 16\%$).
- Permite probar la interfaz, el botón de riego manual (con el corte automático a 8 s) y el renderizado en Canvas **sin necesidad de contar con el ESP32 físico encendido**.

### Manejo de Heartbeat y Bloqueo de Comandos

Para evitar que el usuario intente encender la bomba cuando el microcontrolador está apagado o fuera de cobertura:
- El dashboard calcula la diferencia temporal entre el momento actual y `lastPacket`.
- Si transcurren más de **12 segundos** (`HEARTBEAT_TIMEOUT_MS`) sin recibir paquetes en `/telemetry`, el sistema deshabilita automáticamente los botones de riego y actualiza la insignia a **"Esperando al ESP32"** o **"Sin telemetría"**.

---

## 🚀 Guía de Puesta en Marcha Paso a Paso

### 1. Requisitos Previos de Software
- Instalar [Arduino IDE](https://www.arduino.cc/en/software) (versión 2.x recomendada).
- Agregar el soporte para placas ESP32 en Arduino IDE:
  - *Preferencias* $\rightarrow$ *Gestor de URLs Adicionales de Tarjetas*:
    `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
  - *Herramientas* $\rightarrow$ *Placa* $\rightarrow$ *Gestor de Placas* $\rightarrow$ Buscar e instalar **esp32 by Espressif Systems**.
- Instalar las siguientes librerías desde el Gestor de Bibliotecas:
  - **PubSubClient** (por Nick O'Leary).
  - **DHT sensor library** (por Adafruit).
  - **Adafruit Unified Sensor** (por Adafruit).

### 2. Configuración del Firmware
Abre el archivo `code/mini_invernadero_hivemq.ino` y personaliza los siguientes parámetros:

1. **Credenciales Wi-Fi**:
   ```cpp
   const char* WIFI_SSID = "TU_RED_WIFI";
   const char* WIFI_PASSWORD = "TU_CONTRASEÑA";
   ```
2. **Prefijo de Tópicos MQTT Único**:
   > [!WARNING]
   > Como el broker `broker.hivemq.com` es público, si dos personas usan el mismo topic habrá interferencias. Elige un sufijo aleatorio único:
   ```cpp
   const char* TOPIC_BASE = "mi-laboratorio/invernadero-equipo3";
   ```

### 3. Calibración del Sensor FC-28
1. Sube el sketch al ESP32 y abre el **Monitor Serie** a `115200 baudios`.
2. Con el sensor completamente limpio y seco en el aire, anota el valor de `soil_raw` (ej. `3500`). Asigna este valor a `ADC_SECO`.
3. Sumerge las puntas metálicas del sensor en un vaso con agua (sin sumergir el circuito electrónico). Anota el valor de `soil_raw` (ej. `1200`). Asigna este valor a `ADC_HUMEDO`.

### 4. Compilación y Carga
1. Conecta el ESP32 mediante cable Micro-USB o USB-C a tu ordenador.
2. En el menú *Herramientas*, selecciona:
   - **Placa**: *ESP32 Dev Module* (o la variante correspondiente a tu placa).
   - **Upload Speed**: *921600* (o *115200* si experimentas fallos).
   - **Puerto**: Selecciona el puerto serie COM (Windows) o `/dev/ttyUSB*` / `/dev/ttyACM*` (Linux/Mac).
3. Pulsa **Subir** (Upload). Si la consola muestra `Connecting........_____`, mantén pulsado el botón **BOOT** en la placa durante un par de segundos hasta que inicie la escritura de la memoria flash.

### 5. Apertura del Dashboard Web
1. Abre el archivo `index.html` directamente en tu navegador web preferido (Google Chrome, Mozilla Firefox, Edge o Safari). No requieres instalar Node.js ni servidores web complejos.
2. En la sección **Conectividad MQTT**:
   - Comprueba que la URL sea: `wss://broker.hivemq.com:8884/mqtt`.
   - En **Prefijo de Topics MQTT**, ingresa exactamente el mismo `TOPIC_BASE` configurado en el firmware (ej. `mi-laboratorio/invernadero-equipo3`).
3. Haz clic en **"Conectar al broker"**.
4. ¡Listo! En segundos verás cómo los indicadores se encienden en verde, el escenario SVG refleja el estado del invernadero y la gráfica comienza a trazar las lecturas en tiempo real.

---

## 🛠 Resolución de Problemas Frecuentes (Troubleshooting)

### 1. El sensor DHT22 devuelve `null` o `NaN` en las métricas
- **Causa**: Falla de contacto en el pin de datos, falta de resistencia pull-up o pin mal configurado.
- **Solución**:
  - Verifica que el pin de datos esté conectado al **GPIO 21**. Si tu placa tiene serigrafiado `D2` y no responde, revisa el mapeo de pines.
  - Asegúrate de que el sensor reciba alimentación estable de **3.3V**.
  - Si el módulo es el sensor bare (4 pines sueltos sin PCB), debes conectar una resistencia de **10 kΩ** entre `VCC` y `DATA`.

### 2. La humedad del suelo siempre muestra 0% o 100% fijo
- **Causa**: Sensor conectado a un pin del bloque ADC2 mientras el Wi-Fi está activo, o valores de calibración incorrectos.
- **Solución**:
  - Verifica que la salida analógica esté conectada obligatoriamente a un pin del **ADC1** (como el **GPIO 34**). Nunca uses pines del ADC2 (como GPIO 0, 2, 4, 12-15, 25-27) para lecturas analógicas mientras el Wi-Fi esté habilitado.
  - Revisa el Monitor Serie para verificar el valor numérico de `soil_raw` y ajusta `ADC_SECO` y `ADC_HUMEDO`.

### 3. El ESP32 no conecta al broker MQTT o muestra `state = -2`
- **Causa**: Fallo en la conexión a Internet o bloqueo del puerto 1883 en la red Wi-Fi institucional/empresarial.
- **Solución**:
  - Las redes universitarias o corporativas suelen bloquear los puertos TCP salientes que no sean 80 o 443. Si estás en una red restringida, comparte temporalmente datos desde tu teléfono móvil para realizar las pruebas.
  - Revisa que el SSID y contraseña en el archivo `.ino` estén libres de errores tipográficos.

### 4. El navegador indica "MQTT Error" o "Broker desconectado"
- **Causa**: Bloqueo de WebSockets en el navegador o URL errónea.
- **Solución**:
  - Asegúrate de utilizar el protocolo seguro **`wss://`** y el puerto **`:8884/mqtt`** (`wss://broker.hivemq.com:8884/mqtt`). Si usas `ws://` sin TLS o el puerto 1883 en el navegador, la conexión será rechazada.

### 5. El relé se activa solo al encender el microcontrolador
- **Causa**: Comportamiento característico de los módulos *Active-LOW*. Durante el arranque del microcontrolador, el pin puede encontrarse flotante en nivel bajo por una fracción de segundo antes de ejecutarse el código.
- **Solución**:
  - El sketch previene esto escribiendo `digitalWrite(PIN_RELE, HIGH)` antes de invocar `pinMode(PIN_RELE, OUTPUT)` en la rutina `setup()`. Asegúrate de no alterar ese orden en el código.

---

## 📂 Estructura del Repositorio

```text
mini_invernadero_hivemq/
├── index.html                   # Punto de entrada web principal en HTML5 semántico
├── dashboard.html               # Vista espejo del dashboard
├── assets/
│   ├── logo-americana.png       # Logotipo institucional Corporación Universitaria Americana
│   └── image.png                # Recursos visuales auxiliares
├── css/
│   ├── style.css                # Sistema de diseño, grid/flexbox, variables CSS e interfaz
│   └── animation.css            # Cinemática de la planta, partículas de luz y microaspersión
├── js/
│   └── app.js                   # Lógica reactiva: cliente MQTT WSS, Canvas Bézier y simulador
├── code/
│   └── mini_invernadero_hivemq.ino # Firmware C++ para ESP32 (WiFi, PubSubClient, DHT22, FC-28)
└── README.md                    # Documentación técnica integral del proyecto
```

---

## 👨‍💻 Créditos y Reconocimientos

Proyecto desarrollado para fines pedagógicos, investigativos y de transferencia tecnológica en el área de **Internet de las Cosas (IoT) y Agricultura de Precisión**.

**Corporación Universitaria Americana**  
Facultad de Ingeniería — Medellín / Barranquilla / Montería, Colombia.
