@regression
Feature: Coach API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  Scenario: TC-API-COACH01 | GET /api/coaches returns active coaches
    Given path '/api/coaches'
    When method GET
    Then status 200
    And match response == '#array'
    And match response[0] contains { slug: '#notnull' }

  @security
  Scenario: TC-API-COACH02 | Training plan requires auth
    Given path '/api/user/training-plan'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-COACH03 | Coach Q&A submission without auth returns 401
    Given path '/api/coach-questions'
    And request { question: 'Test Q', category: 'training' }
    When method POST
    Then status 401

  Scenario: TC-API-COACH04 | GET /api/coach-questions returns user questions
    Given path '/api/coach-questions'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-COACH05 | GET /api/messages/conversations returns list
    Given path '/api/messages/conversations'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-COACH06 | GET /api/user/achievements returns achievements
    Given path '/api/user/achievements'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'
