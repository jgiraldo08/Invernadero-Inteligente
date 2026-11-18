/**
 * ==========================================================================
 * VERDE.LAB — Mini Invernadero IoT
 * Controlador Principal del Dashboard (MQTT, Telemetría, Gráficas y Simulación)
 * ==========================================================================
 */

'use strict';

/**
 * Espacio de nombres de la aplicación
 */
const App = {
  // Configuración y límites
  CONFIG: {
    MAX_SAMPLES: 50,
    HEARTBEAT_TIMEOUT_MS: 12000,
    SAFETY_RELAY_TIMEOUT_MS: 8000,
    DEFAULT_WSS_URL: 'wss://broker.hivemq.com:8884/mqtt',
    DEFAULT_TOPIC_BASE: 'lab/invernadero/demo-7f2c9d'
  },

  // Estado reactivo global
  state: {
    client: null,
    connected: false,
    demo: false,
    simTimer: null,
    simRelayTimeout: null,
    relay: 'UNKNOWN',
    lastPacket: 0,
    history: {
      soil: [],
      temp: [],
      air: []
    },
    chartMode: 'soil',
    lastMessage: null,
    events: [],
    topicBase: ''
  },

  // Cache de elementos del DOM
  elements: {},

  /**
   * Inicialización de la aplicación al cargar el DOM
   */
  init() {
    this.cacheElements();
    this.bindEvents();
    this.updateClock();
    this.updateConnectionUI();
    this.drawChart();

    // Actualizador de reloj y verificación de latido del dispositivo
    setInterval(() => {
      this.updateClock();
      this.updateDeviceStatus();
    }, 1000);

    this.logEvent('Dashboard inicializado y listo para conectar a HiveMQ.');
  },

  /**
   * Almacena referencias a los nodos del DOM más utilizados
   */
  cacheElements() {
    const $ = id => document.getElementById(id);
    this.elements = {
      appRoot: $('appRoot'),
      clock: $('clock'),
      brokerDot: $('brokerDot'),
      brokerLabel: $('brokerLabel'),
      deviceDot: $('deviceDot'),
      deviceLabel: $('deviceLabel'),
      connectionStatus: $('connectionStatus'),
      connectForm: $('connectForm'),
      connectBtn: $('connectBtn'),
      mqttUrl: $('mqttUrl'),
      topicBase: $('topicBase'),
      demoBtn: $('demoBtn'),
      resetBtn: $('resetBtn'),
      
      // Actuador y Relé
      relayState: $('relayState'),
      relayDescription: $('relayDescription'),
      relayOnBtn: $('relayOnBtn'),
      relayOffBtn: $('relayOffBtn'),
      lastCommand: $('lastCommand'),
      
      // Escenario del Terrario / Plantica
      sceneTag: $('sceneTag'),
      sceneSummary: $('sceneSummary'),
      sceneDescription: $('sceneDescription'),
      sceneWater: $('sceneWater'),
      
      // Métricas de Sensores
      tempValue: $('tempValue'),
      tempFoot: $('tempFoot'),
      airValue: $('airValue'),
      airBar: $('airBar'),
      soilValue: $('soilValue'),
      soilFoot: $('soilFoot'),
      soilBar: $('soilBar'),
      
      // Historial y Eventos
      chartCanvas: $('chart'),
      chartLegend: $('chartLegend'),
      chartTabs: document.querySelectorAll('.chart-tab-btn'),
      eventList: $('eventList'),
      footerLast: $('footerLast')
    };
  },

  /**
   * Vincula los escuchadores de eventos de la interfaz
   */
  bindEvents() {
    const el = this.elements;

    el.connectForm.addEventListener('submit', e => {
      e.preventDefault();
      this.handleConnectSubmit();
    });

    el.relayOnBtn.addEventListener('click', () => this.sendRelayCommand('ON'));
    el.relayOffBtn.addEventListener('click', () => this.sendRelayCommand('OFF'));
    el.demoBtn.addEventListener('click', () => this.toggleDemoMode());
    el.resetBtn.addEventListener('click', () => this.resetData());

    el.chartTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectChart(btn.dataset.chart);
      });
    });

    window.addEventListener('resize', () => this.drawChart());
  },

  /**
   * Genera los tópicos MQTT en función del prefijo configurado
   */
  getTopics() {
    const base = this.state.topicBase;
    return {
      telemetry: `${base}/telemetry`,
      online: `${base}/status`,
      relayState: `${base}/relay/state`,
      relayCmd: `${base}/relay/set`
    };
  },

  /**
   * Utilidades matemáticas y de formato
   */
  utils: {
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    isValidNumber: n => typeof n === 'number' && Number.isFinite(n),
    fmtNumber: (n, d = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '--',
    getClockString: () => new Date().toLocaleTimeString('es-CO', { hour12: false })
  },

  /**
   * Actualiza el reloj del sistema en la barra superior
   */
  updateClock() {
    if (this.elements.clock) {
      this.elements.clock.textContent = this.utils.getClockString();
    }
  },

  /**
   * Registra un evento en la lista de actividad
   */
  logEvent(message, isError = false) {
    const eventObj = {
      message: String(message).slice(0, 140),
      error: Boolean(isError),
      time: this.utils.getClockString()
    };

    this.state.events.unshift(eventObj);
    this.state.events = this.state.events.slice(0, 5);

    const list = this.elements.eventList;
    if (!list) return;

    list.replaceChildren();
    for (const ev of this.state.events) {
      const row = document.createElement('div');
      row.className = `event-entry${ev.error ? ' error' : ''}`;

      const dot = document.createElement('i');
      const span = document.createElement('span');
      span.textContent = ev.message;
      const time = document.createElement('time');
      time.textContent = ev.time;

      row.append(dot, span, time);
      list.appendChild(row);
    }
  },

  /**
   * Actualiza las insignias de estado y botones de conexión
   */
  updateConnectionUI() {
    const { connected, demo } = this.state;
    const el = this.elements;

    if (demo) {
      this.setBadge(el.brokerDot, el.brokerLabel, 'Modo demostración', 'warn');
      el.connectionStatus.textContent = 'Simulación activa';
      el.connectBtn.textContent = 'Conectar al broker';
    } else if (connected) {
      this.setBadge(el.brokerDot, el.brokerLabel, 'Broker conectado', 'ok');
      el.connectionStatus.textContent = 'Conectado a HiveMQ WSS';
      el.connectBtn.textContent = 'Desconectar';
    } else {
      this.setBadge(el.brokerDot, el.brokerLabel, 'Broker desconectado', '');
      el.connectionStatus.textContent = 'Desconectado';
      el.connectBtn.textContent = 'Conectar al broker';
    }

    el.mqttUrl.disabled = connected;
    el.topicBase.disabled = connected;
    el.demoBtn.textContent = demo ? 'Detener simulación' : 'Iniciar simulación';
    el.demoBtn.disabled = connected;

    this.updateDeviceStatus();
  },

  /**
   * Comprueba si el ESP32 está transmitiendo telemetría en vivo
   */
  updateDeviceStatus() {
    const { connected, demo, lastPacket, relay } = this.state;
    const el = this.elements;
    const isTransmitting = connected && lastPacket > 0 && (Date.now() - lastPacket < this.CONFIG.HEARTBEAT_TIMEOUT_MS);
    const active = demo || isTransmitting;

    if (demo) {
      this.setBadge(el.deviceDot, el.deviceLabel, 'Datos simulados', 'warn');
      el.sceneTag.textContent = 'MODO DEMO';
    } else if (isTransmitting) {
      this.setBadge(el.deviceDot, el.deviceLabel, 'ESP32 transmitiendo', 'ok');
      el.sceneTag.textContent = 'EN VIVO · ESP32';
    } else if (connected) {
      this.setBadge(el.deviceDot, el.deviceLabel, 'Esperando al ESP32', '');
      el.sceneTag.textContent = 'ESPERANDO SEÑAL';
    } else {
      this.setBadge(el.deviceDot, el.deviceLabel, 'Sin telemetría', '');
      el.sceneTag.textContent = 'DESCONECTADO';
    }

    // El control solo se habilita si hay telemetría activa o si está en simulación
    el.relayOnBtn.disabled = !active || relay === 'ON';
    el.relayOffBtn.disabled = !active;
  },

  /**
   * Configura una etiqueta de estado luminosa
   */
  setBadge(dotEl, labelEl, text, statusClass) {
    if (!dotEl || !labelEl) return;
    dotEl.className = `status-dot${statusClass ? ' ' + statusClass : ''}`;
    labelEl.textContent = text;
  },

  /**
   * Cambia el estado del actuador / relé e interactúa con las animaciones
   */
  setRelayState(stateName) {
    if (stateName !== 'ON' && stateName !== 'OFF') return;

    this.state.relay = stateName;
    const isWatering = stateName === 'ON';

    // Dispara las animaciones de la plantica y del agua en el DOM
    this.elements.appRoot.classList.toggle('relay-on', isWatering);

    this.elements.relayState.textContent = isWatering ? 'Riego activado' : 'Relé apagado';
    this.elements.relayDescription.textContent = isWatering
      ? 'Microaspersión activa · Corte de seguridad a los 8 s'
      : 'Bomba inactiva · Circuito en reposo';

    this.elements.sceneWater.textContent = isWatering ? 'RIEGO EN CURSO' : 'RIEGO EN ESPERA';

    this.updateDeviceStatus();
  },

  /**
   * Conecta o desconecta la sesión MQTT
   */
  handleConnectSubmit() {
    if (this.state.connected) {
      this.disconnectMQTT();
    } else {
      this.connectMQTT();
    }
  },

  /**
   * Inicia la conexión WebSocket MQTT con HiveMQ
   */
  connectMQTT() {
    if (this.state.demo) {
      this.stopDemo();
    }

    const url = this.elements.mqttUrl.value.trim();
    const base = this.elements.topicBase.value.trim().replace(/\/+$/, '');

    // Validaciones
    if (!/^wss:\/\/[^\s/]+(?::\d+)?\/[\w/-]*$/.test(url)) {
      this.logEvent('La URL debe usar protocolo seguro wss:// (ej. wss://broker.hivemq.com:8884/mqtt)', true);
      return;
    }

    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base)) {
      this.logEvent('Prefijo no válido. Usa caracteres alfanuméricos, /, _ o -', true);
      return;
    }

    if (typeof mqtt === 'undefined') {
      this.logEvent('Biblioteca MQTT.js no disponible. Revisa la conexión de red.', true);
      return;
    }

    this.state.topicBase = base;
    this.state.lastPacket = 0;
    this.elements.connectBtn.textContent = 'Conectando...';
    this.elements.connectBtn.disabled = true;

    this.logEvent('Conectando por WSS a HiveMQ...');

    try {
      const client = mqtt.connect(url, {
        clientId: 'verdelab-' + Math.random().toString(16).slice(2, 11),
        clean: true,
        keepalive: 30,
        connectTimeout: 10000,
        reconnectPeriod: 3000,
        protocolVersion: 4,
        resubscribe: true
      });

      this.state.client = client;

      client.on('connect', () => {
        this.state.connected = true;
        this.elements.connectBtn.disabled = false;
        this.updateConnectionUI();

        const topics = this.getTopics();
        client.subscribe([topics.telemetry, topics.online, topics.relayState], { qos: 0 }, err => {
          if (err) {
            this.logEvent('Error al suscribir: ' + err.message, true);
          } else {
            this.logEvent(`Suscrito con éxito a ${this.state.topicBase}/#`);
          }
        });
      });

      client.on('message', (topic, buffer) => {
        const payloadText = buffer.toString();
        const topics = this.getTopics();

        if (topic === topics.telemetry) {
          try {
            const data = JSON.parse(payloadText);
            this.applyTelemetry(data);
          } catch (e) {
            this.logEvent('Telemetría JSON no válida', true);
          }
        } else if (topic === topics.relayState) {
          this.setRelayState(payloadText.trim().toUpperCase());
        } else if (topic === topics.online) {
          this.logEvent(`ESP32 anuncia: ${payloadText.slice(0, 32)}`);
        }
      });

      client.on('reconnect', () => {
        this.state.connected = false;
        this.logEvent('Reconectando a HiveMQ...');
        this.updateConnectionUI();
      });

      client.on('close', () => {
        this.state.connected = false;
        this.updateConnectionUI();
      });

      client.on('error', err => {
        this.logEvent(`MQTT Error: ${err.message}`, true);
        this.elements.connectBtn.disabled = false;
      });

      client.on('offline', () => {
        this.state.connected = false;
        this.updateConnectionUI();
      });

    } catch (err) {
      this.elements.connectBtn.disabled = false;
      this.logEvent(`Error al instanciar MQTT: ${err.message}`, true);
    }
  },

  /**
   * Cierra la conexión MQTT
   */
  disconnectMQTT() {
    if (this.state.client) {
      const c = this.state.client;
      this.state.client = null;
      c.end(true);
    }

    this.state.connected = false;
    this.state.lastPacket = 0;
    this.state.relay = 'UNKNOWN';

    this.elements.appRoot.classList.remove('relay-on');
    this.elements.relayState.textContent = 'Sin datos';
    this.elements.relayDescription.textContent = 'Dispositivo no conectado';
    this.elements.sceneWater.textContent = 'RIEGO EN ESPERA';

    this.logEvent('Desconectado del broker');
    this.updateConnectionUI();
  },

  /**
   * Envía un comando de activación o apagado del relé de riego
   */
  sendRelayCommand(value) {
    if (this.state.demo) {
      this.setRelayState(value);
      this.elements.lastCommand.textContent = `${value} · demo`;
      this.logEvent(`Orden simulada: ${value} (modo demo)`);

      clearTimeout(this.state.simRelayTimeout);
      if (value === 'ON') {
        this.state.simRelayTimeout = setTimeout(() => {
          this.setRelayState('OFF');
          this.elements.lastCommand.textContent = 'OFF · auto (8s)';
          this.logEvent('Temporizador de seguridad: corte automático a los 8 s');
        }, this.CONFIG.SAFETY_RELAY_TIMEOUT_MS);
      }
      return;
    }

    const { connected, lastPacket, client } = this.state;
    const isTransmitting = connected && (Date.now() - lastPacket < this.CONFIG.HEARTBEAT_TIMEOUT_MS);

    if (!isTransmitting) {
      this.logEvent('Sin telemetría reciente del ESP32: comando bloqueado.', true);
      return;
    }

    const topic = this.getTopics().relayCmd;
    client.publish(topic, value, { qos: 0, retain: false }, err => {
      if (err) {
        this.logEvent(`Fallo al enviar comando ${value}`, true);
        return;
      }
      this.elements.lastCommand.textContent = `${value} · enviado`;
      this.logEvent(`Comando ${value} enviado al ESP32 · esperando confirmación`);
    });
  },

  /**
   * Añade una muestra al historial circular
   */
  appendHistory(metric, value) {
    const arr = this.state.history[metric];
    arr.push(this.utils.isValidNumber(value) ? value : null);
    if (arr.length > this.CONFIG.MAX_SAMPLES) {
      arr.shift();
    }
  },

  /**
   * Procesa y refleja los datos de telemetría recibidos en la UI
   */
  applyTelemetry(data, isSimulated = false) {
    if (typeof data !== 'object' || !data) return;

    const { clamp, isValidNumber, fmtNumber } = this.utils;
    const el = this.elements;

    const t = isValidNumber(data.temperature) ? clamp(data.temperature, -30, 80) : null;
    const a = isValidNumber(data.air_humidity) ? clamp(data.air_humidity, 0, 100) : null;
    const s = isValidNumber(data.soil_percent) ? clamp(data.soil_percent, 0, 100) : null;

    if (t === null && a === null && s === null) return;

    this.state.lastPacket = Date.now();
    this.state.lastMessage = data;

    // Actualizar métricas principales
    el.tempValue.innerHTML = `${fmtNumber(t)}<span>°C</span>`;
    el.airValue.innerHTML = `${fmtNumber(a)}<span>% HR</span>`;
    el.soilValue.innerHTML = `${fmtNumber(s, 0)}<span>%</span>`;

    // Barras de progreso de los sensores
    el.airBar.style.width = `${a ?? 0}%`;
    el.soilBar.style.width = `${s ?? 0}%`;

    // Pies de métricas informativos
    el.tempFoot.textContent = t === null
      ? 'DHT22 sin lectura'
      : t > 32 ? 'Ambiente cálido'
      : t < 19 ? 'Ambiente fresco'
      : 'Rango térmico óptimo';

    const adc = Number(data.soil_raw);
    el.soilFoot.textContent = Number.isFinite(adc)
      ? `ADC: ${adc} · FC-28 calibrado`
      : 'FC-28 · Humedad relativa';

    // Resumen en la tarjeta del terrario
    const soilDesc = s === null
      ? 'Esperando sensor de humedad'
      : s <= 28 ? 'Suelo seco · Requiere riego'
      : s >= 75 ? 'Suelo óptimamente hidratado'
      : 'Humedad equilibrada en el sustrato';

    el.sceneSummary.textContent = soilDesc;
    el.sceneDescription.textContent = isSimulated
      ? 'Demostración con telemetría matemática simulada.'
      : 'Datos en vivo recibidos desde la placa ESP32.';

    el.footerLast.textContent = `Última lectura: ${this.utils.getClockString()}${isSimulated ? ' (simulada)' : ''}`;

    // Actualizar historiales
    this.appendHistory('temp', t);
    this.appendHistory('air', a);
    this.appendHistory('soil', s);

    // Si viene el estado del relé en el paquete, reflejarlo
    if (data.relay === 'ON' || data.relay === 'OFF') {
      this.setRelayState(data.relay);
    }

    this.drawChart();
    this.updateDeviceStatus();
  },

  /**
   * Activa o desactiva la simulación de datos en tiempo real
   */
  toggleDemoMode() {
    if (this.state.demo) {
      this.stopDemo();
    } else {
      this.startDemo();
    }
  },

  startDemo() {
    if (this.state.client) {
      this.disconnectMQTT();
    }

    this.state.demo = true;
    this.state.lastPacket = Date.now();
    this.setRelayState('OFF');
    this.updateConnectionUI();
    this.logEvent('SIMULACIÓN INICIADA: Telemetría artificial generada localmente.');

    let step = 0;
    const tick = () => {
      step++;
      // Funciones armónicas para simular variaciones naturales
      const temp = 26.5 + 2.2 * Math.sin(step / 6);
      const air = 66 + 10 * Math.sin(step / 8 + 0.5);
      const soil = 52 + 16 * Math.sin(step / 11 + 1.2);
      const rawAdc = Math.round(3500 - (soil / 100) * (3500 - 1200));

      this.applyTelemetry({
        temperature: temp,
        air_humidity: air,
        soil_percent: soil,
        soil_raw: rawAdc,
        relay: this.state.relay
      }, true);
    };

    tick();
    this.state.simTimer = setInterval(tick, 2500);
  },

  stopDemo() {
    clearInterval(this.state.simTimer);
    clearTimeout(this.state.simRelayTimeout);
    this.state.simTimer = null;
    this.state.demo = false;
    this.state.lastPacket = 0;
    this.state.relay = 'UNKNOWN';

    this.elements.appRoot.classList.remove('relay-on');
    this.elements.relayState.textContent = 'Sin datos';
    this.elements.relayDescription.textContent = 'Conecta un dispositivo para control real';

    this.updateConnectionUI();
    this.logEvent('Simulación detenida.');
  },

  /**
   * Reinicia los historiales locales de datos
   */
  resetData() {
    this.state.history = { soil: [], temp: [], air: [] };
    this.drawChart();
    this.state.events = [];
    this.logEvent('Historial de telemetría reiniciado.');
  },

  /**
   * Cambia la variable mostrada en la gráfica Canvas
   */
  selectChart(mode) {
    if (!['soil', 'temp', 'air'].includes(mode)) return;

    this.state.chartMode = mode;
    this.elements.chartTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.chart === mode);
    });

    const labels = {
      soil: 'Humedad del suelo (%)',
      temp: 'Temperatura (°C)',
      air: 'Humedad relativa del aire (% HR)'
    };

    this.elements.chartLegend.textContent = labels[mode] || '';
    this.drawChart();
  },

  /**
   * Renderiza el gráfico de líneas suavizado en Canvas HTML5
   */
  drawChart() {
    const canvas = this.elements.chartCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { left: 40, right: 16, top: 18, bottom: 26 };
    const innerW = w - pad.left - pad.right;
    const innerH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const mode = this.state.chartMode;
    const values = this.state.history[mode];
    const yMin = 0;
    const yMax = mode === 'temp' ? 50 : 100;

    // Líneas de cuadrícula y etiquetas del eje Y
    ctx.font = '10px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;

    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const yPos = pad.top + (innerH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, yPos);
      ctx.lineTo(w - pad.right, yPos);
      ctx.stroke();

      const labelVal = Math.round(yMax - ((yMax - yMin) * i) / gridSteps);
      const unit = mode === 'temp' ? '°C' : '%';
      ctx.fillText(`${labelVal}${unit}`, pad.left - 8, yPos + 3);
    }

    // Etiquetas del eje X
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.fillText('ANTERIOR', pad.left, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText('AHORA', w - pad.right, h - 4);

    if (values.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "DM Sans", system-ui, sans-serif';
      ctx.fillText('Esperando lecturas de telemetría para trazar la curva...', w / 2, h / 2);
      return;
    }

    // Colores según la variable
    const colors = {
      soil: '#4ade80',
      temp: '#facc15',
      air: '#38bdf8'
    };
    const strokeColor = colors[mode] || '#4ade80';

    // Mapeo de coordenadas con Bezier
    const points = values.map((v, i) => {
      if (v === null || typeof v !== 'number') return null;
      const x = pad.left + (values.length <= 1 ? innerW / 2 : (i / Math.max(values.length - 1, 1)) * innerW);
      const normalizedY = this.utils.clamp((v - yMin) / (yMax - yMin), 0, 1);
      const y = pad.top + innerH * (1 - normalizedY);
      return { x, y };
    });

    // Función para trazar segmento continuo
    const drawSegment = seg => {
      if (seg.length === 0) return;

      ctx.beginPath();
      ctx.moveTo(seg[0].x, seg[0].y);

      for (let i = 1; i < seg.length; i++) {
        const pPrev = seg[i - 1];
        const pCurr = seg[i];
        const midX = (pPrev.x + pCurr.x) / 2;
        ctx.bezierCurveTo(midX, pPrev.y, midX, pCurr.y, pCurr.x, pCurr.y);
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    };

    let currentSegment = [];
    for (const pt of points) {
      if (pt) {
        currentSegment.push(pt);
      } else {
        drawSegment(currentSegment);
        currentSegment = [];
      }
    }
    drawSegment(currentSegment);

    // Resaltar el último punto registrado
    const lastValid = points.filter(Boolean).at(-1);
    if (lastValid) {
      ctx.beginPath();
      ctx.arc(lastValid.x, lastValid.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor;
      ctx.fill();
      ctx.strokeStyle = '#090e11';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
};

// Autoarranque al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
