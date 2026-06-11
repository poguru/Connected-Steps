@smoke @regression
Feature: Sessions API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  @smoke
  Scenario: TC-API-SES01 | GET /api/sessions returns array
    Given path '/api/sessions'
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-SES02 | GET /api/sessions returns sessions with required fields
    Given path '/api/sessions'
    When method GET
    Then status 200
    * def first = response[0]
    And match first contains { id: '#notnull', date: '#notnull' }

  Scenario: TC-API-SES03 | Unauthenticated join returns 401
    Given path '/api/sessions/invalid-id/join'
    When method POST
    Then status 401

  Scenario: TC-API-SES04 | Join non-existent session returns 404
    Given path '/api/sessions/00000000-0000-0000-0000-000000000000/join'
    And cookie session = cookie
    When method POST
    Then status 404

  Scenario: TC-API-SES05 | GET /api/user/joined-sessions returns array for auth user
    Given path '/api/user/joined-sessions'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-SES06 | Session RSVP counts endpoint returns object
    Given path '/api/sessions/rsvp-counts'
    When method GET
    Then status 200
    And match response == '#object'

  Scenario: TC-API-SES07 | Session feedback requires authentication
    Given path '/api/sessions/fake-id/feedback'
    And request { rating: 5, comment: 'Great session' }
    When method POST
    Then status 401

  Scenario: TC-API-SES08 | GET /api/sessions/recent returns array
    Given path '/api/sessions/recent'
    When method GET
    Then status 200
    And match response == '#array'
