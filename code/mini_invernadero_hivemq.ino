/*
 * Mini Invernadero IoT - ESP32 clasico / DevKit
 * FC-28 (AO -> GPIO34), DHT22 (DATA -> GPIO4), Rele (IN -> GPIO26)
 * Broker publico de HiveMQ: broker.hivemq.com:1883
 *
 * BIBLIOTECAS Arduino IDE:
 *   - PubSubClient (Nick O'Leary)
 *   - DHT sensor library (Adafruit)
 *   - Adafruit Unified Sensor
 *
 * SEGURIDAD: DEMOSTRACION EN BROKER PUBLICO. SIN CARGAS DE POTENCIA.
 * El broker no tiene autenticacion: los topics y comandos son publicos.
 * Desactivacion del rele tras 8 s como limite de software (no de hardware).
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <math.h>

// -------- 1. EDITAR CREDENCIALES WIFI --------
const char* WIFI_SSID = "C.U.A";
const char* WIFI_PASSWORD = "C951u123a";

// -------- 2. BROKER PUBLICO HIVEMQ --------
const char* MQTT_HOST = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;  // MQTT/TCP, sin TLS. Solo laboratorio.

// -------- 3. TOPIC DEL PROYECTO --------
// Debe ser IDENTICO al campo "Prefijo MQTT" del dashboard HTML.
// CAMBIA EL SUFIJO demo-7f2c9d POR UNO PROPIO para evitar interferencias.
const char* TOPIC_BASE = "lab/invernadero/demo-7f2c9d";

// -------- 4. PINES --------
const uint8_t PIN_SUELO = 34; // ADC1: compatible con Wi-Fi (ESP32 clasico)
const uint8_t PIN_DHT = 21;    // Cambia a 2 SOLO si D2 de tu placa es GPIO2
const uint8_t PIN_RELE = 26;
#define TIPO_DHT DHT22

// -------- 5. RELE --------
// Modulos comunes de 1 canal son ACTIVOS EN BAJO (LOW = ON).
// Cambiar a false si tu modulo es activo en alto.
const bool RELE_ACTIVO_BAJO = true;
const unsigned long RELE_MAX_ON_MS = 8000UL;

// -------- 6. CALIBRACION DEL FC-28 --------
// Son EJEMPLOS. Anota la lectura cruda de suelo seco y humedo y reemplaza.
const int ADC_SECO = 3500;
const int ADC_HUMEDO = 1200;

// -------- 7. TIEMPOS --------
const unsigned long TELEMETRIA_CADA_MS = 2500UL; // DHT22: >= 2 segundos
const unsigned long REINTENTO_MQTT_MS = 5000UL;
const unsigned long REINTENTO_WIFI_MS = 15000UL;

WiFiClient net;
PubSubClient mqtt(net);
DHT dht(PIN_DHT, TIPO_DHT);

String topicTelemetria;
String topicEstado;
String topicComando;
String topicRele;
String idCliente;

bool releEncendido = false;
bool publicarEstadoRele = false;
unsigned long releInicioMs = 0;
unsigned long ultimoEnvioMs = 0;
unsigned long ultimoMQTTMs = 0;
unsigned long ultimoWiFiMs = 0;

void aplicarRele(bool encender) {
  // Un mensaje ON repetido no extiende el tiempo de activacion.
  if (encender && releEncendido) return;
  releEncendido = encender;
  digitalWrite(PIN_RELE,
               RELE_ACTIVO_BAJO ? (encender ? LOW : HIGH)
                                : (encender ? HIGH : LOW));
  if (encender) releInicioMs = millis();
  publicarEstadoRele = true;
  Serial.printf("[RELE] %s\n", encender ? "ON (maximo 8 s)" : "OFF");
}

void recibirMQTT(char* topic, byte* payload, unsigned int length) {
  if (String(topic) != topicComando) return;
  if (length == 0 || length > 16) return;

  char orden[17];
  memcpy(orden, payload, length);
  orden[length] = '\0';
  String comando = String(orden);
  comando.trim();
  comando.toUpperCase();

  if (comando == "ON") {
    aplicarRele(true);
  } else if (comando == "OFF") {
    aplicarRele(false);
  } else {
    Serial.print("[MQTT] Comando ignorado: ");
    Serial.println(comando);
  }
}

int leerSueloPromedio() {
  long suma = 0;
  for (int i = 0; i < 8; i++) {
    suma += analogRead(PIN_SUELO);
    delayMicroseconds(160);
  }
  return (int)(suma / 8);
}

int calcularHumedadRelativa(int raw) {
  if (ADC_SECO == ADC_HUMEDO) return 0;
  long porcentaje = map(raw, ADC_SECO, ADC_HUMEDO, 0, 100);
  return constrain(porcentaje, 0L, 100L);
}

void publicarTelemetria() {
  const int raw = leerSueloPromedio();
  const int humedadSuelo = calcularHumedadRelativa(raw);
  const float temperatura = dht.readTemperature();
  const float humedadAire = dht.readHumidity();
  const bool dhtOk = !isnan(temperatura) && !isnan(humedadAire);

  char tTexto[20];
  char hTexto[20];
  if (dhtOk) {
    snprintf(tTexto, sizeof(tTexto), "%.1f", temperatura);
    snprintf(hTexto, sizeof(hTexto), "%.1f", humedadAire);
  } else {
    strcpy(tTexto, "null");
    strcpy(hTexto, "null");
  }

  char json[320];
  snprintf(json, sizeof(json),
           "{\"temperature\":%s,\"air_humidity\":%s,"
           "\"soil_percent\":%d,\"soil_raw\":%d,"
           "\"relay\":\"%s\",\"dht_ok\":%s,"
           "\"wifi_rssi\":%d,\"uptime_s\":%lu}",
           tTexto, hTexto, humedadSuelo, raw,
           releEncendido ? "ON" : "OFF", dhtOk ? "true" : "false",
           WiFi.RSSI(), millis() / 1000UL);

  Serial.print("[SENSORES] ");
  Serial.println(json);

  if (mqtt.connected()) {
    if (!mqtt.publish(topicTelemetria.c_str(), json, false)) {
      Serial.println("[MQTT] No se pudo publicar telemetria");
    }
  }
}

void conectarWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  ultimoWiFiMs = millis();
  Serial.print("[WIFI] Conectando a ");
  Serial.println(WIFI_SSID);
}

void conectarMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  ultimoMQTTMs = millis();
  Serial.print("[MQTT] Conectando a ");
  Serial.println(MQTT_HOST);

  // Last Will (mensaje retenido) para marcar desconexion inesperada.
  bool ok = mqtt.connect(idCliente.c_str(), topicEstado.c_str(),
                         0, true, "offline");
  if (!ok) {
    Serial.printf("[MQTT] Error: estado=%d\n", mqtt.state());
    return;
  }

  Serial.println("[MQTT] Conectado");
  mqtt.publish(topicEstado.c_str(), "online", true);
  mqtt.subscribe(topicComando.c_str(), 0);
  mqtt.publish(topicRele.c_str(), "OFF", true);
  publicarEstadoRele = false;
  ultimoEnvioMs = millis() - TELEMETRIA_CADA_MS;
  Serial.print("[MQTT] Comandos: ");
  Serial.println(topicComando);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  // Llevar la salida del rele al estado OFF antes de su uso.
  digitalWrite(PIN_RELE, RELE_ACTIVO_BAJO ? HIGH : LOW);
  pinMode(PIN_RELE, OUTPUT);
  aplicarRele(false);

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_SUELO, ADC_11db);
  dht.begin();

  topicTelemetria = String(TOPIC_BASE) + "/telemetry";
  topicEstado = String(TOPIC_BASE) + "/status";
  topicComando = String(TOPIC_BASE) + "/relay/set";
  topicRele = String(TOPIC_BASE) + "/relay/state";

  uint64_t mac = ESP.getEfuseMac();
  char sufijo[13];
  snprintf(sufijo, sizeof(sufijo), "%012llX", (unsigned long long)mac);
  idCliente = String("greenhouse-") + sufijo;

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(recibirMQTT);
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(2);

  Serial.println("\n=== MINI INVERNADERO ESP32 ===");
  Serial.print("[TOPIC BASE] ");
  Serial.println(TOPIC_BASE);
  conectarWiFi();
}

void loop() {
  const unsigned long ahora = millis();

  // Apagado por tiempo, con prioridad sobre el resto de tareas.
  if (releEncendido && (ahora - releInicioMs >= RELE_MAX_ON_MS)) {
    Serial.println("[SEGURIDAD] Tiempo de rele agotado (8 s)");
    aplicarRele(false);
  }

  if (WiFi.status() != WL_CONNECTED) {
    if (releEncendido) aplicarRele(false);
    if (ahora - ultimoWiFiMs >= REINTENTO_WIFI_MS) {
      conectarWiFi();
    }
  } else {
    if (!mqtt.connected()) {
      if (releEncendido) aplicarRele(false);
      if (ahora - ultimoMQTTMs >= REINTENTO_MQTT_MS) {
        conectarMQTT();
      }
    } else {
      mqtt.loop();
      if (publicarEstadoRele) {
        mqtt.publish(topicRele.c_str(), releEncendido ? "ON" : "OFF", true);
        publicarEstadoRele = false;
      }
    }
  }

  if (ahora - ultimoEnvioMs >= TELEMETRIA_CADA_MS) {
    ultimoEnvioMs = ahora;
    publicarTelemetria();
  }
}
