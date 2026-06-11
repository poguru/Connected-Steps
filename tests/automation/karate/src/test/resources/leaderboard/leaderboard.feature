@smoke @regression
Feature: Leaderboard API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  @smoke
  Scenario: TC-API-LB01 | GET /api/leaderboard returns array
    Given path '/api/leaderboard'
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-LB02 | Leaderboard entries have required fields
    Given path '/api/leaderboard'
    When method GET
    Then status 200
    * def first = response[0]
    And match first contains { user_name: '#notnull', month_points: '#number' }

  Scenario: TC-API-LB03 | Leaderboard does not expose emails publicly
    Given path '/api/leaderboard'
    When method GET
    Then status 200
    * def hasEmail = karate.filter(response, function(x){ return x.user_email != null && x.user_email != '' }).length > 0
    And assert hasEmail == false

  Scenario: TC-API-LB04 | GET /api/leaderboard/user returns rank for auth user
    Given path '/api/leaderboard/user'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response contains { rank: '#number', month_points: '#number' }

  Scenario: TC-API-LB05 | Unauthenticated /api/leaderboard/user returns 401
    Given path '/api/leaderboard/user'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-LB06 | Rank snapshot cron requires authorization
    Given path '/api/cron/rank-snapshot'
    When method GET
    Then status 401

  Scenario: TC-API-LB07 | Recalculate requires admin auth
    Given path '/api/admin/leaderboard/recalculate'
    And request { month: '2026-06' }
    When method POST
    Then status 401

  @smoke
  Scenario: TC-API-LB08 | GET /api/leaderboard/breakdown returns data for auth user
    Given path '/api/leaderboard/breakdown'
    And cookie session = cookie
    When method GET
    Then status 200
