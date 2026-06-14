Feature: Shower panel controller modes and transitions

  Scenario: Controller sets actuators for drain mode
    Given the mode select GPIOs indicate "drain"
    When the controller reads sensors and determines mode
    Then the controller should set actuators for "drain"

  Scenario: Controller sets actuators for flush mode
    Given the mode select GPIOs indicate "flush"
    When the controller reads sensors and determines mode
    Then the controller should set actuators for "flush"

  Scenario: Controller sets actuators for shower mode with flow
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    When the controller reads sensors and determines mode
    Then the controller should set actuators for "shower"

  Scenario: Controller transitions to sanitize mode after no flow in shower mode
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads below threshold for a long period
    When the controller reads sensors and determines mode after timeout
    Then the controller should set actuators for "sanitize"

  Scenario: Controller transitions back to shower mode when flow resumes in sanitize mode
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads below threshold for a long period
    And flow out sensor reads above threshold
    When the controller reads sensors and determines mode after timeout
    Then the controller should set actuators for "shower"

  Scenario: Controller applies calibration to analog sensors
    Given the flow in sensor raw value is maximum
    When the controller decodes the analog value
    Then the result should be the sensor full scale

  Scenario: Controller falls back to drain mode for unrecognized mode bits
    Given the mode select GPIOs indicate an unrecognized pattern
    When the controller reads sensors and determines mode
    Then the controller should set actuators for "drain"

  Scenario: Controller returns to shower mode after sanitize timer expires
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads below threshold for a long period
    And the sanitize cycle is active and has expired
    When the controller reads sensors and determines mode
    Then the controller should set actuators for "shower"

  Scenario: Auto-sanitize does not trigger in drain mode
    Given the mode select GPIOs indicate "drain"
    And flow out sensor reads below threshold for a long period
    When the controller reads sensors and determines mode after timeout
    Then the controller should set actuators for "drain"

  Scenario: Auto-sanitize does not trigger in flush mode
    Given the mode select GPIOs indicate "flush"
    And flow out sensor reads below threshold for a long period
    When the controller reads sensors and determines mode after timeout
    Then the controller should set actuators for "flush"

  Scenario: Controller posts mode and turbidity to the display webhook
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    When the controller steps
    Then the display webhook should receive mode "SHOWER" and the current turbidity

  Scenario: Controller posts the correct mode name string for each mode
    Given the mode select GPIOs indicate "sanitize"
    When the controller steps
    Then the display webhook should receive mode "SANITIZE"

  # --- Drain pump dry-run protection ---

  Scenario: Drain pump begins priming when shower drain flow is detected
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    When the controller steps
    Then the drain pump state should be "priming"

  Scenario: Drain pump stops after priming timeout with no return flow
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    And the drain pump is in priming state with timeout elapsed
    When the controller steps
    Then the drain pump state should be "waiting"

  Scenario: Drain pump transitions to pumping when return flow is detected during priming
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    And the drain pump is in priming state
    And flow return sensor reads above threshold
    When the controller steps
    Then the drain pump state should be "pumping"

  Scenario: Drain pump continues pumping after shower drain flow stops while return flow persists
    Given the mode select GPIOs indicate "shower"
    And the drain pump is in pumping state
    And flow return sensor reads above threshold
    When the controller steps
    Then the drain pump state should be "pumping"

  Scenario: Drain pump stops when return flow stops
    Given the mode select GPIOs indicate "shower"
    And the drain pump is in pumping state
    When the controller steps
    Then the drain pump state should be "idle"

  Scenario: Drain pump retries priming in the same step after the waiting interval expires
    Given the mode select GPIOs indicate "shower"
    And flow out sensor reads above threshold
    And the drain pump is in waiting state with retry interval elapsed
    When the controller steps
    Then the drain pump state should be "priming"

  Scenario: Drain pump state resets to idle when mode leaves shower
    Given the mode select GPIOs indicate "drain"
    And the drain pump is in pumping state
    When the controller steps
    Then the drain pump state should be "idle"