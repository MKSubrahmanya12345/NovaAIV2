const int BTN_YELLOW = 2;
const int BTN_BLUE = 3;
const int BTN_GREEN = 4;
const int BTN_RED = 5;

const int BUZZER_PIN = 8;
const int LED_YELLOW = 9;
const int LED_BLUE = 10;
const int LED_GREEN = 11;
const int LED_RED = 12;

void setup() {
  Serial.begin(115200);

  pinMode(BTN_YELLOW, INPUT_PULLUP);
  pinMode(BTN_BLUE, INPUT_PULLUP);
  pinMode(BTN_GREEN, INPUT_PULLUP);
  pinMode(BTN_RED, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_BLUE, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_BLUE, LOW);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  Serial.println("BOOT_OK");
}

void loop() {
  const bool yellowPressed = digitalRead(BTN_YELLOW) == LOW;
  const bool bluePressed = digitalRead(BTN_BLUE) == LOW;
  const bool greenPressed = digitalRead(BTN_GREEN) == LOW;
  const bool redPressed = digitalRead(BTN_RED) == LOW;

  digitalWrite(LED_YELLOW, yellowPressed ? HIGH : LOW);
  digitalWrite(LED_BLUE, bluePressed ? HIGH : LOW);
  digitalWrite(LED_GREEN, greenPressed ? HIGH : LOW);
  digitalWrite(LED_RED, redPressed ? HIGH : LOW);

  if (yellowPressed || bluePressed || greenPressed || redPressed) {
    tone(BUZZER_PIN, 880, 50);
  }

  delay(40);
}