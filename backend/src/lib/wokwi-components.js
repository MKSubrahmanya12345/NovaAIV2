const baseCatalog = [
  { label: "Arduino Uno", partType: "wokwi-arduino-uno", aliases: ["uno", "arduino uno"] },
  { label: "Arduino Nano", partType: "wokwi-arduino-nano", aliases: ["nano", "arduino nano"] },
  { label: "Arduino Mega", partType: "wokwi-arduino-mega", aliases: ["mega", "arduino mega"] },
  { label: "ATtiny85", partType: "wokwi-attiny85", aliases: ["attiny", "attiny85"] },
  { label: "Raspberry Pi Pico", partType: "wokwi-pi-pico", aliases: ["pi pico", "rp2040"] },
  { label: "ESP32 DevKit", partType: "wokwi-esp32-devkit-v1", aliases: ["esp32", "esp32 devkit"] },
  { label: "ESP32-C3 DevKit", partType: "board-esp32-c3-devkitm-1", aliases: ["esp32-c3"] },
  { label: "ESP32-S3 DevKit", partType: "board-esp32-s3-devkitc-1", aliases: ["esp32-s3"] },

  { label: "LED", partType: "wokwi-led", aliases: ["led"] },
  { label: "RGB LED", partType: "wokwi-rgb-led", aliases: ["rgb led"] },
  { label: "LED Bar Graph", partType: "wokwi-led-bar-graph", aliases: ["led bar graph"] },
  { label: "WS2812 Ring", partType: "wokwi-neopixel-ring", aliases: ["neopixel ring", "ws2812 ring"] },
  { label: "WS2812 Strip", partType: "wokwi-neopixel-strip", aliases: ["neopixel strip", "ws2812 strip"] },
  { label: "WS2812 Matrix", partType: "wokwi-neopixel-matrix", aliases: ["neopixel matrix", "ws2812 matrix"] },

  { label: "Pushbutton", partType: "wokwi-pushbutton", aliases: ["button", "pushbutton"] },
  { label: "Potentiometer", partType: "wokwi-potentiometer", aliases: ["pot", "potentiometer"] },
  { label: "Slide Potentiometer", partType: "wokwi-slide-potentiometer", aliases: ["slide pot", "slide potentiometer"] },
  { label: "Rotary Encoder", partType: "wokwi-ky-040", aliases: ["rotary encoder", "ky-040"] },
  { label: "4x4 Keypad", partType: "wokwi-keypad", aliases: ["keypad", "4x4 keypad"] },

  { label: "DHT22", partType: "wokwi-dht22", aliases: ["dht22"] },
  { label: "DS18B20", partType: "wokwi-ds18b20", aliases: ["ds18b20"] },
  { label: "HC-SR04", partType: "wokwi-hc-sr04", aliases: ["ultrasonic", "hc-sr04"] },
  { label: "PIR Sensor", partType: "wokwi-pir-motion-sensor", aliases: ["pir", "motion sensor"] },
  { label: "Photoresistor", partType: "wokwi-photoresistor-sensor", aliases: ["ldr", "photoresistor"] },
  { label: "BMP180", partType: "board-bmp180", aliases: ["bmp180"] },
  { label: "MPU6050", partType: "wokwi-mpu6050", aliases: ["mpu6050"] },

  { label: "LCD 1602", partType: "wokwi-lcd1602", aliases: ["lcd1602", "lcd 16x2"] },
  { label: "LCD 2004", partType: "wokwi-lcd2004", aliases: ["lcd2004", "lcd 20x4"] },
  { label: "SSD1306 OLED", partType: "wokwi-ssd1306", aliases: ["ssd1306", "oled"] },
  { label: "MAX7219 Matrix", partType: "wokwi-max7219-matrix", aliases: ["max7219"] },
  { label: "7-Segment Display", partType: "wokwi-7segment", aliases: ["7 segment", "seven segment"] },

  { label: "Servo", partType: "wokwi-servo", aliases: ["servo"] },
  { label: "Stepper Motor", partType: "wokwi-stepper-motor", aliases: ["stepper"] },
  { label: "A4988 Driver", partType: "wokwi-a4988", aliases: ["a4988"] },

  { label: "Resistor", partType: "wokwi-resistor", aliases: ["resistor"] },
  { label: "Buzzer", partType: "wokwi-buzzer", aliases: ["buzzer", "piezo"] },
  { label: "Relay Module", partType: "wokwi-relay-module", aliases: ["relay"] },
  { label: "Breadboard", partType: "wokwi-breadboard", aliases: ["breadboard"] },
  { label: "Logic Analyzer", partType: "wokwi-logic-analyzer", aliases: ["logic analyzer"] },
  { label: "microSD Card", partType: "wokwi-microsd-card", aliases: ["sd card", "microsd"] }
];

const cleanCatalogEntry = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  const partType = typeof entry.partType === "string" ? entry.partType.trim() : "";
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];

  if (!label || !partType) return null;
  return { label, partType, aliases };
};

const parseExtraCatalog = () => {
  const raw = process.env.WOKWI_EXTRA_COMPONENTS;
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanCatalogEntry).filter(Boolean);
  } catch {
    return [];
  }
};

export const getWokwiComponentCatalog = () => {
  const merged = [...baseCatalog, ...parseExtraCatalog()];
  const seen = new Set();

  return merged.filter((entry) => {
    if (seen.has(entry.partType)) return false;
    seen.add(entry.partType);
    return true;
  });
};

export const formatWokwiComponentCatalogForPrompt = () => {
  return getWokwiComponentCatalog()
    .map((item) => `- ${item.label} (${item.partType})`)
    .join("\n");
};

export const findUnsupportedPartTypesInText = (text = "") => {
  const content = String(text || "");
  const tokens = content.match(/\b(?:wokwi|board|chip)-[a-z0-9-]+\b/gi) || [];

  const allowedPartTypes = new Set(
    getWokwiComponentCatalog().map((item) => item.partType.toLowerCase())
  );

  const unsupported = [...new Set(
    tokens
      .map((token) => token.toLowerCase())
      .filter((token) => !token.startsWith("chip-") && !allowedPartTypes.has(token))
  )];

  return unsupported;
};