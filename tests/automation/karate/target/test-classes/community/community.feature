@regression
Feature: Community & Feed API

  Background:
    Given url baseUrl
    * def loginResult = call read('classpath:helpers/auth-helper.feature') { email: '#(testEmail)', password: '#(testPassword)' }
    * def cookie = loginResult.authCookie

  Scenario: TC-API-COM01 | GET /api/community/posts returns only approved posts
    Given path '/api/community/posts'
    When method GET
    Then status 200
    And match response == '#array'
    * def unapproved = karate.filter(response, function(p){ return p.status != 'approved' })
    And assert unapproved.length == 0

  Scenario: TC-API-COM02 | Submit community post returns pending status
    Given path '/api/community/posts'
    And cookie session = cookie
    And request { title: 'API Test Question', body: 'Automated test post - ignore', category: 'general' }
    When method POST
    Then status 200
    And match response.status == 'pending'

  @security
  Scenario: TC-API-COM03 | XSS in post body is stripped
    Given path '/api/community/posts'
    And cookie session = cookie
    And request { title: 'XSS Test', body: '<script>alert("xss")</script>', category: 'general' }
    When method POST
    Then status 200
    * def bodyStr = response + ''
    And assert bodyStr.indexOf('<script>') == -1

  Scenario: TC-API-COM04 | GET /api/feed returns array for auth user
    Given path '/api/feed'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'

  Scenario: TC-API-COM05 | Create feed post returns created post
    Given path '/api/posts'
    And cookie session = cookie
    And request { type: 'general', content: 'Automated QA feed post - ignore' }
    When method POST
    Then status 200
    And match response contains { id: '#notnull' }

  @security
  Scenario: TC-API-COM06 | Unauthenticated post creation returns 401
    Given path '/api/posts'
    And request { type: 'general', content: 'Unauth post' }
    When method POST
    Then status 401

  Scenario: TC-API-COM07 | GET /api/users/search returns results
    Given path '/api/users/search'
    And param q = 'a'
    And cookie session = cookie
    When method GET
    Then status 200
    And match response == '#array'
