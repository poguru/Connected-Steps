@regression
Feature: Referrals API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  Scenario: TC-API-REF01 | GET /api/referrals/code returns a code for auth user
    Given path '/api/referrals/code'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response contains { code: '#notnull' }

  Scenario: TC-API-REF02 | GET /api/referrals/stats returns counts
    Given path '/api/referrals/stats'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response contains { invited: '#number', registered: '#number' }

  @security
  Scenario: TC-API-REF03 | Referrals code requires authentication
    Given path '/api/referrals/code'
    When method GET
    Then status 401

  Scenario: TC-API-REF04 | Self-referral claim returns 400
    Given path '/api/referrals/code'
    And cookie session = cookie
    When method GET
    Then status 200
    * def myCode = response.code
    Given path '/api/referrals/claim'
    And cookie session = cookie
    And request { code: '#(myCode)' }
    When method POST
    # Self-referral must fail
    Then status 400
    And match response.error contains '#notnull'

  Scenario: TC-API-REF05 | Claim with invalid code returns 400
    Given path '/api/referrals/claim'
    And cookie session = cookie
    And request { code: 'INVALID-CODE-XYZ' }
    When method POST
    Then status 400
