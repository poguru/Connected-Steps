@regression
Feature: Admin API

  Background:
    Given url baseUrl

  @security
  Scenario: TC-API-ADM01 | Admin sessions without auth returns 401
    Given path '/api/admin/sessions'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-ADM02 | Admin users without auth returns 401
    Given path '/api/admin/users'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-ADM03 | Admin memberships without auth returns 401
    Given path '/api/admin/memberships'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-ADM04 | Admin leaderboard archive without auth returns 401
    Given path '/api/admin/leaderboard/archive'
    When method POST
    Then status 401

  @security
  Scenario: TC-API-ADM05 | Admin session sync without auth returns 401
    Given path '/api/admin/sessions/fake-id/sync'
    When method POST
    Then status 401

  @security
  Scenario: TC-API-ADM06 | Admin community moderation without auth returns 401
    Given path '/api/admin/community'
    When method GET
    Then status 401

  @security
  Scenario: TC-API-ADM07 | Admin broadcast without auth returns 401
    Given path '/api/admin/coach-ops/broadcast'
    And request { message: 'test', channel: 'email' }
    When method POST
    Then status 401

  @security
  Scenario: TC-API-ADM08 | Admin login with wrong password returns 401
    Given path '/api/admin/auth/login'
    And request { password: 'wrong_password_xyz' }
    When method POST
    Then status 401
