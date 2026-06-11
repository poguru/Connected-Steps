@regression
Feature: Notifications API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  Scenario: TC-API-NOT01 | GET /api/notifications returns array for auth user
    Given path '/api/notifications'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  @security
  Scenario: TC-API-NOT02 | Unauthenticated /api/notifications returns 401
    Given path '/api/notifications'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-NOT03 | Session reminders cron without auth returns 401
    Given path '/api/cron/session-reminders'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-NOT04 | Streak at-risk cron without auth returns 401
    Given path '/api/cron/streak-at-risk'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-NOT05 | Expiry reminders cron without auth returns 401
    Given path '/api/cron/expiry-reminders'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-NOT06 | Weekly digest cron without auth returns 401
    Given path '/api/cron/weekly-digest'
    When method GET
    Then status 401

  Scenario: TC-API-NOT07 | Push subscription endpoint accepts valid payload
    Given path '/api/push/subscribe'
    And cookie session = cookie
    And request { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'key', auth: 'auth' } }
    When method POST
    Then status 200
