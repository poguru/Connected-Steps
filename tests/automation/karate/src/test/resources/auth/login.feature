@smoke @regression
Feature: Authentication API

  Background:
    Given url baseUrl

  @smoke
  Scenario: TC-API-AUTH01 | Valid login returns 200 and session token
    Given path '/api/auth/login'
    And request { email: '#(testEmail)', password: '#(testPassword)' }
    When method POST
    Then status 200
    And match response contains { user: '#notnull' }

  Scenario: TC-API-AUTH02 | Wrong password returns 400
    Given path '/api/auth/login'
    And request { email: '#(testEmail)', password: 'WrongPassword999!' }
    When method POST
    Then status 400
    And match response contains { error: '#notnull' }

  Scenario: TC-API-AUTH03 | Unknown email returns 400
    Given path '/api/auth/login'
    And request { email: 'nobody@connectedsteps.test', password: 'SomePass@123' }
    When method POST
    Then status 400

  Scenario: TC-API-AUTH04 | Empty body returns 400
    Given path '/api/auth/login'
    And request {}
    When method POST
    Then status 400

  @security
  Scenario: TC-API-AUTH05 | Login rate limiting returns 429 after N attempts
    Given path '/api/auth/login'
    And request { email: '#(testEmail)', password: 'wrong1' }
    When method POST
    # Simulate rapid repeated calls
    * def results = []
    * def loop = function(){ for(var i=0;i<12;i++){ var r = karate.call('classpath:helpers/auth-helper.feature',{email:'brute@test.com',password:'wrong'+i}); results.push(r); } }
    # Attempt via repeated HTTP calls
    * def responses = karate.repeat(12, function(i){ return karate.http(baseUrl+'/api/auth/login').contentType('application/json').post({email:'brute@test.com',password:'wrong'+i}).status })
    * def has429 = karate.filter(responses, function(s){ return s == 429 }).length > 0
    Then assert has429 == true

  Scenario: TC-API-AUTH06 | OTP send for valid email returns 200
    Given path '/api/auth/send-otp'
    And request { type: 'email', value: '#(testEmail)', purpose: 'login' }
    When method POST
    Then status 200

  @security
  Scenario: TC-API-AUTH07 | OTP verify with wrong code returns 400
    Given path '/api/auth/verify-otp'
    And request { email: '#(testEmail)', code: '000000', purpose: 'login' }
    When method POST
    Then status 400

  Scenario: TC-API-AUTH08 | Password reset send OTP returns 200
    Given path '/api/auth/send-otp'
    And request { type: 'email', value: '#(testEmail)', purpose: 'reset' }
    When method POST
    Then status 200

  Scenario: TC-API-AUTH09 | Register with duplicate email returns 400
    Given path '/api/auth/register'
    And request { firstName: 'Dup', lastName: 'User', email: '#(testEmail)', password: 'TestPass@123', goal: '5K', location: 'Hyderabad' }
    When method POST
    Then status 400
    And match response.error contains 'already'

  Scenario: TC-API-AUTH10 | Register without required fields returns 400
    Given path '/api/auth/register'
    And request { email: 'partial@test.com' }
    When method POST
    Then status 400
