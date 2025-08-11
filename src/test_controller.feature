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